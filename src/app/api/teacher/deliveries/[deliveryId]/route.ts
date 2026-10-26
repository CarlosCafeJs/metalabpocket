import { NextRequest, NextResponse } from 'next/server';
import { getTeacherDelivery } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ deliveryId: string }> }) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { deliveryId } = await context.params;
  const delivery = await getTeacherDelivery(deliveryId);
  if (!delivery) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(new Uint8Array(delivery.fileData), { headers: {
    'Content-Type': delivery.mimeType, 'Content-Length': String(delivery.sizeBytes),
    'Content-Disposition': `${delivery.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(delivery.fileName)}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
  } });
}
