'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { allMissions, courseModules, type Mission } from '@/domain/curriculum';
import MissionRunner from './MissionRunner';
import ClassroomMissions from './ClassroomMissions';

type ProgressRecord = {
  missionId?: string;
  mission_id?: string;
  status?: string;
  completed?: boolean;
};

type MePayload = {
  student?: (Record<string, unknown> & { id?: string }) | null;
  business?: Record<string, unknown> | null;
  progress?: unknown;
  achievements?: unknown[];
};

function isCompletedStatus(value: unknown) {
  return value === true || value === 'complete' || value === 'completed';
}

function collectCompletedMissionIds(progress: unknown): Set<string> {
  const completed = new Set<string>();
  if (!progress) return completed;

  if (Array.isArray(progress)) {
    progress.forEach(item => {
      if (typeof item === 'string') {
        completed.add(item);
        return;
      }
      if (!item || typeof item !== 'object') return;
      const record = item as ProgressRecord;
      const id = record.missionId || record.mission_id;
      if (id && (isCompletedStatus(record.status) || record.completed === true)) completed.add(id);
    });
    return completed;
  }

  if (typeof progress === 'object') {
    const value = progress as Record<string, unknown>;
    const explicitIds = value.completedMissionIds || value.completed_mission_ids;
    if (Array.isArray(explicitIds)) explicitIds.forEach(id => {
      if (typeof id === 'string') completed.add(id);
    });
    const nested = value.missions || value.records || value.items;
    collectCompletedMissionIds(nested).forEach(id => completed.add(id));
  }

  return completed;
}

function studentName(student: MePayload['student']) {
  if (!student) return 'estudante';
  for (const key of ['displayName', 'firstName', 'first_name', 'name', 'fullName', 'full_name']) {
    const value = student[key];
    if (typeof value === 'string' && value.trim()) return value.trim().split(/\s+/)[0];
  }
  return 'estudante';
}

function hasBusiness(business: MePayload['business']) {
  if (!business) return false;
  return Object.values(business).some(value => value !== null && value !== undefined && String(value).trim().length > 0);
}

export default function MissionWorkspace() {
  const [me, setMe] = useState<MePayload | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [selectedModule, setSelectedModule] = useState(1);
  const [selectedMissionId, setSelectedMissionId] = useState(allMissions[0]?.id || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).error === 'string'
            ? String((payload as Record<string, unknown>).error)
            : 'Não foi possível carregar suas missões.';
          throw new Error(message);
        }
        if (!active) return;
        const parsed = (payload && typeof payload === 'object' ? payload : {}) as MePayload;
        const progress = collectCompletedMissionIds(parsed.progress);
        setMe(parsed);
        setCompletedIds(progress);
        const nextMission = allMissions.find(mission => !progress.has(mission.id)) || allMissions[0];
        if (nextMission) {
          setSelectedModule(nextMission.module);
          setSelectedMissionId(nextMission.id);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Não foi possível carregar suas missões.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const module = courseModules.find(item => item.id === selectedModule) || courseModules[0];
  const selectedMission = allMissions.find(mission => mission.id === selectedMissionId)
    || module.missions[0];
  const completedCount = completedIds.size;
  const progressPercent = Math.round((completedCount / allMissions.length) * 100);

  const nextMission = useMemo(() => {
    const currentIndex = allMissions.findIndex(mission => mission.id === selectedMission?.id);
    if (currentIndex < 0) return null;
    return allMissions.slice(currentIndex + 1).find(mission => !completedIds.has(mission.id))
      || allMissions.find(mission => !completedIds.has(mission.id))
      || null;
  }, [completedIds, selectedMission?.id]);

  const selectMission = (mission: Mission) => {
    setSelectedModule(mission.module);
    setSelectedMissionId(mission.id);
    document.getElementById('mission-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const registerProgress = (missionId: string, _payload: unknown) => {
    setCompletedIds(current => {
      const next = new Set(current);
      next.add(missionId);
      return next;
    });
  };

  if (loading) {
    return <div className="mission-loading" role="status">Preparando sua próxima atividade…</div>;
  }

  if (error) {
    return (
      <section className="mission-error" role="alert">
        <h2>Não foi possível abrir a trilha</h2>
        <p>{error}</p>
        <div className="mission-inline-actions">
          <button type="button" className="mission-primary-button" onClick={() => window.location.reload()}>Tentar novamente</button>
          <Link className="mission-link" href="/">Voltar à entrada</Link>
        </div>
      </section>
    );
  }

  return (
    <div className="mission-workspace" id="mission-workspace">
      <section className="mission-overview" aria-labelledby="mission-overview-title">
        <div>
          <span className="mission-label">Central de aprendizagem</span>
          <h2 id="mission-overview-title">Olá, {studentName(me?.student)}. Esta é sua próxima prática.</h2>
          <p>Conclua uma atividade de cada vez. Você pode repetir as missões e revisar o feedback quando precisar.</p>
        </div>
        <div className="mission-progress-summary" aria-label={`${progressPercent}% da trilha concluída`}>
          <strong>{progressPercent}%</strong>
          <span>{completedCount} de {allMissions.length} missões</span>
          <progress max={allMissions.length} value={completedCount}>{progressPercent}%</progress>
        </div>
      </section>

      <nav className="mission-module-tabs" aria-label="Módulos do curso">
        {courseModules.map(item => {
          const completedInModule = item.missions.filter(mission => completedIds.has(mission.id)).length;
          return (
            <button
              key={item.id}
              type="button"
              className={item.id === selectedModule ? 'is-active' : ''}
              aria-current={item.id === selectedModule ? 'page' : undefined}
              onClick={() => {
                setSelectedModule(item.id);
                const firstPending = item.missions.find(mission => !completedIds.has(mission.id)) || item.missions[0];
                setSelectedMissionId(firstPending.id);
              }}
            >
              <span>{String(item.id).padStart(2, '0')}</span>
              <strong>{item.title}</strong>
              <small>{completedInModule}/{item.missions.length}</small>
            </button>
          );
        })}
      </nav>

      <div className="mission-layout">
        <aside className="mission-list" aria-labelledby="module-missions-title">
          <div className="mission-list__heading">
            <span className="mission-section-label">{module.duration} · Módulo {module.id}</span>
            <h2 id="module-missions-title">{module.title}</h2>
            <p>{module.objective}</p>
          </div>
          <ol>
            {module.missions.map(mission => {
              const complete = completedIds.has(mission.id);
              const active = selectedMission?.id === mission.id;
              return (
                <li key={mission.id}>
                  <button
                    type="button"
                    className={`${active ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`.trim()}
                    aria-current={active ? 'step' : undefined}
                    onClick={() => selectMission(mission)}
                  >
                    <span className="mission-list__number">{complete ? '✓' : String(mission.order).padStart(2, '0')}</span>
                    <span>
                      <strong>{mission.title}</strong>
                      <small>{complete ? 'Concluída · pode repetir' : mission.objective}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <section className="mission-main">
          {selectedMission && (
            <MissionRunner
              key={selectedMission.id}
              mission={selectedMission}
              studentId={me?.student?.id}
              businessConfigured={hasBusiness(me?.business)}
              alreadyCompleted={completedIds.has(selectedMission.id)}
              onProgressChanged={registerProgress}
            />
          )}
          {selectedMission && completedIds.has(selectedMission.id) && nextMission && (
            <div className="mission-next-step">
              <span className="mission-section-label">Próximo passo</span>
              <strong>{nextMission.title}</strong>
              <button type="button" className="mission-primary-button" onClick={() => selectMission(nextMission)}>
                Continuar para a próxima missão
              </button>
            </div>
          )}
        </section>
      </div>
      <ClassroomMissions />
    </div>
  );
}

