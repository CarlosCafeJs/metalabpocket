import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentDelivery } from '@/server/repository';
import { readSessionToken } from '@/server/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ deliveryId: string }> }) {
  const token = readSessionToken(request);
  const student = token ? await findEnrolledStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sessão expirada.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { deliveryId } = await context.params;
  const delivery = await getStudentDelivery(student.id, deliveryId);
  if (!delivery) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(new Uint8Array(delivery.fileData), { headers: {
    'Content-Type': delivery.mimeType, 'Content-Length': String(delivery.sizeBytes),
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(delivery.fileName)}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
  } });
}
