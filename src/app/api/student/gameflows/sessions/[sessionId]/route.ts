import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {findEnrolledStudentBySessionToken} from '@/server/repository';
import {readSessionToken} from '@/server/session';
import {getStudentGameFlowSession} from '@/server/gameflows-sessions';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string}>};
export async function GET(request:NextRequest,context:Context){
  const token=readSessionToken(request);const student=token?await findEnrolledStudentBySessionToken(token).catch(()=>null):null;
  if(!student)return NextResponse.json({error:'Entre em uma turma para continuar.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Operação não encontrada.'},{status:404,headers:noStore});
  try{const session=await getStudentGameFlowSession(id.data,student.id);return session?NextResponse.json({session},{headers:noStore}):NextResponse.json({error:'Você não está na lista congelada desta operação.'},{status:404,headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.gameflows.session.read failed (${code})`);return NextResponse.json({error:'Não foi possível recuperar seu dossiê.'},{status:503,headers:noStore});}
}
