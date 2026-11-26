import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticateTeacherAccount, getTeacherAccountSession, revokeTeacherAccountSession, TEACHER_ACCOUNT_COOKIE } from '@/server/teacher-accounts';
import { clearTeacherCookie } from '@/server/teacher-auth';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStoreHeaders = { 'Cache-Control': 'no-store' };
const loginSchema = z.object({ identifier: z.string().trim().min(1).max(254).optional(), cpf: z.string().max(20).optional(), password: z.string().min(1).max(256) }).strict();
const failures = new Map<string, { count: number; startedAt: number }>();

function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: noStoreHeaders }); }
function loginKey(request: NextRequest) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0, 64) || 'local'; }
function isMissingAccountSchema(error: unknown) { return Boolean(error && typeof error === 'object' && 'code' in error && ['42P01','42703'].includes(String(error.code))); }
function isDatabaseConfigurationError(error: unknown) { return error instanceof Error && error.message === 'DATABASE_URL_NOT_CONFIGURED'; }

export async function GET(request: NextRequest) {
  if (!process.env.DATABASE_URL) return json({ configured: false, accountsReady: false, authenticated: false, error: 'O acesso docente por contas ainda não está configurado neste ambiente.' });
  try {
    const teacher = await getTeacherAccountSession(request);
    return json({ configured: true, accountsReady: true, authenticated: Boolean(teacher), role: teacher?.role ?? null });
  } catch (error) {
    if (isMissingAccountSchema(error)) return json({ configured: true, accountsReady: false, authenticated: false, error: 'A estrutura de contas docentes ainda não está preparada. A migration 019 precisa ser aplicada em ambiente autorizado.' }, 503);
    console.error('teacher.session.read failed (UNAVAILABLE)');
    return json({ configured: true, accountsReady: false, authenticated: false, error: 'Não foi possível verificar a sessão docente.' }, 503);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  if (!process.env.DATABASE_URL) return json({ error: 'O acesso docente por contas ainda não está configurado neste ambiente.' }, 503);
  const key = loginKey(request), now = Date.now(), previous = failures.get(key);
  const attempt = previous && now - previous.startedAt < 15 * 60_000 ? previous : { count: 0, startedAt: now };
  if (attempt.count >= 5) return json({ error: 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' }, 429);

  try {
    const parsed = loginSchema.safeParse(await readJson(request, 4096));
    if (!parsed.success) {
      attempt.count += 1; failures.set(key, attempt);
      return json({ error: 'CPF/e-mail ou senha não conferem, ou a conta ainda não está ativa.' }, 401);
    }
    const identifier = parsed.data.identifier || parsed.data.cpf || '';
    const databaseLogin = await authenticateTeacherAccount(identifier, parsed.data.password);
    if (!databaseLogin) {
      attempt.count += 1; failures.set(key, attempt);
      return json({ error: 'CPF/e-mail ou senha não conferem, ou a conta ainda não está ativa.' }, 401);
    }
    failures.delete(key);
    const response = json({ authenticated: true, role: databaseLogin.teacher.role });
    response.cookies.set({ name: TEACHER_ACCOUNT_COOKIE, value: databaseLogin.token, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 12 * 60 * 60 });
    clearTeacherCookie(response);
    return response;
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: error.headers });
    if (isMissingAccountSchema(error)) return json({ error: 'A estrutura de contas docentes ainda não está preparada. A migration 019 precisa ser aplicada em ambiente autorizado.' }, 503);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : isDatabaseConfigurationError(error) ? 'DATABASE_URL_NOT_CONFIGURED' : 'UNEXPECTED';
    console.error(`teacher.session.create failed (${code})`);
    return json({ error: 'Não foi possível iniciar a sessão docente com o banco de contas.' }, 503);
  }
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);
  await revokeTeacherAccountSession(request).catch(() => undefined);
  const response = json({ authenticated: false });
  response.cookies.set({ name: TEACHER_ACCOUNT_COOKIE, value: '', httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', expires: new Date(0) });
  clearTeacherCookie(response);
  return response;
}
