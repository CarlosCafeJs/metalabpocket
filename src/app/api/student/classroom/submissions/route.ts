import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findStudentBySessionToken, getPublishedClassroomMissionTasks, getPublishedClassroomTask, submitClassroomMissionResponse, submitClassroomTask } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const schema = z.object({ taskId: z.string().uuid(), answer: z.union([z.string().max(2000), z.array(z.string().max(100)).max(12), z.boolean(), z.null()]) }).strict();
const missionSchema=z.object({missionId:z.string().uuid(),answers:z.array(z.object({taskId:z.string().uuid(),answer:z.union([z.string().max(2000),z.array(z.string().max(100)).max(12),z.boolean(),z.null()])}).strict()).max(80)}).strict();
const noStore = { 'Cache-Control': 'no-store' };
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  const token = readSessionToken(request); const student = token ? await findStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers: noStore });
  try {
    const body=await readJson(request,150000);
    if(body&&typeof body==='object'&&'missionId'in body){
      const input=missionSchema.parse(body);
      const tasks=await getPublishedClassroomMissionTasks(input.missionId);
      if(!tasks.length)return NextResponse.json({error:'Esta missão não está liberada ou ainda não tem perguntas.'},{status:404,headers:noStore});
      const supplied=new Map(input.answers.map(item=>[item.taskId,item.answer]));
      if(supplied.size!==input.answers.length||input.answers.some(item=>!tasks.some(task=>task.id===item.taskId))||tasks.some(task=>task.required&&!supplied.has(task.id)))return NextResponse.json({error:'Revise as perguntas obrigatórias antes de enviar o formulário.'},{status:400,headers:noStore});
      for(const task of tasks){
        const answer=supplied.get(task.id);
        const empty=answer===null||answer===''||(Array.isArray(answer)&&answer.length===0);
        if(empty&&!task.required)continue;
        const settings=task.settings||{};const scaleMin=Number(settings.scaleMin??1);const scaleMax=Number(settings.scaleMax??5);
        const valid=task.type==='complete'?answer===true
          :task.type==='text'||task.type==='short_answer'?typeof answer==='string'&&answer.trim().length>=1
          :task.type==='multiple_choice'||task.type==='dropdown'?typeof answer==='string'&&task.options.some(option=>option.value===answer)
          :task.type==='checkboxes'?Array.isArray(answer)&&answer.length>0&&answer.every(value=>task.options.some(option=>option.value===value))&&new Set(answer).size===answer.length
          :task.type==='linear_scale'?typeof answer==='string'&&Number.isInteger(Number(answer))&&Number(answer)>=scaleMin&&Number(answer)<=scaleMax
          :task.type==='date'?typeof answer==='string'&&/^\d{4}-\d{2}-\d{2}$/u.test(answer)&&!Number.isNaN(Date.parse(`${answer}T12:00:00Z`))
          :false;
        if(!valid)return NextResponse.json({error:`Confira a resposta: ${task.prompt}`},{status:400,headers:noStore});
      }
      const submission=await submitClassroomMissionResponse({studentId:student.id,missionId:input.missionId,answers:input.answers});
      if(!submission)return NextResponse.json({error:'As respostas desta missão já foram registradas ou o módulo foi encerrado.'},{status:409,headers:noStore});
      return NextResponse.json({submission},{status:201,headers:noStore});
    }
    const input = schema.parse(body);
    const task = await getPublishedClassroomTask(input.taskId);
    if (!task) return NextResponse.json({ error: 'Esta tarefa não está liberada.' }, { status: 404, headers: noStore });
    const empty = input.answer === null || input.answer === '' || (Array.isArray(input.answer) && input.answer.length === 0);
    const settings = task.settings || {};
    const scaleMin = Number(settings.scaleMin ?? 1);
    const scaleMax = Number(settings.scaleMax ?? 5);
    const valid = (!task.required && empty) || (
      task.type === 'complete' ? input.answer === true
        : task.type === 'text' || task.type === 'short_answer' ? typeof input.answer === 'string' && input.answer.trim().length >= 1
          : task.type === 'multiple_choice' || task.type === 'dropdown' ? typeof input.answer === 'string' && task.options.some(option => option.value === input.answer)
            : task.type === 'checkboxes' ? Array.isArray(input.answer) && input.answer.length > 0 && input.answer.every(value => task.options.some(option => option.value === value)) && new Set(input.answer).size === input.answer.length
              : task.type === 'linear_scale' ? typeof input.answer === 'string' && Number.isInteger(Number(input.answer)) && Number(input.answer) >= scaleMin && Number(input.answer) <= scaleMax
                : task.type === 'date' ? typeof input.answer === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(input.answer) && !Number.isNaN(Date.parse(`${input.answer}T12:00:00Z`))
                  : false
    );
    if (!valid) return NextResponse.json({ error: 'Responda à tarefa antes de enviar.' }, { status: 400, headers: noStore });
    const submission = await submitClassroomTask({ studentId: student.id, taskId: input.taskId, answer: input.answer });
    if (!submission) return NextResponse.json({ error: 'Esta tarefa foi encerrada ou deixou de estar liberada.' }, { status: 409, headers: noStore });
    return NextResponse.json({ submission }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Resposta inválida.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED'; console.error(`student.classroom.submit failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível registrar sua resposta.' }, { status: 503, headers: noStore });
  }
}
