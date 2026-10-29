import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return new NextResponse(null, { status: 404 });
  return NextResponse.json({ ready: true, mode: 'desktop' }, { headers: { 'Cache-Control': 'no-store' } });
}
