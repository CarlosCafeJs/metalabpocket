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

function configuration() {
  const cpf = digits(process.env.METALAB_TEACHER_CPF || '');
  const password = process.env.METALAB_TEACHER_PASSWORD || '';
  const secret = process.env.METALAB_TEACHER_SESSION_SECRET || '';
  if (!validCpf(cpf) || password.length < 12 || secret.length < 32) return null;
  return { cpf, password, secret };
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
  return validCpf(cpf) && equalText(cpf, config.cpf) && equalText(passwordInput, config.password);
}

function signature(payload: string, secret: string) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function createTeacherSession() {
  const config = configuration();
  if (!config) throw new Error('TEACHER_AUTH_NOT_CONFIGURED');
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${expires}.${randomBytes(32).toString('base64url')}`;
  return `${payload}.${signature(payload, config.secret)}`;
}

export function hasTeacherSession(request: NextRequest) {
  const config = configuration();
  const token = request.cookies.get(TEACHER_COOKIE)?.value || '';
  if (!config || !/^[0-9]{10}\.[A-Za-z0-9_-]{43}\.[a-f0-9]{64}$/u.test(token)) return false;
  const [expires, nonce, supplied] = token.split('.');
  if (!nonce || !supplied || Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  const expected = signature(`${expires}.${nonce}`, config.secret);
  return timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'));
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
