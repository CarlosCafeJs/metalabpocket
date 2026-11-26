import 'server-only';
import type { NextRequest, NextResponse } from 'next/server';
import { canAccessTeacherAdmin, rejectLegacyTeacherSession } from '@/domain/teacher-session-policy';
import { getTeacherAccountSession } from '@/server/teacher-accounts';

// Kept only to expire cookies previously issued by the environment-based login.
export const TEACHER_COOKIE = 'metalab_teacher_session';

/** Legacy HMAC cookies and credential-based sessions are intentionally invalid. */
export function hasTeacherSession(_request: NextRequest) {
  return rejectLegacyTeacherSession('');
}

/** Global teacher operations are restricted to an active, database-backed admin. */
export async function hasTeacherOrAdminSession(request: NextRequest) {
  try {
    const identity = await getTeacherAccountSession(request);
    return canAccessTeacherAdmin(identity?.role ?? null);
  } catch {
    return false;
  }
}

export async function isInstalabEconomyAdmin(request: NextRequest) {
  return hasTeacherOrAdminSession(request);
}

export function clearTeacherCookie(response: NextResponse) {
  response.cookies.set({
    name: TEACHER_COOKIE, value: '', httpOnly: true,
    secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', expires: new Date(0)
  });
}
