import { NextRequest, NextResponse } from 'next/server';
import { allMissions } from '@/domain/curriculum';
import { listTeacherStudents } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  try {
    const students = await listTeacherStudents(allMissions.length);
    return NextResponse.json({ students }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.students.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar a turma agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
