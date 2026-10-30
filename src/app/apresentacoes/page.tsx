'use client';

import { AppShell } from '@/components/AppShell';
import PresentationLibrary from './PresentationLibrary';

export default function PresentationsPage() {
  return <AppShell eyebrow="APRENDER COM APOIO VISUAL" title="Apresentações" description="Materiais preparados pelo professor para acompanhar as aulas."><PresentationLibrary /></AppShell>;
}
