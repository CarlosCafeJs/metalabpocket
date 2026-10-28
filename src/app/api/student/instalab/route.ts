import { NextRequest, NextResponse } from 'next/server';
import { countStudentInstalabPosts, createInstalabPost, findEnrolledStudentBySessionToken, getStudentBusinessAndClass, getStudentInstalabSponsoredAd, listStudentInstalabPosts } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const maxImageBytes = 4 * 1024 * 1024;
const defaultPageSize = 12;
const allowedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);
const feedQuery = z.object({ limit: z.coerce.number().int().min(1).max(30).default(12), offset: z.coerce.number().int().min(0).max(100000).default(0), scope: z.enum(['class', 'mine']).default('class') });

async function currentStudent(request: NextRequest) {
  const token = readSessionToken(request);
  return token ? findEnrolledStudentBySessionToken(token) : null;
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
  const parsed = feedQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Parâmetros de paginação inválidos.' }, { status: 400, headers: noStore });
  try {
    const context = await getStudentBusinessAndClass(student.id);
    if (!context?.classId) return NextResponse.json({ studentId: student.id, studentName: context?.studentFullName ?? student.displayName, businessName: context?.businessName ?? null, businessSegment: context?.businessSegment ?? null, businessDescription: context?.businessDescription ?? null, hasAvatar: context?.hasAvatar ?? false, class: null, business: Boolean(context?.businessId), posts: [], sponsored: null, total: 0, hasMore: false }, { headers: noStore });
    if (!context.businessId) return NextResponse.json({ studentId: student.id, studentName: context.studentFullName, businessName: null, businessSegment: null, businessDescription: null, hasAvatar: context.hasAvatar, class: { id: context.classId, name: context.className }, business: false, posts: [], sponsored: null, total: 0, hasMore: false }, { headers: noStore });
    const { limit, offset, scope } = parsed.data;
    const mineOnly = scope === 'mine';
    const [posts, total] = await Promise.all([
      listStudentInstalabPosts(student.id, limit, offset, mineOnly),
      countStudentInstalabPosts(student.id, mineOnly),
    ]);
    const sponsored = !mineOnly && offset === 0 ? await getStudentInstalabSponsoredAd(student.id) : null;
    return NextResponse.json({ studentId: student.id, studentName: context.studentFullName, businessName: context.businessName, businessSegment: context.businessSegment, businessDescription: context.businessDescription, hasAvatar: context.hasAvatar, class: { id: context.classId, name: context.className }, business: true, posts, sponsored, total, hasMore: offset + posts.length < total }, { headers: noStore });
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
  const requestId = request.headers.get('idempotency-key') || '';
  if (!z.string().uuid().safeParse(requestId).success) return NextResponse.json({ error: 'Identificador da publicação inválido. Atualize a página e tente novamente.' }, { status: 400, headers: noStore });
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
      imageData,
      requestId
    });
    if (!id) return NextResponse.json({ error: 'Não foi possível associar a publicação à sua turma e empresa.' }, { status: 409, headers: noStore });
    const { id: postId, reward, balance, duplicate } = id;
    const [posts, total] = await Promise.all([listStudentInstalabPosts(student.id, defaultPageSize, 0), countStudentInstalabPosts(student.id)]);
    return NextResponse.json({ id: postId, posts, total, hasMore: posts.length < total, reward, balance, duplicate }, { status: duplicate ? 200 : 201, headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.instalab.create failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível publicar agora.' }, { status: 503, headers: noStore });
  }
}
