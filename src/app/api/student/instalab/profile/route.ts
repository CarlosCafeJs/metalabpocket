import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentBusinessAndClass, removeInstalabAvatar, saveInstalabAvatar } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sanitizeInstalabImage } from '@/server/instalab-image';
import { sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const maxAvatarBytes = 2 * 1024 * 1024;
const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function currentStudent(request: NextRequest) {
  const token = readSessionToken(request);
  return token ? findEnrolledStudentBySessionToken(token) : null;
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxAvatarBytes + 24 * 1024) return NextResponse.json({ error: 'A foto deve ter no máximo 2 MB.' }, { status: 413, headers: noStore });
  const student = await currentStudent(request);
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const context = await getStudentBusinessAndClass(student.id);
    if (!context?.classId || !context.businessId) return NextResponse.json({ error: 'Entre em uma turma e cadastre sua empresa para editar o perfil.' }, { status: 409, headers: noStore });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return NextResponse.json({ error: 'Envie uma imagem pelo formulário.' }, { status: 415, headers: noStore });
    const form = await request.formData();
    const file = form.get('image');
    if (!(file instanceof File) || file.size < 1 || file.size > maxAvatarBytes || !allowedTypes.has(file.type)) return NextResponse.json({ error: 'Escolha uma foto JPG, PNG ou WebP de até 2 MB.' }, { status: 400, headers: noStore });
    const sanitized = sanitizeInstalabImage(file.type, Buffer.from(await file.arrayBuffer()));
    if (!sanitized || sanitized.byteLength > maxAvatarBytes) return NextResponse.json({ error: 'O conteúdo do arquivo não é uma imagem válida.' }, { status: 415, headers: noStore });
    const saved = await saveInstalabAvatar(student.id, sanitized, file.type);
    if (!saved) return NextResponse.json({ error: 'Não foi possível atualizar seu perfil.' }, { status: 409, headers: noStore });
    return NextResponse.json({ profileImageUrl: `/api/instalab/avatar/${student.id}?v=${Date.now()}` }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.avatar.save failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível salvar sua foto agora.' }, { status: 503, headers: noStore });
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const student = await currentStudent(request);
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const removed = await removeInstalabAvatar(student.id);
    if (!removed) return NextResponse.json({ error: 'Você ainda não tem uma foto de perfil.' }, { status: 404, headers: noStore });
    return NextResponse.json({ removed: true }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.avatar.remove failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível remover sua foto agora.' }, { status: 503, headers: noStore });
  }
}
