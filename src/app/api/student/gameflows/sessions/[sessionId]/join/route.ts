import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {findEnrolledStudentBySessionToken} from '@/server/repository';
import {readSessionToken} from '@/server/session';
import {joinGameFlowSession} from '@/server/gameflows-sessions';
import {sameOrigin} from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string}>};
export async function POST(request:NextRequest,context:Context){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const token=readSessionToken(request);const student=token?await findEnrolledStudentBySessionToken(token).catch(()=>null):null;
  if(!student)return NextResponse.json({error:'Sua sessão expirou ou não possui uma turma.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Sala não encontrada.'},{status:404,headers:noStore});
  try{
    const result=await joinGameFlowSession(id.data,student.id);
    if(result.kind==='not-found')return NextResponse.json({error:'Sala não encontrada.'},{status:404,headers:noStore});
    if(result.kind==='not-enrolled')return NextResponse.json({error:'Esta sessão pertence a outra turma.'},{status:403,headers:noStore});
    if(result.kind==='entry-closed')return NextResponse.json({error:'A operação já começou. Somente participantes registrados podem reconectar.'},{status:409,headers:noStore});
    if(result.kind==='closed-session')return NextResponse.json({error:'Esta operação terminou. Consulte seu dossiê pelo histórico.'},{status:409,headers:noStore});
    return NextResponse.json({joined:true,state:result.state},{headers:noStore});
  }catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.gameflows.session.join failed (${code})`);return NextResponse.json({error:'Não foi possível entrar na sala.'},{status:503,headers:noStore});}
}
