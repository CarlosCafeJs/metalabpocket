import { NextRequest, NextResponse } from 'next/server';
import { listStudentPhotos } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ studentId: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const studentId = (await context.params).studentId;
  if (!z.string().uuid().safeParse(studentId).success) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  try {
    const photos = await listStudentPhotos(studentId);
    return NextResponse.json({ photos }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.student.photos.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível atualizar as fotos deste aluno.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
