import { NextRequest, NextResponse } from 'next/server';
import { setTeacherInstalabLike } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };
const headers = { 'Cache-Control': 'no-store' };

async function change(request: NextRequest, context: Context, liked: boolean) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers });
  const { postId } = await context.params;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers });
  try {
    const likeCount = await setTeacherInstalabLike(postId, liked);
    if (likeCount === null) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers });
    return NextResponse.json({ likeCount, likedByMe: liked }, { headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.like failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível registrar a interação.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest, context: Context) { return change(request, context, true); }
export async function DELETE(request: NextRequest, context: Context) { return change(request, context, false); }
