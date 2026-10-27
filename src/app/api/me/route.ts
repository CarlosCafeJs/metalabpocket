import { NextRequest, NextResponse } from 'next/server';
import { allMissions } from '@/domain/curriculum';
import { findEnrolledStudentBySessionToken, findStudentBySessionToken, getBusiness, getMissionAttempts, getStudentClass, setStudentPhotoSharingConsent } from '@/server/repository';
import { clearSessionCookie, readSessionToken } from '@/server/session';
import { photoConsentSchema, readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  if (!token) return json({ error: 'Sessão não encontrada.' }, 401);

  try {
    const student = await findStudentBySessionToken(token);
    if (!student) {
      const response = json({ error: 'Sessão expirada.' }, 401);
      clearSessionCookie(response);
      return response;
    }
    const classroom = await getStudentClass(student.id);
    if (!classroom) return json({ student: { id: student.id, displayName: student.displayName }, enrolled: false, classroom: null });
    const [business, progress] = await Promise.all([
      getBusiness(student.id),
      getMissionAttempts(student.id)
    ]);
    const completedIds = new Set(progress.filter(item => item.status === 'completed').map(item => item.missionId));
    const currentMission = allMissions.find(mission => !completedIds.has(mission.id));
    const latestAttempt = progress[0];
    const achievements = [
      ...(completedIds.size > 0 ? ['Primeiro passo'] : []),
      ...(business ? ['Negócio em foco'] : []),
      ...(['m3-foto-geral', 'm3-foto-detalhe', 'm3-foto-contexto'].every(id => completedIds.has(id)) ? ['Olhar de vitrine'] : [])
    ];
    return json({
      student,
      enrolled: true,
      classroom,
      business,
      progress: {
        completedMissions: completedIds.size,
        totalMissions: allMissions.length,
        currentMissionId: currentMission?.id,
        currentModule: currentMission?.module,
        lastActivity: latestAttempt ? allMissions.find(mission => mission.id === latestAttempt.missionId)?.title : undefined,
        achievements,
        records: progress
      }
    });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`me.read failed (${code})`);
    return json({ error: 'Não foi possível carregar a sessão agora.' }, 503);
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  try {
    const token = readSessionToken(request);
    const student = token ? await findEnrolledStudentBySessionToken(token) : null;
    if (!student) return json({ error: 'Sessão expirada.' }, 401);
    const parsed = photoConsentSchema.safeParse(await readJson(request, 1024));
    if (!parsed.success) return json({ error: 'Escolha uma opção válida.' }, 400);
    const photoSharingConsent = await setStudentPhotoSharingConsent(student.id, parsed.data.photoSharingConsent);
    return json({ photoSharingConsent });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: error.headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`me.consent.update failed (${code})`);
    return json({ error: 'Não foi possível atualizar essa preferência agora.' }, 503);
  }
}
