import type { Metadata } from 'next';
import TeacherPresentationLibrary from './TeacherPresentationLibrary';

export const metadata: Metadata = { title: 'MetaLab Apresentações · Professor', robots: { index: false, follow: false } };

export default function TeacherPresentationsPage() { return <TeacherPresentationLibrary />; }
