import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createStudentDelivery, findEnrolledStudentBySessionToken, listStudentClassroomResponses, listStudentDeliveries } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={ 'Cache-Control':'no-store' };
const allowedTypes=new Set(['image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm']);
const maxFileBytes=4*1024*1024;
async function studentFor(request:NextRequest){const token=readSessionToken(request);return token?findEnrolledStudentBySessionToken(token):null;}

export async function GET(request:NextRequest){
  try{const student=await studentFor(request);if(!student)return NextResponse.json({error:'Sessão expirada.'},{status:401,headers:noStore});const[deliveries,missionResponses]=await Promise.all([listStudentDeliveries(student.id),listStudentClassroomResponses(student.id)]);return NextResponse.json({deliveries,missionResponses},{headers:noStore});}
  catch(error){const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.deliveries.list failed (${code})`);return NextResponse.json({error:code==='42703'?'A nova estrutura de Entregas depende da migration 020.':'Não foi possível carregar suas entregas.'},{status:503,headers:noStore});}
}

export async function POST(request:NextRequest){
  if(!sameOrigin(request))return NextResponse.json({error:'Origem não permitida.'},{status:403,headers:noStore});
  const length=Number(request.headers.get('content-length')||0);if(length>maxFileBytes+32*1024)return NextResponse.json({error:'O envio excede o limite de 4 MB.'},{status:413,headers:noStore});
  try{
    const student=await studentFor(request);if(!student)return NextResponse.json({error:'Sua sessão expirou. Entre novamente.'},{status:401,headers:noStore});
    if(!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data'))return NextResponse.json({error:'Envie o formulário de entrega.'},{status:415,headers:noStore});
    const form=await request.formData();
    const activityName=String(form.get('activityName')||'').trim();
    const textContent=String(form.get('textContent')||'').trim();
    const missionRaw=String(form.get('missionId')||'').trim();
    const missionId=missionRaw||null;
    const rawFile=form.get('file');const file=rawFile instanceof File&&rawFile.size>0?rawFile:null;
    if(!textContent&&!file)return NextResponse.json({error:'Escreva uma resposta ou anexe um arquivo.'},{status:400,headers:noStore});
    if(textContent.length>10000)return NextResponse.json({error:'O texto deve ter até 10 mil caracteres.'},{status:400,headers:noStore});
    if(!missionId&&(activityName.length<3||activityName.length>120))return NextResponse.json({error:'Informe um título com 3 a 120 caracteres para a entrega independente.'},{status:400,headers:noStore});
    if(missionId&&!z.string().uuid().safeParse(missionId).success)return NextResponse.json({error:'Missão inválida.'},{status:400,headers:noStore});
    if(file&&(!allowedTypes.has(file.type)||file.size>maxFileBytes))return NextResponse.json({error:'Anexe JPG, PNG, WebP, PDF, MP4 ou WebM de até 4 MB.'},{status:400,headers:noStore});
    const fileData=file?Buffer.from(await file.arrayBuffer()):null;
    const fileName=file?file.name.replace(/[\\/\u0000-\u001f]/gu,'_').slice(0,255)||'anexo':null;
    const delivery=await createStudentDelivery({studentId:student.id,activityName:activityName||'Entrega de missão',description:textContent.slice(0,1000),missionId,textContent:textContent||null,fileName,mimeType:file?.type||null,fileData});
    return NextResponse.json({delivery},{status:201,headers:noStore});
  }catch(error){
    if(error instanceof Response)return error;
    if(error instanceof Error&&error.message==='CLASSROOM_MISSION_UNAVAILABLE')return NextResponse.json({error:'Esta missão não está publicada para sua turma.'},{status:404,headers:noStore});
    const code=error&&typeof error==='object'&&'code'in error?String(error.code):'UNEXPECTED';console.error(`student.deliveries.create failed (${code})`);
    return NextResponse.json({error:['42P01','42703','23502','23514'].includes(code)?'A nova estrutura de Entregas depende da migration 020.':'Não foi possível salvar a entrega agora.'},{status:503,headers:noStore});
  }
}
