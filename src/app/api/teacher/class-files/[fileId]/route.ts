import { NextRequest, NextResponse } from 'next/server';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { deleteTeacherClassFile, getTeacherClassFile } from '@/server/class-files';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
type Context = { params: Promise<{ fileId: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const teacher = await getTeacherAccountSession(request).catch(() => null);
  if (!teacher) return NextResponse.json({ error: 'Entre com uma conta docente ativa.' }, { status: 401, headers: noStore });
  const { fileId } = await context.params;
  if (!z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: noStore });
  try {
    const deleted = await deleteTeacherClassFile(fileId, teacher.role === 'teacher' ? teacher.id : undefined);
    return deleted ? NextResponse.json({ deleted: true }, { headers: noStore }) : NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.class-files.delete failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível remover o arquivo.' }, { status: 503, headers: noStore });
  }
}

export async function GET(request: NextRequest, context: Context) {
  const teacher = await getTeacherAccountSession(request).catch(() => null);
  if (!teacher) return NextResponse.json({ error: 'Entre com uma conta docente ativa.' }, { status: 401, headers: noStore });
  const { fileId } = await context.params;
  if (!z.string().uuid().safeParse(fileId).success) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: noStore });
  try {
    const file = await getTeacherClassFile(fileId, teacher.role === 'teacher' ? teacher.id : undefined);
    if (!file?.content) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: noStore });
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
    console.error(`teacher.class-files.download failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível baixar este arquivo.' }, { status: 503, headers: noStore });
  }
}
