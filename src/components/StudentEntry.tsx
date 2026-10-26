'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStudentState } from '@/hooks/useStudentState';

type RegistrationResponse = {
  student?: { id?: string; displayName?: string };
  error?: string;
};

export function StudentEntry() {
  const router = useRouter();
  const session = useStudentState();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const maximumBirthDate = useMemo(() => new Date().toISOString().slice(0, 10), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/students', {
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
      router.push('/dashboard');
      router.refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Não foi possível registrar sua entrada.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!session.loading && session.authenticated && session.student) {
    return (
      <div className="entry-returning" role="status">
        <span className="section-tag">SESSÃO ENCONTRADA</span>
        <h2>Olá, {session.student.displayName}.</h2>
        <p>Sua central de aprendizagem está pronta para continuar.</p>
        <button className="button button-primary button-wide" onClick={() => router.push('/dashboard')}>
          Continuar minha formação <span aria-hidden="true">→</span>
        </button>
      </div>
    );
  }

  return (
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

      <div className="honeypot" aria-hidden="true">
        <label htmlFor="student-website">Site</label>
        <input id="student-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <button className="button button-primary button-wide" type="submit" disabled={submitting}>
        {submitting ? 'Preparando seu espaço…' : 'Entrar no MetaLab Pocket'}
      </button>
      <p className="form-message" role="alert" aria-live="polite">{message}</p>
      <p className="privacy-copy"><strong>Ambiente de treino:</strong> seus dados registram sua entrada no curso. Os aplicativos são simulações e não acessam redes sociais reais. As fotos tiradas na Câmera são enviadas ao banco do curso para acompanhamento do professor; se a conexão falhar, elas ficam na galeria e tentam sincronizar novamente depois.</p>
    </form>
  );
}
