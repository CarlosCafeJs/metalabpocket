import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createTeacherSession, clearTeacherCookie, hasTeacherSession, setTeacherCookie, teacherAuthConfigured, verifyTeacherCredentials } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const noStoreHeaders = { 'Cache-Control': 'no-store' };
const loginSchema = z.object({ cpf: z.string().max(20), password: z.string().min(1).max(256) }).strict();
const failures = new Map<string, { count: number; startedAt: number }>();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStoreHeaders });
}

function loginKey(request: NextRequest) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) || 'local';
}

export async function GET(request: NextRequest) {
  return json({ configured: teacherAuthConfigured(), authenticated: hasTeacherSession(request) });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  if (!teacherAuthConfigured()) return json({ error: 'Acesso do professor ainda não configurado neste ambiente.' }, 503);

  const key = loginKey(request);
  const now = Date.now();
  const previous = failures.get(key);
  const attempt = previous && now - previous.startedAt < 15 * 60_000 ? previous : { count: 0, startedAt: now };
  if (attempt.count >= 5) return json({ error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' }, 429);

  try {
    const parsed = loginSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success || !verifyTeacherCredentials(parsed.data.cpf, parsed.data.password)) {
      attempt.count += 1;
      failures.set(key, attempt);
      return json({ error: 'CPF ou senha não conferem.' }, 401);
    }
    failures.delete(key);
    const response = json({ authenticated: true });
    setTeacherCookie(response, createTeacherSession(parsed.data.cpf));
    return response;
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: error.headers });
    console.error('teacher.session.create failed');
    return json({ error: 'Não foi possível iniciar a sessão do professor.' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  const response = json({ authenticated: false });
  clearTeacherCookie(response);
  return response;
}
