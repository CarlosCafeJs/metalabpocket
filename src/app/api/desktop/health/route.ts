import { NextResponse } from 'next/server';
import { getDesktopDatabase } from '@/server/desktop/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return new NextResponse(null, { status: 404 });
  getDesktopDatabase();
  return NextResponse.json({ ready: true, mode: 'desktop', storage: 'sqlite' }, { headers: { 'Cache-Control': 'no-store' } });
}
