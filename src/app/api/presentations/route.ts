import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createBlankPresentationDocument } from '@/domain/presentations';
import { hasTeacherSession } from '@/server/teacher-auth';
import { findStudentBySessionToken, getStudentClass } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { listStudentPresentations, listTeacherPresentations, createPresentation, duplicatePresentation, updatePresentation, softDeletePresentation } from '@/server/presentations';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const classIds = z.array(z.string().uuid()).max(50).refine(items => new Set(items).size === items.length, 'Turmas duplicadas.');
const title = z.string().trim().min(1).max(120);

function isMissingModuleSchema(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42P01');
}

function unavailableMessage(error: unknown, fallback: string) {
  return isMissingModuleSchema(error)
    ? 'MetaLab Apresentações ainda não foi instalado neste banco. Aplique as migrations pendentes.'
    : fallback;
}

export async function GET(request: NextRequest) {
  try {
    if (hasTeacherSession(request)) {
      return NextResponse.json({ presentations: await listTeacherPresentations(), role: 'teacher' }, { headers });
    }
    const token = readSessionToken(request);
    const student = token ? await findStudentBySessionToken(token) : null;
    if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers });
    const classroom = await getStudentClass(student.id);
    if (!classroom) return NextResponse.json({ error: 'Entre em uma turma para acessar as apresentações.' }, { status: 403, headers });
    return NextResponse.json({ presentations: await listStudentPresentations(classroom.id), role: 'student' }, { headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.list failed (${code})`);
    return NextResponse.json({ error: unavailableMessage(error, 'Não foi possível carregar as apresentações.') }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  try {
    const body = await readJson(request, 24 * 1024);
    const input = z.discriminatedUnion('action', [
      z.object({ action: z.literal('create'), title, classIds, isPublished: z.boolean().default(false) }).strict(),
      z.object({ action: z.literal('duplicate'), id: z.string().uuid(), title }).strict()
    ]).parse(body);
    if (input.action === 'duplicate') {
      const id = await duplicatePresentation(input.id, input.title);
      return id ? NextResponse.json({ id }, { status: 201, headers }) : NextResponse.json({ error: 'Apresentação não encontrada.' }, { status: 404, headers });
    }
    if (input.isPublished && !input.classIds.length) return NextResponse.json({ error: 'Escolha ao menos uma turma antes de publicar.' }, { status: 400, headers });
    const presentation = await createPresentation({ ...input, document: createBlankPresentationDocument() });
    if (!presentation) return NextResponse.json({ error: 'Uma das turmas selecionadas não existe.' }, { status: 400, headers });
    return NextResponse.json({ presentation }, { status: 201, headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira o título e as turmas selecionadas.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.create failed (${code})`);
    return NextResponse.json({ error: unavailableMessage(error, 'Não foi possível criar a apresentação.') }, { status: 503, headers });
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  try {
    const input = z.object({ id: z.string().uuid(), title, classIds, isPublished: z.boolean(), expectedRevision: z.number().int().positive() }).strict().parse(await readJson(request, 4096));
    if (input.isPublished && !input.classIds.length) return NextResponse.json({ error: 'Escolha ao menos uma turma antes de publicar.' }, { status: 400, headers });
    const result = await updatePresentation(input);
    if (result.kind === 'missing') return NextResponse.json({ error: 'Apresentação não encontrada.' }, { status: 404, headers });
    if (result.kind === 'missing-class') return NextResponse.json({ error: 'Uma das turmas selecionadas não existe.' }, { status: 400, headers });
    if (result.kind === 'conflict') return NextResponse.json({ error: 'Esta apresentação foi alterada em outra sessão. Atualize a lista antes de salvar.' }, { status: 409, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Os dados da apresentação são inválidos.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.update failed (${code})`);
    return NextResponse.json({ error: unavailableMessage(error, 'Não foi possível atualizar a apresentação.') }, { status: 503, headers });
  }
}

export async function DELETE(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  try {
    const input = z.object({ id: z.string().uuid(), expectedRevision: z.number().int().positive() }).strict().parse(await readJson(request, 1024));
    const deleted = await softDeletePresentation(input.id, input.expectedRevision);
    return deleted ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: 'A apresentação mudou ou não existe mais. Atualize a lista.' }, { status: 409, headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Apresentação inválida.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`presentations.delete failed (${code})`);
    return NextResponse.json({ error: unavailableMessage(error, 'Não foi possível excluir a apresentação.') }, { status: 503, headers });
  }
}
