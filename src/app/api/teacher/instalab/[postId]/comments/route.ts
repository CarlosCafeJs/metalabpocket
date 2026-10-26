import { NextRequest, NextResponse } from 'next/server';
import { createTeacherInstalabComment, listTeacherInstalabPosts } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  const { postId } = await context.params;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
  try {
    const input = z.object({ body: z.string().trim().min(1).max(1000) }).strict().parse(await readJson(request, 2048));
    if (containsPotentialSensitiveData(input.body)) return NextResponse.json({ error: 'Remova links, e-mails, telefones, senhas ou códigos pessoais do comentário.' }, { status: 422, headers: noStore });
    const id = await createTeacherInstalabComment(postId, input.body);
    if (!id) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
    const post = (await listTeacherInstalabPosts()).find(item => item.id === postId);
    return NextResponse.json({ comments: post?.comments ?? [] }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Escreva um comentário de até 1.000 caracteres.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.comment failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível enviar o comentário.' }, { status: 503, headers: noStore });
  }
}
