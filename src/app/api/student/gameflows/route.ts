import {NextRequest,NextResponse} from 'next/server';
import {findEnrolledStudentBySessionToken} from '@/server/repository';
import {readSessionToken} from '@/server/session';
import {listStudentGameFlowOptions} from '@/server/gameflows-sessions';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
export async function GET(request:NextRequest){
  const token=readSessionToken(request);const student=token?await findEnrolledStudentBySessionToken(token).catch(()=>null):null;
  if(!student)return NextResponse.json({error:'Entre em uma turma autorizada para acessar o GameFlows.'},{status:401,headers:noStore});
  try{return NextResponse.json({cases:await listStudentGameFlowOptions(student.id)},{headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.gameflows.list failed (${code})`);return NextResponse.json({error:'Não foi possível carregar as investigações.'},{status:503,headers:noStore});}
}
