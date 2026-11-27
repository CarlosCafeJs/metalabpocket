import type { Metadata } from 'next';
import TeacherClassFiles from './TeacherClassFiles';

export const metadata: Metadata = { title: 'Arquivos da turma · Professor', robots: { index: false, follow: false } };

export default function TeacherClassFilesPage() { return <TeacherClassFiles />; }
