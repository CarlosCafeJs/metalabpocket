'use client';

import { useEffect, useState } from 'react';

type ClassFile = { id: string; classId: string; className: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClassFilesLibrary() {
  const [files, setFiles] = useState<ClassFile[]>([]);
  const [className, setClassName] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch('/api/student/class-files', { cache: 'no-store', credentials: 'same-origin' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os materiais.');
        if (active) { setFiles(data.files || []); setClassName(data.classroom?.name || ''); }
      })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : 'Não foi possível carregar os materiais.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="class-files-library">
    <header className="class-files-heading"><div><span className="section-tag">CONTEÚDO DA TURMA</span><h2>{className || 'Materiais para baixar'}</h2><p>Arquivos compartilhados pelo professor com os alunos desta turma.</p></div><span className="class-files-count">{files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}</span></header>
    {message && <div className="class-files-notice" role="alert">{message}</div>}
    {loading ? <p className="class-files-empty">Carregando materiais…</p> : files.length ? <div className="class-files-list">{files.map(file => <article className="class-file-card" key={file.id}><span className="class-file-icon" aria-hidden="true">↓</span><div className="class-file-copy"><strong>{file.fileName}</strong><small>{formatSize(file.sizeBytes)} · Adicionado em {new Date(file.createdAt).toLocaleDateString('pt-BR')}</small></div><a className="button button-primary" href={`/api/student/class-files/${file.id}`} download>Baixar</a></article>)}</div> : !message && <div className="class-files-empty"><span aria-hidden="true">▤</span><h3>Nenhum material disponível</h3><p>Quando o professor compartilhar arquivos com a turma, eles aparecerão aqui.</p></div>}
  </section>;
}
