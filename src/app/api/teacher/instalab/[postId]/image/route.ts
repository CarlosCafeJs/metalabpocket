import { NextRequest, NextResponse } from 'next/server';
import { getStudentInstalabImage } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };

export async function GET(request: NextRequest, context: Context) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const postId = (await context.params).postId;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Imagem não encontrada.' }, { status: 404 });
  try {
    const image = await getStudentInstalabImage(postId, '00000000-0000-0000-0000-000000000000', true);
    if (!image) return NextResponse.json({ error: 'Imagem não encontrada.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(new Uint8Array(image.image_data), { headers: { 'Content-Type': image.image_mime_type, 'Content-Disposition': `inline; filename="${image.image_name.replace(/["\\\r\n]/gu, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.image.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar esta imagem.' }, { status: 503 });
  }
}
