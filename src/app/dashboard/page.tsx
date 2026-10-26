'use client';

import Link from 'next/link';
import { AppShell } from '@/components/AppShell';
import { allMissions, courseModules } from '@/domain/curriculum';
import { useStudentState } from '@/hooks/useStudentState';

export default function DashboardPage() {
  const { student, business, progress } = useStudentState();
  const completed = Math.max(0, Math.min(progress?.completedMissions ?? 0, allMissions.length));
  const total = progress?.totalMissions || allMissions.length;
  const percentage = Math.round((completed / Math.max(total, 1)) * 100);
  const nextMission = allMissions.find(mission => mission.id === progress?.currentMissionId)
    || allMissions.find(mission => !progress?.completedMissionIds?.includes(mission.id));
  const currentModule = courseModules.find(module => module.id === (nextMission?.module || courseModules.at(-1)?.id)) || courseModules[0];
  const achievements = progress?.achievements || [];

  return (
    <AppShell>
      <section className="dashboard-hero">
        <div className="dashboard-intro">
          <span className="section-tag light">CENTRAL DE APRENDIZAGEM</span>
          <p className="dashboard-greeting">Olá, {student?.displayName || 'estudante'}.</p>
          <h1>Qual é a sua<br /><em>próxima atividade?</em></h1>
          <p>Continue de onde parou. Cada missão prepara algo que será usado no seu Kit Digital.</p>
        </div>
        <div className="dashboard-progress" aria-label={`${percentage}% da formação concluída`}>
          <div className="progress-orbit" style={{ '--progress': `${percentage * 3.6}deg` } as React.CSSProperties}>
            <div><strong>{percentage}%</strong><span>concluído</span></div>
          </div>
          <p><strong>{completed} de {total}</strong> missões concluídas</p>
          <small>FORMAÇÃO DE 20 HORAS</small>
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="next-mission-card">
          <div className="card-topline"><span>{nextMission ? 'PRÓXIMA MISSÃO' : 'FORMAÇÃO CONCLUÍDA'}</span><em>MÓDULO {currentModule.id} · {currentModule.duration}</em></div>
          <div className="mission-number" aria-hidden="true">{nextMission ? String(nextMission.order).padStart(2, '0') : '✓'}</div>
          <div className="mission-copy">
            <p>{currentModule.title}</p>
            <h2>{nextMission?.title || 'Você concluiu as 20 horas de formação.'}</h2>
            <span>{nextMission?.objective || 'Revise seu Kit Digital ou repita uma atividade para continuar praticando.'}</span>
            <Link className="button button-primary" href={nextMission ? '/missoes' : '/celular'}>
              {nextMission ? 'Continuar missão' : 'Abrir o celular'} <span aria-hidden="true">→</span>
            </Link>
          </div>
        </article>

        <aside className="dashboard-side">
          <article className="business-summary-card">
            <span className="section-tag">MEU CONTEXTO</span>
            <div className="business-mark" style={{ background: business?.primaryColor || '#D98B08' }}>{business?.name?.charAt(0) || '+'}</div>
            <h2>{business?.name || 'Configure sua empresa'}</h2>
            <p>{business ? `${business.segment} · ${business.mainOffering}` : 'Conte sobre o negócio que acompanhará suas atividades.'}</p>
            <Link href="/empresa">{business ? 'Revisar dados' : 'Começar configuração'} <span aria-hidden="true">→</span></Link>
          </article>
          <article className="last-activity-card">
            <span className="section-tag">ÚLTIMA ATIVIDADE</span>
            <strong>{progress?.lastActivity || 'Entrada no MetaLab Pocket'}</strong>
            <small>Seu progresso é salvo ao concluir cada missão.</small>
          </article>
        </aside>
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span className="section-tag">SUA TRILHA</span><h2>5 módulos que constroem um projeto.</h2></div><Link href="/missoes">Ver todas as missões →</Link></div>
        <div className="module-grid">
          {courseModules.map(module => {
            const completedMissionIds = new Set(progress?.completedMissionIds || []);
            const moduleDone = module.missions.filter(mission => completedMissionIds.has(mission.id)).length;
            const active = module.id === currentModule.id;
            return (
              <article key={module.id} className={`module-card ${active ? 'active' : ''}`}>
                <div className="module-index"><span>{String(module.id).padStart(2, '0')}</span><em>{module.duration}</em></div>
                <h3>{module.title}</h3>
                <p>{module.subtitle}</p>
                <div className="mini-progress" aria-label={`${moduleDone} de ${module.missions.length} missões`}><i style={{ width: `${(moduleDone / module.missions.length) * 100}%` }} /></div>
                <small>{moduleDone}/{module.missions.length} missões</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section-block achievements-section">
        <div className="section-heading"><div><span className="section-tag">CONQUISTAS</span><h2>Marcos da sua jornada.</h2></div></div>
        <div className="achievement-row">
          {[
            ['Primeiro passo', 'Entrar e conhecer a plataforma', completed > 0 || Boolean(student)],
            ['Negócio em foco', 'Configurar o contexto da empresa', Boolean(business)],
            ['Olhar de vitrine', 'Concluir as fotos do produto', Boolean(achievements.includes('Olhar de vitrine'))]
          ].map(([title, description, unlocked]) => (
            <article key={String(title)} className={unlocked || achievements.includes(String(title)) ? 'unlocked' : ''}>
              <span aria-hidden="true">{unlocked || achievements.includes(String(title)) ? '✦' : '○'}</span>
              <div><strong>{title}</strong><small>{description}</small></div>
            </article>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
