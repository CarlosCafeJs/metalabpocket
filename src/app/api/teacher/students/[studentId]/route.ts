import { NextRequest, NextResponse } from 'next/server';
import { allMissions } from '@/domain/curriculum';
import { archiveTeacherStudent, getBusiness, getMissionAttempts, getTeacherStudent, getTeacherClassroomProgress, listStudentDeliveries, listStudentPhotos, listTeacherClassroomSubmissionsForStudent, listTeacherInstalabPostsForStudent, restoreTeacherStudent } from '@/server/repository';
import { hasTeacherSession } from '@/server/teacher-auth';
import { z } from 'zod';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ studentId: string }> };
const restoreSchema = z.object({ action: z.literal('restore') }).strict();

async function validatedStudentId(context: RouteContext) {
  const studentId = (await context.params).studentId;
  return z.string().uuid().safeParse(studentId).success ? studentId : null;
}

export async function GET(request: NextRequest, context: RouteContext) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const studentId = await validatedStudentId(context);
  if (!studentId) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  try {
    const student = await getTeacherStudent(studentId);
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    const [business, attempts, photos, deliveries, classroomSubmissions, classroomProgress, instalabPosts] = await Promise.all([
      getBusiness(studentId), getMissionAttempts(studentId), listStudentPhotos(studentId), listStudentDeliveries(studentId), listTeacherClassroomSubmissionsForStudent(studentId), getTeacherClassroomProgress(studentId), listTeacherInstalabPostsForStudent(studentId)
    ]);
    const completedIds = new Set(attempts.filter(attempt => attempt.status === 'completed').map(attempt => attempt.missionId));
    return NextResponse.json({
      student,
      business,
      progress: { completedMissions: completedIds.size + classroomProgress.completed, totalMissions: allMissions.length + classroomProgress.total, records: attempts },
      photos,
      deliveries,
      classroomSubmissions,
      instalabPosts
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.student.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível abrir os dados desse aluno agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const studentId = await validatedStudentId(context);
  if (!studentId) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  try {
    const archived = await archiveTeacherStudent(studentId);
    return archived
      ? NextResponse.json({ archived: true }, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Aluno não encontrado ou já removido.' }, { status: 404 });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.student.archive failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível remover o aluno agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  if (!hasTeacherSession(request)) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403 });
  const studentId = await validatedStudentId(context);
  if (!studentId) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  try {
    const parsed = restoreSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400 });
    const restored = await restoreTeacherStudent(studentId);
    return restored
      ? NextResponse.json({ restored: true }, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'Não foi possível restaurar. Verifique se há outro cadastro ativo com o mesmo e-mail e nascimento.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: error.headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.student.restore failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível restaurar o aluno agora.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
