import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {findEnrolledStudentBySessionToken} from '@/server/repository';
import {readSessionToken} from '@/server/session';
import {getStudentGameFlowRanking} from '@/server/gameflows-sessions';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{sessionId:string}>};
export async function GET(request:NextRequest,context:Context){
  const token=readSessionToken(request);const student=token?await findEnrolledStudentBySessionToken(token).catch(()=>null):null;
  if(!student)return NextResponse.json({error:'Sessão estudantil necessária.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).sessionId);if(!id.success)return NextResponse.json({error:'Operação não encontrada.'},{status:404,headers:noStore});
  try{return NextResponse.json({ranking:await getStudentGameFlowRanking(id.data,student.id)},{headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.gameflows.ranking.read failed (${code})`);return NextResponse.json({error:'Não foi possível carregar o ranking.'},{status:503,headers:noStore});}
}
