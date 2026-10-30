'use client';

import Link from 'next/link';
import { PointerEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { PresentationDocument, PresentationElement } from '@/domain/presentations';

type Presentation = { id: string; title: string; revision: number; document: PresentationDocument };
type History = { past: PresentationDocument[]; future: PresentationDocument[] };
type Drag = { id: string; startX: number; startY: number; x: number; y: number; width: number; height: number; resize: boolean };
const newId = () => crypto.randomUUID();
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function PresentationEditor({ id }: { id: string }) {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [document, setDocument] = useState<PresentationDocument | null>(null);
  const [slideIndex, setSlideIndex] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState('Abrindo apresentação…');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const docRef = useRef<PresentationDocument | null>(null);
  const revisionRef = useRef(0);
  const dragRef = useRef<Drag | null>(null);
  const savingRef = useRef(false);
  const savedDocumentRef = useRef<PresentationDocument | null>(null);
  const dragStartDocumentRef = useRef<PresentationDocument | null>(null);
  const slide = document?.slides[slideIndex];
  const selected = slide?.elements.find(element => element.id === selectedId) || null;

  useEffect(() => {
    let active = true;
    fetch(`/api/presentations/${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async response => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível abrir o material.'); return payload as { presentation: Presentation }; })
      .then(payload => { if (!active) return; setPresentation(payload.presentation); setDocument(payload.presentation.document); docRef.current = payload.presentation.document; savedDocumentRef.current = payload.presentation.document; revisionRef.current = payload.presentation.revision; setStatus('Todas as alterações estão salvas.'); })
      .catch(caught => { if (active) { setError(caught instanceof Error ? caught.message : 'Não foi possível abrir o material.'); setStatus('Falha ao abrir.'); } });
    return () => { active = false; };
  }, [id]);

  const save = useCallback(async () => {
    const snapshot = docRef.current;
    if (!snapshot || savingRef.current) return;
    savingRef.current = true; setStatus('Salvando…'); setError('');
    try {
      const response = await fetch(`/api/presentations/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: revisionRef.current, document: snapshot }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      revisionRef.current = payload.revision;
      savedDocumentRef.current = snapshot;
      setPresentation(current => current ? { ...current, revision: payload.revision } : current);
      setStatus(docRef.current === snapshot ? 'Todas as alterações estão salvas.' : 'Salvando alterações recentes…');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao salvar.'); setStatus('Verifique o salvamento.'); }
    finally { savingRef.current = false; }
  }, [id]);

  useEffect(() => {
    if (!document || !presentation) return;
    const timer = window.setTimeout(() => { if (document !== savedDocumentRef.current) void save(); }, 900);
    return () => window.clearTimeout(timer);
  }, [document, presentation, save]);

  const commit = useCallback((next: PresentationDocument) => {
    setHistory(current => ({ past: [...current.past.slice(-39), docRef.current!], future: [] }));
    docRef.current = next; setDocument(next);
  }, []);
  const change = useCallback((mutate: (current: PresentationDocument) => PresentationDocument, record = true) => {
    const current = docRef.current;
    if (!current) return;
    const next = mutate(current);
    if (record) commit(next); else { docRef.current = next; setDocument(next); }
  }, [commit]);

  const undo = useCallback(() => setHistory(current => {
    const previous = current.past.at(-1); if (!previous) return current;
    const live = docRef.current!; docRef.current = previous; setDocument(previous);
    return { past: current.past.slice(0, -1), future: [live, ...current.future].slice(0, 40) };
  }), []);
  const redo = useCallback(() => setHistory(current => {
    const next = current.future[0]; if (!next) return current;
    const live = docRef.current!; docRef.current = next; setDocument(next);
    return { past: [...current.past, live].slice(-40), future: current.future.slice(1) };
  }), []);

  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redo(); }
      if (event.key === 'Delete' && selectedId && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) removeElement(selectedId);
    }
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [redo, undo, selectedId]);

  function addSlide() {
    if (!document) return;
    const newSlide = { id: newId(), title: `Slide ${document.slides.length + 1}`, background: '#f7f4ee', elements: [] };
    change(current => ({ ...current, slides: [...current.slides, newSlide] })); setSlideIndex(document.slides.length); setSelectedId(null);
  }
  function addElement(type: 'text' | 'rectangle' | 'circle' | 'line' | 'arrow') {
    if (!slide) return;
    const element: PresentationElement = type === 'text'
      ? { id: newId(), type: 'text', x: 240, y: 250, width: 800, height: 150, text: 'Clique para editar este texto', color: '#172743', fontSize: 42, fontWeight: 700, align: 'center' }
      : { id: newId(), type: 'shape', shape: type, x: 420, y: 260, width: type === 'line' || type === 'arrow' ? 420 : 360, height: type === 'line' || type === 'arrow' ? 6 : 200, fill: '#e8a012', stroke: '#172743', strokeWidth: 2 };
    change(current => ({ ...current, slides: current.slides.map((item, index) => index === slideIndex ? { ...item, elements: [...item.elements, element] } : item) })); setSelectedId(element.id);
  }
  async function uploadImage(file: File | undefined) {
    if (!file || !document) return;
    setUploading(true); setError('');
    try {
      const form = new FormData(); form.set('file', file);
      const response = await fetch(`/api/presentations/${encodeURIComponent(id)}/assets`, { method: 'POST', body: form });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar a imagem.');
      const asset = payload.asset as { id: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; sizeBytes: number };
      const element: PresentationElement = { id: newId(), type: 'image', assetId: asset.id, x: 280, y: 150, width: 720, height: 420, fit: 'contain' };
      change(current => ({ ...current, assets: [...current.assets, asset], slides: current.slides.map((item, index) => index === slideIndex ? { ...item, elements: [...item.elements, element] } : item) }));
      setSelectedId(element.id); setStatus('Imagem enviada; salvando documento…');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Falha ao enviar imagem.'); }
    finally { setUploading(false); }
  }
  function removeElement(elementId: string) {
    change(current => ({ ...current, slides: current.slides.map((item, index) => index === slideIndex ? { ...item, elements: item.elements.filter(element => element.id !== elementId) } : item) })); setSelectedId(null);
  }
  function updateSelected(patch: Partial<PresentationElement>) {
    if (!selected) return;
    change(current => ({ ...current, slides: current.slides.map((item, index) => index === slideIndex ? { ...item, elements: item.elements.map(element => element.id === selected.id ? { ...element, ...patch } as PresentationElement : element) } : item) }));
  }
  function updateSlide(patch: { title?: string; background?: string }) {
    change(current => ({ ...current, slides: current.slides.map((item, index) => index === slideIndex ? { ...item, ...patch } : item) }));
  }
  function reorderSlide(direction: number) {
    if (!document) return;
    const destination = slideIndex + direction; if (destination < 0 || destination >= document.slides.length) return;
    change(current => { const slides = [...current.slides]; [slides[slideIndex], slides[destination]] = [slides[destination], slides[slideIndex]]; return { ...current, slides }; }); setSlideIndex(destination);
  }
  function deleteSlide() {
    if (!document || document.slides.length <= 1 || !window.confirm('Excluir este slide?')) return;
    change(current => ({ ...current, slides: current.slides.filter((_, index) => index !== slideIndex) })); setSlideIndex(Math.max(0, slideIndex - 1)); setSelectedId(null);
  }
  function duplicateSlide() {
    if (!slide || !document || document.slides.length >= 100) return;
    const copy = { ...slide, id: newId(), title: `${slide.title} — cópia`.slice(0, 120), elements: slide.elements.map(element => ({ ...element, id: newId() })) };
    change(current => ({ ...current, slides: [...current.slides.slice(0, slideIndex + 1), copy, ...current.slides.slice(slideIndex + 1)] })); setSlideIndex(slideIndex + 1); setSelectedId(null);
  }
  function moveLayer(direction: number) {
    if (!selected || !slide) return;
    const elementIndex = slide.elements.findIndex(element => element.id === selected.id); const target = elementIndex + direction;
    if (elementIndex < 0 || target < 0 || target >= slide.elements.length) return;
    change(current => ({ ...current, slides: current.slides.map((item, index) => {
      if (index !== slideIndex) return item;
      const elements = [...item.elements]; [elements[elementIndex], elements[target]] = [elements[target], elements[elementIndex]]; return { ...item, elements };
    }) }));
  }
  function elementPointerDown(event: PointerEvent<HTMLElement>, element: PresentationElement, resize = false) {
    if (!canvasRef.current) return;
    event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); setSelectedId(element.id);
    const bounds = canvasRef.current.getBoundingClientRect();
    dragStartDocumentRef.current = docRef.current;
    dragRef.current = { id: element.id, startX: event.clientX, startY: event.clientY, x: element.x, y: element.y, width: element.width, height: element.height, resize };
    void bounds;
  }
  const canvasRef = useRef<HTMLDivElement>(null);
  function elementPointerMove(event: PointerEvent<HTMLElement>) {
    const drag = dragRef.current; const bounds = canvasRef.current?.getBoundingClientRect(); const current = docRef.current;
    if (!drag || !bounds || !current || !slide) return;
    const dx = (event.clientX - drag.startX) * 1280 / bounds.width; const dy = (event.clientY - drag.startY) * 720 / bounds.height;
    change(doc => ({
      ...doc,
      slides: doc.slides.map((item, index) => index !== slideIndex ? item : {
        ...item,
        elements: item.elements.map(element => {
          if (element.id !== drag.id) return element;
          if (drag.resize) return { ...element, width: clamp(drag.width + dx, 40, 1280 - drag.x), height: clamp(drag.height + dy, 30, 720 - drag.y) } as PresentationElement;
          return { ...element, x: clamp(drag.x + dx, 0, 1280 - element.width), y: clamp(drag.y + dy, 0, 720 - element.height) } as PresentationElement;
        })
      })
    }), false);
  }
  function elementPointerUp() { if (dragRef.current) { const before = dragStartDocumentRef.current; if (before) setHistory(current => ({ past: [...current.past.slice(-39), before], future: [] })); dragRef.current = null; dragStartDocumentRef.current = null; } }

  if (!presentation || !document || !slide) return <main className="teacher-page presentation-teacher-page"><div className="presentation-teacher-content">{error ? <div className="presentations-notice is-error" role="alert">{error}</div> : <div className="presentation-empty">{status}</div>}<Link href="/docente/apresentacoes">← Biblioteca</Link></div></main>;

  return <main className="teacher-page presentation-teacher-page presentation-editor-page">
    <header className="presentation-teacher-topbar"><Link href="/docente/apresentacoes">← Biblioteca</Link><strong>{presentation.title}</strong><div className="presentation-editor-top-actions"><span className={error ? 'is-error' : ''} role="status">{error || status}</span><button type="button" onClick={undo} disabled={!history.past.length}>Desfazer</button><button type="button" onClick={redo} disabled={!history.future.length}>Refazer</button><Link className="button button-secondary" href={`/docente/apresentacoes/${id}`}>Visualizar</Link><button className="button button-primary" type="button" onClick={() => void save()}>Salvar agora</button></div></header>
    <div className="presentation-editor-shell">
      <aside className="presentation-editor-slides"><header><strong>Páginas</strong><button type="button" onClick={addSlide} disabled={document.slides.length >= 100}>＋</button></header>{document.slides.map((item, index) => <button type="button" key={item.id} onClick={() => { setSlideIndex(index); setSelectedId(null); }} className={index === slideIndex ? 'is-active' : ''}><span>{index + 1}</span><div style={{ background: item.background }}><b>{item.title}</b></div></button>)}</aside>
      <section className="presentation-editor-workspace"><div className="presentation-editor-tools"><button type="button" onClick={() => addElement('text')}>＋ Texto</button><button type="button" onClick={() => addElement('rectangle')}>▰ Retângulo</button><button type="button" onClick={() => addElement('circle')}>◯ Círculo</button><button type="button" onClick={() => addElement('line')}>／ Linha</button><label className="presentation-upload-button">{uploading ? 'Enviando…' : '＋ Imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={event => { void uploadImage(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><button type="button" onClick={() => window.print()}>Exportar PDF</button><span>Arraste para mover · puxe o canto para redimensionar</span></div>
        <div className="presentation-editor-canvas-wrap"><div ref={canvasRef} className="presentation-editor-canvas" style={{ background: slide.background }} onPointerDown={() => setSelectedId(null)}>
          {slide.elements.map((element, index) => {
            const placement = { left: `${element.x / 12.8}%`, top: `${element.y / 7.2}%`, width: `${element.width / 12.8}%`, height: `${element.height / 7.2}%`, zIndex: index + 1 };
            const style: React.CSSProperties = element.type === 'text'
              ? { ...placement, color: element.color, fontSize: `${element.fontSize / 12.8}cqw`, fontWeight: element.fontWeight, textAlign: element.align }
              : element.type === 'shape'
                ? { ...placement, background: element.shape === 'circle' || element.shape === 'rectangle' ? element.fill : element.stroke, border: element.shape === 'line' || element.shape === 'arrow' ? 0 : `${element.strokeWidth / 12.8}cqw solid ${element.stroke}`, borderRadius: element.shape === 'circle' ? '50%' : undefined }
                : { ...placement, border: '1px dashed #8996a8', background: '#e7e9ec', color: '#344762' };
            return <div key={element.id} className={`presentation-editor-element${selectedId === element.id ? ' is-selected' : ''}${element.type === 'text' ? ' is-text' : ''}${element.type === 'image' ? ' is-image' : ''}${element.type === 'shape' ? ` is-shape is-${element.shape}` : ''}`} style={style} onPointerDown={event => elementPointerDown(event, element)} onPointerMove={elementPointerMove} onPointerUp={elementPointerUp} onPointerCancel={elementPointerUp}>
              {element.type === 'text' ? element.text : element.type === 'image' ? <img src={`/api/presentations/${id}/assets/${element.assetId}`} alt="Imagem do slide" draggable={false} style={{ width: '100%', height: '100%', objectFit: element.fit }} /> : null}{selectedId === element.id && <span className="presentation-editor-resize" role="button" aria-label="Redimensionar elemento" onPointerDown={event => elementPointerDown(event, element, true)} onPointerMove={elementPointerMove} onPointerUp={elementPointerUp} />}
            </div>;
          })}
        </div></div>
        <footer className="presentation-editor-page-controls"><button type="button" onClick={() => reorderSlide(-1)} disabled={slideIndex === 0}>↑ Mover página</button><button type="button" onClick={() => reorderSlide(1)} disabled={slideIndex === document.slides.length - 1}>↓ Mover página</button><button type="button" onClick={duplicateSlide} disabled={document.slides.length >= 100}>Duplicar página</button><span>{slideIndex + 1} / {document.slides.length}</span><button type="button" onClick={deleteSlide} disabled={document.slides.length <= 1}>Excluir página</button></footer>
      </section>
      <aside className="presentation-editor-inspector"><strong>Design</strong><label>Nome da página<input value={slide.title} maxLength={120} onChange={event => updateSlide({ title: event.target.value })} /></label><label>Fundo<input type="color" value={slide.background} onChange={event => updateSlide({ background: event.target.value })} /></label>
        {selected && <><hr /><strong>Elemento selecionado</strong>{selected.type === 'text' ? <><label>Texto<textarea value={selected.text} maxLength={5000} onChange={event => updateSelected({ text: event.target.value })} /></label><label>Cor<input type="color" value={selected.color} onChange={event => updateSelected({ color: event.target.value })} /></label><label>Tamanho da fonte<input type="number" min={10} max={120} value={selected.fontSize} onChange={event => updateSelected({ fontSize: Number(event.target.value) })} /></label><label>Alinhamento<select value={selected.align} onChange={event => updateSelected({ align: event.target.value as 'left' | 'center' | 'right' })}><option value="left">Esquerda</option><option value="center">Centro</option><option value="right">Direita</option></select></label></> : selected.type === 'shape' ? <><label>Tipo<select value={selected.shape} onChange={event => updateSelected({ shape: event.target.value as 'rectangle' | 'circle' | 'line' | 'arrow' })}><option value="rectangle">Retângulo</option><option value="circle">Círculo</option><option value="line">Linha</option><option value="arrow">Seta</option></select></label><label>Preenchimento<input type="color" value={selected.fill} onChange={event => updateSelected({ fill: event.target.value })} /></label><label>Contorno<input type="color" value={selected.stroke} onChange={event => updateSelected({ stroke: event.target.value })} /></label></> : <p>Imagem vinculada ao documento.</p>}<div className="presentation-editor-layer-actions"><button type="button" onClick={() => moveLayer(1)}>Trazer à frente</button><button type="button" onClick={() => moveLayer(-1)}>Enviar atrás</button></div><button className="is-danger" type="button" onClick={() => removeElement(selected.id)}>Remover elemento</button></>}
        <small>Alterações salvas automaticamente. Use Ctrl+Z para desfazer.</small>
      </aside>
    </div>
    <div className="presentation-print-pages" aria-hidden="true">{document.slides.map((item, index) => <article key={item.id} style={{ background: item.background }}>{item.elements.map(element => {
      const placement = { position: 'absolute' as const, left: `${element.x / 12.8}%`, top: `${element.y / 7.2}%`, width: `${element.width / 12.8}%`, height: `${element.height / 7.2}%` };
      if (element.type === 'text') return <div key={element.id} style={{ ...placement, color: element.color, fontSize: `${element.fontSize}px`, fontWeight: element.fontWeight, textAlign: element.align, whiteSpace: 'pre-wrap' }}>{element.text}</div>;
      if (element.type === 'image') return <img key={element.id} src={`/api/presentations/${id}/assets/${element.assetId}`} alt="" style={{ ...placement, objectFit: element.fit }} />;
      return <div key={element.id} style={{ ...placement, background: element.shape === 'rectangle' || element.shape === 'circle' ? element.fill : element.stroke, border: element.shape === 'line' || element.shape === 'arrow' ? 0 : `${element.strokeWidth}px solid ${element.stroke}`, borderRadius: element.shape === 'circle' ? '50%' : undefined }} />;
    })}<small>{index + 1} / {document.slides.length}</small></article>)}</div>
  </main>;
}
