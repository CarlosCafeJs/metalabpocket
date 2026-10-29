import { NextRequest, NextResponse } from 'next/server';
import { isDesktopSameOrigin, readDesktopSession } from '@/server/desktop/auth';
import { listOutbox, getProvision, setOutboxState } from '@/server/desktop/store';
import { DesktopBackendError, requestDesktopBackend, resolveDesktopBackend, verifyMetaLabDesktopBackend } from '@/server/desktop/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

export async function POST(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401, headers: noStore });
  const provision = getProvision(session.provisionId);
  if (!provision) return NextResponse.json({ error: 'Provisionamento local não encontrado.' }, { status: 401, headers: noStore });
  const operations = listOutbox(session.studentId).filter(item => item.provisionId === session.provisionId && (item.state === 'pending' || item.state === 'error'));
  if (!operations.length) return NextResponse.json({ results: [], pending: 0 }, { headers: noStore });
  const allResults: Array<{ operationId: string; state: string; result?: Record<string, unknown>; error?: string }> = [];
  for (let index = 0; index < operations.length; index += 20) {
    const batch = operations.slice(index, index + 20);
    for (const operation of batch) setOutboxState(operation.operationId, 'syncing');
    try {
      const backend = await resolveDesktopBackend(provision.backendUrl, { allowTestLocal: process.env.METALAB_DESKTOP_TEST_MODE === '1' });
      const remoteHeaders = { Origin: backend.origin };
      await verifyMetaLabDesktopBackend(backend, remoteHeaders);
      const response = await requestDesktopBackend(backend, '/api/student/desktop-sync', {
        method: 'POST', timeoutMs: 25_000,
        headers: { ...remoteHeaders, Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `DesktopSync ${provision.syncToken}` },
        body: JSON.stringify({ action: 'sync', operations: batch.map(item => ({
          operationId: item.operationId, provisionId: item.provisionId, missionId: item.missionId,
          snapshotHash: item.snapshotHash, answers: item.answers
        })) })
      });
      let payload: { results?: typeof allResults; error?: string } = {};
      try { payload = JSON.parse(response.text) as typeof payload; } catch { /* handled as incompatible response */ }
      if (response.status < 200 || response.status >= 300) {
        if (response.status >= 300 && response.status < 400) throw new DesktopBackendError('incompatible');
        if (response.status === 404) throw new DesktopBackendError('not_found');
        if (response.status >= 500) throw new DesktopBackendError('remote_server_error');
        const state = response.status === 401 || response.status === 403 ? 'needs_auth' : 'error';
        for (const operation of batch) setOutboxState(operation.operationId, state, { error: payload.error || `HTTP_${response.status}` });
        return NextResponse.json({ error: payload.error || 'O servidor não aceitou a sincronização.', pending: listOutbox(session.studentId).length }, { status: response.status === 401 || response.status === 403 ? 409 : 503, headers: noStore });
      }
      if (!Array.isArray(payload.results)) throw new DesktopBackendError('incompatible');
      const results = payload.results;
      const resultsByOperation = new Map(results.map(result => [result.operationId, result]));
      for (const operation of batch) {
        const result = resultsByOperation.get(operation.operationId);
        if (!result) {
          setOutboxState(operation.operationId, 'error', { error: 'SYNC_RESULT_MISSING' });
          allResults.push({ operationId: operation.operationId, state: 'error', error: 'SYNC_RESULT_MISSING' });
          continue;
        }
        const state = result.state === 'synced' ? 'synced' : result.state === 'conflict' || result.state === 'already_submitted' ? 'conflict' : result.state === 'revoked' ? 'needs_auth' : 'error';
        setOutboxState(result.operationId, state, { error: result.error || (state === 'conflict' ? result.state : undefined), result: result.result });
        allResults.push(result);
      }
    } catch (error) {
      const code = error instanceof DesktopBackendError ? error.code : error && typeof error === 'object' && 'name' in error ? String(error.name) : 'NETWORK_ERROR';
      for (const operation of batch) setOutboxState(operation.operationId, 'error', { error: code });
      const errorMessage = error instanceof DesktopBackendError && error.code === 'tls_certificate'
        ? 'Certificado HTTPS inválido. A resposta continua salva neste dispositivo.'
        : error instanceof DesktopBackendError && error.code === 'not_found'
          ? 'O backend Web ainda não publicou a rota de sincronização Desktop. A resposta continua salva neste dispositivo.'
          : error instanceof DesktopBackendError && error.code === 'remote_server_error'
            ? 'O servidor Web está com erro interno. A resposta continua salva neste dispositivo.'
            : error instanceof DesktopBackendError && error.code === 'dns_failure'
              ? 'Não foi possível localizar o servidor pelo DNS. A resposta continua salva neste dispositivo.'
              : error instanceof DesktopBackendError && error.code === 'timeout'
                ? 'A conexão expirou. A resposta continua salva neste dispositivo.'
                : error instanceof DesktopBackendError && error.code === 'network_unavailable'
                  ? 'A rede está indisponível. A resposta continua salva neste dispositivo.'
        : error instanceof DesktopBackendError && error.code === 'incompatible'
          ? 'Backend incompatível. A resposta continua salva neste dispositivo.'
          : error instanceof DesktopBackendError && error.code === 'blocked_destination'
            ? 'Destino de rede não permitido. A resposta continua salva neste dispositivo.'
            : 'Sem conexão com o servidor. A resposta continua salva neste dispositivo.';
      return NextResponse.json({ error: errorMessage, pending: listOutbox(session.studentId).length }, { status: 503, headers: noStore });
    }
  }
  return NextResponse.json({ results: allResults, pending: listOutbox(session.studentId).filter(item => item.provisionId === session.provisionId && item.state !== 'synced').length }, { headers: noStore });
}
