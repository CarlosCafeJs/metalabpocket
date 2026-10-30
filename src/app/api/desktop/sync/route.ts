import { randomInt, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isDesktopSameOrigin, readDesktopSession } from '@/server/desktop/auth';
import {
  acquireDesktopSyncRun, confirmDesktopSyncOperation, finishDesktopSyncRun, isDesktopSyncRunActive,
  getDesktopSyncPreferences, getDesktopSyncSummary, listSyncableOutbox,
  renewDesktopSyncLock, setOutboxState
} from '@/server/desktop/store';
import { DesktopBackendError, requestDesktopBackend, resolveDesktopBackend, verifyDesktopSyncAuthorization, verifyMetaLabDesktopBackend } from '@/server/desktop/backend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };

function retryTime(attempt: number) {
  const base = 15_000 * (2 ** Math.min(Math.max(attempt - 1, 0), 8));
  const jittered = Math.floor(base * (0.75 + randomInt(0, 501) / 1000));
  return new Date(Date.now() + Math.min(60 * 60_000, jittered)).toISOString();
}

function retryable(error: unknown) {
  return error instanceof DesktopBackendError && [
    'dns_failure', 'network_unavailable', 'timeout', 'server_unavailable', 'tls_certificate', 'remote_server_error'
  ].includes(error.code);
}

function errorCode(error: unknown) {
  return error instanceof DesktopBackendError ? error.code : 'internal_error';
}

export async function POST(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401, headers: noStore });

  let source: 'manual' | 'automatic' = 'manual';
  try {
    const body = await request.json().catch(() => ({})) as { source?: unknown };
    if (body.source === 'automatic') source = 'automatic';
    else if (body.source !== undefined && body.source !== 'manual') return NextResponse.json({ error: 'Origem da sincronização inválida.' }, { status: 400, headers: noStore });
  } catch { /* An empty body is the legacy manual request contract. */ }

  const preferences = getDesktopSyncPreferences(session.provisionId);
  if (preferences.paused) return NextResponse.json({ error: 'Sincronização pausada.', paused: true, summary: getDesktopSyncSummary(session.provisionId) }, { status: 409, headers: noStore });
  if (source === 'automatic' && !preferences.automatic) return NextResponse.json({ skipped: true, summary: getDesktopSyncSummary(session.provisionId) }, { headers: noStore });

  const operations = listSyncableOutbox(session.provisionId, new Date().toISOString(), source === 'manual');
  if (!operations.length) {
    const summary = getDesktopSyncSummary(session.provisionId);
    if (isDesktopSyncRunActive(session.provisionId)) return NextResponse.json({ error: 'Já existe uma sincronização em andamento.', busy: true, summary }, { status: 409, headers: noStore });
    return NextResponse.json({ results: [], pending: 0, summary }, { headers: noStore });
  }

  const runId = randomUUID();
  if (!acquireDesktopSyncRun(session.provisionId, runId, operations.length)) {
    return NextResponse.json({ error: 'Já existe uma sincronização em andamento.', busy: true, summary: getDesktopSyncSummary(session.provisionId) }, { status: 409, headers: noStore });
  }

  const allResults: Array<{ operationId: string; state: string; result?: Record<string, unknown>; error?: string }> = [];
  let runState: 'completed' | 'partial' | 'failed' = 'completed';
  let fatalError: string | null = null;
  for (let index = 0; index < operations.length; index += 20) {
    const batch = operations.slice(index, index + 20);
    renewDesktopSyncLock(session.provisionId, runId);
    for (const operation of batch) setOutboxState(operation.operationId, 'syncing');
    try {
      const backend = await resolveDesktopBackend(session.provision.backendUrl, { allowTestLocal: process.env.METALAB_DESKTOP_TEST_MODE === '1' });
      const remoteHeaders = { Origin: backend.origin };
      await verifyMetaLabDesktopBackend(backend, remoteHeaders);
      await verifyDesktopSyncAuthorization(backend, session.provision.syncToken);
      const response = await requestDesktopBackend(backend, '/api/student/desktop-sync', {
        method: 'POST', timeoutMs: 25_000,
        headers: { ...remoteHeaders, Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `DesktopSync ${session.provision.syncToken}` },
        body: JSON.stringify({ action: 'sync', operations: batch.map(item => ({
          operationId: item.operationId, provisionId: item.provisionId, missionId: item.missionId,
          snapshotHash: item.snapshotHash, answers: item.answers
        })) })
      });
      let payload: { results?: typeof allResults; error?: string } = {};
      try { payload = JSON.parse(response.text) as typeof payload; } catch { /* invalid responses are classified below */ }
      if (response.status < 200 || response.status >= 300) {
        if (response.status >= 300 && response.status < 400) throw new DesktopBackendError('incompatible');
        if (response.status === 404) throw new DesktopBackendError('not_found');
        if (response.status === 401) throw new DesktopBackendError('remote_unauthorized');
        if (response.status === 403) throw new DesktopBackendError('remote_forbidden');
        if (response.status >= 500) throw new DesktopBackendError('remote_server_error');
        throw new DesktopBackendError('incompatible');
      }
      if (!Array.isArray(payload.results)) throw new DesktopBackendError('incompatible');
      const allowedOperationIds = new Set(batch.map(operation => operation.operationId));
      const byOperation = new Map(payload.results.filter(result => allowedOperationIds.has(result.operationId)).map(result => [result.operationId, result]));
      for (const operation of batch) {
        const result = byOperation.get(operation.operationId);
        if (!result) {
          setOutboxState(operation.operationId, 'error', { error: 'sync_result_missing', nextAttemptAt: retryTime(operation.attempts + 1) });
          allResults.push({ operationId: operation.operationId, state: 'error', error: 'sync_result_missing' });
          runState = 'partial';
          continue;
        }
        const state = result.state === 'synced' ? 'synced' : result.state === 'conflict' || result.state === 'already_submitted' ? 'conflict' : result.state === 'revoked' ? 'needs_auth' : 'error';
        const canRetry = state === 'error' && result.state === 'error';
        setOutboxState(result.operationId, state, {
          error: state === 'conflict' ? 'conflict' : state === 'error' ? 'remote_operation_failed' : undefined,
          result: result.result,
          nextAttemptAt: canRetry ? retryTime(operation.attempts + 1) : null
        });
        if (state === 'synced') confirmDesktopSyncOperation(session.provisionId, runId);
        else runState = 'partial';
        allResults.push({ operationId: result.operationId, state, ...(state === 'error' ? { error: 'remote_operation_failed' } : {}) });
      }
    } catch (error) {
      const code = errorCode(error);
      const canRetry = retryable(error);
      const failureState = error instanceof DesktopBackendError && (error.code === 'remote_unauthorized' || error.code === 'remote_forbidden') ? 'needs_auth' : 'error';
      fatalError = code;
      runState = 'partial';
      for (const operation of batch) {
        setOutboxState(operation.operationId, failureState, { error: code, nextAttemptAt: canRetry ? retryTime(operation.attempts + 1) : null });
        allResults.push({ operationId: operation.operationId, state: failureState, error: code });
      }
      break;
    }
  }
  finishDesktopSyncRun(session.provisionId, runId, runState);
  const summary = getDesktopSyncSummary(session.provisionId);
  return NextResponse.json({
    results: allResults,
    pending: summary.counts.pending + summary.counts.failed + summary.counts.conflicts + summary.counts.needsAuth,
    run: { id: runId, total: operations.length, confirmed: summary.activeRun?.confirmed ?? allResults.filter(item => item.state === 'synced').length, state: runState },
    ...(fatalError ? { error: fatalError } : {}),
    summary
  }, { status: fatalError ? 503 : 200, headers: noStore });
}
