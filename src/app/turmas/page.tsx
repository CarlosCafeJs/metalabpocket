'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/AppShell';

type StudentClass = { id: string; name: string; joinCode: string };
type Classmate = { id: string; fullName: string; businessName: string | null };

export default function StudentClassesPage() {
  const [classroom, setClassroom] = useState<StudentClass | null>(null);
  const [classmates, setClassmates] = useState<Classmate[]>([]);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function load() {
    const response = await fetch('/api/student/classes', { credentials: 'same-origin', cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível consultar sua turma.');
    setClassroom(result.class);
    setClassmates(Array.isArray(result.classmates) ? result.classmates : []);
  }
  useEffect(() => { void load().catch(error => setMessage(error.message)); }, []);

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/student/classes', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível entrar na turma.');
      setClassroom(result.class); setClassmates(Array.isArray(result.classmates) ? result.classmates : []); setCode(''); setMessage(`Você entrou em ${result.class.name}.`);
      window.dispatchEvent(new Event('metalab:session-changed'));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível entrar na turma.'); }
    finally { setBusy(false); }
  }

  return <AppShell eyebrow="SUA SALA DE AULA" title="Turmas" description="Entre na sala da sua turma para acompanhar as atividades e compartilhar no InstaLab.">
    <section className="student-class-page">
      {classroom && <article className="student-class-current"><div className="student-class-current-mark" aria-hidden="true">✓</div><div className="student-class-current-copy"><span className="section-tag">VOCÊ ESTÁ NESTA TURMA</span><h2>{classroom.name}</h2><p>Missões e publicações ficam reunidas com seus colegas aqui.</p></div><Link className="button button-secondary" href="/instalab">Abrir InstaLab <span aria-hidden="true">→</span></Link></article>}
      {classroom && <section className="student-classmates"><header><div><span className="section-tag">SUA TURMA</span><h2>Alunos da sala</h2><p>Você vê apenas colegas matriculados nesta mesma turma.</p></div><span>{classmates.length} {classmates.length===1?'aluno':'alunos'}</span></header>{classmates.length?<div className="student-classmates-grid">{classmates.map(classmate=><article key={classmate.id}><span aria-hidden="true">{classmate.fullName.trim().charAt(0).toUpperCase()}</span><div><strong>{classmate.fullName}</strong><small>{classmate.businessName||'Empresa em construção'}</small></div></article>)}</div>:<p className="student-classmates-empty">Ainda não há alunos matriculados nesta turma.</p>}</section>}
      <form className="student-class-join" onSubmit={join}>
        <div className="student-class-join-heading"><span className="student-class-icon" aria-hidden="true">＋</span><div><span className="section-tag">{classroom ? 'TROCAR DE TURMA' : 'ENTRAR EM UMA TURMA'}</span><h2>{classroom ? 'Tem outro código?' : 'Digite o código da aula'}</h2><p>Peça ao professor o código de 8 caracteres para entrar na sala.</p></div></div>
        <div className="student-class-code-row"><label htmlFor="class-code">Código da turma<input id="class-code" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, '').slice(0, 8))} placeholder="Ex.: 8F2A9HBC" maxLength={8} minLength={8} autoCapitalize="characters" autoComplete="off" aria-describedby="class-code-hint" required /></label><button className="button button-primary" disabled={busy || code.length !== 8}>{busy ? 'Entrando…' : classroom ? 'Trocar de turma' : 'Entrar na turma'} <span aria-hidden="true">→</span></button></div>
        <small id="class-code-hint" className="student-class-hint">Ao entrar em outra turma, sua participação será associada à nova sala.</small>
      </form>
      {message && <p className={`student-class-message${message.startsWith('Você entrou') ? ' is-success' : ''}`} role="status">{message}</p>}
    </section>
  </AppShell>;
}
