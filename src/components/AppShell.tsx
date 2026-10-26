'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStudentState } from '@/hooks/useStudentState';

type AppShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  immersive?: boolean;
};

const navigation = [
  { href: '/dashboard', label: 'Central', short: 'CE' },
  { href: '/empresa', label: 'Minha Empresa', short: 'EM' },
  { href: '/turmas', label: 'Turmas', short: 'TU' },
  { href: '/missoes', label: 'Missões', short: 'MI' },
  { href: '/instalab', label: 'InstaLab', short: 'IL' },
  { href: '/missoes-relampago', label: 'Missão Relâmpago', short: 'MR' },
  { href: '/entregas', label: 'Entregas', short: 'EN' },
  { href: '/celular', label: 'Celular', short: 'CL' }
];

export function AppShell({ children, eyebrow, title, description, actions, immersive = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useStudentState();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (!session.loading && session.authenticated === false) router.replace('/');
  }, [router, session.authenticated, session.loading]);

  async function leave() {
    await fetch('/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    sessionStorage.removeItem('metalab-pocket-entry');
    window.dispatchEvent(new Event('metalab:session-changed'));
    router.replace('/');
    router.refresh();
  }

  return (
    <div className={`app-shell${immersive ? ' immersive-shell' : ''}`}>
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className="app-sidebar" aria-label="Navegação principal">
        <Link className="shell-brand" href="/dashboard" aria-label="MetaLab Pocket — Central">
          <Image src="/simulator/assets/metalab-logo.png" alt="MetaLab" width={142} height={84} priority />
          <span>POCKET</span>
        </Link>
        <nav className="shell-nav">
          {navigation.map(item => {
            const active = hydrated && (pathname === item.href || (item.href === '/missoes' && pathname.startsWith('/missoes/')));
            return (
              <Link key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>
                <i aria-hidden="true">{item.short}</i><span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="shell-safety">
          <span aria-hidden="true">✦</span>
          <div><strong>Ambiente protegido</strong><small>Simulações sem redes externas</small></div>
        </div>
      </aside>

      <div className="shell-content">
        <header className="shell-topbar">
          <div className="mobile-brand"><strong>MetaLab Pocket</strong><span>Ambiente de aprendizagem</span></div>
          <div className="student-chip" aria-live="polite">
            <span className="student-avatar" aria-hidden="true">{session.student?.displayName?.charAt(0).toUpperCase() || 'M'}</span>
            <div><small>ALUNO</small><strong>{session.loading ? 'Carregando…' : session.student?.displayName || 'Estudante'}</strong></div>
          </div>
          <button className="text-button" type="button" onClick={leave}>Encerrar</button>
        </header>

        <nav className="mobile-nav" aria-label="Navegação móvel">
          {navigation.map(item => {
            const active = hydrated && (pathname === item.href || (item.href === '/missoes' && pathname.startsWith('/missoes/')));
            return <Link key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
          })}
        </nav>

        <main id="main-content" className={`shell-main${immersive ? ' immersive-main' : ''}`}>
          {(eyebrow || title || description || actions) && (
            <header className="page-heading">
              <div>
                {eyebrow && <span className="section-tag">{eyebrow}</span>}
                {title && <h1>{title}</h1>}
                {description && <p>{description}</p>}
              </div>
              {actions && <div className="page-actions">{actions}</div>}
            </header>
          )}
          {!immersive && session.error && <div className="inline-notice" role="status">Sua sessão será sincronizada quando a conexão voltar. Você ainda pode consultar o conteúdo local.</div>}
          {children}
        </main>
      </div>
    </div>
  );
}
