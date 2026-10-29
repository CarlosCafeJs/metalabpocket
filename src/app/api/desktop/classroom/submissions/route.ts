import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { classroomMissionHash } from '@/domain/classroom-snapshot';
import { isDesktopSameOrigin, readDesktopSession } from '@/server/desktop/auth';
import { listCachedModules, savePendingMission } from '@/server/desktop/store';
import { validateClassroomMissionAnswers } from '@/domain/classroom-answer-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const schema = z.object({ missionId: z.string().uuid(), answers: z.array(z.object({ taskId: z.string().uuid(), answer: z.union([z.string().max(2000), z.array(z.string().max(100)).max(12), z.boolean(), z.null()]) }).strict()).max(80) }).strict();

export async function POST(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  const session = readDesktopSession(request);
  if (!session) return NextResponse.json({ error: 'Sua sessão offline expirou.' }, { status: 401, headers: noStore });
  try {
    const input = schema.parse(await request.json());
    const modules = listCachedModules(session.provisionId);
    const module = modules.find(item => item.missions.some(mission => mission.id === input.missionId));
    const mission = module?.missions.find(item => item.id === input.missionId);
    const snapshotHash = module ? classroomMissionHash(module as never, input.missionId) : null;
    const provision = session.provision;
    const version = provision && snapshotHash;
    if (!module || !mission || !version) return NextResponse.json({ error: 'Missão não está no conteúdo autorizado para este dispositivo.' }, { status: 404, headers: noStore });
    const validationError = validateClassroomMissionAnswers(mission.tasks as never, input.answers);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400, headers: noStore });
    const operationId = randomUUID();
    const submission = savePendingMission({ operationId, provisionId: session.provisionId, studentId: session.studentId, missionId: input.missionId, snapshotHash, answers: input.answers });
    return NextResponse.json({ submission: { ...submission, state: 'pending' } }, { status: 201, headers: noStore });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Respostas inválidas.' }, { status: 400, headers: noStore });
    const code = error instanceof Error ? error.message : 'UNEXPECTED';
    const status = code === 'DESKTOP_MISSION_ALREADY_SUBMITTED' ? 409 : code === 'DESKTOP_SNAPSHOT_CONFLICT' ? 409 : 503;
    return NextResponse.json({ error: status === 409 ? 'Esta missão já foi registrada neste dispositivo.' : 'Não foi possível salvar a resposta localmente.' }, { status, headers: noStore });
  }
}
