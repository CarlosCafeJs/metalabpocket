import { NextRequest,NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { publishGameFlowCase } from '@/server/gameflows-cases';
import { readJson,sameOrigin } from '@/server/validation';

export const runtime='nodejs';export const dynamic='force-dynamic';const noStore={'Cache-Control':'no-store'};
type Context={params:Promise<{caseId:string}>};
export async function POST(request:NextRequest,context:Context){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const actor=await getTeacherAccountSession(request).catch(()=>null);if(!actor)return NextResponse.json({error:'Sessão docente necessária.'},{status:401,headers:noStore});
  const id=z.string().uuid().safeParse((await context.params).caseId);if(!id.success)return NextResponse.json({error:'Caso não encontrado.'},{status:404,headers:noStore});
  try{
    const body=z.object({classIds:z.array(z.string().uuid()).min(1).max(100)}).strict().parse(await readJson(request,8192));
    const result=await publishGameFlowCase(id.data,body.classIds,{id:actor.id,role:actor.role});
    if(result.kind==='not-found')return NextResponse.json({error:'Caso não encontrado.'},{status:404,headers:noStore});
    if(result.kind==='class-out-of-scope')return NextResponse.json({error:'Uma ou mais turmas estão fora do seu escopo.'},{status:404,headers:noStore});
    if(result.kind==='incomplete')return NextResponse.json({error:'O caso está incompleto ou possui dependências inválidas. Revise 5 a 10 gates e suas respostas.'},{status:409,headers:noStore});
    if(result.kind==='invalid-classes')return NextResponse.json({error:'Selecione ao menos uma turma autorizada.'},{status:400,headers:noStore});
    return NextResponse.json({published:true,classCount:result.classCount},{headers:noStore});
  }catch(error){if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});if(error instanceof z.ZodError)return NextResponse.json({error:'Selecione pelo menos uma turma.'},{status:400,headers:noStore});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.case.publish failed (${code})`);return NextResponse.json({error:'Não foi possível publicar o caso.'},{status:503,headers:noStore});}
}
