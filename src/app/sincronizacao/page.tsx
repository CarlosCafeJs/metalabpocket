import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import SyncCenter from './SyncCenter';

export const metadata: Metadata = {
  title: 'Sincronização · CaféFlow Pocket Desktop',
  description: 'Acompanhe a conectividade, a fila offline e as operações confirmadas do CaféFlow Pocket Desktop.'
};

export default function DesktopSyncPage() {
  return <AppShell eyebrow="MODO DESKTOP · OFFLINE-FIRST" title="Central de sincronização" description="Acompanhe suas respostas salvas e o envio seguro ao servidor oficial."><SyncCenter /></AppShell>;
}
