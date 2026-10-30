'use client';

import { useCallback, useEffect, useState } from 'react';

type Preferences = { automatic: boolean; intervalSeconds: number; paused: boolean };
type SyncSummary = {
  counts: { synced: number; pending: number; syncing: number; failed: number; conflicts: number; needsAuth: number };
  lastCompletedAt: string | null;
  activeRun: { id: string; total: number; confirmed: number; startedAt: string } | null;
  latestRun: { id: string; total: number; confirmed: number; state: string; startedAt: string; completedAt: string | null } | null;
  history: Array<{ occurredAt: string; operationType: string; result: string; attempts: number; error: string | null }>;
};
type Status = { checkedAt: string; api: { reachable: boolean; authorized: boolean; error: string | null }; preferences: Preferences; summary: SyncSummary; retryWaiting: number };

const initialPreferences: Preferences = { automatic: true, intervalSeconds: 60, paused: false };
const errorLabels: Record<string, string> = {
  invalid_url: 'Endereço do servidor inválido', blocked_destination: 'Destino de rede bloqueado', dns_failure: 'Falha ao localizar o servidor (DNS)', process_interrupted: 'A sincronização foi interrompida e poderá ser repetida',
  network_unavailable: 'Sem acesso à rede', timeout: 'Tempo de conexão esgotado', server_unavailable: 'Servidor indisponível',
  tls_certificate: 'Certificado HTTPS inválido', not_found: 'Backend ainda não publicado', remote_unauthorized: 'Autorização expirada',
  remote_forbidden: 'Acesso não autorizado', remote_server_error: 'Erro no servidor remoto', incompatible: 'Backend incompatível',
  internal_error: 'Falha interna', sync_result_missing: 'O servidor não confirmou esta operação', remote_operation_failed: 'Operação rejeitada pelo servidor'
};
const resultLabels: Record<string, string> = { synced: 'Confirmada', pending: 'Pendente', syncing: 'Em processamento', error: 'Falha', conflict: 'Conflito', needs_auth: 'Autorização necessária' };
const formatDate = (value: string | null | undefined) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Ainda não realizada';

export default function SyncCenter() {
  const [status, setStatus] = useState<Status | null>(null);
  const [online, setOnline] = useState(true);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setOnline(navigator.onLine);
    const response = await fetch('/api/desktop/sync/status', { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar a central.');
    setStatus(payload as Status);
  }, []);

  useEffect(() => {
    let active = true;
    const runRefresh = () => void refresh().catch(error => active && setNotice(error instanceof Error ? error.message : 'Falha ao atualizar.')).finally(() => active && setLoading(false));
    const onOnline = () => { setOnline(true); runRefresh(); };
    const onOffline = () => setOnline(false);
    const onSyncEvent = (event: Event) => {
      const state = (event as CustomEvent<{ state?: string }>).detail?.state;
      if (state === 'running') setSyncing(true);
      if (state === 'finished') setSyncing(false);
      runRefresh();
    };
    runRefresh();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('metalab:desktop-sync', onSyncEvent);
    return () => {
      active = false;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('metalab:desktop-sync', onSyncEvent);
    };
  }, [refresh]);

  useEffect(() => {
    const interval = syncing || status?.summary.activeRun ? 1000 : (status?.preferences.intervalSeconds || 60) * 1000;
    const timer = window.setInterval(() => void refresh().catch(() => undefined), interval);
    return () => window.clearInterval(timer);
  }, [refresh, syncing, status?.preferences.intervalSeconds, status?.summary.activeRun?.id]);

  async function changePreferences(patch: Partial<Preferences>) {
    if (!status) return;
    setSaving(true);
    setNotice('');
    try {
      const response = await fetch('/api/desktop/sync/preferences', {
        method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar as preferências.');
      setStatus(current => current ? { ...current, preferences: payload.preferences } : current);
      setNotice(patch.paused === true ? 'Novas rodadas pausadas. A operação em andamento, se houver, será concluída.' : 'Preferências salvas neste dispositivo.');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao salvar preferências.'); }
    finally { setSaving(false); }
  }

  async function synchronizeNow() {
    if (syncing) return;
    setSyncing(true);
    setNotice('Sincronização solicitada. O progresso avança somente após confirmações do servidor.');
    window.dispatchEvent(new Event('metalab:desktop-sync'));
    try {
      const response = await fetch('/api/desktop/sync', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'manual' }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.busy ? 'Já existe uma rodada em andamento.' : payload.error || 'Não foi possível iniciar a sincronização.');
      setNotice(payload.run?.total ? `Rodada concluída: ${payload.run.confirmed} de ${payload.run.total} operações confirmadas.` : 'Não há operações pendentes para sincronizar.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Falha ao sincronizar.'); }
    finally { setSyncing(false); window.dispatchEvent(new CustomEvent('metalab:desktop-sync', { detail: { state: 'finished' } })); }
  }

  const preferences = status?.preferences || initialPreferences;
  const summary = status?.summary;
  const counts = summary?.counts;
  const run = summary?.activeRun
    ? { ...summary.activeRun, state: 'running', completedAt: null }
    : summary?.latestRun;
  const progress = run && run.total > 0 ? Math.floor(Math.min(100, (run.confirmed / run.total) * 100)) : 0;
  const networkLabel = online ? 'Rede disponível neste dispositivo' : 'Este dispositivo está sem conexão';
  const apiLabel = status?.api.reachable && status.api.authorized ? 'Servidor oficial conectado e autorizado' : status ? (errorLabels[status.api.error || 'server_unavailable'] || 'Servidor indisponível') : 'Verificando servidor…';

  return <div className="desktop-sync-center">
    {notice && <p className="desktop-sync-notice" role="status">{notice}</p>}
    <section className="desktop-sync-connectivity" aria-label="Conectividade">
      <div><span className={`desktop-sync-dot ${online ? 'is-online' : 'is-offline'}`} /><div><small>REDE DO DISPOSITIVO</small><strong>{networkLabel}</strong></div></div>
      <div><span className={`desktop-sync-dot ${status?.api.reachable ? 'is-online' : 'is-offline'}`} /><div><small>API OFICIAL</small><strong>{apiLabel}</strong></div></div>
      <div className="desktop-sync-check"><small>Última verificação</small><strong>{formatDate(status?.checkedAt)}</strong><button className="button button-secondary" type="button" onClick={() => void refresh().catch(error => setNotice(error.message))}>Verificar agora</button></div>
    </section>

    <section className="desktop-sync-summary" aria-label="Resumo da sincronização">
      <article><strong>{counts?.synced ?? 0}</strong><span>Confirmadas</span></article>
      <article><strong>{counts?.pending ?? 0}</strong><span>Pendentes</span></article>
      <article><strong>{counts?.syncing ?? 0}</strong><span>Em processamento</span></article>
      <article><strong>{counts?.failed ?? 0}</strong><span>Com falha</span></article>
      <article><strong>{counts?.conflicts ?? 0}</strong><span>Conflitos</span></article>
      <article><strong>{counts?.needsAuth ?? 0}</strong><span>Autorização necessária</span></article>
    </section>

    <section className="desktop-sync-progress">
      <div className="desktop-sync-section-head"><div><span className="section-tag">RODADA DE SINCRONIZAÇÃO</span><h2>{summary?.activeRun ? 'Sincronizando respostas' : 'Progresso confirmado'}</h2></div><button className="button button-primary" type="button" onClick={() => void synchronizeNow()} disabled={syncing || loading || preferences.paused}>{preferences.paused ? 'Sincronização pausada' : syncing ? 'Sincronizando…' : 'Sincronizar agora'}</button></div>
      {run?.total ? <>
        <div className="desktop-sync-progress-label"><strong>{run.confirmed} de {run.total} operações confirmadas pelo servidor</strong><span>{progress}%</span></div>
        <progress max={run.total} value={run.confirmed} aria-label="Operações confirmadas nesta rodada" />
        <small>{summary?.activeRun ? 'O total desta rodada está fixo até sua conclusão.' : `Rodada ${run.state === 'completed' ? 'concluída' : 'encerrada'} · ${formatDate(run.completedAt)}`}</small>
      </> : <p>Nenhuma rodada de sincronização foi concluída ainda.</p>}
      <p className="desktop-sync-last">Última rodada encerrada: {formatDate(summary?.latestRun?.completedAt)}</p>
      <p className="desktop-sync-last">Última operação confirmada pelo servidor: {formatDate(summary?.lastCompletedAt)}</p>
    </section>

    <section className="desktop-sync-settings">
      <span className="section-tag">PREFERÊNCIAS DESTE DISPOSITIVO</span><h2>Automação e controle</h2>
      <label className="desktop-sync-toggle"><input type="checkbox" checked={preferences.automatic} disabled={saving || loading} onChange={event => void changePreferences({ automatic: event.target.checked })} /><span><strong>Sincronizar automaticamente</strong><small>Verifica a API e tenta enviar operações elegíveis ao reconectar.</small></span></label>
      <label className="desktop-sync-interval">Intervalo de verificação<select value={preferences.intervalSeconds} disabled={saving || loading} onChange={event => void changePreferences({ intervalSeconds: Number(event.target.value) })}><option value={30}>30 segundos</option><option value={60}>1 minuto</option><option value={120}>2 minutos</option><option value={300}>5 minutos</option></select></label>
      <button className="button button-secondary" type="button" disabled={saving || loading} onClick={() => void changePreferences({ paused: !preferences.paused })}>{preferences.paused ? 'Retomar novas rodadas' : 'Pausar novas rodadas'}</button>
      <p className="desktop-sync-pause-note">{preferences.paused ? 'Pausada: nenhuma nova rodada será iniciada. Uma rodada em andamento pode terminar com segurança.' : 'A pausa não cancela uma resposta que já esteja sendo processada.'}</p>
    </section>

    <section className="desktop-sync-history">
      <div className="desktop-sync-section-head"><div><span className="section-tag">ATIVIDADE LOCAL</span><h2>Histórico recente</h2></div><button className="button button-secondary" type="button" onClick={() => void refresh().catch(() => undefined)}>Atualizar</button></div>
      {summary?.history.length ? <div className="desktop-sync-history-list">{summary.history.map((entry, index) => <article key={`${entry.occurredAt}-${index}`}>
        <div><strong>{entry.operationType}</strong><small>{formatDate(entry.occurredAt)} · tentativa {entry.attempts}</small></div>
        <span className={`desktop-sync-state state-${entry.result}`}>{resultLabels[entry.result] || entry.result}</span>
        {entry.error && <small className="desktop-sync-error">{errorLabels[entry.error] || 'Não foi possível concluir a operação.'}</small>}
      </article>)}</div> : <p>As operações aparecerão aqui quando forem sincronizadas ou precisarem de atenção.</p>}
    </section>
  </div>;
}
