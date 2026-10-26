import { NextRequest, NextResponse } from 'next/server';
import { findStudentBySessionToken, listStudentInstalabPosts, updateInstalabPost } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ postId: string }> };
const noStore = { 'Cache-Control': 'no-store' };

function validImage(mime: string, bytes: Buffer) {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export async function PUT(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const token = readSessionToken(request);
  const student = token ? await findStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  const postId = (await context.params).postId;
  if (!z.string().uuid().safeParse(postId).success) return NextResponse.json({ error: 'Publicação não encontrada.' }, { status: 404, headers: noStore });
  if (Number(request.headers.get('content-length') || 0) > 4 * 1024 * 1024 + 32 * 1024) return NextResponse.json({ error: 'A imagem deve ter no máximo 4 MB.' }, { status: 413, headers: noStore });
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return NextResponse.json({ error: 'Envie a edição pelo formulário.' }, { status: 415, headers: noStore });
  try {
    const form = await request.formData();
    const body = String(form.get('body') || '').trim();
    const removeImage = String(form.get('removeImage') || '') === 'true';
    const rawFile = form.get('image');
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    if (body.length > 2000 || (body.length < 2 && !file && !removeImage)) return NextResponse.json({ error: 'Mantenha uma legenda ou imagem na publicação.' }, { status: 400, headers: noStore });
    if (body && containsPotentialSensitiveData(body)) return NextResponse.json({ error: 'Remova links, e-mails, telefones, senhas ou códigos pessoais antes de publicar.' }, { status: 422, headers: noStore });
    if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024)) return NextResponse.json({ error: 'Escolha uma imagem JPG, PNG ou WebP de até 4 MB.' }, { status: 400, headers: noStore });
    const imageData = file ? Buffer.from(await file.arrayBuffer()) : null;
    if (file && imageData && !validImage(file.type, imageData)) return NextResponse.json({ error: 'O arquivo escolhido não é uma imagem válida.' }, { status: 415, headers: noStore });
    const updated = await updateInstalabPost({ postId, studentId: student.id, body, imageName: file ? file.name.replace(/[\\/\u0000-\u001f]/gu, '_').slice(0, 255) : null, imageMimeType: file?.type || null, imageData, removeImage });
    if (!updated) return NextResponse.json({ error: 'Você só pode editar publicações próprias que ainda pertencem à sua turma.' }, { status: 404, headers: noStore });
    return NextResponse.json({ posts: await listStudentInstalabPosts(student.id) }, { headers: noStore });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira os dados da publicação.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.update failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível editar a publicação.' }, { status: 503, headers: noStore });
  }
}

export async function DELETE() {
  return NextResponse.json({ error: 'Alunos não podem excluir publicações. Peça ao professor para remover o conteúdo.' }, { status: 403, headers: noStore });
}
