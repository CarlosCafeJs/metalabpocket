'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import type { PresentationDocument } from '@/domain/presentations';
import { SlideRenderer } from '@/components/presentations/SlideRenderer';

type Presentation = { id: string; title: string; document: PresentationDocument };

export default function PresentationViewer({ id, backHref = '/apresentacoes' }: { id: string; backHref?: string }) {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [presenting, setPresenting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`/api/presentations/${encodeURIComponent(id)}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível abrir este material.'); return payload as { presentation: Presentation }; })
      .then(payload => { if (active) setPresentation(payload.presentation); })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível abrir este material.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const slides = presentation?.document.slides || [];
  const move = useCallback((direction: number) => setIndex(current => Math.max(0, Math.min(slides.length - 1, current + direction))), [slides.length]);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); move(1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
      if (event.key === 'Escape') setPresenting(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [move]);

  async function toggleFullscreen() {
    const stage = document.querySelector('.presentation-viewer-stage');
    if (!document.fullscreenElement && stage instanceof HTMLElement) { await stage.requestFullscreen().catch(() => undefined); setPresenting(true); }
    else { await document.exitFullscreen().catch(() => undefined); setPresenting(false); }
  }

  if (loading) return <div className="presentation-empty">Abrindo apresentação…</div>;
  if (error || !presentation) return <section className="presentation-viewer-error" role="alert"><p>{error || 'Apresentação não encontrada.'}</p><Link className="button button-secondary" href={backHref}>Voltar à biblioteca</Link></section>;

  return (
    <section className={`presentation-viewer${presenting ? ' is-presenting' : ''}`}>
      <header className="presentation-viewer-toolbar"><div><Link href={backHref} aria-label="Voltar à biblioteca">← Biblioteca</Link><div><span className="teacher-kicker">VISUALIZADOR</span><h2>{presentation.title}</h2></div></div><div><span>{index + 1} / {slides.length}</span><button className="button button-primary" type="button" onClick={() => void toggleFullscreen()}>{presenting ? 'Sair da tela cheia' : 'Apresentar'}</button></div></header>
      <div className="presentation-viewer-layout"><nav className="presentation-slide-rail" aria-label="Slides">{slides.map((slide, slideIndex) => <button type="button" key={slide.id} onClick={() => setIndex(slideIndex)} className={slideIndex === index ? 'is-active' : ''} aria-label={`Abrir slide ${slideIndex + 1}: ${slide.title}`}><span>{slideIndex + 1}</span><SlideRenderer slide={slide} /><small>{slide.title}</small></button>)}</nav><div className="presentation-viewer-stage"><div className="presentation-viewer-paper"><SlideRenderer slide={slides[index]} /></div><div className="presentation-viewer-controls"><button className="button button-secondary" type="button" onClick={() => move(-1)} disabled={index === 0}>← Anterior</button><span>Use as setas do teclado para navegar</span><button className="button button-secondary" type="button" onClick={() => move(1)} disabled={index === slides.length - 1}>Próximo →</button></div></div></div>
    </section>
  );
}
