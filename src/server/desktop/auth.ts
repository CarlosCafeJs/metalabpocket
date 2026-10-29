import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';
import { getProvision } from '@/server/desktop/store';

export const DESKTOP_COOKIE = 'metalab_desktop_session';
type DesktopClaims = { studentId: string; provisionId: string; expiresAt: number };

function secret() {
  const value = process.env.METALAB_DESKTOP_DATA_KEY || '';
  if (!/^[a-f0-9]{64}$/u.test(value)) throw new Error('DESKTOP_DATA_KEY_UNAVAILABLE');
  return Buffer.from(value, 'hex');
}

export function signDesktopSession(claims: DesktopClaims) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const signature = createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function readDesktopSession(request: NextRequest) {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return null;
  const value = request.cookies.get(DESKTOP_COOKIE)?.value || '';
  const [payload, signature, extra] = value.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret()).update(payload).digest();
  let actual: Buffer;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as DesktopClaims;
    if (typeof claims.studentId !== 'string' || typeof claims.provisionId !== 'string' || !Number.isSafeInteger(claims.expiresAt) || claims.expiresAt <= Date.now()) return null;
    const provision = getProvision(claims.provisionId);
    if (!provision || provision.studentId !== claims.studentId || Date.parse(provision.expiresAt) <= Date.now()) return null;
    return { ...claims, provision };
  } catch { return null; }
}

export function setDesktopCookie(response: NextResponse, token: string, expiresAt: number) {
  response.cookies.set({ name: DESKTOP_COOKIE, value: token, httpOnly: true, secure: false, sameSite: 'strict', path: '/', expires: new Date(expiresAt) });
}

export function clearDesktopCookie(response: NextResponse) {
  response.cookies.set({ name: DESKTOP_COOKIE, value: '', httpOnly: true, secure: false, sameSite: 'strict', path: '/', expires: new Date(0) });
}

export function isDesktopSameOrigin(request: Request) {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return false;
  const host = request.headers.get('host')?.trim().toLowerCase() || '';
  const origin = request.headers.get('origin') || '';
  if (!/^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/u.test(host) || !origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && !parsed.username && !parsed.password
      && parsed.pathname === '/' && !parsed.search && !parsed.hash
      && parsed.origin === `http://${host}`;
  } catch { return false; }
}

export function desktopClaimsCookie(studentId: string, provisionId: string, expiresAt: number) {
  return signDesktopSession({ studentId, provisionId, expiresAt });
}
