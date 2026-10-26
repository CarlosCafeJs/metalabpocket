import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { assignStudentToClass, createTeacherClass, listTeacherClasses } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store'};

export async function GET(request:NextRequest){
  if(!hasTeacherSession(request))return NextResponse.json({error:'Sessão do professor necessária.'},{status:401,headers});
  try{return NextResponse.json({classes:await listTeacherClasses()},{headers});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.classes.list failed (${code})`);return NextResponse.json({error:'Não foi possível carregar as turmas.'},{status:503,headers});}
}

export async function POST(request:NextRequest){
  if(!hasTeacherSession(request))return NextResponse.json({error:'Sessão do professor necessária.'},{status:401,headers});
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers});
  try{
    const body=await readJson(request,2048) as Record<string,unknown>;
    if(body.action==='create'){
      const input=z.object({action:z.literal('create'),name:z.string().trim().min(2).max(120)}).strict().parse(body);
      const id=await createTeacherClass(input.name);
      return NextResponse.json({id:id?.id,joinCode:id?.joinCode,classes:await listTeacherClasses()},{status:201,headers});
    }
    const input=z.object({action:z.literal('assign'),studentId:z.string().uuid(),classId:z.string().uuid().nullable()}).strict().parse(body);
    const updated=await assignStudentToClass(input.studentId,input.classId);
    return updated?NextResponse.json({ok:true,classes:await listTeacherClasses()},{headers}):NextResponse.json({error:'Aluno ou turma não encontrada.'},{status:404,headers});
  }catch(error){if(error instanceof Response)return error;if(error instanceof z.ZodError)return NextResponse.json({error:'Confira o nome da turma e o aluno selecionado.'},{status:400,headers});const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`teacher.classes.write failed (${code})`);return NextResponse.json({error:'Não foi possível salvar esta turma.'},{status:503,headers});}
}
