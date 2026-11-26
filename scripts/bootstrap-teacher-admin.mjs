import { createHmac, randomBytes, randomUUID, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { checkServerIdentity } from 'node:tls';
import { Pool } from 'pg';

const scrypt = promisify(scryptCallback);
const name = (process.env.EDUCAFE_TEACHER_ADMIN_NAME || process.env.EDU_TEACHER_ADMIN_NAME || '').trim();
const email = (process.env.EDUCAFE_TEACHER_ADMIN_EMAIL || process.env.EDU_TEACHER_ADMIN_EMAIL || '').trim().toLowerCase();
const cpf = (process.env.EDUCAFE_TEACHER_ADMIN_CPF || process.env.EDU_TEACHER_ADMIN_CPF || '').replace(/\D/gu, '');
const password = process.env.EDUCAFE_TEACHER_ADMIN_PASSWORD || process.env.EDU_TEACHER_ADMIN_PASSWORD || '';
const pepper = process.env.EDUCAFE_TEACHER_CPF_PEPPER || process.env.EDU_TEACHER_CPF_PEPPER || '';

function validCpf(value) {
  if (!/^\d{11}$/u.test(value) || /^(\d)\1{10}$/u.test(value)) return false;
  const digit = (base, factor) => {
    const sum = [...base].reduce((total, item) => total + Number(item) * factor--, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return digit(value.slice(0, 9), 10) === Number(value[9]) && digit(value.slice(0, 10), 11) === Number(value[10]);
}

if (!process.env.DATABASE_URL || !name || !email.includes('@') || !validCpf(cpf) || password.length < 12 || Buffer.byteLength(pepper, 'utf8') < 32) {
  console.error('Defina DATABASE_URL e EDUCAFE_TEACHER_ADMIN_NAME/EMAIL/CPF/PASSWORD e EDUCAFE_TEACHER_CPF_PEPPER; use CPF válido e senha com pelo menos 12 caracteres.');
  process.exit(2);
}

const ca = process.env.DATABASE_CA?.replace(/\\n/g, '\n');
const servername = process.env.DATABASE_SSL_SERVERNAME?.trim();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 7000,
  ssl: {
    ...(ca ? { ca } : {}),
    ...(servername ? {
      servername,
      checkServerIdentity: (_hostname, certificate) => checkServerIdentity(servername, certificate)
    } : {}),
    rejectUnauthorized: true
  }
});
try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('edu-cafe-flow-initial-admin'))");
    const admins = await client.query("SELECT id FROM metalab_teacher_accounts WHERE account_role='admin' LIMIT 1");
    if (admins.rowCount) {
      await client.query('COMMIT');
      console.log('Administrador já provisionado; nenhuma conta foi alterada.');
      process.exitCode = 0;
    } else {
      const salt = randomBytes(16);
      const hash = await scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
      const passwordHash = `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(hash).toString('base64url')}`;
      const cpfDigest = createHmac('sha256', pepper).update(cpf, 'utf8').digest('hex');
      const created = await client.query(`
        INSERT INTO metalab_teacher_accounts (id,full_name,cpf_digest,email,password_hash,account_state,account_role,approved_at)
        VALUES ($1,$2,$3,$4,$5,'active','admin',NOW())
        ON CONFLICT DO NOTHING RETURNING id
      `, [randomUUID(), name, cpfDigest, email, passwordHash]);
      if (!created.rowCount) throw new Error('ADMIN_IDENTITY_CONFLICT');
      await client.query('COMMIT');
      console.log('Administrador inicial provisionado. O script não imprime CPF, e-mail ou senha.');
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally { client.release(); }
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : 'UNEXPECTED';
  console.error(`Provisionamento interrompido (${/^[A-Z0-9_]{1,40}$/u.test(code) ? code : 'UNEXPECTED'}). Nenhum segredo foi exibido.`);
  process.exitCode = 1;
} finally { await pool.end(); }
