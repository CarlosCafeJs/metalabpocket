'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SimulatorFrame } from '@/components/SimulatorFrame';
import { useStudentState } from '@/hooks/useStudentState';

export default function CameraStudioPage() {
  const router = useRouter();
  const session = useStudentState();
  const [launchedFromCamera, setLaunchedFromCamera] = useState(false);

  useEffect(() => {
    if (session.loading) return;
    if (!session.authenticated) {
      router.replace('/');
      return;
    }
    const cameFromPhoneCamera = sessionStorage.getItem('metalab-pocket-camera-launch') === 'phone-camera';
    sessionStorage.removeItem('metalab-pocket-camera-launch');
    if (cameFromPhoneCamera) setLaunchedFromCamera(true);
    else router.replace('/celular');
  }, [router, session.authenticated, session.loading]);

  if (!launchedFromCamera || session.loading || !session.authenticated) return null;

  return (
    <main className="camera-fullscreen" aria-label="Câmera MetaLab Pocket em tela cheia">
      <SimulatorFrame src="/simulator/camera-studio.html" title="Câmera MetaLab Pocket" kind="studio" />
    </main>
  );
}
