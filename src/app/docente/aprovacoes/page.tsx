'use client';

import { useCallback, useEffect, useState } from 'react';

type Account = { id: string; fullName: string; email: string; state: 'pending'|'active'|'rejected'|'suspended'|'disabled'; role: 'teacher'|'admin'; createdAt: string };
type Classroom = { id: string; name: string; joinCode: string; studentCount: number; responsibleTeacherId: string | null };
const stateLabel: Record<Account['state'], string> = { pending: 'Aguardando aprovação', active: 'Ativo', rejected: 'Rejeitado', suspended: 'Suspenso', disabled: 'Desativado' };

export default function TeacherApprovalsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [classes, setClasses] = useState<Classroom[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const reload = useCallback(async () => {
    const [accountResponse, classResponse] = await Promise.all([
      fetch('/api/teacher/admin/accounts', { cache: 'no-store', credentials: 'same-origin' }),
      fetch('/api/teacher/admin/classes', { cache: 'no-store', credentials: 'same-origin' })
    ]);
    const accountPayload = await accountResponse.json().catch(() => ({}));
    const classPayload = await classResponse.json().catch(() => ({}));
    if (!accountResponse.ok) throw new Error(accountPayload.error || 'Acesso administrativo necessário.');
    if (!classResponse.ok) throw new Error(classPayload.error || 'Não foi possível carregar as turmas.');
    setAccounts(accountPayload.accounts); setClasses(classPayload.classes);
  }, []);

  useEffect(() => { void reload().catch(error => setMessage(error instanceof Error ? error.message : 'Falha ao carregar.')).finally(() => setLoading(false)); }, [reload]);

  async function changeAccount(account: Account, action: string) {
    setBusy(account.id); setMessage('');
    try {
      const response = await fetch('/api/teacher/admin/accounts', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ teacherId: account.id, action }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a conta.');
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível atualizar a conta.'); }
    finally { setBusy(''); }
  }

  async function assignClass(classId: string, teacherId: string) {
    setBusy(classId); setMessage('');
    try {
      const response = await fetch('/api/teacher/admin/classes', { method: 'PATCH', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ classId, teacherId: teacherId || null }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível associar a turma.');
      await reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível associar a turma.'); }
    finally { setBusy(''); }
  }

  if (loading) return <main className="teacher-page"><div className="teacher-loading">Carregando aprovações…</div></main>;
  const activeTeachers = accounts.filter(account => account.role === 'teacher' && account.state === 'active');
  return <main className="teacher-page" style={{ maxWidth: 1100, margin: '0 auto', padding: 32 }}>
    <a href="/docente/painel">← Voltar ao painel</a>
    <span className="section-tag" style={{ display: 'inline-block', marginTop: 24 }}>ADMINISTRAÇÃO</span>
    <h1 style={{ fontSize: 'clamp(2.2rem, 5vw, 4rem)', margin: '8px 0' }}>Contas docentes</h1>
    <p>Revise solicitações e associe explicitamente as turmas existentes aos professores responsáveis.</p>
    {message && <div className="teacher-alert" role="alert">{message}</div>}
    <section className="teacher-subsection" style={{ marginTop: 28 }}>
      <div className="teacher-subhead"><div><span className="teacher-kicker">SOLICITAÇÕES E CONTAS</span><h2>Professores cadastrados</h2></div><button className="button button-secondary" onClick={() => void reload().catch(error => setMessage(error.message))}>Atualizar</button></div>
      {accounts.length ? accounts.map(account => <article key={account.id} style={{ border: '1px solid var(--line, #e5dbca)', borderRadius: 14, padding: 16, margin: '12px 0' }}>
        <strong>{account.fullName}</strong><span style={{ marginLeft: 12 }}>{account.email}</span><span style={{ marginLeft: 12 }}>{stateLabel[account.state]}</span>
        <small style={{ display: 'block', marginTop: 6 }}>Cadastro: {new Date(account.createdAt).toLocaleString('pt-BR')}</small>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
          {account.state === 'pending' && <><button className="button button-primary" disabled={busy===account.id} onClick={() => void changeAccount(account,'approve')}>Aprovar</button><button className="button button-secondary" disabled={busy===account.id} onClick={() => void changeAccount(account,'reject')}>Rejeitar</button></>}
          {account.state === 'active' && <button className="button button-secondary" disabled={busy===account.id} onClick={() => void changeAccount(account,'suspend')}>Suspender</button>}
          {account.state === 'suspended' && <button className="button button-primary" disabled={busy===account.id} onClick={() => void changeAccount(account,'reactivate')}>Reativar</button>}
          {account.state !== 'disabled' && <button className="button button-secondary" disabled={busy===account.id} onClick={() => void changeAccount(account,'disable')}>Desativar</button>}
        </div>
      </article>) : <p>Nenhuma conta docente encontrada.</p>}
    </section>
    <section className="teacher-subsection" style={{ marginTop: 36 }}>
      <div className="teacher-subhead"><div><span className="teacher-kicker">LEGADO · SEM ATRIBUIÇÃO AUTOMÁTICA</span><h2>Responsáveis pelas turmas</h2></div></div>
      <p>Turmas sem responsável continuam sem acesso para professores comuns. A alteração mantém matrículas, missões e entregas.</p>
      {classes.map(classroom => <label key={classroom.id} style={{ display: 'grid', gridTemplateColumns: '1fr minmax(240px, 360px)', gap: 16, alignItems: 'center', borderBottom: '1px solid var(--line, #e5dbca)', padding: '14px 0' }}>
        <span><strong>{classroom.name}</strong><small style={{ display: 'block' }}>{classroom.studentCount} aluno(s)</small></span>
        <select value={classroom.responsibleTeacherId || ''} aria-label={`Responsável pela turma ${classroom.name}`} disabled={busy===classroom.id} onChange={event => void assignClass(classroom.id,event.target.value)}>
          <option value="">Sem responsável</option>
          {activeTeachers.map(account => <option value={account.id} key={account.id}>{account.fullName}</option>)}
        </select>
      </label>)}
    </section>
  </main>;
}
