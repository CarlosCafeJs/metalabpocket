import { NextResponse } from 'next/server';
import { databaseIsReady } from '@/server/repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ready = await databaseIsReady();
    return NextResponse.json(
      { status: ready ? 'ok' : 'not_ready' },
      { status: ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json(
      { status: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
