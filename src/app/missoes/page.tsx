import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import ClassroomMissions from './ClassroomMissions';

export const metadata: Metadata = {
  title: 'Missões · Edu Café Flow',
  description: 'Missões liberadas pelo professor no CaféFlow Pocket.',
};

export default function MissionsPage() {
  return (
    <AppShell
      eyebrow="MISSÕES LIBERADAS PELO PROFESSOR"
      title="Missões"
      description="Acesse os módulos da turma, responda às atividades e acompanhe o que já foi registrado."
    >
      <ClassroomMissions />
    </AppShell>
  );
}
