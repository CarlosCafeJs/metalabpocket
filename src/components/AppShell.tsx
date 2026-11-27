'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStudentState } from '@/hooks/useStudentState';
import DesktopSyncCoordinator from '@/components/DesktopSyncCoordinator';

type AppShellProps = {
  children: ReactNode;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  socialMode?: boolean;
};

const navigation = [
  { href: '/dashboard', label: 'Central', short: 'CE' },
  { href: '/sincronizacao', label: 'Sincronização', short: 'SI' },
  { href: '/meu-perfil', label: 'Meu Perfil', short: 'PE' },
  { href: '/turmas', label: 'Minha Turma', short: 'TU' },
  { href: '/missoes', label: 'Missões', short: 'MI' },
  { href: '/instalab', label: 'InstaFlow', short: 'IF' },
  { href: '/apresentacoes', label: 'Apresentações', short: 'AP' },
  { href: '/arquivos', label: 'Materiais', short: 'AR' },
  { href: '/notas', label: 'Minhas Notas', short: 'NO' },
  { href: '/gameflows', label: 'GameFlows', short: 'GF' },
  { href: '/entregas', label: 'Entregas', short: 'EN' },
  { href: '/forum', label: 'Fórum', short: 'FO' }
];

export function AppShell({ children, eyebrow, title, description, actions, socialMode = false }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useStudentState();
  const [hydrated, setHydrated] = useState(false);
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    setHydrated(true);
    setDesktop(window.metaLabDesktop?.enabled === true);
    if (pathname === '/sincronizacao' && window.metaLabDesktop?.enabled !== true) router.replace('/dashboard');
    if (!session.loading && session.authenticated === false) router.replace('/');
    if (!session.loading && session.authenticated && window.metaLabDesktop?.enabled && pathname !== '/missoes' && pathname !== '/sincronizacao') router.replace('/missoes');
    if (!session.loading && session.authenticated && session.enrolled === false && pathname !== '/turmas') router.replace('/turmas');
  }, [router, pathname, session.authenticated, session.enrolled, session.loading]);

  async function leave() {
    await fetch(desktop ? '/api/desktop/session' : '/api/session', { method: 'DELETE', credentials: 'same-origin' }).catch(() => undefined);
    sessionStorage.removeItem('metalab-pocket-entry');
    window.dispatchEvent(new Event('metalab:session-changed'));
    router.replace('/');
    router.refresh();
  }

  const needsClass = !desktop && session.authenticated === true && session.enrolled === false;
  const blockedByClass = needsClass && pathname !== '/turmas';

  return (
    <div className={`app-shell${socialMode ? ' social-shell' : ''}`}>
      <DesktopSyncCoordinator />
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      {!needsClass && !socialMode && <aside className="app-sidebar" aria-label="Navegação principal">
        <Link className="shell-brand" href={desktop ? '/missoes' : '/dashboard'} aria-label="CaféFlow Pocket — Central">
          <Image src="/branding/cafeflow-logo.png" alt="CaféFlow Software Lab" width={190} height={107} priority />
          <span>POCKET</span>
        </Link>
        <nav className="shell-nav">
          {navigation.filter(item => item.href === '/sincronizacao' ? desktop : !desktop || item.href === '/missoes').map(item => {
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
          <div><strong>Ambiente de aprendizagem</strong><small>Atividades organizadas por turma</small></div>
        </div>
      </aside>}

      <div className={`shell-content${needsClass ? ' class-required-shell' : ''}`}>
        <header className="shell-topbar">
          {needsClass ? <Link className="mobile-brand" href="/turmas"><strong>CaféFlow Pocket</strong><span>Entre em uma turma para continuar</span></Link> : <div className="mobile-brand"><strong>CaféFlow Pocket</strong><span>Ambiente de aprendizagem</span></div>}
          <div className="student-chip" aria-live="polite">
            <span className="student-avatar" aria-hidden="true">{session.student?.displayName?.charAt(0).toUpperCase() || 'C'}</span>
            <div><small>ALUNO</small><strong>{session.loading ? 'Carregando…' : session.student?.displayName || 'Estudante'}</strong></div>
          </div>
          <button className="text-button" type="button" onClick={leave}>Encerrar</button>
        </header>

        {!needsClass && !socialMode && <nav className="mobile-nav" aria-label="Navegação móvel">
          {navigation.filter(item => item.href === '/sincronizacao' ? desktop : !desktop || item.href === '/missoes').map(item => {
            const active = hydrated && (pathname === item.href || (item.href === '/missoes' && pathname.startsWith('/missoes/')));
            return <Link key={item.href} href={item.href} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined}>{item.label}</Link>;
          })}
        </nav>}

        <main id="main-content" className="shell-main">
          {blockedByClass ? <section className="student-class-required" role="status"><span className="section-tag">ACESSO À FORMAÇÃO</span><h1>Entre em uma turma para continuar</h1><p>Peça o código ao professor e informe-o na página Turmas. Depois disso, as atividades e os dados da formação serão liberados para sua conta.</p><Link className="button button-primary" href="/turmas">Ir para Turmas <span aria-hidden="true">→</span></Link></section> : (eyebrow || title || description || actions) && (
            <header className="page-heading">
              <div>
                {eyebrow && <span className="section-tag">{eyebrow}</span>}
                {title && <h1>{title}</h1>}
                {description && <p>{description}</p>}
              </div>
              {actions && <div className="page-actions">{actions}</div>}
            </header>
          )}
          {!blockedByClass && session.error && <div className="inline-notice" role="status">Sua sessão será sincronizada quando a conexão voltar. Você ainda pode consultar o conteúdo local.</div>}
          {!blockedByClass && children}
        </main>
      </div>
    </div>
  );
}
