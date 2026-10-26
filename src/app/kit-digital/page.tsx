'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/AppShell';
import { allMissions, getMission } from '@/domain/curriculum';
import { useStudentState } from '@/hooks/useStudentState';

type LocalPhoto = { id: string; blob: Blob; name?: string; product?: string; angle?: number; height?: number; createdAt: string; url: string; syncStatus?: string };
type LocalPost = { id: string; blob: Blob; caption: string; createdAt: string; url: string };

export default function KitDigitalPage() {
  const router = useRouter();
  const [openedFromGallery, setOpenedFromGallery] = useState(false);
  const { business, progress, student } = useStudentState();
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [posts, setPosts] = useState<LocalPost[]>([]);
  const [galleryMessage, setGalleryMessage] = useState('Carregando fotos locais…');

  useEffect(() => {
    const cameFromPhoneGallery = sessionStorage.getItem('metalab-pocket-gallery-launch') === 'phone-gallery';
    sessionStorage.removeItem('metalab-pocket-gallery-launch');
    if (cameFromPhoneGallery) setOpenedFromGallery(true);
    else router.replace('/celular');
  }, [router]);

  const loadPhotos = useCallback(async () => {
    if (!student?.id) { setGalleryMessage('Aguardando a sessão do aluno…'); return; }
    if (!('indexedDB' in window)) {
      setGalleryMessage('A galeria local não está disponível neste navegador.');
      return;
    }
    try {
      const records = await new Promise<Array<Omit<LocalPhoto, 'url'>>>((resolve, reject) => {
        const open = indexedDB.open(`metalab-pocket-gallery-${student?.id || 'guest'}`, 1);
        open.onupgradeneeded = () => {
          if (!open.result.objectStoreNames.contains('photos')) open.result.createObjectStore('photos', { keyPath: 'id' });
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const request = open.result.transaction('photos', 'readonly').objectStore('photos').getAll();
          request.onerror = () => reject(request.error);
          request.onsuccess = () => resolve(request.result as Array<Omit<LocalPhoto, 'url'>>);
        };
      });
      records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      const pendingPhotos = records.filter(record => record.syncStatus !== 'synced').slice(0, 10);
      for (const photo of pendingPhotos) {
        const upload = await fetch('/api/student/photos', {
          method: 'POST', credentials: 'same-origin',
          headers: {
            'Content-Type': photo.blob.type || 'image/png',
            'X-MetaLab-Photo-Id': photo.id,
            'X-MetaLab-File-Name': encodeURIComponent(photo.name || 'foto-metalab.png'),
            'X-MetaLab-Product': encodeURIComponent(photo.product || 'Produto do curso'),
            'X-MetaLab-Angle': String(photo.angle || 0),
            'X-MetaLab-Height': String(photo.height || 0)
          }, body: photo.blob
        }).catch(() => null);
        photo.syncStatus = upload?.ok ? 'synced' : 'local-only';
      }
      if (pendingPhotos.length) {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(`metalab-pocket-gallery-${student.id}`, 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction('photos', 'readwrite');
          for (const photo of pendingPhotos) transaction.objectStore('photos').put(photo);
          transaction.oncomplete = () => resolve();
          transaction.onerror = () => reject(transaction.error);
          transaction.onabort = () => reject(transaction.error);
        }).catch(() => undefined);
        database.close();
      }
      setPhotos(current => {
        current.forEach(photo => URL.revokeObjectURL(photo.url));
        return records
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .map(record => ({ ...record, url: URL.createObjectURL(record.blob) }));
      });
      setGalleryMessage(records.length ? '' : 'Galeria vazia, use a Câmera para tirar fotos.');
    } catch {
      setGalleryMessage('Não foi possível abrir a galeria local.');
    }
  }, [student?.id]);

  useEffect(() => {
    void loadPhotos();
    const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`metalab-pocket-gallery-${student?.id || 'guest'}`) : null;
    const update = () => void loadPhotos();
    channel?.addEventListener('message', update);
    window.addEventListener('metalab-gallery-updated', update);
    return () => {
      channel?.close();
      window.removeEventListener('metalab-gallery-updated', update);
    };
  }, [loadPhotos, student?.id]);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    const loadPosts = async () => {
      if (!student?.id) return;
      try {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open(`metalab-pocket-instagram-${student?.id || 'guest'}`, 1);
          request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains('posts')) request.result.createObjectStore('posts', { keyPath: 'id' });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const records = await new Promise<Array<{ id: string; blob: Blob; caption?: string; createdAt: string }>>((resolve, reject) => {
          const request = database.transaction('posts', 'readonly').objectStore('posts').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        const next = records.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(record => {
          const url = URL.createObjectURL(record.blob);
          urls.push(url);
          return { ...record, caption: record.caption || '', url };
        });
        if (active) setPosts(next);
      } catch {
        if (active) setPosts([]);
      }
    };
    if (student?.id && 'indexedDB' in window) void loadPosts();
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [student?.id]);

  useEffect(() => () => photos.forEach(photo => URL.revokeObjectURL(photo.url)), [photos]);

  const completed = progress?.completedMissions ?? 0;
  const completedIds = new Set(progress?.completedMissionIds || []);
  const percentage = Math.round((completed / allMissions.length) * 100);
  const writtenOutputs = (progress?.records || []).filter(record => record.status === 'completed'
    && typeof record.answer === 'string'
    && getMission(record.missionId)?.kind === 'text');
  const videoRecord = (progress?.records || []).find(record => record.missionId === 'm4-video' && record.status === 'completed');
  const videoName = typeof videoRecord?.evidence?.fileName === 'string' ? videoRecord.evidence.fileName : '';

  if (!openedFromGallery) return null;

  return (
    <AppShell
      eyebrow="GALERIA · PROJETO FINAL"
      title="Minha Galeria"
      description="Aqui, seu negócio, suas imagens e suas entregas se encontram em uma apresentação única."
      actions={<><Link className="button button-secondary" href="/celular">Voltar ao Sistema</Link><button className="button button-secondary print-hidden" type="button" onClick={() => window.print()}>Imprimir ou salvar em PDF</button></>}
    >
      <section className="kit-cover" style={{ '--business-color': business?.primaryColor || '#D98B08' } as React.CSSProperties}>
        <div><span className="section-tag light">KIT DIGITAL · METALAB</span><h2>{business?.name || 'Seu projeto está sendo construído'}</h2><p>{business?.description || 'Configure sua empresa para preencher a apresentação final.'}</p></div>
        <div className="kit-score"><strong>{percentage}%</strong><span>da jornada</span></div>
      </section>

      <section className="kit-grid">
        <article className="kit-business-card">
          <span className="section-tag">IDENTIDADE DO NEGÓCIO</span>
          {business ? (
            <><div className="kit-business-head"><i style={{ background: business.primaryColor }}>{business.name.charAt(0)}</i><div><h3>{business.name}</h3><p>{business.segment}</p></div></div><dl><div><dt>Oferta</dt><dd>{business.mainOffering}</dd></div><div><dt>Público</dt><dd>{business.targetAudience}</dd></div><div><dt>Diferencial</dt><dd>{business.differentiator}</dd></div></dl></>
          ) : (
            <div className="empty-state compact"><p>O perfil do negócio ainda não foi preenchido.</p><Link href="/empresa">Configurar agora →</Link></div>
          )}
        </article>

        <article className="kit-progress-card">
          <span className="section-tag">FORMAÇÃO</span>
          <h3>{completed} de {allMissions.length}</h3><p>missões concluídas</p>
          <div className="kit-progress-bar"><i style={{ width: `${percentage}%` }} /></div>
          <small>As entregas aparecem conforme você avança na trilha.</small>
        </article>
      </section>

      <section className="photo-sharing-setting">
        <div><span className="section-tag">FOTOS DA CÂMERA</span><h2>Seu professor acompanha as fotos automaticamente.</h2><p>As imagens ficam vinculadas à sua sessão e aparecem somente para o professor na área deste curso. Você pode apagar uma foto pela miniatura na Câmera.</p></div>
      </section>

      <section className="kit-gallery-card">
        <div className="section-heading"><div><span className="section-tag">MINHAS FOTOGRAFIAS</span><h2>Imagens produzidas na Câmera.</h2></div><Link href="/celular">Voltar ao celular para fotografar →</Link></div>
        {photos.length ? (
          <div className="kit-photo-grid">{photos.slice(0, 8).map(photo => <figure key={photo.id}><img src={photo.url} alt={`Fotografia de ${photo.product || 'produto'}`} /><figcaption><strong>{photo.product || 'Produto'}</strong><span>{typeof photo.angle === 'number' ? `${photo.angle}° · ` : ''}{new Date(photo.createdAt).toLocaleDateString('pt-BR')}</span></figcaption></figure>)}</div>
        ) : <div className="empty-state"><span aria-hidden="true">▧</span><h3>Galeria vazia</h3><p>Use a Câmera para tirar fotos.</p></div>}
      </section>

      <section className="kit-gallery-card kit-outputs">
        <div className="section-heading"><div><span className="section-tag">PUBLICAÇÕES E ROTEIROS</span><h2>Materiais criados durante as práticas.</h2></div></div>
        {posts.length > 0 ? <div className="kit-photo-grid">{posts.slice(0, 8).map(post => <figure key={post.id}><img src={post.url} alt="Publicação fictícia do Instagram de treino" /><figcaption><strong>{post.caption || 'Publicação sem legenda'}</strong><span>{new Date(post.createdAt).toLocaleDateString('pt-BR')} · somente neste navegador</span></figcaption></figure>)}</div> : <div className="empty-state compact"><p>As publicações simuladas do Instagram aparecerão aqui.</p><Link href="/celular">Abrir o celular virtual →</Link></div>}
        {writtenOutputs.length > 0 && <div className="kit-written-outputs">{writtenOutputs.map(record => <article key={record.missionId}><span className="section-tag">{getMission(record.missionId)?.title || 'Rascunho'}</span><p>{String(record.answer)}</p></article>)}</div>}
        <div className="kit-video-status"><strong>Vídeo final</strong><span>{videoName ? `${videoName} foi conferido neste navegador. O arquivo continua no computador.` : 'Escolha e confira seu vídeo na missão do módulo 4. O arquivo permanece no computador.'}</span></div>
      </section>

      <section className="kit-deliverables">
        <article><span>01</span><div><strong>Perfil comercial</strong><small>{business ? 'Pronto para apresentar' : 'Aguardando configuração'}</small></div><i>{business ? '✓' : '○'}</i></article>
        <article><span>02</span><div><strong>Conjunto de fotografias</strong><small>{photos.length} imagem(ns) local(is)</small></div><i>{photos.length >= 3 ? '✓' : '○'}</i></article>
        <article><span>03</span><div><strong>Publicação final</strong><small>Conclua a missão de publicação do módulo 5</small></div><i>{completedIds.has('m5-publicacao-final') ? '✓' : '○'}</i></article>
        <article><span>04</span><div><strong>Atendimento comercial</strong><small>Resposta final de treino</small></div><i>{completedIds.has('m5-atendimento-final') ? '✓' : '○'}</i></article>
      </section>
    </AppShell>
  );
}
