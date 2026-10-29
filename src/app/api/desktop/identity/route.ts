import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    application: 'metalab-pocket',
    capability: 'desktop-offline-sync',
    protocolVersion: 1
  }, { headers: { 'Cache-Control': 'no-store' } });
}
