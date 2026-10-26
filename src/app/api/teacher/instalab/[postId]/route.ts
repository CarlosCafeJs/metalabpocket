import { NextRequest, NextResponse } from 'next/server';
import { deleteTeacherInstalabPost, listTeacherInstalabPosts, updateTeacherInstalabPost } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };
const noStore = { 'Cache-Control': 'no-store' };

export async function DELETE(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  const { postId } = await context.params;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
  try {
    const deleted = await deleteTeacherInstalabPost(postId);
    return deleted ? NextResponse.json({ deleted: true }, { headers: noStore }) : NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.delete failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível remover a publicação.' }, { status: 503, headers: noStore });
  }
}

function validImage(mime: string, bytes: Buffer) {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export async function PATCH(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  const { postId } = await context.params;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
  if (Number(request.headers.get('content-length') || 0) > 4 * 1024 * 1024 + 32 * 1024) return NextResponse.json({ error: 'A imagem deve ter no máximo 4 MB.' }, { status: 413, headers: noStore });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return NextResponse.json({ error: 'Envie a edição pelo formulário.' }, { status: 415, headers: noStore });
  try {
    const form = await request.formData();
    const body = String(form.get('body') || '').trim();
    const removeImage = String(form.get('removeImage') || '') === 'true';
    const rawFile = form.get('image');
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    if (body.length > 2000 || (body.length < 2 && !file && removeImage)) return NextResponse.json({ error: 'Mantenha um texto ou uma imagem na publicação.' }, { status: 400, headers: noStore });
    if (body && containsPotentialSensitiveData(body)) return NextResponse.json({ error: 'Remova links, e-mails, telefones, senhas ou códigos pessoais antes de salvar.' }, { status: 422, headers: noStore });
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024)) return NextResponse.json({ error: 'Escolha uma imagem JPG, PNG ou WebP de até 4 MB.' }, { status: 400, headers: noStore });
    const imageData = file ? Buffer.from(await file.arrayBuffer()) : null;
    if (file && imageData && !validImage(file.type, imageData)) return NextResponse.json({ error: 'O arquivo escolhido não é uma imagem válida.' }, { status: 415, headers: noStore });
    const updated = await updateTeacherInstalabPost({ postId, body, imageName: file ? file.name.replace(/[\\/\u0000-\u001f]/gu, '_').slice(0, 255) : null, imageMimeType: file?.type || null, imageData, removeImage });
    if (!updated) return NextResponse.json({ error: 'Publicação não encontrada ou precisa manter texto ou imagem.' }, { status: 404, headers: noStore });
    return NextResponse.json({ posts: await listTeacherInstalabPosts() }, { headers: noStore });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira os dados da publicação.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.instalab.update failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível editar a publicação.' }, { status: 503, headers: noStore });
  }
}
