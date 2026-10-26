import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import ClassroomMissions from './ClassroomMissions';

export const metadata: Metadata = {
  title: 'Minhas Missões · MetaLab Pocket',
  description: 'Missões liberadas pelo professor no MetaLab Pocket.',
};

export default function MissionsPage() {
  return (
    <AppShell
      eyebrow="MISSÕES LIBERADAS PELO PROFESSOR"
      title="Minhas Missões"
      description="Acesse os módulos da turma, responda às atividades e acompanhe o que já foi registrado."
    >
      <ClassroomMissions />
    </AppShell>
  );
}
