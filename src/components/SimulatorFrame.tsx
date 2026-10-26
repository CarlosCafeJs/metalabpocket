'use client';

import { useEffect, useState } from 'react';
import { useStudentState, type BusinessProfile } from '@/hooks/useStudentState';

type SimulatorFrameProps = {
  src: string;
  title: string;
  kind?: 'phone' | 'studio';
  business?: BusinessProfile | null;
};

export function SimulatorFrame({ src, title, kind = 'phone', business = null }: SimulatorFrameProps) {
  const [ready, setReady] = useState(false);
  const { student } = useStudentState();

  useEffect(() => {
    if (kind === 'phone' && business) {
      try {
        const storageKey = `metalab-business-v1-${student?.id || 'guest'}`;
        const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
        const previous = stored && typeof stored === 'object' ? stored : {};
        const catalog = Array.isArray(previous.catalog) ? previous.catalog : [];
        const hasMainOffer = catalog.some((product: { name?: unknown }) => product?.name === business.mainOffering);
        localStorage.setItem(storageKey, JSON.stringify({
          ...previous,
          name: business.name,
          description: business.description,
          segment: business.segment,
          mainOffering: business.mainOffering,
          targetAudience: business.targetAudience,
          differentiator: business.differentiator,
          primaryColor: business.primaryColor,
          catalog: hasMainOffer || !business.mainOffering ? catalog : [
            { name: business.mainOffering, price: 'Consultar', description: business.description },
            ...catalog
          ]
        }));
      } catch {
        // A simulação ainda funciona com o perfil fictício padrão quando o armazenamento local está indisponível.
      }
    }
    setReady(Boolean(student?.id));
  }, [business, kind, student?.id]);

  if (!ready) return <div className={`simulator-loading ${kind}`} role="status">Preparando a experiência interativa…</div>;

  const frameUrl = new URL(src, typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  if (student?.id) frameUrl.searchParams.set('studentId', student.id);
  return (
    <div className={`simulator-frame ${kind}`}>
      <iframe
        src={`${frameUrl.pathname}${frameUrl.search}${frameUrl.hash}`}
        title={title}
        loading="eager"
        allow="camera 'none'; microphone 'none'; geolocation 'none'"
      />
    </div>
  );
}
