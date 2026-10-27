import { NextRequest, NextResponse } from 'next/server';
import { findStudentBySessionToken, getStudentClass, revokeSession } from '@/server/repository';
import { clearSessionCookie, readSessionToken } from '@/server/session';
import { sameOrigin } from '@/server/validation';

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
