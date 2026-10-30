'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Presentation = { id: string; title: string; slideCount: number; updatedAt: string; classNames: string[] };

export default function PresentationLibrary() {
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/presentations', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as apresentações.');
        return payload as { presentations?: Presentation[] };
      })
      .then(payload => { if (active) setPresentations(payload.presentations || []); })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar as apresentações.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return (
    <section className="presentations-library" aria-live="polite">
      <header className="presentations-library-banner"><div><span className="section-tag">MATERIAIS DA TURMA</span><h2>Apresentações liberadas</h2><p>Conteúdos publicados pelo professor para sua turma.</p></div><span className="presentations-library-icon" aria-hidden="true">▤</span></header>
      {error && <div className="presentations-notice" role="alert">{error}</div>}
      {loading ? <div className="presentation-empty">Carregando biblioteca…</div> : presentations.length ? <div className="presentations-grid">{presentations.map((item, index) => <article className="presentation-card" key={item.id}><div className={`presentation-card-art art-${index % 4}`} aria-hidden="true"><span>ML</span><i>{String(item.slideCount).padStart(2, '0')}</i></div><div className="presentation-card-copy"><span className="teacher-kicker">{item.classNames.join(' · ') || 'Material da turma'}</span><h3>{item.title}</h3><p>{item.slideCount} {item.slideCount === 1 ? 'slide' : 'slides'} · Atualizada em {new Date(item.updatedAt).toLocaleDateString('pt-BR')}</p><Link className="button button-secondary" href={`/apresentacoes/${item.id}`}>Abrir apresentação <span aria-hidden="true">→</span></Link></div></article>)}</div> : !error && <div className="presentation-empty"><span aria-hidden="true">✦</span><h3>Nenhuma apresentação liberada</h3><p>Quando o professor publicar um material para sua turma, ele aparecerá aqui.</p></div>}
    </section>
  );
}
