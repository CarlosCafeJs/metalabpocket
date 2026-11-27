'use client';

import { useEffect, useRef, useState } from 'react';

export type AcademicEvaluation = {
  id: string;
  targetKind: 'delivery' | 'classroom_submission';
  targetId: string;
  studentId: string;
  classId: string;
  className: string | null;
  evaluatorId: string;
  evaluatorName: string | null;
  activityTitle: string | null;
  score: number;
  maximumScore: number;
  comment: string;
  publicationState: 'draft' | 'published';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Props = {
  targetKind: AcademicEvaluation['targetKind'];
  targetId: string;
  initial: AcademicEvaluation | undefined;
  onSaved: (evaluation: AcademicEvaluation) => void;
};

export default function GradeEditor({ targetKind, targetId, initial, onSaved }: Props) {
  const [score, setScore] = useState(initial ? String(initial.score) : '');
  const [maximumScore, setMaximumScore] = useState(initial ? String(initial.maximumScore) : '10');
  const [comment, setComment] = useState(initial?.comment || '');
  const [open, setOpen] = useState(!initial || initial.publicationState === 'draft');
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    setScore(initial ? String(initial.score) : '');
    setMaximumScore(initial ? String(initial.maximumScore) : '10');
    setComment(initial?.comment || '');
  }, [initial?.id, initial?.score, initial?.maximumScore, initial?.comment]);

  async function save(publicationState: 'draft' | 'published') {
    if (!formRef.current?.reportValidity()) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/teacher/evaluations', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetKind, targetId, score: Number(score), maximumScore: Number(maximumScore), comment, publicationState })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar a avaliação.');
      onSaved(data.evaluation);
      setMessage(publicationState === 'published' ? 'Nota publicada para o aluno.' : 'Rascunho salvo.');
      setOpen(true);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível salvar a avaliação.');
    } finally { setBusy(false); }
  }

  return <details className="teacher-grade-editor" open={open} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>{initial ? <><strong>{initial.score.toLocaleString('pt-BR')} / {initial.maximumScore.toLocaleString('pt-BR')}</strong><span className={`teacher-grade-state ${initial.publicationState}`}>{initial.publicationState === 'published' ? 'Publicada' : 'Rascunho'}</span></> : <><strong>Ainda não avaliada</strong><span>Atribuir nota</span></>}</summary>
    <form ref={formRef} onSubmit={event => { event.preventDefault(); void save(initial?.publicationState || 'draft'); }}>
      <div className="teacher-grade-fields"><label>Nota<input type="number" min="0" max={maximumScore || 10} step="0.01" inputMode="decimal" value={score} onChange={event => setScore(event.target.value)} required /></label><label>Valor máximo<input type="number" min="0.01" max="10" step="0.01" inputMode="decimal" value={maximumScore} onChange={event => setMaximumScore(event.target.value)} required /></label></div>
      <label>Comentário para o aluno<textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={2} placeholder="Orientação ou devolutiva (opcional)" /></label>
      {initial && <small className="teacher-grade-meta">{initial.evaluatorName ? `Avaliada por ${initial.evaluatorName} · ` : ''}Atualizada em {new Date(initial.updatedAt).toLocaleDateString('pt-BR')}</small>}
      {message && <small className={`teacher-grade-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{message}</small>}
      <div className="teacher-grade-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => void save('draft')}>{busy ? 'Salvando…' : 'Salvar rascunho'}</button><button className="button button-primary" type="button" disabled={busy} onClick={() => void save('published')}>{busy ? 'Salvando…' : initial?.publicationState === 'published' ? 'Salvar e publicar' : 'Publicar nota'}</button></div>
    </form>
  </details>;
}
