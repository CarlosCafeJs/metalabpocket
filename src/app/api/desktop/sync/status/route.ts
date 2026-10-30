import { NextRequest, NextResponse } from 'next/server';
import { isDesktopLocalRequest, readDesktopSession } from '@/server/desktop/auth';
import { DesktopBackendError, resolveDesktopBackend, verifyDesktopSyncAuthorization, verifyMetaLabDesktopBackend } from '@/server/desktop/backend';
import { countSyncableOutbox, getDesktopSyncPreferences, getDesktopSyncSummary } from '@/server/desktop/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  if (!isDesktopLocalRequest(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401, headers: noStore });

  const checkedAt = new Date().toISOString();
  let api: { reachable: boolean; authorized: boolean; error: string | null } = { reachable: false, authorized: false, error: null };
  try {
    const backend = await resolveDesktopBackend(session.provision.backendUrl, { allowTestLocal: process.env.METALAB_DESKTOP_TEST_MODE === '1' });
    await verifyMetaLabDesktopBackend(backend, { Origin: backend.origin });
    await verifyDesktopSyncAuthorization(backend, session.provision.syncToken);
    api = { reachable: true, authorized: true, error: null };
  } catch (error) {
    const code = error instanceof DesktopBackendError ? error.code : 'internal_error';
    api = { reachable: !['dns_failure', 'network_unavailable', 'timeout', 'server_unavailable', 'tls_certificate'].includes(code), authorized: false, error: code };
  }

  return NextResponse.json({
    checkedAt,
    api,
    preferences: getDesktopSyncPreferences(session.provisionId),
    summary: getDesktopSyncSummary(session.provisionId),
    retryWaiting: countSyncableOutbox(session.provisionId)
  }, { headers: noStore });
}
