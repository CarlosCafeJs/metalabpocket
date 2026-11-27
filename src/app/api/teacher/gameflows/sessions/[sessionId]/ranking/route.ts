import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getTeacherAccountSession} from '@/server/teacher-accounts';
import {getGameFlowRanking,getTeacherGameFlowSession} from '@/server/gameflows-sessions';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string}>};
export async function GET(request:NextRequest,context:Context){
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Sala não encontrada.'},{status:404,headers:noStore});
  try{
    const session=await getTeacherGameFlowSession(id.data,{id:actor.id,role:actor.role});if(!session)return NextResponse.json({error:'Sala fora do seu escopo.'},{status:404,headers:noStore});
    return NextResponse.json({ranking:await getGameFlowRanking(session.caseId,session.classId,{id:actor.id,role:actor.role})},{headers:noStore});
  }catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.ranking.read failed (${code})`);return NextResponse.json({error:'Não foi possível carregar o ranking.'},{status:503,headers:noStore});}
}
