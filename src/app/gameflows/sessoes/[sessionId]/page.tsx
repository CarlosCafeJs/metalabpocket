import { AppShell } from '@/components/AppShell';
import GameFlowPlay from './GameFlowPlay';

export default async function GameFlowSessionPage({params}:{params:Promise<{sessionId:string}>}){
  const {sessionId}=await params;
  return <AppShell eyebrow="DCE · DOSSIÊ DO INVESTIGADOR" title="Operação ativa"><GameFlowPlay sessionId={sessionId}/></AppShell>;
}
