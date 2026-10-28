'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

type Comment = { id: string; studentId: string | null; authorName: string; authorBusinessName: string | null; hasAvatar: boolean; authorRole: 'student'|'teacher'; body: string; createdAt: string };
type Post = { id: string; studentId: string; authorName: string; businessName: string; businessSegment: string; businessDescription: string; hasAvatar: boolean; body: string; imageName: string | null; imageMimeType: string | null; imageSizeBytes: number | null; createdAt: string; likeCount: number; likedByMe: boolean; isMine: boolean; comments: Comment[] };
type Sponsored = { id: string; studentId: string; businessName: string; authorName: string; caption: string; imageMimeType: string | null; sourcePostId: string | null };
type FeedState = { studentId: string; studentName: string; businessName: string | null; businessSegment: string | null; businessDescription: string | null; hasAvatar: boolean; class: null | { id: string; name: string }; business: boolean; posts: Post[]; sponsored: Sponsored | null; total: number; hasMore: boolean };
type WalletSummary = { balance: number; entries: Array<{ id: string; amount: number; entryType: string; description: string; createdAt: string }> };
type SocialTab = 'home' | 'profile';
const emptyState: FeedState = { studentId: '', studentName: 'Aluno', businessName: null, businessSegment: null, businessDescription: null, hasAvatar: false, class: null, business: false, posts: [], sponsored: null, total: 0, hasMore: false };
const dateTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Agora' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date); };
const pageSize = 12;

function Avatar({ studentId, name, hasPhoto, className = '', photoUrl }: { studentId: string | null; name: string; hasPhoto: boolean; className?: string; photoUrl?: string }) {
  return <span className={`instalab-avatar ${className}`}>{hasPhoto && studentId ? <img src={photoUrl || `/api/instalab/avatar/${studentId}`} alt={`Foto de ${name}`} loading="lazy"/> : name.trim().charAt(0).toUpperCase() || 'A'}</span>;
}

export default function InstaLabPage() {
  const [feed, setFeed] = useState<FeedState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [interactionBusyId, setInteractionBusyId] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<File | null>(null);
  const [removeCurrentImage, setRemoveCurrentImage] = useState(false);
  const [activeTab, setActiveTab] = useState<SocialTab>('home');
  const [profilePosts, setProfilePosts] = useState<Post[]>([]);
  const [profileTotal, setProfileTotal] = useState(0);
  const [profileHasMore, setProfileHasMore] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<File | null>(null);
  const [profilePhotoPreview, setProfilePhotoPreview] = useState('');
  const [profilePhotoUrl, setProfilePhotoUrl] = useState('');
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const composerRef = useRef<HTMLFormElement>(null);
  const publishRequestId = useRef<string | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch(`/api/student/instalab?limit=${pageSize}&offset=0`, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json() as FeedState;
      if (!response.ok) throw new Error((result as unknown as { error?: string }).error || 'Não foi possível carregar o InstaLab.');
      setFeed(current => {
        if (!quiet) return result;
        const firstPageIds = new Set(result.posts.map(post => post.id));
        return { ...result, posts: [...result.posts, ...current.posts.filter(post => !firstPageIds.has(post.id))] };
      });
      if (!quiet) setMessage('');
    } catch (error) { if (!quiet) setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o InstaLab.'); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => { void load(); const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(true); }, 12000); return () => window.clearInterval(timer); }, [load]);
  useEffect(() => { if (!image) { setPreview(''); return; } const url = URL.createObjectURL(image); setPreview(url); return () => URL.revokeObjectURL(url); }, [image]);
  useEffect(() => { if (!profilePhoto) { setProfilePhotoPreview(''); return; } const url = URL.createObjectURL(profilePhoto); setProfilePhotoPreview(url); return () => URL.revokeObjectURL(url); }, [profilePhoto]);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !feed.hasMore || loading || loadingMore || activeTab !== 'home') return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) void loadMore(); }, { rootMargin: '500px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  // The observer is intentionally re-created only as pagination state changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feed.hasMore, feed.posts.length, loading, loadingMore, activeTab]);

  async function loadMore() {
    if (loadingMore || !feed.hasMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), offset: String(feed.posts.length) });
      const response = await fetch(`/api/student/instalab?${params}`, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json() as FeedState;
      if (!response.ok) throw new Error((result as unknown as { error?: string }).error || 'Não foi possível carregar mais publicações.');
      setFeed(current => {
        const ids = new Set(current.posts.map(post => post.id));
        return { ...current, posts: [...current.posts, ...result.posts.filter(post => !ids.has(post.id))], total: result.total, hasMore: result.hasMore };
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar mais publicações.'); }
    finally { setLoadingMore(false); }
  }

  async function loadProfilePosts(offset = 0) {
    setProfileLoading(true);
    try {
      const params = new URLSearchParams({ scope: 'mine', limit: String(pageSize), offset: String(offset) });
      const response = await fetch(`/api/student/instalab?${params}`, { credentials: 'same-origin', cache: 'no-store' });
      const result = await response.json() as FeedState;
      if (!response.ok) throw new Error((result as unknown as { error?: string }).error || 'Não foi possível carregar seu perfil.');
      setProfilePosts(current => offset === 0 ? result.posts : [...current, ...result.posts.filter(post => !current.some(item => item.id === post.id))]);
      setProfileTotal(result.total);
      setProfileHasMore(result.hasMore);
      if (offset === 0) {
        const walletResponse = await fetch('/api/student/instalab/economy', { credentials: 'same-origin', cache: 'no-store' });
        if (walletResponse.ok) setWallet(await walletResponse.json() as WalletSummary);
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível carregar seu perfil.'); }
    finally { setProfileLoading(false); }
  }

  async function refreshWallet() {
    const response = await fetch('/api/student/instalab/economy', { credentials: 'same-origin', cache: 'no-store' });
    if (response.ok) setWallet(await response.json() as WalletSummary);
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    if (image) formData.set('image', image); else formData.delete('image');
    setBusy(true); setMessage('');
    try {
      publishRequestId.current ||= crypto.randomUUID();
      const response = await fetch('/api/student/instalab', { method: 'POST', credentials: 'same-origin', headers: { 'Idempotency-Key': publishRequestId.current }, body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível publicar.');
      setFeed(current => ({ ...current, posts: result.posts, total: result.total ?? Math.max(current.total + 1, result.posts.length), hasMore: result.hasMore ?? (current.hasMore || result.posts.length >= pageSize) }));
      setImage(null); form.reset(); publishRequestId.current = null; setActiveTab('home'); setMessage(result.reward > 0 ? `Publicação compartilhada. Você recebeu ${result.reward} MetaCoins.` : 'Publicação compartilhada com sua turma.');
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
      if (result.reward > 0) { setMessage(`Curtida registrada. Você recebeu ${result.reward} MetaCoins.`); await refreshWallet(); }
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
      setMessage(result.reward > 0 ? `Comentário publicado. Você recebeu ${result.reward} MetaCoins.` : result.duplicate ? 'Esse comentário já foi publicado.' : 'Comentário publicado.');
      if (result.reward > 0) await refreshWallet();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível comentar.'); }
    finally { setInteractionBusyId(null); }
  }

  async function remove(post: Post) {
    if (!window.confirm('Excluir sua publicação? Essa ação não pode ser desfeita.')) return;
    setInteractionBusyId(post.id);
    try {
      const response = await fetch(`/api/student/instalab/${post.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover.');
      setFeed(current => ({ ...current, posts: current.posts.filter(item => item.id !== post.id), total: Math.max(0, current.total - 1) }));
      setMessage('Publicação removida.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível remover.'); }
    finally { setInteractionBusyId(null); }
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

  async function saveProfilePhoto() {
    if (!profilePhoto) return;
    setProfilePhotoBusy(true); setMessage('');
    try {
      const form = new FormData(); form.set('image', profilePhoto);
      const response = await fetch('/api/student/instalab/profile', { method: 'PUT', credentials: 'same-origin', body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível salvar sua foto.');
      setProfilePhotoUrl(result.profileImageUrl); setFeed(current => ({ ...current, hasAvatar: true, posts: current.posts.map(post => post.studentId === current.studentId ? { ...post, hasAvatar: true } : post) })); setProfilePosts(current => current.map(post => ({ ...post, hasAvatar: true }))); setProfilePhoto(null); setMessage('Foto de perfil atualizada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível salvar sua foto.'); }
    finally { setProfilePhotoBusy(false); }
  }

  async function removeProfilePhoto() {
    setProfilePhotoBusy(true); setMessage('');
    try {
      const response = await fetch('/api/student/instalab/profile', { method: 'DELETE', credentials: 'same-origin' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível remover sua foto.');
      setProfilePhoto(null); setProfilePhotoUrl(''); setFeed(current => ({ ...current, hasAvatar: false, posts: current.posts.map(post => post.studentId === current.studentId ? { ...post, hasAvatar: false } : post) })); setProfilePosts(current => current.map(post => ({ ...post, hasAvatar: false }))); setMessage('Foto de perfil removida.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível remover sua foto.'); }
    finally { setProfilePhotoBusy(false); }
  }

  function openComposer() {
    setActiveTab('home');
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => composerRef.current?.querySelector('textarea')?.focus(), 150);
  }

  return <AppShell socialMode eyebrow="REDE DA TURMA" title="InstaLab" description="Mostre o que sua empresa está criando e acompanhe as ideias dos colegas.">
    <div className="instalab-system">
      <aside className="instalab-social-sidebar" aria-label="Navegação do InstaLab">
        <Link className="instalab-social-brand" href="/instalab" aria-label="InstaLab, início"><span aria-hidden="true">✳</span><strong>InstaLab</strong><small>por MetaLab Pocket</small></Link>
        <nav>
          <button type="button" className={activeTab === 'home' ? 'is-active' : ''} onClick={() => setActiveTab('home')}><i aria-hidden="true">⌂</i> Início</button>
          <button type="button" onClick={openComposer}><i aria-hidden="true">＋</i> Criar publicação</button>
          <button type="button" className={activeTab === 'profile' ? 'is-active' : ''} onClick={() => { setActiveTab('profile'); void loadProfilePosts(); }}><i aria-hidden="true">◉</i> Perfil</button>
        </nav>
        <Link className="instalab-pocket-link" href="/dashboard"><i aria-hidden="true">←</i> Voltar ao MetaLab Pocket</Link>
      </aside>

      <main className="instalab-social-main">
        {loading ? <div className="instalab-empty"><span aria-hidden="true">◌</span><h3>Preparando seu feed</h3><p>Estamos carregando as publicações da turma.</p></div> : !feed.business ? <section className="instalab-gate"><span className="section-tag">PRIMEIRO PASSO</span><h2>Apresente sua empresa</h2><p>Crie o perfil da empresa para publicar seus produtos, ideias e aprendizados no InstaLab.</p><Link className="button button-primary" href="/empresa">Criar minha empresa <span aria-hidden="true">→</span></Link></section> : !feed.class ? <section className="instalab-gate"><span className="section-tag">SUA TURMA</span><h2>Entre na sala para ver o feed</h2><p>As publicações são compartilhadas somente com os colegas da mesma turma.</p><Link className="button button-primary" href="/turmas">Entrar com código <span aria-hidden="true">→</span></Link></section> : <>
          <header className="instalab-social-header"><div><span className="section-tag">SUA TURMA · {feed.class.name}</span><h1>{activeTab === 'profile' ? 'Seu perfil' : 'InstaLab'}</h1><p>{activeTab === 'profile' ? 'O que sua empresa compartilhou com a turma.' : 'Ideias, produtos e aprendizados da sua sala.'}</p></div><button type="button" className="instalab-social-refresh" onClick={() => void load(true)} aria-label="Atualizar publicações">↻</button></header>
          {message && <p className="instalab-status" role="status">{message}</p>}
          {activeTab === 'profile' ? <section className="instalab-profile-card" aria-label="Perfil da empresa">
            <header className="instalab-profile-heading">
              <Avatar studentId={feed.studentId} name={feed.businessName || feed.studentName} hasPhoto={Boolean(profilePhotoPreview || profilePhotoUrl || feed.hasAvatar)} className="instalab-profile-avatar" photoUrl={profilePhotoPreview || profilePhotoUrl || undefined}/>
              <div className="instalab-profile-identity"><span className="section-tag">PERFIL COMERCIAL</span><h2>{feed.businessName || 'Empresa não cadastrada'}</h2><p>{feed.studentName}</p>
                {feed.businessSegment && <small>{feed.businessSegment}</small>}
              </div>
              <Link className="button button-secondary instalab-edit-business" href="/empresa">Editar perfil</Link>
            </header>
            {feed.businessDescription && <p className="instalab-profile-bio">{feed.businessDescription}</p>}
            <dl><div><dd>{profileTotal}</dd><dt>Publicações</dt></div><div><dd>{feed.class.name}</dd><dt>Turma</dt></div></dl>
            {wallet && <section className="instalab-wallet-card"><div><span className="section-tag">ECONOMIA DE SIMULAÇÃO</span><h3>Minha carteira</h3><p><strong>{wallet.balance}</strong> MetaCoins</p><small>Moedas virtuais sem valor monetário, usadas apenas no InstaLab.</small></div><Link className="button button-primary" href="/instalab/profissional">Painel profissional</Link><details><summary>Ver extrato recente</summary>{wallet.entries.length ? <ul>{wallet.entries.slice(0, 8).map(entry => <li key={entry.id}><span>{entry.description}<small>{dateTime(entry.createdAt)}</small></span><strong className={entry.amount < 0 ? 'is-debit' : ''}>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong></li>)}</ul> : <p>Nenhuma movimentação registrada.</p>}</details></section>}
            <div className="instalab-profile-photo-tools">
              <label className="instalab-image-picker">{profilePhoto ? 'Escolher outra foto' : 'Adicionar ou trocar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { const file = event.target.files?.[0] || null; if (file && file.size > 2 * 1024 * 1024) { setMessage('A foto deve ter no máximo 2 MB.'); return; } setProfilePhoto(file); }}/></label>
              <small>JPG, PNG ou WebP · até 2 MB</small>
              {profilePhoto && <button type="button" className="button button-primary" disabled={profilePhotoBusy} onClick={() => void saveProfilePhoto()}>{profilePhotoBusy ? 'Salvando…' : 'Salvar foto'}</button>}
              {profilePhoto && <button type="button" className="button button-secondary" disabled={profilePhotoBusy} onClick={() => setProfilePhoto(null)}>Cancelar</button>}
              {!profilePhoto && feed.hasAvatar && <button type="button" className="button button-secondary" disabled={profilePhotoBusy} onClick={() => void removeProfilePhoto()}>{profilePhotoBusy ? 'Removendo…' : 'Remover foto'}</button>}
            </div>
            <h3>Publicações da empresa</h3>
            {profileLoading && !profilePosts.length ? <p className="instalab-profile-empty">Carregando publicações…</p> : <>
              {profilePosts.some(post => post.imageMimeType) ? <div className="instalab-profile-grid" aria-label="Galeria de fotos publicadas">{profilePosts.filter(post => post.imageMimeType).map(post => <button key={post.id} type="button" onClick={() => { setActiveTab('home'); window.setTimeout(() => document.getElementById('post-' + post.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }} aria-label={'Abrir foto publicada: ' + (post.body || post.imageName || 'foto')}><img src={'/api/student/instalab/' + post.id + '/image'} alt={post.body || 'Foto publicada pela empresa'} loading="lazy"/></button>)}</div> : <div className="instalab-profile-empty-state"><span aria-hidden="true">📷</span><strong>Compartilhe suas primeiras fotos</strong><p>As fotos publicadas aparecerão aqui.</p><button type="button" className="button button-primary" onClick={openComposer}>Criar publicação</button></div>}
              {profilePosts.some(post => !post.imageMimeType) && <section className="instalab-profile-text-posts"><h4>Publicações em texto</h4>{profilePosts.filter(post => !post.imageMimeType).map(post => <button type="button" key={post.id} onClick={() => { setActiveTab('home'); window.setTimeout(() => document.getElementById('post-' + post.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); }}><span>{post.body}</span><small>{dateTime(post.createdAt)}</small></button>)}</section>}
              {profileHasMore && <div className="instalab-load-more"><button className="button button-secondary" type="button" disabled={profileLoading} onClick={() => void loadProfilePosts(profilePosts.length)}>{profileLoading ? 'Carregando…' : 'Carregar mais publicações'}</button></div>}
            </>}
          </section> : <>
            <form ref={composerRef} className="instalab-composer" onSubmit={publish}><div className="instalab-compose-head"><Avatar studentId={feed.studentId} name={feed.businessName || feed.studentName} hasPhoto={feed.hasAvatar} photoUrl={profilePhotoUrl || undefined}/><div><label htmlFor="instalab-body">Compartilhe com a turma</label><small>{feed.businessName || 'Sua empresa'} · {feed.class.name}</small></div></div><textarea id="instalab-body" name="body" maxLength={2000} rows={3} placeholder="O que sua empresa está criando, aprendendo ou oferecendo?"/><div className="instalab-compose-footer">{preview ? <div className="instalab-upload-preview"><img src={preview} alt="Prévia da imagem"/><button type="button" onClick={() => setImage(null)} aria-label="Remover imagem">×</button></div> : <label className="instalab-image-picker"><span aria-hidden="true">＋</span> Adicionar foto<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setImage(event.target.files?.[0] || null)} /></label>}<small className="instalab-upload-hint">JPG, PNG ou WebP · até 4 MB</small><button className="button button-primary" disabled={busy}>{busy ? 'Publicando…' : 'Publicar'} <span aria-hidden="true">↑</span></button></div></form>
          <section className="instalab-feed-section" aria-label="Publicações da turma"><header className="instalab-feed-heading"><div><span className="section-tag">FEED DA TURMA</span><h2>Publicações</h2></div><span>{feed.total} {feed.total === 1 ? 'publicação' : 'publicações'}</span></header><div className="instalab-feed">{feed.sponsored && activeTab === 'home' && <article className="instalab-post instalab-sponsored"><header><Avatar studentId={feed.sponsored.studentId} name={feed.sponsored.businessName} hasPhoto={false}/><div><strong>{feed.sponsored.businessName}</strong><small>{feed.sponsored.authorName} · Anúncio de simulação</small></div><span className="instalab-sponsored-label">PATROCINADO</span></header><p className="instalab-post-body">{feed.sponsored.caption}</p>{feed.sponsored.imageMimeType && <img className="instalab-post-image" src={`/api/student/instalab/campaigns/${feed.sponsored.id}/image`} alt={`Anúncio de simulação da empresa ${feed.sponsored.businessName}`} loading="lazy"/>}<p className="instalab-sponsored-footnote">Publicidade educativa exibida somente nesta turma. O destaque não representa garantia de visualizações.</p></article>}{feed.posts.length ? feed.posts.map(post => <article className="instalab-post" id={`post-${post.id}`} key={post.id}><header><Avatar studentId={post.studentId} name={post.businessName} hasPhoto={post.hasAvatar}/><div><strong>{post.businessName}</strong><small>{post.authorName} · {post.businessSegment} · {dateTime(post.createdAt)}</small></div>{post.isMine && <details className="instalab-post-menu"><summary aria-label="Opções da publicação">•••</summary><div><button type="button" onClick={() => { setEditingPostId(current => current === post.id ? null : post.id); setEditingImage(null); setRemoveCurrentImage(false); }}>{editingPostId === post.id ? 'Cancelar edição' : 'Editar publicação'}</button><button type="button" disabled={interactionBusyId === post.id} onClick={() => void remove(post)}>Excluir publicação</button></div></details>}</header>{editingPostId === post.id ? <form className="instalab-edit-form" onSubmit={event => void editPost(event, post)}><label>Texto da publicação<textarea name="body" maxLength={2000} rows={4} defaultValue={post.body}/></label>{post.imageMimeType && <label className="instalab-remove-image"><input type="checkbox" checked={removeCurrentImage} onChange={event => setRemoveCurrentImage(event.target.checked)}/> Remover imagem atual</label>}<label className="instalab-image-picker">{editingImage ? 'Trocar imagem selecionada' : 'Adicionar ou trocar imagem'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => { setEditingImage(event.target.files?.[0] || null); if (event.target.files?.[0]) setRemoveCurrentImage(false); }}/></label><small>JPG, PNG ou WebP · até 4 MB</small><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></form> : <>{post.body && <p className="instalab-post-body">{post.body}</p>}{post.imageMimeType && <img className="instalab-post-image" src={`/api/student/instalab/${post.id}/image`} alt={post.imageName || `Publicação de ${post.businessName}`} loading="lazy"/>}<div className="instalab-post-actions"><button type="button" className={`instalab-like-button${post.likedByMe ? ' is-liked' : ''}`} aria-label={post.likedByMe ? 'Descurtir publicação' : 'Curtir publicação'} aria-pressed={post.likedByMe} disabled={interactionBusyId === post.id} onClick={() => void toggleLike(post)}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M7 10v11H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3Zm0 0 4-7a3 3 0 0 1 2 3v3h5.2a2.5 2.5 0 0 1 2.45 3l-1.4 7A2.5 2.5 0 0 1 16.8 21H7Z"/></svg><span>{post.likedByMe ? 'Curtido' : 'Curtir'}</span></button><button type="button" className="instalab-comment-jump" onClick={() => document.getElementById(`comment-${post.id}`)?.focus()}>◯ Comentar</button></div><strong className="instalab-like-count">{post.likeCount} {post.likeCount === 1 ? 'curtida' : 'curtidas'}</strong>{post.comments.length > 0 && <div className="instalab-comments" aria-label="Comentários">{post.comments.map(item => <p key={item.id}><Avatar studentId={item.studentId} name={item.authorBusinessName || item.authorName} hasPhoto={item.hasAvatar} className="instalab-comment-avatar"/><span><strong>{item.authorBusinessName || item.authorName}</strong>{item.authorBusinessName && <small>{item.authorName} · </small>} {item.body}</span></p>)}</div>}<form className="instalab-comment-form" onSubmit={event => void comment(event, post)}><label className="visually-hidden" htmlFor={`comment-${post.id}`}>Comentar nesta publicação</label><input id={`comment-${post.id}`} maxLength={1000} value={commentDrafts[post.id] || ''} onChange={event => setCommentDrafts(current => ({ ...current, [post.id]: event.target.value }))} placeholder="Adicione um comentário…"/><button type="submit" disabled={interactionBusyId === post.id || !commentDrafts[post.id]?.trim()}>{interactionBusyId === post.id ? 'Enviando…' : 'Publicar'}</button></form></>}</article>) : <div className="instalab-empty"><span aria-hidden="true">✦</span><h3>O feed começa com uma ideia</h3><p>Publique uma foto ou conte à turma o que sua empresa está desenvolvendo.</p></div>}</div>
              {feed.hasMore && <div className="instalab-load-more" ref={loadMoreRef}><button className="button button-secondary" type="button" disabled={loadingMore} onClick={() => void loadMore()}>{loadingMore ? 'Carregando…' : 'Carregar mais publicações'}</button></div>}
            </section>
          </>}
        </>}
      </main>

      {feed.class && feed.business && <aside className="instalab-context-card"><span className="section-tag">SUA COMUNIDADE</span><h2>{feed.class.name}</h2><p>O feed é compartilhado com os alunos matriculados nesta turma e com o professor.</p><div><i aria-hidden="true">✓</i><span>Publicações, curtidas e comentários ficam dentro do MetaLab Pocket.</span></div><Link href="/turmas">Ver minha turma <span aria-hidden="true">→</span></Link></aside>}
      {feed.class && feed.business && <nav className="instalab-mobile-nav" aria-label="Navegação do InstaLab"><button type="button" className={activeTab === 'home' ? 'is-active' : ''} onClick={() => setActiveTab('home')} aria-label="Início"><span>⌂</span><small>Início</small></button><button type="button" onClick={openComposer} aria-label="Criar publicação"><span>＋</span><small>Criar</small></button><button type="button" className={activeTab === 'profile' ? 'is-active' : ''} onClick={() => { setActiveTab('profile'); void loadProfilePosts(); }} aria-label="Perfil"><span>◉</span><small>Perfil</small></button></nav>}
    </div>
  </AppShell>;
}
