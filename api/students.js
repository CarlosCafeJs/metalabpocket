const { Pool } = require('pg');
const { randomUUID } = require('node:crypto');

let pool;
let schemaReady;

function database() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 2,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
      ssl: { rejectUnauthorized: true }
    });
  }
  return pool;
}

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = database().query(`
      CREATE TABLE IF NOT EXISTS metalab_students (
        id UUID PRIMARY KEY,
        full_name VARCHAR(120) NOT NULL,
        email VARCHAR(254) NOT NULL,
        birth_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `).catch(error => { schemaReady = null; throw error; });
  }
  await schemaReady;
}

function validBirthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const today = new Date();
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date <= today && year >= 1900;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método não permitido.' });
  }
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    return res.status(415).json({ error: 'Envie os dados em JSON.' });
  }
  const { name, email, birthDate } = req.body || {};
  const fullName = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (fullName.length < 2 || fullName.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || normalizedEmail.length > 254 || !validBirthDate(birthDate)) {
    return res.status(400).json({ error: 'Confira nome, e-mail e data de nascimento.' });
  }
  try {
    await ensureSchema();
    const id = randomUUID();
    await database().query(
      'INSERT INTO metalab_students (id, full_name, email, birth_date) VALUES ($1, $2, $3, $4)',
      [id, fullName, normalizedEmail, birthDate]
    );
    return res.status(201).json({ id, firstName: fullName.split(' ')[0] });
  } catch (error) {
    console.error('Falha ao registrar aluno:', error.code || error.name);
    return res.status(503).json({ error: 'Não foi possível salvar o cadastro agora. Tente novamente.' });
  }
};
