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
        <p>O professor autentica no MetaLab oficial antes de salvar outro endereço.</p>
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
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch(desktop ? '/api/desktop/connect' : '/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: String(data.get('name') ?? '').trim(),
          email: String(data.get('email') ?? '').trim(),
          birthDate: String(data.get('birthDate') ?? ''),
          photoSharingConsent: true,
          website: String(data.get('website') ?? '')
        })
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
      <span className="section-tag">01 · ENTRADA DO ALUNO</span>
      <h2>Bem-vindo ao MetaLab Pocket.</h2>
      <p className="form-intro">Preencha seus dados para iniciar. Se você já tem cadastro, sua formação salva será retomada.</p>

      <label htmlFor="student-name">Nome completo</label>
      <input id="student-name" name="name" autoComplete="name" minLength={2} maxLength={120} required placeholder="Como podemos chamar você?" />

      <label htmlFor="student-email">E-mail</label>
      <input id="student-email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="voce@exemplo.com" />

      <label htmlFor="student-birth-date">Data de nascimento</label>
      <input id="student-birth-date" name="birthDate" type="date" autoComplete="bday" min="1900-01-01" max={maximumBirthDate} required />

      {desktop && <DesktopServerAccess origin={backendOrigin} onOpen={() => setSettingsOpen(true)} />}

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="student-website">Site</label>
        <input id="student-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="button button-primary button-wide" type="submit" disabled={submitting}>
        {submitting ? 'Preparando seu espaço…' : 'Entrar no MetaLab Pocket'}
      </button>
      <p className="form-message" role="alert" aria-live="polite">{message}</p>
      <p className="privacy-copy"><strong>Ambiente de treino:</strong> seus dados registram sua entrada no curso. Os aplicativos são simulações e não acessam redes sociais reais. {desktop ? 'As missões e respostas ficam criptografadas neste dispositivo e sincronizam com o curso quando houver conexão.' : 'As fotos tiradas na Câmera são enviadas ao banco do curso para acompanhamento do professor; se a conexão falhar, elas ficam na galeria e tentam sincronizar novamente depois.'}</p>
    </form>
    {desktop && <DesktopBackendSettings open={settingsOpen} origin={backendOrigin} onClose={() => setSettingsOpen(false)} onSaved={value => { setBackendOrigin(value); setSettingsOpen(false); }} />}
    </>
  );
}

function DesktopServerAccess({ origin, onOpen }: { origin: string; onOpen: () => void }) {
  let display = 'Servidor oficial MetaLab';
  try { if (origin) display = new URL(origin).host; } catch { /* não expor URL inválida do banco local */ }
  return <div className="desktop-server-access">
    <span>Servidor: <strong>{display}</strong></span>
    <button type="button" className="text-button" onClick={onOpen}>Configurações do professor</button>
  </div>;
}
