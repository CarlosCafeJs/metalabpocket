import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ error: 'Missão Relâmpago foi descontinuada. Consulte as Missões e atividades da turma.' }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
