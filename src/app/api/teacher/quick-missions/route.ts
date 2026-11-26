import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function retired() {
  return NextResponse.json({ error: 'Missão Relâmpago foi descontinuada. Use Missão da Turma.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET() { return retired(); }
export async function POST() { return retired(); }
export async function PATCH() { return retired(); }
