import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { listGameFlowCases, saveGameFlowCase } from '@/server/gameflows-cases';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};

export async function GET(request:NextRequest){
  const actor=await getTeacherAccountSession(request).catch(()=>null);
  if(!actor)return NextResponse.json({error:'Entre com uma conta docente aprovada.'},{status:401,headers:noStore});
  try{return NextResponse.json({cases:await listGameFlowCases({id:actor.id,role:actor.role})},{headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.cases.list failed (${code})`);return NextResponse.json({error:'Não foi possível carregar os casos.'},{status:503,headers:noStore});}
}

export async function POST(request:NextRequest){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const actor=await getTeacherAccountSession(request).catch(()=>null);
  if(!actor)return NextResponse.json({error:'Entre com uma conta docente aprovada.'},{status:401,headers:noStore});
  try{
    const body=await readJson(request,64*1024);
    const result=await saveGameFlowCase(body,{id:actor.id,role:actor.role});
    if(result.kind==='invalid')return NextResponse.json({error:'O caso precisa ter de 5 a 10 gates válidos. Revise os campos indicados.',issues:result.issues.map(issue=>({path:issue.path,message:issue.message}))},{status:400,headers:noStore});
    if(result.kind!=='saved')return NextResponse.json({error:'Não foi possível salvar este caso.'},{status:409,headers:noStore});
    return NextResponse.json({id:result.id},{status:201,headers:noStore});
  }catch(error){
    if(error instanceof Response)return new Response(error.body,{status:error.status,headers:new Headers([...error.headers,...Object.entries(noStore)])});
    if(error instanceof z.ZodError)return NextResponse.json({error:'Confira o formato dos dados do caso.'},{status:400,headers:noStore});
    const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.gameflows.cases.create failed (${code})`);
    return NextResponse.json({error:'Não foi possível salvar o caso.'},{status:503,headers:noStore});
  }
}
