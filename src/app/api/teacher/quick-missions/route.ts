import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createQuickMission, createQuickModule, listQuickModulesForTeacher, setQuickModulePublished } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const createSchema = z.object({
  moduleId: z.string().uuid(), title: z.string().trim().min(3).max(120), description: z.string().trim().min(3).max(1000),
  request: z.string().trim().min(3).max(2000), estimatedMinutes: z.number().int().min(5).max(180),
  dueAt: z.string().datetime({ offset: true }).nullable()
}).strict();
const moduleSchema = z.object({ title: z.string().trim().min(3).max(120), description: z.string().trim().max(1000).default('') }).strict();
const updateSchema = z.object({ moduleId: z.string().uuid(), published: z.boolean() }).strict();

export async function GET(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  try { return NextResponse.json({ modules: await listQuickModulesForTeacher() }, { headers: noStore }); }
  catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.quick-missions.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar as missões.' }, { status: 503, headers: noStore });
  }
}

export async function POST(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  try {
    const body = await readJson(request, 8192) as { action?: string; data?: unknown };
    if (body.action === 'module') {
      const id = await createQuickModule(moduleSchema.parse(body.data));
      return NextResponse.json({ id }, { status: 201, headers: noStore });
    }
    if (body.action !== 'mission') return NextResponse.json({ error: 'Ação inválida.' }, { status: 400, headers: noStore });
    const input = createSchema.parse(body.data);
    const mission = await createQuickMission(input);
    if (!mission) return NextResponse.json({ error: 'Crie o módulo antes de adicionar missões.' }, { status: 404, headers: noStore });
    return NextResponse.json({ mission }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira os campos: nome, descrição, solicitação, tempo e prazo.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.quick-missions.create failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível criar a missão agora.' }, { status: 503, headers: noStore });
  }
}

export async function PATCH(request: NextRequest) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: noStore });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  try {
    const input = updateSchema.parse(await readJson(request, 2048));
    const updated = await setQuickModulePublished(input.moduleId, input.published);
    return updated ? NextResponse.json({ ok: true }, { headers: noStore }) : NextResponse.json({ error: 'Módulo não encontrado.' }, { status: 404, headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.quick-missions.update failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível atualizar a missão.' }, { status: 503, headers: noStore });
  }
}
