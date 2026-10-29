import { NextRequest, NextResponse } from 'next/server';
import { readDesktopSession } from '@/server/desktop/auth';
import { listCachedModules } from '@/server/desktop/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return NextResponse.json({ error: 'Recurso disponível apenas no aplicativo Desktop.' }, { status: 404 });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401 });
  return NextResponse.json({ modules: listCachedModules(session.provisionId), offline: true, expiresAt: session.provision.expiresAt }, { headers: { 'Cache-Control': 'no-store' } });
}
