import { AppShell } from '@/components/AppShell';
import StudentGameFlows from './StudentGameFlows';

export default function GameFlowsPage() {
  return <AppShell eyebrow="DIVISÃO DE CASOS ESPECIAIS" title="GameFlows" description="Investigue casos, reúna evidências e avance em equipe."><StudentGameFlows /></AppShell>;
}
