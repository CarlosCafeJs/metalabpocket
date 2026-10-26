import 'server-only';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

export const SESSION_COOKIE_NAME = 'metalab_session';
const DEFAULT_SESSION_HOURS = 12;

function sessionHours() {
  const configured = Number.parseInt(process.env.METALAB_SESSION_HOURS || '', 10);
  return Number.isFinite(configured) && configured >= 1 && configured <= 24
    ? configured
    : DEFAULT_SESSION_HOURS;
}

export function createSessionMaterial() {
  const token = randomBytes(32).toString('base64url');
  return {
    id: randomUUID(),
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + sessionHours() * 60 * 60 * 1000)
  };
}

export function hashSessionToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isSessionToken(token: unknown): token is string {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function readSessionToken(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return isSessionToken(token) ? token : null;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/'
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0)
  });
}
