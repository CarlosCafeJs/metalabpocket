import 'server-only';
import { createHash, createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { getPool, transaction } from '@/server/db';
import { nextTeacherAccountState } from '@/domain/teacher-account-policy';

export const TEACHER_ACCOUNT_COOKIE = 'edu_teacher_session';
const SESSION_HOURS = 12;
const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

export type TeacherAccountState = 'pending' | 'active' | 'rejected' | 'suspended' | 'disabled';
export type TeacherAccountRole = 'teacher' | 'admin';
export type TeacherIdentity = { id: string; fullName: string; role: TeacherAccountRole; state: 'active' };

export function normalizeTeacherCpf(input: string) { return input.replace(/\D/gu, ''); }

export function isValidTeacherCpf(input: string) {
  const cpf = normalizeTeacherCpf(input);
  if (!/^\d{11}$/u.test(cpf) || /^(\d)\1{10}$/u.test(cpf)) return false;
  const check = (base: string, initialFactor: number) => {
    const sum = [...base].reduce((value, digit) => value + Number(digit) * initialFactor--, 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };
  return check(cpf.slice(0, 9), 10) === Number(cpf[9]) && check(cpf.slice(0, 10), 11) === Number(cpf[10]);
}

export function normalizeTeacherEmail(input: string) { return input.trim().toLocaleLowerCase('en-US'); }

function cpfDigest(cpf: string) {
  const pepper = process.env.EDUCAFE_TEACHER_CPF_PEPPER || process.env.EDU_TEACHER_CPF_PEPPER || '';
  if (Buffer.byteLength(pepper, 'utf8') < 32) throw new Error('EDUCAFE_TEACHER_CPF_PEPPER_NOT_CONFIGURED');
  return createHmac('sha256', pepper).update(normalizeTeacherCpf(cpf), 'utf8').digest('hex');
}

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_BYTES, {
      N: cost, r: blockSize, p: parallelization, maxmem: SCRYPT_MAX_MEMORY
    }, (error, key) => error ? reject(error) : resolve(Buffer.from(key)));
  });
}

export async function hashTeacherPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyTeacherPassword(password: string, stored: string) {
  const [algorithm, costText, blockText, parallelText, saltText, hashText, ...extra] = stored.split('$');
  const cost = Number(costText), blockSize = Number(blockText), parallelization = Number(parallelText);
  if (extra.length || algorithm !== 'scrypt' || cost !== SCRYPT_COST || blockSize !== SCRYPT_BLOCK_SIZE || parallelization !== SCRYPT_PARALLELIZATION || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.byteLength !== 16 || expected.byteLength !== SCRYPT_KEY_BYTES) return false;
    return timingSafeEqual(await derive(password, salt, cost, blockSize, parallelization), expected);
  } catch { return false; }
}

function digestToken(token: string) { return createHash('sha256').update(token, 'utf8').digest('hex'); }

export async function registerTeacherAccount(input: { fullName: string; cpf: string; email: string; passwordHash: string }) {
  const id = randomUUID();
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO metalab_teacher_accounts (id, full_name, cpf_digest, email, password_hash, account_state, account_role)
    VALUES ($1, $2, $3, $4, $5, 'pending', 'teacher')
    ON CONFLICT DO NOTHING
    RETURNING id
  `, [id, input.fullName.trim(), cpfDigest(input.cpf), normalizeTeacherEmail(input.email), input.passwordHash]);
  return Boolean(result.rowCount);
}

export async function authenticateTeacherAccount(identifier: string, password: string) {
  const value = identifier.trim();
  const isCpf = /^\D*[0-9.\-/ ]+$/u.test(value) && normalizeTeacherCpf(value).length === 11;
  const digest = isCpf ? cpfDigest(value) : null;
  const result = await getPool().query<{ id: string; full_name: string; account_role: TeacherAccountRole; password_hash: string; account_state: TeacherAccountState }>(`
    SELECT id, full_name, account_role, password_hash, account_state
    FROM metalab_teacher_accounts
    WHERE (CASE WHEN $1::char(64) IS NOT NULL THEN cpf_digest = $1 ELSE LOWER(email) = LOWER($2) END)
    LIMIT 1
  `, [digest, normalizeTeacherEmail(value)]);
  const account = result.rows[0];
  // Verify a fixed fallback hash shape when the account is absent to reduce timing differences.
  const validPassword = account
    ? await verifyTeacherPassword(password, account.password_hash)
    : await verifyTeacherPassword(password, 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
  if (!account || account.account_state !== 'active' || !validPassword) return null;
  const token = randomBytes(32).toString('base64url');
  await transaction(async client => {
    await client.query('UPDATE metalab_teacher_accounts SET last_authenticated_at=NOW(), updated_at=NOW() WHERE id=$1 AND account_state=\'active\'', [account.id]);
    await client.query(`INSERT INTO metalab_teacher_sessions (id,teacher_id,token_digest,expires_at) VALUES ($1,$2,$3,NOW()+($4::int * INTERVAL '1 hour'))`, [randomUUID(), account.id, digestToken(token), SESSION_HOURS]);
  });
  return { token, teacher: { id: account.id, fullName: account.full_name, role: account.account_role as TeacherAccountRole, state: 'active' as const } };
}

export async function getTeacherAccountSession(request: NextRequest): Promise<TeacherIdentity | null> {
  const token = request.cookies.get(TEACHER_ACCOUNT_COOKIE)?.value || '';
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
  const result = await getPool().query<{ id: string; full_name: string; account_role: TeacherAccountRole }>(`
    SELECT account.id, account.full_name, account.account_role
    FROM metalab_teacher_sessions session
    JOIN metalab_teacher_accounts account ON account.id=session.teacher_id
    WHERE session.token_digest=$1 AND session.revoked_at IS NULL AND session.expires_at>NOW() AND account.account_state='active'
    LIMIT 1
  `, [digestToken(token)]);
  const row = result.rows[0];
  return row ? { id: row.id, fullName: row.full_name, role: row.account_role, state: 'active' } : null;
}

export async function revokeTeacherAccountSession(request: NextRequest) {
  const token = request.cookies.get(TEACHER_ACCOUNT_COOKIE)?.value || '';
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return;
  await getPool().query('UPDATE metalab_teacher_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE token_digest=$1', [digestToken(token)]);
}

export async function listTeacherSignupRequests() {
  const result = await getPool().query<{ id: string; full_name: string; email: string; account_state: TeacherAccountState; account_role: TeacherAccountRole; created_at: Date | string }>(`
    SELECT id, full_name, email, account_state, account_role, created_at FROM metalab_teacher_accounts ORDER BY created_at DESC LIMIT 500
  `);
  return result.rows.map(row => ({ id: row.id, fullName: row.full_name, email: row.email, state: row.account_state, role: row.account_role, createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at }));
}

export async function changeTeacherAccountState(adminId: string, teacherId: string, action: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'disable') {
  return transaction(async client => {
    if (adminId === teacherId) {
      const auditAction = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'reactivate' ? 'reactivated' : action;
      await client.query('INSERT INTO metalab_teacher_account_audit (admin_id,teacher_id,action,outcome) VALUES ($1,$2,$3,\'denied\')', [adminId, teacherId, auditAction]);
      return false;
    }
    const selected = await client.query<{ account_state: TeacherAccountState; account_role: TeacherAccountRole }>('SELECT account_state,account_role FROM metalab_teacher_accounts WHERE id=$1 FOR UPDATE', [teacherId]);
    const current = selected.rows[0]?.account_state;
    const state = current ? nextTeacherAccountState(current, action) : null;
    if (!current || selected.rows[0]?.account_role !== 'teacher' || !state) {
      await client.query('INSERT INTO metalab_teacher_account_audit (admin_id,teacher_id,action,outcome) VALUES ($1,$2,$3,\'denied\')', [adminId, teacherId, action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'reactivate' ? 'reactivated' : action]);
      return false;
    }
    await client.query(`UPDATE metalab_teacher_accounts SET account_state=$2, updated_at=NOW(), approved_at=CASE WHEN $2='active' THEN COALESCE(approved_at,NOW()) ELSE approved_at END, approved_by=CASE WHEN $2='active' THEN $3 ELSE approved_by END, suspended_at=CASE WHEN $2='suspended' THEN NOW() WHEN $2='active' THEN NULL ELSE suspended_at END, disabled_at=CASE WHEN $2='disabled' THEN NOW() ELSE disabled_at END WHERE id=$1`, [teacherId, state, adminId]);
    if (state !== 'active') await client.query('UPDATE metalab_teacher_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE teacher_id=$1 AND revoked_at IS NULL', [teacherId]);
    const auditAction = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : action === 'reactivate' ? 'reactivated' : action;
    await client.query('INSERT INTO metalab_teacher_account_audit (admin_id,teacher_id,action,outcome) VALUES ($1,$2,$3,\'success\')', [adminId, teacherId, auditAction]);
    return true;
  });
}
