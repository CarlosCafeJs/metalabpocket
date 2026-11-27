import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {getTeacherAccountSession} from '@/server/teacher-accounts';
import {createGameFlowSession,listTeacherGameFlowSessions} from '@/server/gameflows-sessions';
import {readJson,sameOrigin} from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
export async function GET(request:NextRequest){
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  try{return NextResponse.json({sessions:await listTeacherGameFlowSessions({id:actor.id,role:actor.role})},{headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.sessions.list failed (${code})`);return NextResponse.json({error:'Não foi possível carregar as salas.'},{status:503,headers:noStore});}
}
export async function POST(request:NextRequest){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  try{
    const input=z.object({caseId:z.string().uuid(),classId:z.string().uuid(),message:z.string().trim().max(1000).optional()}).strict().parse(await readJson(request,4096));
    const result=await createGameFlowSession(input,{id:actor.id,role:actor.role});
    if(result.kind==='not-found')return NextResponse.json({error:'Caso publicado e turma autorizada não encontrados.'},{status:404,headers:noStore});
    return NextResponse.json({sessionId:result.id},{status:201,headers:noStore});
  }catch(error){if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});if(error instanceof z.ZodError)return NextResponse.json({error:'Selecione um caso e uma turma.'},{status:400,headers:noStore});if(error&&typeof error==='object'&&'code'in error&&String(error.code)==='23505')return NextResponse.json({error:'Já existe uma sala aberta para este caso e turma.'},{status:409,headers:noStore});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.sessions.create failed (${code})`);return NextResponse.json({error:'Não foi possível abrir a sala.'},{status:503,headers:noStore});}
}
