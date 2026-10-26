'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Mission } from '@/domain/curriculum';
import {
  evaluateMission,
  containsPotentialSensitiveData,
  LOCAL_VIDEO_TYPES,
  MAX_LOCAL_VIDEO_BYTES,
  type MissionEvaluation,
  type MissionEvidence,
} from '@/domain/mission-evaluation';

type GalleryPhoto = {
  id: string;
  blob: Blob;
  name?: string;
  product?: string;
  createdAt?: string;
};

type GalleryPreview = GalleryPhoto & { url: string };

type MissionRunnerProps = {
  mission: Mission;
  studentId?: string;
  businessConfigured: boolean;
  alreadyCompleted: boolean;
  onProgressChanged: (missionId: string, payload: unknown) => void;
};

function readGallery(studentId?: string): Promise<GalleryPhoto[]> {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('Galeria local indisponível neste navegador.'));
      return;
    }

    const openRequest = window.indexedDB.open(`metalab-pocket-gallery-${studentId || 'guest'}`, 1);
    openRequest.onupgradeneeded = () => {
      const database = openRequest.result;
      if (!database.objectStoreNames.contains('photos')) {
        database.createObjectStore('photos', { keyPath: 'id' });
      }
    };
    openRequest.onerror = () => reject(openRequest.error || new Error('Não foi possível abrir a Galeria.'));
    openRequest.onsuccess = () => {
      const database = openRequest.result;
      const transaction = database.transaction('photos', 'readonly');
      const request = transaction.objectStore('photos').getAll();
      request.onerror = () => reject(request.error || new Error('Não foi possível ler a Galeria.'));
      request.onsuccess = () => {
        const photos = (request.result as GalleryPhoto[]).sort((a, b) =>
          String(b.createdAt || '').localeCompare(String(a.createdAt || '')),
        );
        resolve(photos);
      };
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => database.close();
    };
  });
}

function transportFor(mission: Mission, evidence: MissionEvidence) {
  if (mission.kind === 'checklist') {
    const checks = evidence.checks ?? [];
    return {
      answer: mission.instructions.filter((_, index) => checks[index]),
      evidence: { checkedCount: checks.filter(Boolean).length },
    };
  }
  if (mission.kind === 'choice') {
    return { answer: evidence.choice || '', evidence: { selected: evidence.choice || '' } };
  }
  if (mission.kind === 'text') {
    return { answer: evidence.text || '', evidence: { length: (evidence.text || '').trim().length } };
  }
  if (mission.kind === 'gallery') {
    return {
      answer: evidence.photoCount ?? 0,
      evidence: { photoCount: evidence.photoCount ?? 0, localOnly: true },
    };
  }
  if (mission.kind === 'video') {
    const validVideo = Boolean(evidence.video
      && LOCAL_VIDEO_TYPES.includes(evidence.video.type as typeof LOCAL_VIDEO_TYPES[number])
      && evidence.video.size > 0
      && evidence.video.size <= MAX_LOCAL_VIDEO_BYTES);
    return {
      answer: evidence.video?.name || '',
      evidence: {
        fileName: evidence.video?.name || '',
        mimeType: evidence.video?.type || '',
        size: evidence.video?.size || 0,
        validVideo,
        localOnly: true,
      },
    };
  }
  return {
    answer: evidence.businessConfigured ? 'configured' : 'missing',
    evidence: { businessConfigured: evidence.businessConfigured === true },
  };
}

function serverCompleted(payload: unknown, fallback: boolean) {
  if (!payload || typeof payload !== 'object') return fallback;
  const value = payload as Record<string, unknown>;
  if (typeof value.completed === 'boolean') return value.completed;
  if (value.status === 'completed' || value.status === 'complete') return true;
  if (value.result && typeof value.result === 'object') {
    const result = value.result as Record<string, unknown>;
    if (typeof result.completed === 'boolean') return result.completed;
    if (result.status === 'completed' || result.status === 'complete') return true;
  }
  if (value.progress && typeof value.progress === 'object') {
    const progress = value.progress as Record<string, unknown>;
    if (progress.status === 'completed' || progress.status === 'complete') return true;
  }
  return fallback;
}

export default function MissionRunner({
  mission,
  studentId,
  businessConfigured,
  alreadyCompleted,
  onProgressChanged,
}: MissionRunnerProps) {
  const [checks, setChecks] = useState<boolean[]>([]);
  const [choice, setChoice] = useState('');
  const [text, setText] = useState('');
  const [evaluation, setEvaluation] = useState<MissionEvaluation | null>(null);
  const [gallery, setGallery] = useState<GalleryPreview[]>([]);
  const [galleryState, setGalleryState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [galleryMessage, setGalleryMessage] = useState('');
  const [video, setVideo] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const refreshGallery = useCallback(async () => {
    setGalleryState('loading');
    setGalleryMessage('');
    try {
      const photos = await readGallery(studentId);
      setGallery(photos.map(photo => ({ ...photo, url: URL.createObjectURL(photo.blob) })));
      setGalleryState('ready');
    } catch (error) {
      setGalleryState('error');
      setGalleryMessage(error instanceof Error ? error.message : 'Não foi possível consultar a Galeria.');
    }
  }, [studentId]);

  useEffect(() => {
    setChecks(Array(mission.instructions.length).fill(false));
    setChoice('');
    setText('');
    setEvaluation(null);
    setSaveMessage('');
    setVideo(null);
    setVideoUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return '';
    });
    if (mission.kind === 'gallery') void refreshGallery();
    else setGallery([]);
  }, [mission, refreshGallery]);

  useEffect(() => () => {
    gallery.forEach(photo => URL.revokeObjectURL(photo.url));
  }, [gallery]);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const evidence = useMemo<MissionEvidence>(() => ({
    checks,
    choice,
    text,
    businessConfigured,
    photoCount: gallery.length,
    video: video ? { name: video.name, type: video.type, size: video.size } : null,
  }), [businessConfigured, checks, choice, gallery.length, text, video]);

  const submitAttempt = async () => {
    const localResult = evaluateMission(mission, evidence);
    setSaveMessage('');
    if (mission.kind === 'text' && containsPotentialSensitiveData(text)) {
      setEvaluation(localResult);
      setSaveMessage('Resposta mantida somente nesta tela. Remova links, e-mails, telefones, senhas ou códigos antes de registrar.');
      return;
    }
    const payload = transportFor(mission, evidence);
    setSaving(true);
    try {
      const response = await fetch(`/api/missions/${encodeURIComponent(mission.id)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverError = data && typeof data === 'object' && typeof (data as Record<string, unknown>).error === 'string'
          ? String((data as Record<string, unknown>).error)
          : 'Não foi possível registrar esta tentativa agora.';
        throw new Error(serverError);
      }
      const completed = serverCompleted(data, mission.kind === 'choice' ? false : localResult.completed);
      setEvaluation(evaluateMission(mission, evidence, completed));
      const responseRecord = data && typeof data === 'object' ? (data as Record<string, unknown>).attempt : null;
      const serverFeedback = responseRecord && typeof responseRecord === 'object' && typeof (responseRecord as Record<string, unknown>).feedback === 'string'
        ? String((responseRecord as Record<string, unknown>).feedback)
        : '';
      setSaveMessage(completed
        ? `Progresso registrado no curso. ${serverFeedback}`
        : `Tentativa registrada. ${serverFeedback || 'Revise o feedback e tente novamente.'}`);
      if (completed) onProgressChanged(mission.id, data);
    } catch (error) {
      setEvaluation(localResult);
      setSaveMessage(error instanceof Error
        ? `${error.message} Seu trabalho continua nesta tela.`
        : 'Não foi possível registrar esta tentativa. Seu trabalho continua nesta tela.');
    } finally {
      setSaving(false);
    }
  };

  const selectVideo = (file: File | null) => {
    setVideo(file);
    setEvaluation(null);
    setSaveMessage('');
    setVideoUrl(current => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  return (
    <article className="mission-runner" aria-labelledby="mission-title">
      <header className="mission-runner__header">
        <div>
          <span className="mission-label">Módulo {mission.module} · Missão {mission.order}</span>
          <h2 id="mission-title">{mission.title}</h2>
          <p>{mission.objective}</p>
        </div>
        {alreadyCompleted && <span className="mission-complete-badge">Concluída ✓</span>}
      </header>

      <section className="mission-context" aria-labelledby="mission-context-title">
        <span className="mission-section-label">Contexto</span>
        <h3 id="mission-context-title">Por que esta prática importa</h3>
        <p>{mission.context}</p>
      </section>

      <div className="mission-reference-grid">
        <section aria-labelledby="mission-instructions-title">
          <span className="mission-section-label">Passo a passo</span>
          <h3 id="mission-instructions-title">Como realizar</h3>
          <ol className="mission-instructions">
            {mission.instructions.map(instruction => <li key={instruction}>{instruction}</li>)}
          </ol>
        </section>
        <section aria-labelledby="mission-criteria-title">
          <span className="mission-section-label">Critérios</span>
          <h3 id="mission-criteria-title">O que será observado</h3>
          <ul className="mission-criteria">
            {mission.criteria.map(criterion => <li key={criterion}>{criterion}</li>)}
          </ul>
        </section>
      </div>

      <section className="mission-activity" aria-labelledby="mission-activity-title">
        <span className="mission-section-label">Prática</span>
        <h3 id="mission-activity-title">{mission.prompt}</h3>

        {mission.kind === 'checklist' && (
          <fieldset className="mission-checklist">
            <legend className="sr-only">Etapas realizadas</legend>
            {mission.instructions.map((instruction, index) => (
              <label key={instruction} className="mission-check">
                <input
                  type="checkbox"
                  checked={checks[index] || false}
                  onChange={event => {
                    const next = [...checks];
                    next[index] = event.target.checked;
                    setChecks(next);
                    setEvaluation(null);
                  }}
                />
                <span>{instruction}</span>
              </label>
            ))}
          </fieldset>
        )}

        {mission.kind === 'choice' && (
          <fieldset className="mission-options">
            <legend className="sr-only">Escolha uma resposta</legend>
            {mission.options?.map(option => (
              <label key={option.value} className="mission-option">
                <input
                  type="radio"
                  name={`mission-${mission.id}`}
                  value={option.value}
                  checked={choice === option.value}
                  onChange={() => { setChoice(option.value); setEvaluation(null); }}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </fieldset>
        )}

        {mission.kind === 'text' && (
          <div className="mission-text-answer">
            <label htmlFor={`answer-${mission.id}`}>Sua resposta</label>
            <textarea
              id={`answer-${mission.id}`}
              rows={7}
              maxLength={1200}
              value={text}
              onChange={event => { setText(event.target.value); setEvaluation(null); }}
              placeholder="Escreva com suas palavras. Não inclua dados pessoais, links, senhas ou códigos."
            />
            <small>{text.trim().length}/{mission.minLength ?? 30} caracteres mínimos · máximo de 1.200</small>
          </div>
        )}

        {mission.kind === 'business' && (
          <div className="mission-connected-state">
            <strong>{businessConfigured ? 'Negócio configurado ✓' : 'Seu negócio ainda precisa ser configurado.'}</strong>
            <p>Os dados salvos serão usados como contexto nas próximas missões.</p>
            <Link className="mission-link" href="/empresa">Abrir Minha Empresa</Link>
          </div>
        )}

        {mission.kind === 'gallery' && (
          <div className="mission-gallery-check">
            <div className="mission-connected-state">
              <strong>{galleryState === 'loading' ? 'Consultando a Galeria…' : `${gallery.length} foto${gallery.length === 1 ? '' : 's'} encontrada${gallery.length === 1 ? '' : 's'}`}</strong>
              <p>As imagens são lidas do armazenamento local deste navegador e não são enviadas.</p>
              {galleryMessage && <p role="alert">{galleryMessage}</p>}
              <div className="mission-inline-actions">
                <Link className="mission-link" href="/celular">Abrir o celular e tocar em Câmera</Link>
                <button type="button" className="mission-secondary-button" onClick={() => void refreshGallery()}>Atualizar Galeria</button>
              </div>
            </div>
            {gallery.length > 0 && (
              <div className="mission-gallery-preview" aria-label="Fotos mais recentes da Galeria">
                {gallery.slice(0, 3).map(photo => (
                  <figure key={photo.id}>
                    <img src={photo.url} alt={photo.product || photo.name || 'Foto do produto na Câmera'} />
                    <figcaption>{photo.product || photo.name || 'Foto do produto'}</figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}

        {mission.kind === 'video' && (
          <div className="mission-video-picker">
            <label className="mission-file-label" htmlFor={`video-${mission.id}`}>Escolher vídeo do computador</label>
            <input
              id={`video-${mission.id}`}
              type="file"
              accept={LOCAL_VIDEO_TYPES.join(',')}
              onChange={event => selectVideo(event.target.files?.[0] || null)}
            />
            <p>MP4 ou WebM, até 50 MB. O vídeo fica somente nesta página e nunca é enviado ao servidor.</p>
            {video && (
              <div className="mission-video-summary">
                <strong>{video.name}</strong>
                <span>{(video.size / 1024 / 1024).toFixed(1)} MB</span>
              </div>
            )}
            {videoUrl && video && LOCAL_VIDEO_TYPES.includes(video.type as typeof LOCAL_VIDEO_TYPES[number]) && video.size <= MAX_LOCAL_VIDEO_BYTES && (
              <video className="mission-video-preview" src={videoUrl} controls playsInline preload="metadata">
                Seu navegador não conseguiu mostrar a prévia deste vídeo.
              </video>
            )}
          </div>
        )}

        <div className="mission-submit-row">
          <button type="button" className="mission-primary-button" onClick={() => void submitAttempt()} disabled={saving || galleryState === 'loading'}>
            {saving ? 'Registrando…' : alreadyCompleted ? 'Refazer e conferir' : 'Conferir minha atividade'}
          </button>
        </div>
      </section>

      {evaluation && (
        <section className={`mission-feedback mission-feedback--${evaluation.status}`} aria-live="polite" aria-labelledby="mission-feedback-title">
          <span className="mission-section-label">Feedback</span>
          <h3 id="mission-feedback-title">{evaluation.title}</h3>
          <p>{evaluation.message}</p>
          <ul>
            {evaluation.criteria.map(criterion => (
              <li key={criterion.id} className={criterion.met ? 'is-met' : 'is-missing'}>
                <span aria-hidden="true">{criterion.met ? '✓' : '○'}</span> {criterion.label}
              </li>
            ))}
          </ul>
          <p>{evaluation.nextStep}</p>
          {saveMessage && <p className="mission-save-status" role="status">{saveMessage}</p>}
          {evaluation.canRetry && (
            <button type="button" className="mission-secondary-button" onClick={() => { setEvaluation(null); setSaveMessage(''); }}>
              Tentar novamente
            </button>
          )}
        </section>
      )}
    </article>
  );
}

