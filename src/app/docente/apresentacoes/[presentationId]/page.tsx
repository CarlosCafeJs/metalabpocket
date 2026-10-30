'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import PresentationViewer from '@/app/apresentacoes/PresentationViewer';

export default function TeacherPresentationViewerPage() {
  const params = useParams<{ presentationId: string }>();
  return <main className="teacher-page presentation-teacher-page"><header className="presentation-teacher-topbar"><Link href="/docente/apresentacoes">← Biblioteca</Link><span className="section-tag">MODO DE VISUALIZAÇÃO</span></header><div className="presentation-teacher-content"><PresentationViewer id={params.presentationId} backHref="/docente/apresentacoes" /></div></main>;
}
