import { AppShell } from '@/components/AppShell';
import ClassFilesLibrary from './ClassFilesLibrary';

export default function ClassFilesPage() {
  return <AppShell eyebrow="ARQUIVOS DA TURMA" title="Materiais" description="Acesse os documentos e recursos compartilhados pelo professor."><ClassFilesLibrary /></AppShell>;
}
