import { NextRequest, NextResponse } from 'next/server';
import { findStudentBySessionToken, setInstalabLike } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };

async function change(request: NextRequest, context: Context, liked: boolean) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  const token = readSessionToken(request);
  const student = token ? await findStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers });
  const { postId } = await context.params;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers });
  try {
    const result = await setInstalabLike(postId, student.id, liked);
    if (!result) return NextResponse.json({ error: 'Publicação não encontrada na sua turma.' }, { status: 404, headers });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.like failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível atualizar a curtida.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest, context: Context) { return change(request, context, true); }
export async function DELETE(request: NextRequest, context: Context) { return change(request, context, false); }
