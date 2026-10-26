import type { Metadata } from 'next';
import TeacherPanel from './teacher-panel';

export const metadata: Metadata = {
  title: 'Área do professor',
  robots: { index: false, follow: false, noarchive: true }
};

export default function TeacherPage() {
  return <TeacherPanel />;
}
