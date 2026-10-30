'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

type Classroom = { id: string; name: string; joinCode: string; studentCount: number };
type Presentation = { id: string; title: string; revision: number; isPublished: boolean; classIds: string[]; classNames: string[]; slideCount: number; updatedAt: string };

export default function TeacherPresentationLibrary() {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [title, setTitle] = useState('');
  const [classIds, setClassIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);

  async function refresh() {
    setLoading(true); setMessage(''); setError(false);
    try {
      const [presentationsResponse, classesResponse] = await Promise.all([
        fetch('/api/presentations', { cache: 'no-store' }), fetch('/api/teacher/classes', { cache: 'no-store' })
      ]);
      const presentationsPayload = await presentationsResponse.json();
      const classesPayload = await classesResponse.json();
      if (!presentationsResponse.ok) throw new Error(presentationsPayload.error || 'Não foi possível carregar as apresentações.');
      if (!classesResponse.ok) throw new Error(classesPayload.error || 'Não foi possível carregar as turmas.');
      setPresentations(presentationsPayload.presentations || []);
      setClasses(classesPayload.classes || []);
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Falha ao carregar os dados.'); setError(true); }
    finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function create(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', title, classIds, isPublished: false }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a apresentação.');
      setTitle(''); setMessage('Rascunho criado.'); await refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Falha ao criar apresentação.'); setError(true); }
    finally { setBusy(false); }
  }

  async function createCanvaLesson() {
    setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-canva-lesson', classIds }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível criar a aula.');
      setMessage('Aula “Canva — Introdução ao Design e à Criação Visual” criada como rascunho editável.'); await refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Falha ao criar a aula.'); setError(true); }
    finally { setBusy(false); }
  }

  async function update(item: Presentation, values: { title: string; classIds: string[]; isPublished: boolean }) {
    setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/presentations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, expectedRevision: item.revision, ...values }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar.');
      setMessage('Apresentação atualizada.'); await refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Falha ao atualizar.'); setError(true); }
    finally { setBusy(false); }
  }

  async function duplicate(item: Presentation) {
    setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/presentations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'duplicate', id: item.id, title: `${item.title} — cópia`.slice(0, 120) }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível duplicar.');
      setMessage('Cópia criada como rascunho.'); await refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Falha ao duplicar.'); setError(true); }
    finally { setBusy(false); }
  }

  async function remove(item: Presentation) {
    if (!window.confirm(`Mover “${item.title}” para a lixeira?`)) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch('/api/presentations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: item.id, expectedRevision: item.revision }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível remover.');
      setMessage('Apresentação removida da biblioteca.'); await refresh();
    } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Falha ao remover.'); setError(true); }
    finally { setBusy(false); }
  }

  function toggleClass(id: string, selected: string[], setter: (value: string[]) => void) {
    setter(selected.includes(id) ? selected.filter(item => item !== id) : [...selected, id]);
  }

  return (
    <main className="teacher-page presentation-teacher-page">
      <header className="presentation-teacher-topbar"><Link href="/docente/painel">← Painel do professor</Link><span className="section-tag">META LAB · APRESENTAÇÕES</span></header>
      <div className="presentation-teacher-content">
        <header className="presentation-teacher-heading"><div><span className="section-tag">MATERIAIS DIDÁTICOS</span><h1>MetaLab Apresentações</h1><p>Crie materiais, organize a biblioteca e libere apresentações para suas turmas.</p></div><button type="button" className="button button-secondary" onClick={() => void refresh()}>Atualizar</button></header>
        {message && <div className={error ? 'presentations-notice is-error' : 'presentations-notice'} role={error ? 'alert' : 'status'}>{message}</div>}
        <section className="presentation-create-panel"><div><span className="teacher-kicker">NOVA APRESENTAÇÃO</span><h2>Comece com uma capa em branco</h2><p>Crie um material próprio no editor visual ou use a aula pronta sobre Canva como ponto de partida.</p></div><form onSubmit={create}><label>Título<input value={title} onChange={event => setTitle(event.target.value)} minLength={1} maxLength={120} placeholder="Ex.: Identidade da marca" required /></label><fieldset><legend>Turmas autorizadas</legend>{classes.length ? classes.map(item => <label key={item.id}><input type="checkbox" checked={classIds.includes(item.id)} onChange={() => toggleClass(item.id, classIds, setClassIds)} />{item.name}</label>) : <small>Crie uma turma antes de publicar materiais.</small>}</fieldset><div className="presentation-manage-actions"><button className="button button-primary" type="submit" disabled={busy || !title.trim()}>{busy ? 'Salvando…' : '＋ Criar rascunho'}</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void createCanvaLesson()}>Criar aula pronta: Canva</button></div></form></section>
        <section className="presentation-teacher-list"><header><div><span className="teacher-kicker">BIBLIOTECA</span><h2>Suas apresentações</h2></div><span>{presentations.length} {presentations.length === 1 ? 'material' : 'materiais'}</span></header>
          {loading ? <div className="presentation-empty">Carregando biblioteca…</div> : presentations.length ? <div className="presentation-manage-grid">{presentations.map(item => <article className="presentation-manage-card" key={item.id}><div className="presentation-card-art art-0" aria-hidden="true"><span>ML</span><i>{String(item.slideCount).padStart(2, '0')}</i></div><div className="presentation-manage-body"><div className="presentation-manage-title"><span className={`presentation-status ${item.isPublished ? 'is-published' : ''}`}>{item.isPublished ? 'PUBLICADA' : 'RASCUNHO'}</span><small>Rev. {item.revision} · {item.slideCount} slide(s)</small></div><label>Título<input key={`${item.id}-${item.revision}`} defaultValue={item.title} maxLength={120} aria-label={`Título: ${item.title}`} /></label><fieldset><legend>Disponível para</legend>{classes.map(classroom => <label key={classroom.id}><input type="checkbox" defaultChecked={item.classIds.includes(classroom.id)} data-class-id={classroom.id} />{classroom.name}</label>)}</fieldset><div className="presentation-manage-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={event => { const article = (event.currentTarget as HTMLButtonElement).closest('article'); const input = article?.querySelector<HTMLInputElement>('input[aria-label^="Título:"]'); const selected = Array.from(article?.querySelectorAll<HTMLInputElement>('input[data-class-id]:checked') || []).map(control => control.dataset.classId).filter((value): value is string => Boolean(value)); void update(item, { title: input?.value.trim() || item.title, classIds: selected, isPublished: item.isPublished }); }}>Salvar</button><button className="button button-secondary" type="button" disabled={busy} onClick={() => void update(item, { title: item.title, classIds: item.classIds, isPublished: !item.isPublished })}>{item.isPublished ? 'Recolher' : 'Publicar'}</button></div><div className="presentation-manage-actions"><Link className="button button-primary" href={`/docente/apresentacoes/${item.id}/editar`}>Editar slides</Link><Link className="button button-secondary" href={`/docente/apresentacoes/${item.id}`}>Visualizar</Link><button type="button" onClick={() => void duplicate(item)} disabled={busy}>Duplicar</button><button type="button" className="is-danger" onClick={() => void remove(item)} disabled={busy}>Excluir</button></div><small className="presentation-class-summary">Turmas: {item.classNames.join(', ') || 'nenhuma selecionada'}</small></div></article>)}</div> : <div className="presentation-empty"><span aria-hidden="true">▤</span><h3>Biblioteca pronta para começar</h3><p>Crie um rascunho acima e depois escolha a turma que poderá visualizá-lo.</p></div>}
        </section>
      </div>
    </main>
  );
}
