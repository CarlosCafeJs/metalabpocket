import { NextRequest, NextResponse } from 'next/server';
import { hasTeacherSession } from '@/server/teacher-auth';
import { findStudentBySessionToken, getStudentClass } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { getPresentation, getStudentPresentation, updatePresentationDocument } from '@/server/presentations';
import { presentationDocumentSchema } from '@/domain/presentations';
import { readJson, sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function PATCH(request: NextRequest, context: { params: Promise<{ presentationId: string }> }) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  try {
    const { presentationId } = await context.params;
    if (!z.string().uuid().safeParse(presentationId).success) return NextResponse.json({ error: 'Identificador de apresentação inválido.' }, { status: 400, headers });
    const input = z.object({ expectedRevision: z.number().int().positive(), document: presentationDocumentSchema }).strict().parse(await readJson(request, 2 * 1024 * 1024));
    const result = await updatePresentationDocument({ id: presentationId, ...input });
    if (result.kind === 'missing') return NextResponse.json({ error: 'Apresentação não encontrada.' }, { status: 404, headers });
    if (result.kind === 'missing-assets') return NextResponse.json({ error: 'Uma imagem não pertence a esta apresentação. Envie-a novamente pelo editor.' }, { status: 400, headers });
    if (result.kind === 'conflict') return NextResponse.json({ error: 'Esta apresentação foi alterada em outra sessão. Atualize antes de continuar.' }, { status: 409, headers });
    return NextResponse.json({ ok: true, revision: result.revision }, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'O documento tem dados inválidos ou excede o limite permitido.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.document.update failed (${code})`);
    const missingSchema = Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
    return NextResponse.json({ error: missingSchema ? 'MetaLab Apresentações ainda não foi instalado neste banco. Aplique as migrations pendentes.' : 'Não foi possível salvar a apresentação.' }, { status: 503, headers });
  }
}

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
