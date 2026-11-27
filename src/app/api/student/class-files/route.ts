import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentClass } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { listStudentClassFiles } from '@/server/class-files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Entre em uma turma para acessar os materiais.' }, { status: 401, headers: noStore });
  try {
    const classroom = await getStudentClass(student.id);
    if (!classroom) return NextResponse.json({ error: 'Você ainda não está vinculado a uma turma.' }, { status: 403, headers: noStore });
    return NextResponse.json({ classroom: { id: classroom.id, name: classroom.name }, files: await listStudentClassFiles(classroom.id) }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.class-files.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar os materiais da turma.' }, { status: 503, headers: noStore });
  }
}
