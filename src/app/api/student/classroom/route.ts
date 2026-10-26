import { NextRequest, NextResponse } from 'next/server';
import { findStudentBySessionToken, listClassroomForStudent } from '@/server/repository';
import { readSessionToken } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  const token = readSessionToken(request); const student = token ? await findStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try { return NextResponse.json({ modules: await listClassroomForStudent(student.id) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED'; console.error(`student.classroom.read failed (${code})`); return NextResponse.json({ error: 'Não foi possível carregar as missões liberadas.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
