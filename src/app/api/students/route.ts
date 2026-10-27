import { NextRequest, NextResponse } from 'next/server';
import { createOrResumeStudentWithSession, findStudentBySessionToken } from '@/server/repository';
import { readSessionToken, setSessionCookie } from '@/server/session';
import { readJson, sameOrigin, studentSchema } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PRIVACY_NOTICE_VERSION = '2026-10-21-v2';
const noStoreHeaders = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

function classifyFailure(error: unknown) {
  if (!(error instanceof Error)) return 'UNEXPECTED';
  if (error.message === 'DATABASE_URL_NOT_CONFIGURED') return 'DATABASE_URL_NOT_CONFIGURED';

  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : '';
  // Only emit known, non-sensitive driver codes. Never log the error message or URL.
  if (/^(?:08\w{3}|28\w{3}|3D000|42P01|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|SELF_SIGNED_CERT_IN_CHAIN|CERT_HAS_EXPIRED)$/u.test(code)) {
    return code;
  }
  return 'UNEXPECTED';
}

function failureMessage(code: string) {
  if (code === 'DATABASE_URL_NOT_CONFIGURED') {
    return 'O banco de dados ainda não foi configurado neste ambiente. Defina DATABASE_URL, aplique as migrações e reinicie o servidor.';
  }
  if (code === '42P01') {
    return 'As tabelas do curso ainda não existem no banco. Execute as migrações e tente novamente.';
  }
  if (code === '28P01' || code === '28000') {
    return 'O banco recusou as credenciais configuradas. Confira DATABASE_URL no ambiente do servidor.';
  }
  if (code === 'SELF_SIGNED_CERT_IN_CHAIN') {
    return 'O banco recusou o certificado TLS. Configure DATABASE_CA e DATABASE_SSL_SERVERNAME com o certificado e o nome esperados pelo PostgreSQL Railway.';
  }
  if (code.startsWith('08') || ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET'].includes(code)) {
    return 'Não foi possível conectar ao banco de dados. Confira a conexão configurada e tente novamente.';
  }
  return 'Não foi possível salvar o cadastro agora. Tente novamente.';
}

function thrownResponse(error: Response) {
  const headers = new Headers(error.headers);
  headers.set('Cache-Control', 'no-store');
  return new Response(error.body, { status: error.status, headers });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);

  try {
    const currentToken = readSessionToken(request);
    if (currentToken) {
      const currentStudent = await findStudentBySessionToken(currentToken);
      if (currentStudent) return json({ student: currentStudent, existing: true });
    }

    const parsed = studentSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success) return json({ error: 'Confira nome, e-mail e data de nascimento.' }, 400);

    const result = await createOrResumeStudentWithSession({
      name: parsed.data.name,
      email: parsed.data.email,
      birthDate: parsed.data.birthDate,
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      photoSharingConsent: parsed.data.photoSharingConsent
    });
    const response = json({ student: result.student, resumed: result.resumed }, result.resumed ? 200 : 201);
    setSessionCookie(response, result.token);
    return response;
  } catch (error) {
    if (error instanceof Response) return thrownResponse(error);
    if (error instanceof Error && error.message === 'STUDENT_ARCHIVED') {
      return json({ error: 'Este cadastro foi desativado pelo professor. Peça ao professor para restaurá-lo.' }, 403);
    }
    const code = classifyFailure(error);
    console.error(`students.create failed (${code})`);
    return json({ error: failureMessage(code) }, 503);
  }
}
