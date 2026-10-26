import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClassroomMission, createClassroomModule, createClassroomTask, listClassroomForTeacher, setClassroomPublished } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const schemas = {
  module: z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().max(1000).default('') }).strict(),
  mission: z.object({ moduleId: z.string().uuid(), title: z.string().trim().min(3).max(120), objective: z.string().trim().max(500).default(''), description: z.string().trim().max(1500).default('') }).strict(),
  task: z.object({ missionId: z.string().uuid(), prompt: z.string().trim().min(3).max(1500), description: z.string().trim().max(1000).default(''), type: z.enum(['text','short_answer','multiple_choice','checkboxes','dropdown','linear_scale','date','complete']), required: z.boolean().default(true), settings: z.record(z.string(), z.unknown()).default({}), options: z.array(z.object({ value: z.string().min(1).max(100), label: z.string().trim().min(1).max(200) })).max(12).default([]) }).strict().refine(value => !['multiple_choice','checkboxes','dropdown'].includes(value.type) || value.options.length >= 2, 'Adicione ao menos duas opções para este formato.'),
  publish: z.object({ action: z.literal('publish'), kind: z.literal('module'), id: z.string().uuid(), published: z.boolean() }).strict()
};

export async function GET(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  try { return NextResponse.json({ modules: await listClassroomForTeacher() }, { headers: noStore }); }
  catch (error) { const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED'; console.error(`teacher.classroom.read failed (${code})`); return NextResponse.json({ error: 'Não foi possível carregar a Missão da Turma.' }, { status: 503, headers: noStore }); }
}

export async function POST(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  try {
    const body = await readJson(request, 12000);
    if (body && typeof body === 'object' && (body as { action?: string }).action === 'publish') {
      const input = schemas.publish.parse(body);
      const updated = await setClassroomPublished(input.kind, input.id, input.published);
      if (!updated) return NextResponse.json({ error: 'Item não encontrado.' }, { status: 404, headers: noStore });
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    const action = body && typeof body === 'object' && 'action' in body ? String((body as {action:string}).action) : '';
    if (action === 'module') { const id = await createClassroomModule(schemas.module.parse((body as {data:unknown}).data)); return NextResponse.json({ id }, { status: 201, headers: noStore }); }
    if (action === 'mission') { const id = await createClassroomMission(schemas.mission.parse((body as {data:unknown}).data)); return NextResponse.json({ id }, { status: 201, headers: noStore }); }
    if (action === 'task') { const id = await createClassroomTask(schemas.task.parse((body as {data:unknown}).data)); return NextResponse.json({ id }, { status: 201, headers: noStore }); }
    return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira os campos e as opções informadas.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED'; console.error(`teacher.classroom.write failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível salvar esta etapa.' }, { status: 503, headers: noStore });
  }
}
