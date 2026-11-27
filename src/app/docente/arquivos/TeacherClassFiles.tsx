'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

type Classroom = { id: string; name: string };
type ClassFile = { id: string; classId: string; className: string; fileName: string; mimeType: string; sizeBytes: number; createdAt: string };
const accepted = '.pdf,.docx,.xlsx,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp';

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TeacherClassFiles() {
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [files, setFiles] = useState<ClassFile[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function refresh() {
    setLoading(true);
    try {
      const response = await fetch('/api/teacher/class-files', { cache: 'no-store', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os arquivos.');
      setClasses(data.classes || []);
      setFiles(data.files || []);
      setSelectedClass(current => current || data.classes?.[0]?.id || '');
      setError(false);
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível carregar os arquivos.');
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(''); setError(false);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/teacher/class-files', { method: 'POST', credentials: 'same-origin', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o arquivo.');
      setFiles(data.files || []);
      formRef.current?.reset();
      setMessage('Arquivo disponibilizado para a turma selecionada.');
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível enviar o arquivo.');
    } finally { setBusy(false); }
  }

  async function remove(file: ClassFile) {
    if (!window.confirm(`Remover “${file.fileName}” para todos os alunos da turma ${file.className}?`)) return;
    setBusy(true); setMessage(''); setError(false);
    try {
      const response = await fetch(`/api/teacher/class-files/${file.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível remover o arquivo.');
      setFiles(current => current.filter(item => item.id !== file.id));
      setMessage('Arquivo removido da turma.');
    } catch (cause) {
      setError(true);
      setMessage(cause instanceof Error ? cause.message : 'Não foi possível remover o arquivo.');
    } finally { setBusy(false); }
  }

  return <main className="teacher-page class-files-teacher-page">
    <header className="class-files-teacher-topbar"><a href="/docente/painel">← Painel do professor</a><span className="section-tag">MATERIAIS DIDÁTICOS</span></header>
    <div className="class-files-teacher-content">
      <header className="class-files-heading"><div><span className="section-tag">CONTEÚDO COMPARTILHADO</span><h1>Arquivos da turma</h1><p>Envie documentos para uma turma específica. Apenas os alunos vinculados a ela poderão baixar.</p></div><button type="button" className="button button-secondary" onClick={() => void refresh()} disabled={loading}>Atualizar</button></header>
      {message && <div className={`class-files-notice${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>{message}</div>}
      <section className="class-files-upload-panel"><div><span className="teacher-kicker">NOVO MATERIAL</span><h2>Compartilhar um arquivo</h2><p>PDF, DOCX, XLSX, PPTX, TXT, CSV, JPG, PNG ou WebP · até 15 MB.</p></div>
        <form ref={formRef} onSubmit={event => void upload(event)}><label>Turma<select name="classId" value={selectedClass} onChange={event => setSelectedClass(event.target.value)} required disabled={!classes.length}><option value="" disabled>Selecione uma turma</option>{classes.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label>Arquivo<input type="file" name="file" accept={accepted} required disabled={!classes.length || busy} /></label><button className="button button-primary" type="submit" disabled={busy || !classes.length}>{busy ? 'Enviando…' : '↑ Enviar para a turma'}</button>{!classes.length && !loading && <small>Crie uma turma antes de compartilhar materiais.</small>}</form>
      </section>
      <section className="class-files-teacher-list"><header><div><span className="teacher-kicker">BIBLIOTECA</span><h2>Arquivos publicados</h2></div><span>{files.length} {files.length === 1 ? 'arquivo' : 'arquivos'}</span></header>
        {loading ? <p className="class-files-empty">Carregando arquivos…</p> : files.length ? <div className="class-files-list">{files.map(file => <article className="class-file-card" key={file.id}><span className="class-file-icon" aria-hidden="true">▤</span><div className="class-file-copy"><strong>{file.fileName}</strong><small>{file.className} · {formatSize(file.sizeBytes)} · {new Date(file.createdAt).toLocaleDateString('pt-BR')}</small></div><a className="button button-secondary" href={`/api/teacher/class-files/${file.id}`}>Baixar</a><button type="button" className="button button-danger" onClick={() => void remove(file)} disabled={busy}>Remover</button></article>)}</div> : !error && <div className="class-files-empty"><span aria-hidden="true">▤</span><h3>Biblioteca vazia</h3><p>Os arquivos enviados aparecerão aqui, identificados pela turma.</p></div>}
      </section>
    </div>
  </main>;
}
