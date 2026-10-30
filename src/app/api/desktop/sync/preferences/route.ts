import { NextRequest, NextResponse } from 'next/server';
import { isDesktopLocalRequest, isDesktopSameOrigin, readDesktopSession } from '@/server/desktop/auth';
import { getDesktopSyncPreferences, saveDesktopSyncPreferences } from '@/server/desktop/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (!isDesktopLocalRequest(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401, headers: noStore });
  return NextResponse.json({ preferences: getDesktopSyncPreferences(session.provisionId) }, { headers: noStore });
}

export async function PATCH(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401, headers: noStore });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || Object.keys(body).some(key => !['automatic', 'intervalSeconds', 'paused'].includes(key))) {
    return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400, headers: noStore });
  }
  const current = getDesktopSyncPreferences(session.provisionId);
  const automatic = body.automatic === undefined ? current.automatic : body.automatic;
  const intervalSeconds = body.intervalSeconds === undefined ? current.intervalSeconds : body.intervalSeconds;
  const paused = body.paused === undefined ? current.paused : body.paused;
  if (typeof automatic !== 'boolean' || typeof paused !== 'boolean' || typeof intervalSeconds !== 'number' || !Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 300) {
    return NextResponse.json({ error: 'Use um intervalo inteiro entre 30 e 300 segundos.' }, { status: 400, headers: noStore });
  }
  return NextResponse.json({ preferences: saveDesktopSyncPreferences(session.provisionId, { automatic, intervalSeconds, paused }) }, { headers: noStore });
}
