import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { listStudentPublishedAcademicEvaluations } from '@/server/academic-evaluations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Entre em uma turma para consultar suas notas.' }, { status: 401, headers: noStore });
  try {
    const evaluations = await listStudentPublishedAcademicEvaluations(student.id);
    return NextResponse.json({ evaluations }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.grades.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar suas notas.' }, { status: 503, headers: noStore });
  }
}
