'use client';

import { useEffect, useState } from 'react';

type Evaluation = {
  id: string;
  targetKind: 'delivery' | 'classroom_submission';
  activityTitle: string | null;
  className: string | null;
  score: number;
  maximumScore: number;
  comment: string;
  publicationState: 'published';
  publishedAt: string | null;
  updatedAt: string;
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR', { dateStyle: 'medium' }) : 'Data indisponível';
}

export default function StudentGrades() {
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/student/grades', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar as notas.');
        if (active) setEvaluations(data.evaluations || []);
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as notas.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="student-grades-list" aria-live="polite">
    {error && <div className="student-grades-notice" role="alert">{error}</div>}
    {loading ? <p className="student-grades-empty">Carregando suas notas…</p> : evaluations.length ? evaluations.map(evaluation => <article className="student-grade-card" key={evaluation.id}>
      <div className="student-grade-accent" aria-hidden="true">✓</div>
      <div className="student-grade-main"><span className="section-tag">{evaluation.targetKind === 'delivery' ? 'ENTREGA AVALIADA' : 'MISSÃO DA TURMA'}</span><h2>{evaluation.activityTitle || 'Atividade'}</h2><p>{evaluation.className || 'Turma'} · Avaliada em {date(evaluation.publishedAt || evaluation.updatedAt)}</p>{evaluation.comment && <blockquote>{evaluation.comment}</blockquote>}</div>
      <strong className="student-grade-score">{evaluation.score.toLocaleString('pt-BR')}<small> / {evaluation.maximumScore.toLocaleString('pt-BR')}</small></strong>
    </article>) : !error && <div className="student-grades-empty"><span aria-hidden="true">✧</span><h2>Nenhuma nota publicada</h2><p>As avaliações que o professor publicar aparecerão aqui. Somente você consegue consultar suas notas.</p></div>}
  </section>;
}
