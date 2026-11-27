import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { listTeacherClasses } from '@/server/repository';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { CLASS_FILE_MAX_BYTES, createTeacherClassFile, listTeacherClassFiles } from '@/server/class-files';
import { sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

const supportedTypes: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain', csv: 'text/csv',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp'
};

function hasExpectedSignature(extension: string, bytes: Buffer) {
  if (extension === 'pdf') return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === 'png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (extension === 'jpg' || extension === 'jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (extension === 'webp') return bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (['docx','xlsx','pptx'].includes(extension)) return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (extension === 'txt' || extension === 'csv') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/u.test(text);
    } catch { return false; }
  }
  return false;
}

function cleanFileName(value: string) {
  return value.normalize('NFKC').replace(/[\\/\u0000-\u001F\u007F]/gu, '_').trim().slice(0, 180) || 'material';
}

export async function GET(request: NextRequest) {
  const teacher = await getTeacherAccountSession(request).catch(() => null);
  if (!teacher) return NextResponse.json({ error: 'Entre com uma conta docente ativa.' }, { status: 401, headers: noStore });
  try {
    const owner = teacher.role === 'teacher' ? teacher.id : undefined;
    const [classes, files] = await Promise.all([listTeacherClasses(owner), listTeacherClassFiles(owner)]);
    return NextResponse.json({ classes, files }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.class-files.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar os arquivos das turmas.' }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const teacher = await getTeacherAccountSession(request).catch(() => null);
  if (!teacher) return NextResponse.json({ error: 'Entre com uma conta docente ativa.' }, { status: 401, headers: noStore });
  if (Number(request.headers.get('content-length') || 0) > CLASS_FILE_MAX_BYTES + 96 * 1024) {
    return NextResponse.json({ error: 'O arquivo pode ter no máximo 15 MB.' }, { status: 413, headers: noStore });
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
    return NextResponse.json({ error: 'Envie o arquivo pelo formulário.' }, { status: 415, headers: noStore });
  }

  try {
    const form = await request.formData();
    const classId = z.string().uuid().safeParse(form.get('classId'));
    const file = form.get('file');
    if (!classId.success || !(file instanceof File)) {
      return NextResponse.json({ error: 'Escolha uma turma e um arquivo.' }, { status: 400, headers: noStore });
    }
    if (file.size < 1 || file.size > CLASS_FILE_MAX_BYTES) {
      return NextResponse.json({ error: 'O arquivo pode ter no máximo 15 MB.' }, { status: 413, headers: noStore });
    }
    const safeName = cleanFileName(file.name);
    const extension = safeName.split('.').pop()?.toLowerCase() || '';
    const mimeType = supportedTypes[extension];
    if (!mimeType || (file.type && file.type !== mimeType)) {
      return NextResponse.json({ error: 'Formato não permitido. Use PDF, DOCX, XLSX, PPTX, TXT, CSV, JPG, PNG ou WebP.' }, { status: 415, headers: noStore });
    }
    const content = Buffer.from(await file.arrayBuffer());
    if (!hasExpectedSignature(extension, content)) {
      return NextResponse.json({ error: 'O conteúdo não corresponde ao formato do arquivo.' }, { status: 400, headers: noStore });
    }
    const id = await createTeacherClassFile({
      classId: classId.data,
      teacherId: teacher.id,
      responsibleTeacherId: teacher.role === 'teacher' ? teacher.id : undefined,
      fileName: safeName,
      mimeType,
      content
    });
    if (!id) return NextResponse.json({ error: 'Turma não encontrada ou fora do seu escopo.' }, { status: 404, headers: noStore });
    const owner = teacher.role === 'teacher' ? teacher.id : undefined;
    return NextResponse.json({ id, files: await listTeacherClassFiles(owner) }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.class-files.upload failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível salvar este arquivo.' }, { status: 503, headers: noStore });
  }
}
