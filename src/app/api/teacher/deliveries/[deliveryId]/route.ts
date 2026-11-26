import { NextRequest, NextResponse } from 'next/server';
import { getTeacherDelivery } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { getTeacherAccountSession } from '@/server/teacher-accounts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest, context: { params: Promise<{ deliveryId: string }> }) {
  const legacy = hasTeacherSession(request);
  const account = legacy ? null : await getTeacherAccountSession(request).catch(() => null);
  if (!legacy && !account) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const { deliveryId } = await context.params;
  const delivery = await getTeacherDelivery(deliveryId, account?.role === 'teacher' ? account.id : undefined);
  if (!delivery || !delivery.fileName || !delivery.mimeType || delivery.sizeBytes === null) return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return new NextResponse(new Uint8Array(delivery.fileData), { headers: {
    'Content-Type': delivery.mimeType, 'Content-Length': String(delivery.sizeBytes),
    'Content-Disposition': `${delivery.mimeType.startsWith('image/') ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(delivery.fileName)}`,
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store'
  } });
}
