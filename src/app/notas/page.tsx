import { AppShell } from '@/components/AppShell';
import StudentGrades from './StudentGrades';

export default function StudentGradesPage() {
  return <AppShell eyebrow="ACOMPANHAMENTO INDIVIDUAL" title="Minhas Notas" description="Consulte as avaliações que seus professores publicaram para você."><StudentGrades /></AppShell>;
}
