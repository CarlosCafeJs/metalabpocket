'use client';

import { useCallback, useEffect, useState } from 'react';

export type StudentSummary = {
  id: string;
  displayName: string;
};

export type BusinessProfile = {
  id?: string;
  updatedAt?: string;
  name: string;
  segment: string;
  description: string;
  mainOffering: string;
  targetAudience: string;
  differentiator: string;
  primaryColor: string;
};

export type ProgressSummary = {
  completedMissions: number;
  totalMissions: number;
  currentMissionId?: string;
  currentModule?: number;
  lastActivity?: string;
  achievements?: string[];
  completedMissionIds?: string[];
  records?: Array<{ missionId: string; status: string; answer?: unknown; evidence?: Record<string, unknown>; feedback?: string; updatedAt?: string; completedAt?: string | null }>;
};

type StudentState = {
  student: StudentSummary | null;
  business: BusinessProfile | null;
  progress: ProgressSummary | null;
  enrolled: boolean | null;
  desktopBackendOrigin: string | null;
};

const emptyState: StudentState = { student: null, business: null, progress: null, enrolled: null, desktopBackendOrigin: null };

function readStudent(payload: Record<string, unknown>): StudentSummary | null {
  const source = (payload.student && typeof payload.student === 'object' ? payload.student : payload) as Record<string, unknown>;
  const id = typeof source.id === 'string' ? source.id : '';
  const displayName = typeof source.displayName === 'string'
    ? source.displayName
    : typeof source.firstName === 'string'
      ? source.firstName
      : typeof source.name === 'string'
        ? source.name.split(/\s+/)[0]
        : '';
  return id && displayName ? { id, displayName } : null;
}

function readBusiness(payload: unknown): BusinessProfile | null {
  if (!payload || typeof payload !== 'object') return null;
  const envelope = payload as Record<string, unknown>;
  const source = (envelope.business && typeof envelope.business === 'object' ? envelope.business : envelope) as Record<string, unknown>;
  const fields = ['name', 'segment', 'description', 'mainOffering', 'targetAudience', 'differentiator', 'primaryColor'] as const;
  if (!fields.every(field => typeof source[field] === 'string')) return null;
  return {
    id: typeof source.id === 'string' ? source.id : undefined,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : undefined,
    name: source.name as string,
    segment: source.segment as string,
    description: source.description as string,
    mainOffering: source.mainOffering as string,
    targetAudience: source.targetAudience as string,
    differentiator: source.differentiator as string,
    primaryColor: source.primaryColor as string
  };
}

function readProgress(payload: Record<string, unknown>): ProgressSummary | null {
  if (!payload.progress || typeof payload.progress !== 'object') return null;
  const source = payload.progress as Record<string, unknown>;
  const records = Array.isArray(source.records) ? source.records.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
  const completedMissionIds = Array.isArray(source.completedMissionIds)
    ? source.completedMissionIds.filter((item): item is string => typeof item === 'string')
    : records.filter(record => record.status === 'completed' && typeof record.missionId === 'string').map(record => String(record.missionId));
  const completedMissions = Number(source.completedMissions ?? source.completedCount ?? completedMissionIds.length);
  const totalMissions = Number(source.totalMissions ?? source.totalCount ?? 25);
  return {
    completedMissions: Number.isFinite(completedMissions) ? completedMissions : 0,
    totalMissions: Number.isFinite(totalMissions) && totalMissions > 0 ? totalMissions : 25,
    currentMissionId: typeof source.currentMissionId === 'string' ? source.currentMissionId : undefined,
    currentModule: typeof source.currentModule === 'number' ? source.currentModule : undefined,
    lastActivity: typeof source.lastActivity === 'string' ? source.lastActivity : undefined,
    achievements: Array.isArray(source.achievements) ? source.achievements.filter((item): item is string => typeof item === 'string') : undefined,
    completedMissionIds,
    records: records.map(record => ({
      missionId: String(record.missionId || ''),
      status: String(record.status || ''),
      answer: record.answer,
      evidence: record.evidence && typeof record.evidence === 'object' ? record.evidence as Record<string, unknown> : undefined,
      feedback: typeof record.feedback === 'string' ? record.feedback : undefined,
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : undefined,
      completedAt: typeof record.completedAt === 'string' ? record.completedAt : null
    }))
  };
}

export function useStudentState() {
  const [state, setState] = useState<StudentState>(emptyState);
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState('');

  const refreshBusiness = useCallback(async () => {
    const response = await fetch('/api/business', { cache: 'no-store', credentials: 'same-origin' });
    if (response.status === 404) {
      setState(current => ({ ...current, business: null }));
      return null;
    }
    if (!response.ok) throw new Error('Não foi possível carregar os dados da empresa.');
    const business = readBusiness(await response.json());
    setState(current => ({ ...current, business }));
    return business;
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (window.metaLabDesktop?.enabled) {
        const response = await fetch('/api/desktop/session', { cache: 'no-store', credentials: 'same-origin' });
        if (response.status === 401) {
          setState(emptyState);
          setAuthenticated(false);
          return;
        }
        if (!response.ok) throw new Error('Não foi possível recuperar a sessão offline.');
        const payload = await response.json() as Record<string, unknown>;
        const student = readStudent(payload);
        if (!student) throw new Error('A sessão offline recebida está incompleta.');
        setAuthenticated(true);
        setState({ student, business: null, progress: null, enrolled: payload.enrolled === true, desktopBackendOrigin: typeof payload.backendOrigin === 'string' ? payload.backendOrigin : null });
        return;
      }
      const response = await fetch('/api/me', { cache: 'no-store', credentials: 'same-origin' });
      if (response.status === 401) {
        setState(emptyState);
        setAuthenticated(false);
        return;
      }
      if (!response.ok) throw new Error('Não foi possível recuperar sua sessão.');
      const payload = await response.json() as Record<string, unknown>;
      const student = readStudent(payload);
      if (!student) throw new Error('A sessão recebida está incompleta.');
      const enrolled = payload.enrolled === true;
      setAuthenticated(true);
      setState({ student, business: enrolled ? readBusiness(payload.business) : null, progress: enrolled ? readProgress(payload) : null, enrolled, desktopBackendOrigin: null });
      if (enrolled) {
        try {
          if (!readBusiness(payload.business)) await refreshBusiness();
        } catch {
          // A área do aluno continua utilizável enquanto o perfil do negócio é recuperado depois.
        }
      }
    } catch (caught) {
      setAuthenticated(null);
      setError(caught instanceof Error ? caught.message : 'Não foi possível recuperar sua sessão.');
    } finally {
      setLoading(false);
    }
  }, [refreshBusiness]);

  useEffect(() => {
    void refresh();
    const handleSessionChange = () => void refresh();
    window.addEventListener('metalab:session-changed', handleSessionChange);
    return () => window.removeEventListener('metalab:session-changed', handleSessionChange);
  }, [refresh]);

  return {
    ...state,
    loading,
    authenticated,
    error,
    refresh,
    refreshBusiness
  };
}
