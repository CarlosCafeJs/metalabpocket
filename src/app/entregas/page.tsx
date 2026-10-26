'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';

type Delivery = { id: string; activityName: string; description: string; classDate: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string; quickMissionTitle?: string | null };
type QuickMission = { id: string; title: string; description: string; request: string; estimatedMinutes: number; dueAt: string | null; submitted: boolean };
type QuickModule = { missions: QuickMission[] };
const today = () => new Date().toLocaleDateString('sv-SE');
const readableSize = (bytes: number) => bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

export default function DeliveriesPage() {
  const [items, setItems] = useState<Delivery[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Carregando suas entregas…');
  const [todayDate, setTodayDate] = useState('');
  const [missions, setMissions] = useState<QuickMission[]>([]);
  const [selectedMissionId, setSelectedMissionId] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/student/deliveries', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as entregas.');
      setItems(data.deliveries); setMessage(data.deliveries.length ? '' : 'As atividades solicitadas pelo professor aparecerão aqui depois do primeiro envio.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as entregas.'); }
  }, []);

  useEffect(() => { setTodayDate(today()); void load(); }, [load]);

  useEffect(() => {
    const queryMission = new URLSearchParams(window.location.search).get('missao') || '';
    setSelectedMissionId(queryMission);
    fetch('/api/student/quick-missions', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => response.ok ? response.json() : { modules: [] })
      .then((data: { modules?: QuickModule[] }) => setMissions((data.modules || []).flatMap(module=>module.missions)))
      .catch(() => setMissions([]));
  }, []);

  const selectedMission = missions.find(item => item.id === selectedMissionId);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setMessage('');
    try {
      const form = new FormData(formElement);
      if (selectedMissionId) form.set('quickMissionId', selectedMissionId);
      const response = await fetch('/api/student/deliveries', { method: 'POST', credentials: 'same-origin', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a entrega.');
      formElement.reset(); setSelectedMissionId(''); window.history.replaceState({}, '', '/entregas'); setMessage('Entrega enviada e salva no seu registro.'); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar a entrega.'); }
    finally { setBusy(false); }
  }

  return <AppShell eyebrow="ATIVIDADES DA FORMAÇÃO" title="Entregas" description="Envie os materiais pedidos em aula. Seus arquivos ficam vinculados à sua sessão e visíveis para você e para o professor.">
    <div className="delivery-layout">
      <section className="delivery-form-card"><div className="delivery-card-heading"><span className="delivery-icon">↥</span><div><span className="teacher-kicker">NOVO ENVIO</span><h2>Registrar uma atividade</h2></div></div>
        <p className="delivery-guidance">Confira a orientação do professor, identifique a atividade e anexe um arquivo que mostre seu trabalho. Não inclua senhas, conversas privadas ou dados pessoais de terceiros.</p>
        <form className="delivery-form" onSubmit={submit}>
          <label>Missão Relâmpago (opcional)<select value={selectedMissionId} onChange={event => setSelectedMissionId(event.target.value)}><option value="">Entrega livre / outra atividade</option>{missions.map(mission => <option key={mission.id} value={mission.id}>{mission.title}{mission.submitted ? ' · já enviada' : ''}</option>)}</select></label>
          {selectedMission && <div className="delivery-selected-mission"><span className="teacher-kicker">ORIENTAÇÃO DO PROFESSOR</span><strong>{selectedMission.title}</strong><p>{selectedMission.description}</p><p><b>Solicitação:</b> {selectedMission.request}</p><small>Tempo sugerido: {selectedMission.estimatedMinutes} min{selectedMission.dueAt ? ` · prazo: ${new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(selectedMission.dueAt))}` : ''}</small></div>}
          <label>Nome da atividade<input name="activityName" minLength={3} maxLength={120} placeholder="Ex.: Foto de produto — ângulo frontal" defaultValue={selectedMission?.title} key={selectedMission?.id || 'free'} required /></label>
          <label>Sua resposta / descrição<textarea name="description" minLength={3} maxLength={1000} rows={4} placeholder="Descreva como realizou a missão e o que deseja destacar." required /></label>
          <label>Data da aula<input name="classDate" type="date" max={todayDate || undefined} defaultValue={todayDate || undefined} required /></label>
          <label className="delivery-file-label">Anexo <small>Foto, vídeo curto ou PDF · até 4 MB</small><input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4,video/webm" required /></label>
          <p className="delivery-file-hint">Tipos aceitos: JPG, PNG, WebP, PDF, MP4 e WebM. Para vídeos, exporte uma versão curta e compactada.</p>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? 'Enviando…' : 'Enviar atividade'}</button>
          <p className="delivery-message" role="status">{message}</p>
        </form>
      </section>
      <section className="delivery-list-card"><div className="delivery-card-heading"><span className="delivery-icon">✓</span><div><span className="teacher-kicker">MEUS REGISTROS</span><h2>Atividades enviadas</h2></div></div>
        {items.length ? <div className="delivery-items">{items.map(item => <article className="delivery-item" key={item.id}><div className="delivery-item-top"><div><span className="section-tag">{new Date(`${item.classDate}T12:00:00`).toLocaleDateString('pt-BR')}</span><h3>{item.quickMissionTitle ? `Missão: ${item.quickMissionTitle}` : item.activityName}</h3></div><a className="button button-secondary" href={`/api/student/deliveries/${item.id}`}>Baixar anexo</a></div><p>{item.description}</p><small>{item.fileName} · {readableSize(item.sizeBytes)}</small></article>)}</div> : <div className="delivery-empty"><span>↗</span><p>{message || 'Você ainda não enviou atividades.'}</p></div>}
      </section>
    </div>
  </AppShell>;
}
