import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentClass } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { getStudentClassFile } from '@/server/class-files';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ fileId: string }> };

export async function GET(request: NextRequest, context: Context) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Entre em uma turma para baixar materiais.' }, { status: 401, headers: noStore });
  const { fileId } = await context.params;
  if (!z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: noStore });
  try {
    const classroom = await getStudentClass(student.id);
    if (!classroom) return NextResponse.json({ error: 'Você ainda não está vinculado a uma turma.' }, { status: 403, headers: noStore });
    const file = await getStudentClassFile(fileId, classroom.id);
    if (!file?.content) return NextResponse.json({ error: 'Arquivo não encontrado na sua turma.' }, { status: 404, headers: noStore });
    const body = new ArrayBuffer(file.content.byteLength);
    new Uint8Array(body).set(file.content);
    const fallback = file.file_name.replace(/[^\x20-\x7E]|["\\]/gu, '_');
    const encoded = encodeURIComponent(file.file_name).replace(/['()*]/gu, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
    return new NextResponse(body, { headers: {
      ...noStore,
      'Content-Type': file.mime_type,
      'Content-Length': String(file.size_bytes),
      'Content-Disposition': `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff'
    } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.class-files.download failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível baixar este arquivo.' }, { status: 503, headers: noStore });
  }
}
