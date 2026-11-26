'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentState } from '@/hooks/useStudentState';

type RegistrationResponse = {
  student?: { id?: string; displayName?: string };
  error?: string;
};

type DesktopConfigResponse = { backendOrigin?: string; error?: string };

function DesktopBackendSettings({ open, origin, onClose, onSaved }: {
  open: boolean;
  origin: string;
  onClose: () => void;
  onSaved: (value: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  if (!open) return null;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) {
      setMessage('Conecte-se à internet para autenticar o professor e alterar o servidor.');
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/desktop/config', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify({
          backendUrl: String(data.get('backendUrl') ?? '').trim(),
          teacherCpf: String(data.get('teacherCpf') ?? '').trim(),
          teacherPassword: String(data.get('teacherPassword') ?? '')
        })
      });
      const result = await response.json().catch(() => ({})) as DesktopConfigResponse;
      if (!response.ok || !result.backendOrigin) throw new Error(result.error || 'Não foi possível alterar o servidor.');
      form.reset();
      onSaved(result.backendOrigin);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível alterar o servidor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="desktop-settings-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form className="desktop-settings-dialog" onSubmit={save} noValidate role="dialog" aria-modal="true" aria-labelledby="desktop-settings-title">
        <span className="section-tag">ACESSO RESTRITO AO PROFESSOR</span>
        <h2 id="desktop-settings-title">Configurar servidor</h2>
        <p>O professor autentica no servidor oficial do CaféFlow Pocket antes de salvar outro endereço.</p>
        <label htmlFor="desktop-backend-url">Servidor HTTPS</label>
        <input id="desktop-backend-url" name="backendUrl" type="url" autoComplete="url" required defaultValue={origin} placeholder="https://exemplo.com" />
        <label htmlFor="desktop-teacher-cpf">CPF do professor</label>
        <input id="desktop-teacher-cpf" name="teacherCpf" inputMode="numeric" autoComplete="username" required />
        <label htmlFor="desktop-teacher-password">Senha do professor</label>
        <input id="desktop-teacher-password" name="teacherPassword" type="password" autoComplete="current-password" required />
        <p className="form-message" role="alert" aria-live="polite">{message}</p>
        <div className="desktop-settings-actions">
          <button type="button" className="button" onClick={onClose}>Cancelar</button>
          <button type="submit" className="button button-primary" disabled={saving}>{saving ? 'Validando…' : 'Validar e salvar'}</button>
        </div>
      </form>
    </div>
  );
}

export function StudentEntry() {
  const router = useRouter();
  const session = useStudentState();
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [message, setMessage] = useState('');
  const [desktop, setDesktop] = useState(false);
  const [backendOrigin, setBackendOrigin] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const maximumBirthDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => setDesktop(window.metaLabDesktop?.enabled === true), []);
  useEffect(() => {
    if (!desktop) return;
    let active = true;
    fetch('/api/desktop/config', { cache: 'no-store' }).then(response => response.json()).then((result: DesktopConfigResponse) => {
      if (active && result.backendOrigin) setBackendOrigin(result.backendOrigin);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [desktop]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    if (desktop && !navigator.onLine) {
      setMessage('Sem conexão com a internet. Se já houver uma sessão offline válida, suas missões continuam disponíveis.');
      return;
    }
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    if (mode === 'register' && password !== String(data.get('passwordConfirm') ?? '')) {
      setMessage('As senhas não conferem.');
      return;
    }
    setSubmitting(true);
    setMessage('');
    try {
      const credentials = mode === 'register'
        ? {
            name: String(data.get('name') ?? '').trim(),
            email: String(data.get('email') ?? '').trim(),
            cpf: String(data.get('cpf') ?? '').trim(),
            birthDate: String(data.get('birthDate') ?? ''),
            password
          }
        : { identifier: String(data.get('identifier') ?? '').trim(), password };
      const response = await fetch(desktop ? '/api/desktop/connect' : mode === 'register' ? '/api/students' : '/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(desktop ? { action: mode, ...credentials } : credentials)
      });
      const result = await response.json().catch(() => ({})) as RegistrationResponse;
      if (!response.ok || !result.student?.id) {
        throw new Error(result.error || 'Não foi possível registrar sua entrada.');
      }
      sessionStorage.setItem('metalab-pocket-entry', 'yes');
      window.dispatchEvent(new Event('metalab:session-changed'));
      router.push(desktop ? '/missoes' : '/dashboard');
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Não foi possível registrar sua entrada.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!session.loading && session.authenticated && session.student) {
    return (
      <>
        <div className="entry-returning" role="status">
          <span className="section-tag">SESSÃO ENCONTRADA</span>
          <h2>Olá, {session.student.displayName}.</h2>
          <p>Sua central de aprendizagem está pronta para continuar.</p>
          {desktop && <DesktopServerAccess origin={session.desktopBackendOrigin || backendOrigin} onOpen={() => setSettingsOpen(true)} />}
          <button className="button button-primary button-wide" onClick={() => router.push(desktop ? '/missoes' : '/dashboard')}>
            Continuar minha formação <span aria-hidden="true">→</span>
          </button>
        </div>
        {desktop && <DesktopBackendSettings open={settingsOpen} origin={backendOrigin} onClose={() => setSettingsOpen(false)} onSaved={value => { setBackendOrigin(value); setSettingsOpen(false); }} />}
      </>
    );
  }

  return (
    <>
    <form className="student-form" onSubmit={submit} noValidate>
      <span className="section-tag">ACESSO À FORMAÇÃO</span>
      <h2>{mode === 'register' ? 'Crie sua conta.' : 'Entre na sua conta.'}</h2>
      <p className="form-intro">{mode === 'register' ? 'Use seus dados para acompanhar missões, atividades e projetos da sua turma.' : 'Acesse sua turma e continue de onde parou.'}</p>

      {mode === 'register' ? <>
        <label htmlFor="student-name">Nome completo</label>
        <input id="student-name" name="name" autoComplete="name" minLength={2} maxLength={120} required placeholder="Como podemos chamar você?" />

        <label htmlFor="student-email">E-mail</label>
        <input id="student-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="voce@exemplo.com" />

        <label htmlFor="student-cpf">CPF</label>
        <input id="student-cpf" name="cpf" inputMode="numeric" autoComplete="off" minLength={11} maxLength={14} required placeholder="000.000.000-00" />

        <label htmlFor="student-birth-date">Data de nascimento</label>
        <input id="student-birth-date" name="birthDate" type="date" autoComplete="bday" min="1900-01-01" max={maximumBirthDate} required />
      </> : <>
        <label htmlFor="student-identifier">CPF ou e-mail</label>
        <input id="student-identifier" name="identifier" autoComplete="username" maxLength={254} required placeholder="CPF ou voce@exemplo.com" />
      </>}

      <label htmlFor="student-password">Senha</label>
      <input id="student-password" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 12 : 1} maxLength={256} required placeholder={mode === 'register' ? 'Mínimo de 12 caracteres' : 'Sua senha'} />
      {mode === 'register' && <>
        <label htmlFor="student-password-confirm">Repita a senha</label>
        <input id="student-password-confirm" name="passwordConfirm" type="password" autoComplete="new-password" minLength={12} maxLength={256} required placeholder="Digite a senha novamente" />
      </>}

      {desktop && <DesktopServerAccess origin={backendOrigin} onOpen={() => setSettingsOpen(true)} />}

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="student-website">Site</label>
        <input id="student-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="button button-primary button-wide" type="submit" disabled={submitting}>
        {submitting ? 'Conectando…' : mode === 'register' ? 'Criar conta e entrar' : 'Entrar'}
      </button>
      <p className="form-message" role="alert" aria-live="polite">{message}</p>
      <p className="privacy-copy">{desktop ? 'No aplicativo Desktop, missões e respostas ficam criptografadas neste dispositivo e sincronizam com o curso quando houver conexão.' : 'Seus dados são usados para acompanhar sua participação e seus projetos na turma.'} O CPF é armazenado como resumo criptográfico e a senha nunca fica salva em texto aberto.</p>
      <p className="privacy-copy">{mode === 'register' ? 'Já tem uma conta?' : 'Ainda não tem uma conta?'} <button type="button" className="text-button entry-mode-toggle" onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setMessage(''); }}>{mode === 'register' ? 'Entrar' : 'Criar conta'}</button></p>
    </form>
    {desktop && <DesktopBackendSettings open={settingsOpen} origin={backendOrigin} onClose={() => setSettingsOpen(false)} onSaved={value => { setBackendOrigin(value); setSettingsOpen(false); }} />}
    </>
  );
}

function DesktopServerAccess({ origin, onOpen }: { origin: string; onOpen: () => void }) {
  let display = 'Servidor oficial CaféFlow Pocket';
  try { if (origin) display = new URL(origin).host; } catch { /* não expor URL inválida do banco local */ }
  return <div className="desktop-server-access">
    <span>Servidor: <strong>{display}</strong></span>
    <button type="button" className="text-button" onClick={onOpen}>Configurações do professor</button>
  </div>;
}
