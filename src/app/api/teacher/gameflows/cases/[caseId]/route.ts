import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { getGameFlowCaseForTeacher, saveGameFlowCase } from '@/server/gameflows-cases';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{caseId:string}>};
export async function GET(request:NextRequest,context:Context){
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const caseId=z.string().uuid().safeParse((await context.params).caseId);if(!caseId.success)return NextResponse.json({error:'Caso não encontrado.'},{status:404,headers:noStore});
  try{const investigation=await getGameFlowCaseForTeacher(caseId.data,{id:actor.id,role:actor.role});return investigation?NextResponse.json({investigation},{headers:noStore}):NextResponse.json({error:'Caso não encontrado.'},{status:404,headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.case.read failed (${code})`);return NextResponse.json({error:'Não foi possível abrir este caso.'},{status:503,headers:noStore});}
}
export async function PUT(request:NextRequest,context:Context){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const caseId=z.string().uuid().safeParse((await context.params).caseId);if(!caseId.success)return NextResponse.json({error:'Caso não encontrado.'},{status:404,headers:noStore});
  try{
    const saved=await saveGameFlowCase(await readJson(request,64*1024),{id:actor.id,role:actor.role},caseId.data);
    if(saved.kind==='not-found')return NextResponse.json({error:'Caso não encontrado no seu escopo.'},{status:404,headers:noStore});
    if(saved.kind==='not-editable')return NextResponse.json({error:'Casos publicados não podem ser alterados depois de disponibilizados.'},{status:409,headers:noStore});
    if(saved.kind==='has-sessions')return NextResponse.json({error:'Este caso já possui sessões; preserve o histórico criando uma nova versão.'},{status:409,headers:noStore});
    if(saved.kind==='invalid')return NextResponse.json({error:'O caso precisa ter de 5 a 10 gates válidos.',issues:saved.issues.map(issue=>({path:issue.path,message:issue.message}))},{status:400,headers:noStore});
    return NextResponse.json({id:saved.id},{headers:noStore});
  }catch(error){if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.case.update failed (${code})`);return NextResponse.json({error:'Não foi possível atualizar o caso.'},{status:503,headers:noStore});}
}
