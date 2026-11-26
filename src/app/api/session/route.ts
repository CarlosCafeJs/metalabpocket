import { NextRequest, NextResponse } from 'next/server';
import { authenticateStudentWithPassword, findStudentBySessionToken, getStudentClass, revokeSession } from '@/server/repository';
import { clearSessionCookie, readSessionToken, setSessionCookie } from '@/server/session';
import { readJson, sameOrigin, studentLoginSchema } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  if (!token) return json({ active: false });

  try {
    const student = await findStudentBySessionToken(token);
    if (!student) {
      const response = json({ active: false });
      clearSessionCookie(response);
      return response;
    }
    const classroom = await getStudentClass(student.id);
    return json({ active: true, enrolled: Boolean(classroom), student: { id: student.id, displayName: student.displayName } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`session.read failed (${code})`);
    return json({ error: 'Não foi possível consultar a sessão agora.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  try {
    const parsed = studentLoginSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success) return json({ error: 'Informe seu CPF ou e-mail e a senha.' }, 400);
    const result = await authenticateStudentWithPassword(parsed.data.identifier, parsed.data.password);
    const response = json({ student: result.student });
    setSessionCookie(response, result.token);
    return response;
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...Object.fromEntries(error.headers), ...noStoreHeaders } });
    if (error instanceof Error && error.message === 'STUDENT_AUTH_INVALID') return json({ error: 'CPF ou e-mail e senha não conferem.' }, 401);
    if (error instanceof Error && error.message === 'STUDENT_CPF_PEPPER_NOT_CONFIGURED') {
      console.error('session.login failed (STUDENT_CPF_PEPPER_NOT_CONFIGURED)');
      return json({ error: 'O acesso seguro ainda não está configurado neste ambiente. Avise o responsável pelo sistema.' }, 503);
    }
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`session.login failed (${code})`);
    return json({ error: 'Não foi possível entrar agora. Tente novamente.' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  const token = readSessionToken(request);

  try {
    if (token) await revokeSession(token);
    const response = new NextResponse(null, { status: 204, headers: noStoreHeaders });
    clearSessionCookie(response);
    return response;
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`session.revoke failed (${code})`);
    const response = json({ error: 'A sessão local foi encerrada, mas o servidor não confirmou a saída.' }, 503);
    clearSessionCookie(response);
    return response;
  }
}
