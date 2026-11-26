import { NextRequest, NextResponse } from 'next/server';
import { allMissions } from '@/domain/curriculum';
import { listTeacherStudents } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { getTeacherAccountSession } from '@/server/teacher-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const legacy = hasTeacherSession(request);
    const account = legacy ? null : await getTeacherAccountSession(request);
    if (!legacy && !account) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
    const archived = request.nextUrl.searchParams.get('archived') === 'true';
    const students = await listTeacherStudents(allMissions.length, archived, account?.role === 'teacher' ? account.id : undefined);
    return NextResponse.json({ students }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.students.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar a turma agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
