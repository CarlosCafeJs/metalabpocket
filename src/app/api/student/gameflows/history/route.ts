import {NextRequest,NextResponse} from 'next/server';
import {findEnrolledStudentBySessionToken} from '@/server/repository';
import {readSessionToken} from '@/server/session';
import {listStudentGameFlowHistory} from '@/server/gameflows-sessions';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
export async function GET(request:NextRequest){
  const token=readSessionToken(request);const student=token?await findEnrolledStudentBySessionToken(token).catch(()=>null):null;
  if(!student)return NextResponse.json({error:'Sessão estudantil necessária.'},{status:401,headers:noStore});
  try{return NextResponse.json({sessions:await listStudentGameFlowHistory(student.id)},{headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.gameflows.history.read failed (${code})`);return NextResponse.json({error:'Não foi possível carregar o histórico.'},{status:503,headers:noStore});}
}
