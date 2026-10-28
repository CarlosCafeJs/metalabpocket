'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { defaultCampaignBudget } from '@/domain/instalab-economy';

type Post = { id: string; body: string; imageMimeType: string | null; likeCount: number; comments: unknown[]; createdAt: string };
type Campaign = { id: string; caption: string; objective: string; budgetLimit: number; amountSpent: number; remainingBudget: number; paidIntervals: number; paidThrough: string | null; status: string; createdAt: string; rejectionReason: string | null; impressions: number; sourcePostId: string | null };
type Economy = { balance: number; entries: Array<{ id: string; amount: number; description: string; createdAt: string }>; campaigns: Campaign[]; plans: { adIntervalMinutes: number; adIntervalCost: number } };
const moneyDate = (value: string) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
const statusLabel: Record<string, string> = { pending: 'Aguardando professor', active: 'Em veiculação', approved: 'Aprovado', rejected: 'Reprovado', suspended: 'Pausado', ended: 'Encerrado', no_balance: 'Sem saldo' };

export default function ProfessionalPanelPage() {
  const [economy, setEconomy] = useState<Economy | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [caption, setCaption] = useState('');
  const [objective, setObjective] = useState('awareness');
  const [budgetLimit, setBudgetLimit] = useState<number | null>(null);
  const [sourcePostId, setSourcePostId] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const requestId = useRef<string | null>(null);

  async function load() {
    const [walletResponse, postsResponse] = await Promise.all([
      fetch('/api/student/instalab/economy', { credentials: 'same-origin', cache: 'no-store' }),
      fetch('/api/student/instalab?scope=mine&limit=30&offset=0', { credentials: 'same-origin', cache: 'no-store' })
    ]);
    const walletData = await walletResponse.json();
    const postData = await postsResponse.json();
    if (!walletResponse.ok) throw new Error(walletData.error || 'Não foi possível carregar a carteira.');
    if (!postsResponse.ok) throw new Error(postData.error || 'Não foi possível carregar suas publicações.');
    setEconomy(walletData as Economy);
    setPosts(postData.posts as Post[]);
  }

  useEffect(() => { void load().catch(error => setMessage(error instanceof Error ? error.message : 'Não foi possível carregar o painel.')); }, []);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    const form = new FormData();
    form.set('caption', caption);
    form.set('objective', objective);
    form.set('budgetLimit', String(selectedBudgetLimit));
    if (sourcePostId) form.set('sourcePostId', sourcePostId);
    if (image) form.set('image', image);
    requestId.current ||= crypto.randomUUID();
    try {
      const response = await fetch('/api/student/instalab/campaigns', { method: 'POST', credentials: 'same-origin', headers: { 'Idempotency-Key': requestId.current }, body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível enviar o anúncio.');
      requestId.current = null; setCaption(''); setImage(null); setSourcePostId('');
      setMessage(result.duplicate ? 'Este anúncio já havia sido recebido.' : 'Anúncio enviado para aprovação. As moedas só serão cobradas quando começar a veiculação.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível enviar o anúncio.'); }
    finally { setBusy(false); }
  }

  async function changeCampaign(campaign: Campaign, action: 'pause' | 'end') {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/student/instalab/campaigns/${campaign.id}`, { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar o anúncio.');
      setMessage(action === 'pause' ? 'Campanha pausada. O restante do orçamento não foi cobrado.' : 'Campanha encerrada.');
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o anúncio.'); }
    finally { setBusy(false); }
  }

  const earned = economy?.entries.filter(entry => entry.amount > 0).reduce((total, entry) => total + entry.amount, 0) ?? 0;
  const spent = Math.abs(economy?.entries.filter(entry => entry.amount < 0).reduce((total, entry) => total + entry.amount, 0) ?? 0);
  const intervalCost = economy?.plans.adIntervalCost ?? 10;
  const intervalMinutes = economy?.plans.adIntervalMinutes ?? 10;
  const selectedBudgetLimit = budgetLimit ?? defaultCampaignBudget(economy?.balance ?? intervalCost, intervalCost);
  const estimatedIntervals = Math.floor(selectedBudgetLimit / intervalCost);
  const estimatedMinutes = estimatedIntervals * intervalMinutes;

  return <AppShell><main className="student-professional"><Link className="student-professional-back" href="/instalab">← Voltar ao InstaLab</Link><span className="section-tag">INSTA LAB · SIMULAÇÃO</span><h1>Painel profissional</h1><p className="student-professional-lead">Acompanhe seu negócio e planeje uma divulgação para sua turma.</p>
    {message && <p className="instalab-status" role="status">{message}</p>}
    {!economy ? <section className="student-professional-card"><p>Carregando sua carteira…</p></section> : <>
      <section className="student-professional-metrics"><article><small>Saldo disponível</small><strong>{economy.balance} <span>MetaCoins</span></strong></article><article><small>Recebidas no extrato</small><strong>{earned}</strong></article><article><small>Investidas no extrato</small><strong>{spent}</strong></article><article><small>Publicações</small><strong>{posts.length}</strong></article></section>
      <section className="student-professional-card"><header><div><span className="section-tag">FERRAMENTAS PARA ANÚNCIOS</span><h2>Criar anúncio para a turma</h2><p>O professor aprova antes da veiculação. O orçamento define o limite máximo; cada intervalo pago dura {intervalMinutes} minutos e não garante visualizações.</p></div></header>
        <form className="student-ad-form" onSubmit={createCampaign}>
          <label>Texto do anúncio<textarea required minLength={2} maxLength={1000} value={caption} onChange={event => setCaption(event.target.value)} placeholder="Apresente o produto ou serviço da sua empresa." rows={3}/></label>
          <div className="student-ad-form-grid"><label>Objetivo<select value={objective} onChange={event => setObjective(event.target.value)}><option value="awareness">Apresentar a empresa</option><option value="visits">Levar ao perfil da empresa</option><option value="engagement">Convidar a interagir</option></select></label><label>Limite máximo de investimento (MetaCoins)<input type="number" min={intervalCost} max={100000} step={intervalCost} value={selectedBudgetLimit} onChange={event => setBudgetLimit(Math.max(intervalCost, Number(event.target.value) || intervalCost))}/><small>{intervalCost} moedas por {intervalMinutes} min · até {estimatedIntervals} intervalos ({Math.floor(estimatedMinutes / 60)} h {estimatedMinutes % 60} min, se houver saldo).</small></label></div>
          <label>Usar publicação existente<select value={sourcePostId} onChange={event => { setSourcePostId(event.target.value); if (event.target.value) setImage(null); }}><option value="">Criar peça com imagem nova</option>{posts.filter(post => post.imageMimeType).map(post => <option key={post.id} value={post.id}>{post.body.slice(0, 72) || 'Publicação com imagem'}{post.body.length > 72 ? '…' : ''}</option>)}</select></label>
          {!sourcePostId && <label className="student-ad-image">Imagem do anúncio<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setImage(event.target.files?.[0] || null)}/><small>JPG, PNG ou WebP · até 4 MB</small></label>}
          <div className="student-ad-submit"><p>Limite escolhido: <strong>{selectedBudgetLimit} MetaCoins</strong>. A cobrança ocorre intervalo a intervalo, somente enquanto o anúncio estiver ativo.</p><button className="button button-primary" disabled={busy || !caption.trim() || !sourcePostId && !image}>{busy ? 'Enviando…' : 'Enviar para análise'}</button></div>
        </form>
      </section>
      <section className="student-professional-card"><header><div><span className="section-tag">CAMPANHAS</span><h2>Meus anúncios</h2></div></header>{economy.campaigns.length ? <div className="student-campaign-list">{economy.campaigns.map(campaign => <article key={campaign.id}><div><strong>{campaign.caption}</strong><p>Limite {campaign.budgetLimit} · cobrado {campaign.amountSpent} · restante do limite {campaign.remainingBudget} MetaCoins · {campaign.paidIntervals} intervalo(s) · {moneyDate(campaign.createdAt)}</p><p>Saldo atual da carteira: {economy.balance} MetaCoins. O limite não fica reservado; cada intervalo só é cobrado se houver saldo.</p>{campaign.paidThrough && <small>Veiculação paga até {moneyDate(campaign.paidThrough)}</small>}{campaign.rejectionReason && <small>{campaign.rejectionReason}</small>}</div><span className={'campaign-status campaign-' + campaign.status}>{statusLabel[campaign.status] || campaign.status}</span><small>{campaign.impressions} impressões registradas</small>{(campaign.status === 'active' || campaign.status === 'pending' || campaign.status === 'suspended') && <div className="student-campaign-actions"><button type="button" className="button button-secondary" disabled={busy || campaign.status === 'suspended'} onClick={() => void changeCampaign(campaign, 'pause')}>{campaign.status === 'suspended' ? 'Pausado' : 'Pausar'}</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => void changeCampaign(campaign, 'end')}>Encerrar</button></div>}</article>)}</div> : <p>Você ainda não criou anúncios.</p>}</section>
      <section className="student-professional-card"><header><div><span className="section-tag">INSIGHTS DISPONÍVEIS</span><h2>Atividade do perfil</h2><p>Dados que já são registrados pelo InstaLab. Visualizações e alcance único ainda não são medidos.</p></div></header><p>{posts.length} publicações carregadas · {posts.reduce((sum, post) => sum + post.likeCount, 0)} curtidas · {posts.reduce((sum, post) => sum + post.comments.length, 0)} comentários.</p><details><summary>Extrato de MetaCoins</summary><div className="student-campaign-list">{economy.entries.length ? economy.entries.map(entry => <article key={entry.id}><div><strong>{entry.description}</strong><p>{moneyDate(entry.createdAt)}</p></div><strong className={entry.amount < 0 ? 'is-debit' : 'is-credit'}>{entry.amount > 0 ? '+' : ''}{entry.amount}</strong></article>) : <p>Nenhuma movimentação.</p>}</div></details></section>
      <p className="student-professional-disclaimer">MetaCoins são itens fictícios de uma atividade educacional. Não representam dinheiro e não podem ser compradas, transferidas ou convertidas.</p>
    </>}
  </main></AppShell>;
}
