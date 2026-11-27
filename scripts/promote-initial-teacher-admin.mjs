import { createHmac, randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';
import { checkServerIdentity } from 'node:tls';
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

loadEnvConfig(process.cwd());
const scrypt = promisify(scryptCallback);
const name = (process.env.EDUCAFE_TEACHER_ADMIN_NAME || '').trim();
const email = (process.env.EDUCAFE_TEACHER_ADMIN_EMAIL || '').trim().toLowerCase();
const cpf = (process.env.EDUCAFE_TEACHER_ADMIN_CPF || '').replace(/\D/gu, '');
const password = process.env.EDUCAFE_TEACHER_ADMIN_PASSWORD || '';
const pepper = process.env.EDUCAFE_TEACHER_CPF_PEPPER || '';

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
  console.error('Configure DATABASE_URL, EDUCAFE_TEACHER_CPF_PEPPER e EDUCAFE_TEACHER_ADMIN_NAME/CPF/EMAIL/PASSWORD; use CPF válido e senha de pelo menos 12 caracteres.');
  process.exit(2);
}

const ca = process.env.DATABASE_CA?.replace(/\\n/gu, '\n');
const servername = process.env.DATABASE_SSL_SERVERNAME?.trim();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10000,
  ssl: {
    ...(ca ? { ca } : {}),
    ...(servername ? { servername, checkServerIdentity: (_host, certificate) => checkServerIdentity(servername, certificate) } : {}),
    rejectUnauthorized: true
  }
});

try {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('edu-cafe-flow-initial-admin'))");

    const admins = await client.query("SELECT 1 FROM metalab_teacher_accounts WHERE account_role='admin' LIMIT 1");
    if (admins.rowCount) throw new Error('ADMIN_ALREADY_EXISTS');

    const cpfDigest = createHmac('sha256', pepper).update(cpf, 'utf8').digest('hex');
    const matches = await client.query(
      `SELECT id, LOWER(email) AS email, cpf_digest, account_role, account_state
       FROM metalab_teacher_accounts
       WHERE LOWER(email)=LOWER($1) OR cpf_digest=$2
       FOR UPDATE`,
      [email, cpfDigest]
    );
    if (matches.rowCount !== 1 || matches.rows[0].email !== email || matches.rows[0].cpf_digest.trim() !== cpfDigest) {
      throw new Error('TEACHER_IDENTITY_MISMATCH');
    }
    const account = matches.rows[0];
    if (account.account_role !== 'teacher' || account.account_state !== 'pending') {
      throw new Error('ACCOUNT_NOT_PENDING_TEACHER');
    }

    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const passwordHash = `scrypt$16384$8$1$${salt.toString('base64url')}$${Buffer.from(derived).toString('base64url')}`;
    await client.query(
      `UPDATE metalab_teacher_accounts
       SET full_name=$2, password_hash=$3, account_state='active', account_role='admin',
           approved_at=COALESCE(approved_at,NOW()), updated_at=NOW()
       WHERE id=$1`,
      [account.id, name, passwordHash]
    );
    await client.query('COMMIT');
    console.log('Conta docente pendente promovida a administrador. Nenhum segredo foi exibido.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    const code = error instanceof Error ? error.message : 'UNEXPECTED';
    console.error(`Promoção cancelada (${/^[A-Z0-9_]{1,40}$/u.test(code) ? code : 'UNEXPECTED'}). Nenhuma alteração foi mantida.`);
    process.exitCode = 1;
  } finally {
    client.release();
  }
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'CONNECTION_FAILED';
  console.error(`Promoção não iniciada (${/^[A-Z0-9_]{1,40}$/u.test(code) ? code : 'CONNECTION_FAILED'}).`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
