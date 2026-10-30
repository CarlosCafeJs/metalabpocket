'use client';

import { AppShell } from '@/components/AppShell';
import PresentationViewer from '../PresentationViewer';
import { useParams } from 'next/navigation';

export default function PresentationDetailPage() {
  const params = useParams<{ presentationId: string }>();
  return <AppShell><PresentationViewer id={params.presentationId} /></AppShell>;
}
