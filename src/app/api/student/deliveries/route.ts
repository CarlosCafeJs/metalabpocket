import { NextRequest, NextResponse } from 'next/server';
import { createStudentDelivery, findEnrolledStudentBySessionToken, listStudentDeliveries } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'video/mp4', 'video/webm']);
const maxFileBytes = 4 * 1024 * 1024;
const noStore = { 'Cache-Control': 'no-store' };

async function studentFor(request: NextRequest) {
  const token = readSessionToken(request);
  return token ? findEnrolledStudentBySessionToken(token) : null;
}

export async function GET(request: NextRequest) {
  try {
    const student = await studentFor(request);
    if (!student) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401, headers: noStore });
    return NextResponse.json({ deliveries: await listStudentDeliveries(student.id) }, { headers: noStore });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.deliveries.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar suas entregas.' }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const length = Number(request.headers.get('content-length') || 0);
  if (length > maxFileBytes + 64 * 1024) return NextResponse.json({ error: 'O envio excede o limite de 4 MB.' }, { status: 413, headers: noStore });
  try {
    const student = await studentFor(request);
    if (!student) return NextResponse.json({ error: 'Sua sessão expirou. Entre novamente.' }, { status: 401, headers: noStore });
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data')) {
      return NextResponse.json({ error: 'Envie os dados e o anexo pelo formulário.' }, { status: 415, headers: noStore });
    }
    const form = await request.formData();
    const activityName = String(form.get('activityName') || '').trim();
    const description = String(form.get('description') || '').trim();
    const rawQuickMissionId = String(form.get('quickMissionId') || '').trim();
    const quickMissionId = rawQuickMissionId || null;
    const classDate = String(form.get('classDate') || '');
    const file = form.get('file');
    if (activityName.length < 3 || activityName.length > 120 || description.length < 3 || description.length > 1000) {
      return NextResponse.json({ error: 'Informe o nome e a descrição da atividade.' }, { status: 400, headers: noStore });
    }
    if (quickMissionId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(quickMissionId)) {
      return NextResponse.json({ error: 'Missão selecionada inválida.' }, { status: 400, headers: noStore });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(classDate) || Number.isNaN(Date.parse(`${classDate}T12:00:00Z`))) {
      return NextResponse.json({ error: 'Informe uma data válida para a aula.' }, { status: 400, headers: noStore });
    }
    if (!(file instanceof File) || !file.size || file.size > maxFileBytes || !allowedTypes.has(file.type)) {
      return NextResponse.json({ error: 'Anexe uma foto JPG, PNG ou WebP, um PDF ou um vídeo MP4/WebM de até 4 MB.' }, { status: 400, headers: noStore });
    }
    const fileName = file.name.replace(/[\\/\u0000-\u001f]/gu, '_').slice(0, 255) || 'anexo';
    const delivery = await createStudentDelivery({ studentId: student.id, activityName, description, classDate, quickMissionId, fileName, mimeType: file.type, fileData: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ delivery }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    if (error instanceof Error && error.message === 'QUICK_MISSION_UNAVAILABLE') {
      return NextResponse.json({ error: 'O módulo desta missão foi recolhido pelo professor. Atualize a página para ver as opções disponíveis.' }, { status: 409, headers: noStore });
    }
    console.error(`student.deliveries.create failed (${code})`);
    return NextResponse.json({ error: code === '42P01' ? 'A tabela de entregas ainda não foi criada. Aplique as migrações do banco.' : 'Não foi possível salvar a entrega agora.' }, { status: 503, headers: noStore });
  }
}
