import 'server-only';
import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_COST = 16_384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_BYTES = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, cost: number, blockSize: number, parallelization: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_BYTES, {
      N: cost,
      r: blockSize,
      p: parallelization,
      maxmem: SCRYPT_MAX_MEMORY
    }, (error, key) => error ? reject(error) : resolve(Buffer.from(key)));
  });
}

export function hashStudentCpf(cpf: string) {
  const pepper = process.env.EDUCAFE_STUDENT_CPF_PEPPER || process.env.METALAB_STUDENT_CPF_PEPPER || '';
  if (Buffer.byteLength(pepper, 'utf8') < 32) throw new Error('STUDENT_CPF_PEPPER_NOT_CONFIGURED');
  return createHmac('sha256', pepper).update(cpf.replace(/\D/gu, ''), 'utf8').digest('hex');
}

export async function hashStudentPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELIZATION);
  return `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK_SIZE}$${SCRYPT_PARALLELIZATION}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyStudentPassword(password: string, stored: string) {
  const [algorithm, costText, blockText, parallelText, saltText, hashText, ...extra] = stored.split('$');
  const cost = Number(costText);
  const blockSize = Number(blockText);
  const parallelization = Number(parallelText);
  if (extra.length || algorithm !== 'scrypt' || cost !== SCRYPT_COST || blockSize !== SCRYPT_BLOCK_SIZE || parallelization !== SCRYPT_PARALLELIZATION || !saltText || !hashText) return false;
  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expected = Buffer.from(hashText, 'base64url');
    if (salt.byteLength !== 16 || expected.byteLength !== SCRYPT_KEY_BYTES) return false;
    const actual = await derive(password, salt, cost, blockSize, parallelization);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
