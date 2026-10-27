import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentInstalabImage } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sessão necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const postId = (await context.params).postId;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Imagem não encontrada.' }, { status: 404 });
  try {
    const image = await getStudentInstalabImage(postId, student.id);
    if (!image) return NextResponse.json({ error: 'Imagem indisponível para esta turma.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    return new NextResponse(new Uint8Array(image.image_data), { headers: { 'Content-Type': image.image_mime_type, 'Content-Disposition': `inline; filename="${image.image_name.replace(/["\\\r\n]/gu, '_')}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.image.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar esta imagem.' }, { status: 503 });
  }
}
