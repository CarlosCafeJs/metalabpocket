import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { instaflowRatingInputSchema } from '@/domain/instaflow-rating-policy';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { saveInstaflowPostRating } from '@/server/instaflow-ratings';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ postId: string }> };

async function change(request: NextRequest, context: Context, stars: number | null) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const teacher = await getTeacherAccountSession(request).catch(() => null);
  if (!teacher) return NextResponse.json({ error: 'Somente professores aprovados podem avaliar publicações.' }, { status: 401, headers: noStore });
  const { postId } = await context.params;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
  try {
    const result = await saveInstaflowPostRating({
      postId,
      teacherId: teacher.id,
      responsibleTeacherId: teacher.role === 'teacher' ? teacher.id : undefined,
      stars
    });
    if (result.kind === 'not-found') return NextResponse.json({ error: 'Publicação não encontrada nas suas turmas autorizadas.' }, { status: 404, headers: noStore });
    return NextResponse.json({ rating: result.summary }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.rating.write failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível atualizar as estrelas.' }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const parsed = instaflowRatingInputSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) return NextResponse.json({ error: 'Escolha de 1 a 5 estrelas.' }, { status: 400, headers: noStore });
    return await change(request, context, parsed.data.stars);
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: new Headers([...error.headers, ...Object.entries(noStore)]) });
    return NextResponse.json({ error: 'Não foi possível validar as estrelas.' }, { status: 400, headers: noStore });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  return change(request, context, null);
}
