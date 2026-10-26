'use client';

import { AppShell } from '@/components/AppShell';
import { SimulatorFrame } from '@/components/SimulatorFrame';
import { useStudentState } from '@/hooks/useStudentState';

export default function CelularPage() {
  const { business } = useStudentState();
  return (
    <AppShell immersive>
      <SimulatorFrame key={business ? `${business.id}-${business.updatedAt || business.name}` : 'no-business'} src="/simulator/index.html" title="Smartphone virtual MetaLab Pocket" business={business} />
    </AppShell>
  );
}
