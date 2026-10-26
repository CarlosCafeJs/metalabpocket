'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

type Comment = { id: string; studentId: string | null; authorName: string; authorRole: 'student'|'teacher'; body: string; createdAt: string };
type Post = { id: string; studentId: string; authorName: string; businessName: string; body: string; imageName: string | null; imageMimeType: string | null; imageSizeBytes: number | null; createdAt: string; likeCount: number; likedByMe: boolean; isMine: boolean; comments: Comment[] };
type FeedState = { class: null | { id: string; name: string }; business: boolean; posts: Post[] };
const emptyState: FeedState = { class: null, business: false, posts: [] };
const dateTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Agora' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date); };

export default function InstaLabPage() {
  const [feed, setFeed] = useState<FeedState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [interactionBusyId, setInteractionBusyId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<File | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch('/api/student/instalab', { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível carregar o InstaLab.');
      setFeed(result as FeedState);
      if (!quiet) setMessage('');
    } catch (error) { if (!quiet) setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o InstaLab.'); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(true), 12000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { if (!image) { setPreview(''); return; } const url = URL.createObjectURL(image); setPreview(url); return () => URL.revokeObjectURL(url); }, [image]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (image) formData.set('image', image); else formData.delete('image');
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/student/instalab', { method: 'POST', credentials: 'same-origin', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível publicar.');
      setFeed(current => ({ ...current, posts: result.posts })); setImage(null); form.reset(); setMessage('Publicação compartilhada com sua turma.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível publicar agora.'); }
    finally { setBusy(false); }
  }

  async function toggleLike(post: Post) {
    const method = post.likedByMe ? 'DELETE' : 'POST';
    setInteractionBusyId(post.id);
    try {
      const response = await fetch(`/api/student/instalab/${post.id}/like`, { method, credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível registrar a curtida.');
      setFeed(current => ({ ...current, posts: current.posts.map(item => item.id === post.id ? { ...item, likeCount: result.likeCount, likedByMe: result.likedByMe } : item) }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível registrar a curtida.'); }
    finally { setInteractionBusyId(null); }
  }

  async function comment(event: FormEvent<HTMLFormElement>, post: Post) {
    event.preventDefault();
    const body = commentDrafts[post.id]?.trim();
    if (!body) return;
    setInteractionBusyId(post.id);
    try {
      const response = await fetch(`/api/student/instalab/${post.id}/comments`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível comentar.');
      setFeed(current => ({ ...current, posts: current.posts.map(item => item.id === post.id ? { ...item, comments: result.comments } : item) }));
      setCommentDrafts(current => ({ ...current, [post.id]: '' }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível comentar.'); }
    finally { setInteractionBusyId(null); }
  }

  async function remove(post: Post) {
    if (!window.confirm('Excluir sua publicação?')) return;
    try {
      const response = await fetch(`/api/student/instalab/${post.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover.');
      setFeed(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id) }));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível remover.'); }
  }

  async function editPost(event: FormEvent<HTMLFormElement>, post: Post) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (editingImage) formData.set('image', editingImage); else formData.delete('image');
    formData.set('removeImage', String(removeCurrentImage && !editingImage));
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/student/instalab/${post.id}`, { method: 'PUT', credentials: 'same-origin', body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível editar.');
      setFeed(current => ({ ...current, posts: result.posts }));
      setEditingPostId(null); setEditingImage(null); setRemoveCurrentImage(false); setMessage('Publicação atualizada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível editar a publicação.'); }
    finally { setBusy(false); }
  }

  return <AppShell eyebrow="REDE DA TURMA" title="InstaLab" description="Mostre o que sua empresa está criando e acompanhe as ideias dos colegas.">
    <div className="instalab-page">
      <div className="instalab-private-note"><span aria-hidden="true">✦</span><p>Um espaço compartilhado apenas com os alunos e o professor da sua turma.</p></div>
      {loading ? <div className="instalab-empty"><span aria-hidden="true">◌</span><h3>Preparando seu feed</h3><p>Estamos carregando as publicações da turma.</p></div> : !feed.business ? <section className="instalab-gate"><span className="instalab-gate-icon" aria-hidden="true">01</span><span className="section-tag">PRIMEIRO PASSO</span><h2>Apresente sua empresa</h2><p>Crie o perfil da empresa para publicar seus produtos, ideias e aprendizados no InstaLab.</p><div><Link className="button button-primary" href="/empresa">Criar minha empresa <span aria-hidden="true">→</span></Link><Link className="button button-secondary" href="/turmas">Ver turmas</Link></div></section> : !feed.class ? <section className="instalab-gate"><span className="instalab-gate-icon" aria-hidden="true">02</span><span className="section-tag">SUA TURMA</span><h2>Entre na sala para ver o feed</h2><p>As publicações são compartilhadas somente com os colegas da mesma turma.</p><Link className="button button-primary" href="/turmas">Entrar com código <span aria-hidden="true">→</span></Link></section> : <>
        <section className="instalab-heading"><div><span className="section-tag">TURMA · {feed.class.name}</span><h2>Ideias da turma</h2><p>Produtos, bastidores e aprendizados em um só lugar.</p></div><span className="instalab-live"><i/> Feed da turma</span></section>
        <form className="instalab-composer" onSubmit={publish}><div className="instalab-compose-head"><span className="instalab-avatar">M</span><div><label htmlFor="instalab-body">Compartilhe com a turma</label><small>Uma ideia, uma novidade ou uma etapa do seu trabalho.</small></div></div><textarea id="instalab-body" name="body" maxLength={2000} rows={4} placeholder="O que sua empresa está criando, aprendendo ou oferecendo?"/><div className="instalab-compose-footer">{preview ? <div className="instalab-upload-preview"><img src={preview} alt="Prévia da imagem"/><button type="button" onClick={() => setImage(null)} aria-label="Remover imagem">×</button></div> : <label className="instalab-image-picker"><span aria-hidden="true">＋</span> Adicionar imagem<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setImage(event.target.files?.[0] || null)} /></label>}<small className="instalab-upload-hint">JPG, PNG ou WebP · até 4 MB</small><button className="button button-primary" disabled={busy}>{busy ? 'Publicando…' : 'Publicar para a turma'} <span aria-hidden="true">↑</span></button></div></form>
        {message && <p className="instalab-status" role="status">{message}</p>}
        <section className="instalab-feed-section" aria-label="Publicações da turma"><header className="instalab-feed-heading"><div><span className="section-tag">MURAL DA TURMA</span><h2>Publicações</h2></div><span>{feed.posts.length} {feed.posts.length === 1 ? 'publicação' : 'publicações'}</span></header><div className="instalab-feed">{feed.posts.length ? feed.posts.map(post => <article className="instalab-post" key={post.id}><header><span className="instalab-avatar">{post.authorName.charAt(0).toUpperCase()}</span><div><strong>{post.businessName}</strong><small>{post.authorName} · {dateTime(post.createdAt)}</small></div>{post.isMine && <button className="button button-secondary instalab-edit-button" type="button" onClick={() => { setEditingPostId(current => current === post.id ? null : post.id); setEditingImage(null); setRemoveCurrentImage(false); }} aria-label="Editar publicação">{editingPostId===post.id?'Cancelar':'Editar'}</button>}</header>{editingPostId===post.id ? <form className="instalab-edit-form" onSubmit={event=>void editPost(event,post)}><label>Texto da publicação<textarea name="body" maxLength={2000} rows={4} defaultValue={post.body}/></label>{post.imageMimeType&&<label className="instalab-remove-image"><input type="checkbox" checked={removeCurrentImage} onChange={event=>setRemoveCurrentImage(event.target.checked)}/> Remover imagem atual</label>}<label className="instalab-image-picker">{editingImage?'Trocar imagem selecionada':'Adicionar ou trocar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{setEditingImage(event.target.files?.[0]||null);if(event.target.files?.[0])setRemoveCurrentImage(false);}}/></label><small>JPG, PNG ou WebP · até 4 MB</small><button className="button button-primary" disabled={busy}>{busy?'Salvando…':'Salvar alterações'}</button></form> : <>{post.body && <p className="instalab-post-body">{post.body}</p>}{post.imageMimeType && <img className="instalab-post-image" src={`/api/student/instalab/${post.id}/image`} alt={post.imageName || `Publicação de ${post.businessName}`} loading="lazy"/>}<div className="instalab-post-actions"><button type="button" className={`instalab-like-button${post.likedByMe?' is-liked':''}`} aria-pressed={post.likedByMe} disabled={interactionBusyId===post.id} onClick={()=>void toggleLike(post)}>{post.likedByMe?'♥ Curtido':'♡ Curtir'}</button><span>{post.likeCount} {post.likeCount===1?'curtida':'curtidas'} · {post.comments.length} {post.comments.length===1?'comentário':'comentários'}</span></div>{post.comments.length > 0 && <div className="instalab-comments" aria-label="Comentários">{post.comments.map(item => <p key={item.id}><strong>{item.authorName}</strong> {item.body}</p>)}</div>}<form className="instalab-comment-form" onSubmit={event=>void comment(event,post)}><label className="visually-hidden" htmlFor={`comment-${post.id}`}>Comentar nesta publicação</label><input id={`comment-${post.id}`} maxLength={1000} value={commentDrafts[post.id]||''} onChange={event=>setCommentDrafts(current=>({...current,[post.id]:event.target.value}))} placeholder="Escreva um comentário…"/><button type="submit" disabled={interactionBusyId===post.id||!commentDrafts[post.id]?.trim()}>{interactionBusyId===post.id?'Enviando…':'Enviar'}</button></form></>}</article>) : <div className="instalab-empty"><span aria-hidden="true">✦</span><h3>O mural começa com uma ideia</h3><p>Publique uma foto ou conte à turma o que sua empresa está desenvolvendo.</p></div>}</div></section>
      </>}
    </div>
  </AppShell>;
}
