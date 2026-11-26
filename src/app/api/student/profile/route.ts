import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getStudentProfile, updateStudentProfileBio } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { readJson, sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={ 'Cache-Control':'no-store' };

export async function GET(request:NextRequest) {
  const token=readSessionToken(request);
  const student=token?await findEnrolledStudentBySessionToken(token):null;
  if(!student)return NextResponse.json({error:'Sua sessão expirou ou você ainda não está em uma turma.'},{status:401,headers:noStore});
  try {
    const profile=await getStudentProfile(student.id);
    return profile?NextResponse.json({profile},{headers:noStore}):NextResponse.json({error:'Perfil não encontrado.'},{status:404,headers:noStore});
  } catch(error) {
    const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';
    console.error(`student.profile.read failed (${code})`);
    return NextResponse.json({error:code==='42703'?'O perfil pessoal depende da migration 020.':'Não foi possível carregar seu perfil.'},{status:503,headers:noStore});
  }
}

export async function PATCH(request:NextRequest) {
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const token=readSessionToken(request);
  const student=token?await findEnrolledStudentBySessionToken(token):null;
  if(!student)return NextResponse.json({error:'Sua sessão expirou ou você ainda não está em uma turma.'},{status:401,headers:noStore});
  try {
    const parsed=z.object({bio:z.string().trim().max(500)}).strict().parse(await readJson(request,2048));
    if(!await updateStudentProfileBio(student.id,parsed.bio))return NextResponse.json({error:'Não foi possível atualizar seu perfil.'},{status:404,headers:noStore});
    return NextResponse.json({ok:true},{headers:noStore});
  } catch(error) {
    if(error instanceof Response)return error;
    if(error instanceof z.ZodError)return NextResponse.json({error:'A descrição deve ter até 500 caracteres.'},{status:400,headers:noStore});
    const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';
    console.error(`student.profile.update failed (${code})`);
    return NextResponse.json({error:code==='42703'?'O perfil pessoal depende da migration 020.':'Não foi possível atualizar seu perfil.'},{status:503,headers:noStore});
  }
}
