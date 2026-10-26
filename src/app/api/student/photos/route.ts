import { NextRequest, NextResponse } from 'next/server';
import { deleteStudentPhoto, findStudentBySessionToken, saveStudentPhoto } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function readLimitedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_PHOTO_BYTES) {
        await reader.cancel();
        throw new Error('PHOTO_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
}

function hasValidImageHeader(type: string, image: Buffer) {
  if (type === 'image/png') return image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (type === 'image/jpeg') return image[0] === 255 && image[1] === 216 && image[2] === 255;
  if (type === 'image/webp') return image.toString('ascii', 0, 4) === 'RIFF' && image.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

function safeFileName(value: string) {
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { /* keep the raw header */ }
  return decoded.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 150) || 'foto-metalab.png';
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  const sessionToken = readSessionToken(request);
  if (!sessionToken) return json({ error: 'Entre no MetaLab Pocket para compartilhar suas fotos.' }, 401);

  try {
    const student = await findStudentBySessionToken(sessionToken);
    if (!student) return json({ error: 'Sessão expirada.' }, 401);
    const mimeType = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() || '';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) return json({ error: 'Formato de imagem não permitido.' }, 415);
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_PHOTO_BYTES) return json({ error: 'A foto deve ter no máximo 5 MB.' }, 413);
    const imageData = await readLimitedBody(request);
    if (!imageData.length || !hasValidImageHeader(mimeType, imageData)) return json({ error: 'O arquivo enviado não é uma imagem válida.' }, 415);

    const clientPhotoId = request.headers.get('x-metalab-photo-id') || '';
    if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(clientPhotoId)) return json({ error: 'Identificador da foto inválido.' }, 400);
    const product = (request.headers.get('x-metalab-product') || 'Produto do curso').replace(/[\u0000-\u001f]/g, '').slice(0, 80);
    const angle = Number(request.headers.get('x-metalab-angle') || 0);
    const height = Number(request.headers.get('x-metalab-height') || 0);
    if (!Number.isFinite(angle) || !Number.isFinite(height)) return json({ error: 'Dados da foto inválidos.' }, 400);

    const id = await saveStudentPhoto({
      studentId: student.id,
      clientPhotoId,
      fileName: safeFileName(request.headers.get('x-metalab-file-name') || ''),
      product,
      angle: Math.max(-360, Math.min(360, Math.round(angle))),
      height: Math.max(0, Math.min(1000, Math.round(height))),
      mimeType,
      imageData
    });
    if (!id) return json({ error: 'Você pode manter no máximo 10 fotos na galeria.' }, 413);
    return json({ photoId: id, synced: true }, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'PHOTO_TOO_LARGE') return json({ error: 'A foto deve ter no máximo 5 MB.' }, 413);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.photo.save failed (${code})`);
    return json({ error: 'Não foi possível enviar a foto ao curso. Ela continua na galeria local.' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  const sessionToken = readSessionToken(request);
  if (!sessionToken) return json({ error: 'Entre no MetaLab Pocket para remover suas fotos.' }, 401);

  try {
    const student = await findStudentBySessionToken(sessionToken);
    if (!student) return json({ error: 'Sessão expirada.' }, 401);
    const clientPhotoId = request.headers.get('x-metalab-photo-id') || '';
    if (!/^[a-zA-Z0-9_-]{1,100}$/u.test(clientPhotoId)) return json({ error: 'Identificador da foto inválido.' }, 400);
    await deleteStudentPhoto(student.id, clientPhotoId);
    return json({ deleted: true });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.photo.delete failed (${code})`);
    return json({ error: 'Não foi possível remover a foto agora.' }, 503);
  }
}
