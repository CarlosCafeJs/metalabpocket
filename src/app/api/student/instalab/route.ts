import { NextRequest, NextResponse } from 'next/server';
import { createInstalabPost, findStudentBySessionToken, getStudentBusinessAndClass, listStudentInstalabPosts } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const maxImageBytes = 4 * 1024 * 1024;
const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);

async function currentStudent(request: NextRequest) {
  const token = readSessionToken(request);
  return token ? findStudentBySessionToken(token) : null;
}

function isValidImage(mime: string, bytes: Buffer) {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

export async function GET(request: NextRequest) {
  const student = await currentStudent(request);
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const context = await getStudentBusinessAndClass(student.id);
    if (!context?.classId) return NextResponse.json({ class: null, business: Boolean(context?.businessId), posts: [] }, { headers: noStore });
    if (!context.businessId) return NextResponse.json({ class: { id: context.classId, name: context.className }, business: false, posts: [] }, { headers: noStore });
    const posts = await listStudentInstalabPosts(student.id);
    return NextResponse.json({ class: { id: context.classId, name: context.className }, business: true, posts }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar o InstaLab agora.' }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxImageBytes + 32 * 1024) return NextResponse.json({ error: 'A imagem deve ter no máximo 4 MB.' }, { status: 413, headers: noStore });
  const student = await currentStudent(request);
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const context = await getStudentBusinessAndClass(student.id);
    if (!context?.businessId) return NextResponse.json({ error: 'Crie e salve sua empresa antes de publicar no InstaLab.' }, { status: 409, headers: noStore });
    if (!context.classId) return NextResponse.json({ error: 'Entre em uma turma antes de publicar no InstaLab.' }, { status: 409, headers: noStore });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) return NextResponse.json({ error: 'Envie a publicação pelo formulário.' }, { status: 415, headers: noStore });
    const form = await request.formData();
    const body = String(form.get('body') || '').trim();
    const rawFile = form.get('image');
    const file = rawFile instanceof File && rawFile.size > 0 ? rawFile : null;
    if (body.length > 2000 || (body.length < 2 && !file)) return NextResponse.json({ error: 'Escreva uma legenda ou escolha uma imagem.' }, { status: 400, headers: noStore });
    if (body && containsPotentialSensitiveData(body)) return NextResponse.json({ error: 'Remova links, e-mails, telefones, senhas ou códigos pessoais antes de publicar.' }, { status: 422, headers: noStore });
    if (file && (!allowedImages.has(file.type) || file.size > maxImageBytes)) return NextResponse.json({ error: 'Escolha uma imagem JPG, PNG ou WebP de até 4 MB.' }, { status: 400, headers: noStore });
    const imageData = file ? Buffer.from(await file.arrayBuffer()) : null;
    if (file && imageData && !isValidImage(file.type, imageData)) return NextResponse.json({ error: 'O arquivo escolhido não é uma imagem válida.' }, { status: 415, headers: noStore });
    const id = await createInstalabPost({
      studentId: student.id,
      body,
      imageName: file ? file.name.replace(/[\\/\u0000-\u001f]/gu, '_').slice(0, 255) : null,
      imageMimeType: file?.type || null,
      imageData
    });
    if (!id) return NextResponse.json({ error: 'Não foi possível associar a publicação à sua turma e empresa.' }, { status: 409, headers: noStore });
    return NextResponse.json({ id, posts: await listStudentInstalabPosts(student.id) }, { status: 201, headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.create failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível publicar agora.' }, { status: 503, headers: noStore });
  }
}
