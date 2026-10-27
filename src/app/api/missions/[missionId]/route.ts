import { NextRequest, NextResponse } from 'next/server';
import { allMissions, getMission, type Mission } from '@/domain/curriculum';
import {
  findEnrolledStudentBySessionToken,
  getBusiness,
  getMissionAttempt,
  getMissionAttempts,
  saveMissionAttempt
} from '@/server/repository';
import { missionAnswerKey } from '@/server/mission-answer-key';
import { containsPotentialSensitiveData } from '@/domain/mission-evaluation';
import { clearSessionCookie, readSessionToken } from '@/server/session';
import { missionAnswerSchema, readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ missionId: string }> };
type Evidence = Record<string, string | number | boolean>;

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

function thrownResponse(error: Response) {
  const headers = new Headers(error.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(error.body, { status: error.status, headers });
}

async function currentStudent(request: NextRequest) {
  const token = readSessionToken(request);
  return token ? findEnrolledStudentBySessionToken(token) : null;
}

function expiredResponse() {
  const response = json({ error: 'Sessão expirada.' }, 401);
  clearSessionCookie(response);
  return response;
}

async function evaluateMission(
  mission: Mission,
  studentId: string,
  answer: string | string[] | number,
  evidence: Evidence
) {
  let completed = false;

  switch (mission.kind) {
    case 'choice':
      completed = typeof answer === 'string' && answer === missionAnswerKey[mission.id];
      break;
    case 'checklist':
      completed = Array.isArray(answer)
        && mission.instructions.every(instruction => answer.includes(instruction));
      break;
    case 'text':
      completed = typeof answer === 'string' && answer.trim().length >= (mission.minLength || 1);
      break;
    case 'business':
      completed = Boolean(await getBusiness(studentId));
      break;
    case 'gallery':
      completed = typeof evidence.photoCount === 'number'
        && evidence.photoCount >= (mission.requiredPhotos || 1);
      break;
    case 'video':
      completed = evidence.validVideo === true
        && ['video/mp4', 'video/webm'].includes(String(evidence.mimeType || ''))
        && Number(evidence.size) > 0
        && Number(evidence.size) <= 50 * 1024 * 1024
        && typeof evidence.fileName === 'string'
        && evidence.fileName.length > 0
        && evidence.fileName.length <= 300;
      break;
  }

  const feedback = completed
    ? mission.feedback
    : mission.kind === 'choice'
      ? 'Revise os sinais do cenário e tente novamente. Nenhuma ação externa foi executada.'
      : 'A atividade foi registrada. Revise os critérios e complete os itens que faltam.';
  return { completed, feedback };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const mission = getMission((await context.params).missionId);
    if (!mission) return json({ error: 'Missão não encontrada.' }, 404);
    const student = await currentStudent(request);
    if (!student) return expiredResponse();
    const attempt = await getMissionAttempt(student.id, mission.id);
    return json({ mission, attempt });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`mission.read failed (${code})`);
    return json({ error: 'Não foi possível carregar a missão agora.' }, 503);
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);

  try {
    const mission = getMission((await context.params).missionId);
    if (!mission) return json({ error: 'Missão não encontrada.' }, 404);
    const student = await currentStudent(request);
    if (!student) return expiredResponse();
    const parsed = missionAnswerSchema.safeParse(await readJson(request, 12288));
    if (!parsed.success) return json({ error: 'Confira a resposta da atividade.' }, 400);
    if (mission.kind === 'text' && typeof parsed.data.answer === 'string' && containsPotentialSensitiveData(parsed.data.answer)) {
      return json({ error: 'Remova links, e-mails, telefones, senhas ou códigos antes de registrar esta resposta.' }, 422);
    }

    const evaluation = await evaluateMission(mission, student.id, parsed.data.answer, parsed.data.evidence);
    const attempt = await saveMissionAttempt({
      studentId: student.id,
      missionId: mission.id,
      status: evaluation.completed ? 'completed' : 'in_progress',
      answer: parsed.data.answer,
      evidence: parsed.data.evidence,
      feedback: evaluation.feedback
    });
    const attempts = await getMissionAttempts(student.id);
    return json({
      attempt,
      completed: attempt.status === 'completed',
      progress: {
        completedMissions: attempts.filter(item => item.status === 'completed').length,
        totalMissions: allMissions.length
      }
    });
  } catch (error) {
    if (error instanceof Response) return thrownResponse(error);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`mission.save failed (${code})`);
    const message = code === 'DATABASE_URL_NOT_CONFIGURED'
      ? 'O banco de dados não está configurado neste servidor. Seu trabalho continua nesta tela.'
      : code === '42P01'
        ? 'As tabelas do curso ainda não foram criadas no banco. Seu trabalho continua nesta tela.'
        : code === '28P01' || code === '28000'
          ? 'O banco recusou a conexão configurada. Confira as credenciais do servidor.'
          : code.startsWith('08') || ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EACCES'].includes(code)
            ? 'O banco está indisponível no momento. Seu trabalho continua nesta tela; tente registrar novamente quando a conexão voltar.'
            : 'Não foi possível salvar a atividade agora. Seu trabalho continua nesta tela.';
    return json({ error: message }, 503);
  }
}
