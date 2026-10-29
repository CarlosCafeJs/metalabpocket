import { NextRequest, NextResponse } from 'next/server';
import { clearDesktopCookie, isDesktopSameOrigin, readDesktopSession } from '@/server/desktop/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return NextResponse.json({ active: false }, { status: 404, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ active: false }, { status: 401, headers: noStore });
  return NextResponse.json({ active: true, enrolled: true, student: { id: session.provision.studentId, displayName: session.provision.studentName }, backendOrigin: session.provision.backendUrl, expiresAt: session.provision.expiresAt }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const response = new NextResponse(null, { status: 204, headers: noStore });
  clearDesktopCookie(response);
  return response;
}
