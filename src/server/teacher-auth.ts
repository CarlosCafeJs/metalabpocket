import 'server-only';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const TEACHER_COOKIE = 'metalab_teacher_session';
const SESSION_SECONDS = 6 * 60 * 60;

function digits(value: string) {
  return value.replace(/\D/g, '');
}

function validCpf(value: string) {
  if (!/^\d{11}$/u.test(value) || /^([0-9])\1{10}$/u.test(value)) return false;
  const digit = (base: string, factor: number) => {
    const sum = [...base].reduce((total, item) => total + Number(item) * factor--, 0);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  return digit(value.slice(0, 9), 10) === Number(value[9])
    && digit(value.slice(0, 10), 11) === Number(value[10]);
}

type TeacherAccount = { cpf: string; password: string };

function configuration() {
  const secret = process.env.METALAB_TEACHER_SESSION_SECRET || '';
  if (secret.length < 32) return null;

  const primaryCpf = digits(process.env.METALAB_TEACHER_CPF || '');
  const primaryPassword = process.env.METALAB_TEACHER_PASSWORD || '';
  const secondaryCpf = digits(process.env.METALAB_TEACHER_2_CPF || '');
  const secondaryPassword = process.env.METALAB_TEACHER_2_PASSWORD || '';
  const accounts: TeacherAccount[] = [];

  if (validCpf(primaryCpf) && primaryPassword.length >= 12) {
    accounts.push({ cpf: primaryCpf, password: primaryPassword });
  }

  // The optional second account may use a fictitious 11-digit identifier.
  // It is only an account name; access still requires its own strong password.
  if (/^\d{11}$/u.test(secondaryCpf) && !/^([0-9])\1{10}$/u.test(secondaryCpf)
      && !accounts.some(account => account.cpf === secondaryCpf) && secondaryPassword.length >= 12) {
    accounts.push({ cpf: secondaryCpf, password: secondaryPassword });
  }

  if (!accounts.length) return null;
  return { accounts, secret };
}

function equalText(left: string, right: string) {
  const hash = (value: string) => createHmac('sha256', 'metalab-teacher-compare').update(value).digest();
  return timingSafeEqual(hash(left), hash(right));
}

export function teacherAuthConfigured() {
  return configuration() !== null;
}

export function verifyTeacherCredentials(cpfInput: string, passwordInput: string) {
  const config = configuration();
  if (!config) return false;
  const cpf = digits(cpfInput);
  return config.accounts.some(account => equalText(cpf, account.cpf) && equalText(passwordInput, account.password));
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createTeacherSession(cpfInput: string) {
  const config = configuration();
  if (!config) throw new Error('TEACHER_AUTH_NOT_CONFIGURED');
  const cpf = digits(cpfInput);
  if (!config.accounts.some(account => equalText(cpf, account.cpf))) throw new Error('TEACHER_ACCOUNT_NOT_CONFIGURED');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${randomBytes(32).toString('base64url')}.${cpf}`;
  return `${payload}.${signature(payload, config.secret)}`;
}

export function teacherSessionCpf(request: NextRequest) {
  const config = configuration();
  const token = request.cookies.get(TEACHER_COOKIE)?.value || '';
  if (!config) return null;
  const parts = token.split('.');
  const modern = parts.length === 4 && /^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[0-9]{11}\.[a-f0-9]{64}$/u.test(token);
  const legacy = parts.length === 3 && /^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/u.test(token);
  if (!modern && !legacy) return null;
  const [expires, nonce, maybeCpf, maybeSignature] = modern ? parts : [parts[0], parts[1], undefined, parts[2]];
  const supplied = maybeSignature;
  if (!nonce || !supplied || Number(expires) <= Math.floor(Date.now() / 1000)) return null;
  const payload = modern ? `${expires}.${nonce}.${maybeCpf}` : `${expires}.${nonce}`;
  const expected = signature(payload, config.secret);
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) return null;
  return modern && maybeCpf && config.accounts.some(account => equalText(account.cpf, maybeCpf)) ? maybeCpf : null;
}

export function hasTeacherSession(request: NextRequest) {
  const config = configuration();
  const token = request.cookies.get(TEACHER_COOKIE)?.value || '';
  if (!config) return false;
  const parts = token.split('.');
  const modern = parts.length === 4 && /^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[0-9]{11}\.[a-f0-9]{64}$/u.test(token);
  const legacy = parts.length === 3 && /^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/u.test(token);
  if (!modern && !legacy) return false;
  const [expires, nonce, maybeCpf, maybeSignature] = modern ? parts : [parts[0], parts[1], undefined, parts[2]];
  const supplied = maybeSignature;
  if (!nonce || !supplied || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const payload = modern ? `${expires}.${nonce}.${maybeCpf}` : `${expires}.${nonce}`;
  const expected = signature(payload, config.secret);
  if (!timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))) return false;
  return !modern || Boolean(maybeCpf && config.accounts.some(account => equalText(account.cpf, maybeCpf)));
}

export function isInstalabEconomyAdmin(request: NextRequest) {
  const sessionCpf = teacherSessionCpf(request);
  const adminCpf = digits(process.env.METALAB_INSTALAB_ECONOMY_ADMIN_CPF || '');
  return Boolean(sessionCpf && adminCpf && equalText(sessionCpf, adminCpf));
}

export function setTeacherCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: TEACHER_COOKIE, value: token, httpOnly: true,
    secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: SESSION_SECONDS
  });
}

export function clearTeacherCookie(response: NextResponse) {
  response.cookies.set({
    name: TEACHER_COOKIE, value: '', httpOnly: true,
    secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', expires: new Date(0)
  });
}
