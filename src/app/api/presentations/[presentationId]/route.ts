import { NextRequest, NextResponse } from 'next/server';
import { hasTeacherSession } from '@/server/teacher-auth';
import { findStudentBySessionToken, getStudentClass } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { getPresentation, getStudentPresentation } from '@/server/presentations';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest, context: { params: Promise<{ presentationId: string }> }) {
  try {
    const { presentationId } = await context.params;
    if (!z.string().uuid().safeParse(presentationId).success) return NextResponse.json({ error: 'Identificador de apresentação inválido.' }, { status: 400, headers });
    if (hasTeacherSession(request)) {
      const presentation = await getPresentation(presentationId);
      return presentation ? NextResponse.json({ presentation }, { headers }) : NextResponse.json({ error: 'Apresentação não encontrada.' }, { status: 404, headers });
    }
    const token = readSessionToken(request);
    const student = token ? await findStudentBySessionToken(token) : null;
    if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers });
    const classroom = await getStudentClass(student.id);
    if (!classroom) return NextResponse.json({ error: 'Entre em uma turma para acessar este material.' }, { status: 403, headers });
    const presentation = await getStudentPresentation(presentationId, classroom.id);
    return presentation ? NextResponse.json({ presentation }, { headers }) : NextResponse.json({ error: 'Apresentação não encontrada ou não liberada para sua turma.' }, { status: 404, headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.read failed (${code})`);
    const missingSchema = Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
    return NextResponse.json({ error: missingSchema ? 'MetaLab Apresentações ainda não foi instalado neste banco. Aplique as migrations pendentes.' : 'Não foi possível abrir a apresentação.' }, { status: 503, headers });
  }
}
