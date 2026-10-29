import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { classroomMissionHash } from '@/domain/classroom-snapshot';
import { applyDesktopMissionOperation, findEnrolledStudentBySessionToken, findStudentByDesktopSyncToken, getStudentClass, getPublishedClassroomMissionTasks, listClassroomForStudent } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { getPool } from '@/server/db';
import { readJson, sameOrigin } from '@/server/validation';
import { validateClassroomMissionAnswers } from '@/domain/classroom-answer-validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const answerSchema = z.object({ taskId: z.string().uuid(), answer: z.union([z.string().max(2000), z.array(z.string().max(100)).max(12), z.boolean(), z.null()]) }).strict();
const provisionSchema = z.object({ action: z.literal('provision') }).strict();
const syncSchema = z.object({
  action: z.literal('sync'),
  operations: z.array(z.object({
    operationId: z.string().uuid(), provisionId: z.string().uuid(), missionId: z.string().uuid(),
    snapshotHash: z.string().regex(/^[a-f0-9]{64}$/u), answers: z.array(answerSchema).max(80)
  }).strict()).min(1).max(20)
}).strict();

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers: noStore });
  try {
    const body = await readJson(request, 250_000);
    if (body && typeof body === 'object' && 'action' in body && body.action === 'provision') {
      const input = provisionSchema.parse(body);
      void input;
      const token = readSessionToken(request);
      const student = token ? await findEnrolledStudentBySessionToken(token) : null;
      if (!student) return NextResponse.json({ error: 'Sessão inválida ou aluno sem turma.' }, { status: 401, headers: noStore });
      const [classroom, classroomModules] = await Promise.all([
        getStudentClass(student.id), listClassroomForStudent(student.id)
      ]);
      if (!classroom) return NextResponse.json({ error: 'Entre em uma turma para preparar o modo offline.' }, { status: 403, headers: noStore });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const syncToken = randomBytes(32).toString('base64url');
      const syncTokenHash = createHash('sha256').update(syncToken).digest('hex');
      const modules = classroomModules.map(module => ({ ...module, missions: module.missions.filter(mission => mission.isPublished && mission.tasks.length > 0 && mission.tasks.every(task => !task.submissions?.length)) })).filter(module => module.missions.length > 0);
      const hashes = Object.fromEntries(modules.flatMap(module => module.missions.map(mission => [mission.id, classroomMissionHash(module, mission.id)])));
      const provisionId = randomUUID();
      await getPool().query(`
        INSERT INTO metalab_desktop_provisions(id,student_id,class_id,sync_token_hash,mission_hashes,expires_at)
        VALUES($1,$2,$3,$4,$5::jsonb,$6)
      `, [provisionId, student.id, classroom.id, syncTokenHash, JSON.stringify(hashes), expiresAt]);
      return NextResponse.json({ provisionId, syncToken, student: { id: student.id, displayName: student.displayName }, classId: classroom.id, expiresAt, modules, versions: hashes }, { headers: noStore });
    }

    const parsed = syncSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: 'Operação de sincronização inválida.' }, { status: 400, headers: noStore });
    const remoteSessionToken = readSessionToken(request);
    let student = remoteSessionToken ? await findEnrolledStudentBySessionToken(remoteSessionToken) : null;
    let scopedProvisionId: string | null = null;
    if (!student) {
      const authorization = request.headers.get('authorization') || '';
      const match = authorization.match(/^DesktopSync ([A-Za-z0-9_-]{43})$/u);
      const provisioned = match ? await findStudentByDesktopSyncToken(match[1]) : null;
      student = provisioned?.student || null;
      scopedProvisionId = provisioned?.provisionId || null;
    }
    if (!student) return NextResponse.json({ error: 'Sessão ou autorização offline expirada.' }, { status: 401, headers: noStore });
    const classroomModules = await listClassroomForStudent(student.id);
    const classroom = await getStudentClass(student.id);
    if (!classroom) return NextResponse.json({ error: 'O vínculo com a turma foi removido.' }, { status: 403, headers: noStore });
    const results = [];
    for (const operation of parsed.data.operations) {
      if (scopedProvisionId && operation.provisionId !== scopedProvisionId) {
        results.push({ operationId: operation.operationId, state: 'revoked' });
        continue;
      }
      const module = classroomModules.find(item => item.missions.some(mission => mission.id === operation.missionId));
      const currentHash = module ? classroomMissionHash(module, operation.missionId) : null;
      if (!currentHash || currentHash !== operation.snapshotHash) {
        results.push({ operationId: operation.operationId, state: 'conflict' });
        continue;
      }
      const tasks = await getPublishedClassroomMissionTasks(operation.missionId);
      const validationError = validateClassroomMissionAnswers(tasks, operation.answers);
      if (validationError) {
        results.push({ operationId: operation.operationId, state: 'invalid', error: validationError });
        continue;
      }
      const requestHash = createHash('sha256').update(JSON.stringify({ provisionId: operation.provisionId, missionId: operation.missionId, snapshotHash: operation.snapshotHash, answers: operation.answers })).digest('hex');
      try {
        const applied = await applyDesktopMissionOperation({
          operationId: operation.operationId, requestHash, provisionId: operation.provisionId,
          studentId: student.id, classId: classroom.id, missionId: operation.missionId,
          snapshotHash: operation.snapshotHash, answers: operation.answers
        });
        results.push({ operationId: operation.operationId, state: 'synced', duplicate: applied.duplicate, result: applied.result });
      } catch (error) {
        const code = error instanceof Error ? error.message : '';
        results.push({ operationId: operation.operationId, state: code === 'DESKTOP_PROVISION_EXPIRED' || code === 'DESKTOP_CLASS_ACCESS_REVOKED' ? 'revoked' : code === 'DESKTOP_SNAPSHOT_CONFLICT' ? 'conflict' : code === 'DESKTOP_MISSION_ALREADY_SUBMITTED' ? 'already_submitted' : 'error' });
      }
    }
    return NextResponse.json({ results }, { headers: noStore });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400, headers: noStore });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.desktop-sync failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível sincronizar as respostas.' }, { status: 503, headers: noStore });
  }
}
