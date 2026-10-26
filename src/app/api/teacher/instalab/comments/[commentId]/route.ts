import { NextRequest, NextResponse } from 'next/server';
import { deleteTeacherInstalabComment } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ commentId: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  const { commentId } = await context.params;
  if (!z.string().uuid().safeParse(commentId).success) return NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404, headers });
  try {
    const deleted = await deleteTeacherInstalabComment(commentId);
    return deleted ? NextResponse.json({ deleted: true }, { headers }) : NextResponse.json({ error: 'Comentário não encontrado.' }, { status: 404, headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.comment.delete failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível excluir o comentário.' }, { status: 503, headers });
  }
}
