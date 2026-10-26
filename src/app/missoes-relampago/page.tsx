'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';

type QuickMission = { id: string; title: string; description: string; request: string; estimatedMinutes: number; dueAt: string | null; createdAt: string; submitted: boolean; isExpired?: boolean };
type QuickModule = { id: string; title: string; description: string; missions: QuickMission[] };
const formatDue = (value: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sem prazo definido';

export default function QuickMissionsPage() {
  const [modules, setModules] = useState<QuickModule[]>([]);
  const [message, setMessage] = useState('Carregando missões da turma…');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/student/quick-missions', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as missões.');
      setModules(data.modules); setMessage(data.modules.length ? '' : 'Quando o professor liberar um módulo em sala, suas missões aparecerão aqui.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar as missões.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <AppShell eyebrow="DESAFIOS DA TURMA" title="Missão Relâmpago" description="Desafios curtos publicados pelo professor para praticar o conteúdo da aula.">
    <div className="quick-mission-page">
      <div className="quick-mission-note"><span aria-hidden="true">✦</span><p>Leia a solicitação com atenção, organize seu tempo e envie sua resposta na aba <strong>Entregas</strong>. Seu trabalho fica associado somente ao seu perfil.</p></div>
      {loading ? <div className="quick-mission-empty">{message}</div> : modules.length ? modules.map((module, moduleIndex) => <section className="quick-mission-module" key={module.id}>
        <header className="classroom-student-module-head"><span>{String(moduleIndex + 1).padStart(2, '0')}</span><div><h2>{module.title}</h2><p>{module.description}</p></div></header>
        <div className="quick-mission-grid">{module.missions.map((mission, index) => <article className="quick-mission-card" key={mission.id}>
          <div className="quick-mission-card-top"><span className="section-tag">MISSÃO {String(index + 1).padStart(2, '0')}</span><span className={`quick-mission-status ${mission.submitted ? 'is-submitted' : ''}`}>{mission.submitted ? 'ENTREGUE' : mission.isExpired ? 'PRAZO PASSOU · ENVIO ABERTO' : 'EM ABERTO'}</span></div>
          <h2>{mission.title}</h2><p>{mission.description}</p>
          <div className="quick-mission-request"><span className="teacher-kicker">O QUE FAZER</span><p>{mission.request}</p></div>
          <div className="quick-mission-meta"><span>◷ {mission.estimatedMinutes} min sugeridos</span><span>▣ {formatDue(mission.dueAt)}</span></div>
          <Link className="button button-primary" href={`/entregas?missao=${mission.id}`}>{mission.submitted ? 'Ver e complementar na Entregas' : mission.isExpired ? 'Enviar com atraso' : 'Preparar entrega'} <span aria-hidden="true">→</span></Link>
        </article>)}</div>
      </section>) : <div className="quick-mission-empty"><span aria-hidden="true">✦</span><h2>Nenhuma missão aberta</h2><p>{message}</p><button className="button button-secondary" onClick={() => { setLoading(true); void load(); }}>Atualizar</button></div>}
    </div>
  </AppShell>;
}
