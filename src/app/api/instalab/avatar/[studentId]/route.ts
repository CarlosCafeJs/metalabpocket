import { NextRequest, NextResponse } from 'next/server';
import { getInstalabAvatar, findEnrolledStudentBySessionToken } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ studentId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const studentId = (await context.params).studentId;
  if (!z.string().uuid().safeParse(studentId).success) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const teacher = await getTeacherAccountSession(request).catch(()=>null);
  const token = readSessionToken(request);
  const viewer = !teacher && token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!teacher && !viewer) return new NextResponse(null, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const avatar = await getInstalabAvatar(studentId, teacher ? undefined : viewer!.id, teacher?.role==='teacher'?teacher.id:undefined);
    if (!avatar) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
    return new NextResponse(new Uint8Array(avatar.image_data), { headers: {
      'Content-Type': avatar.image_mime_type,
      'Content-Length': String(avatar.image_data.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline'
    } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`instalab.avatar.read failed (${code})`);
    return new NextResponse(null, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
