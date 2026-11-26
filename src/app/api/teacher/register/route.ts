import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { hashTeacherPassword, isValidTeacherCpf, registerTeacherAccount } from '@/server/teacher-accounts';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const attempts = new Map<string, { count: number; started: number }>();
const schema = z.object({
  fullName: z.string().trim().min(3).max(160),
  cpf: z.string().trim().min(11).max(20),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256)
}).strict();

function response(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
function clientKey(request: NextRequest) { return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim().slice(0,64) || 'local'; }

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response({ error: 'Origem da solicitação não permitida.' }, 403);
  const key = clientKey(request), now = Date.now(), previous = attempts.get(key);
  const attempt = previous && now - previous.started < 60 * 60_000 ? previous : { count: 0, started: now };
  if (attempt.count >= 5) return response({ error: 'Muitas solicitações. Tente novamente mais tarde.' }, 429);
  attempt.count += 1; attempts.set(key, attempt);
  try {
    const parsed = schema.safeParse(await readJson(request, 8192));
    if (!parsed.success) return response({ error: 'Confira nome, CPF, e-mail e uma senha com pelo menos 12 caracteres.' }, 400);
    const input = parsed.data;
    if (!isValidTeacherCpf(input.cpf)) return response({ error: 'Informe um CPF válido.' }, 400);
    if (input.password !== input.confirmPassword) return response({ error: 'As senhas não conferem.' }, 400);
    const passwordHash = await hashTeacherPassword(input.password);
    await registerTeacherAccount({ fullName: input.fullName, cpf: input.cpf, email: input.email, passwordHash });
    attempts.delete(key);
    return response({ message: 'Cadastro recebido. Sua conta está aguardando aprovação de um administrador.' }, 202);
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: new Headers([...error.headers, ...Object.entries(headers)]) });
    if (error instanceof Error && error.message === 'EDUCAFE_TEACHER_CPF_PEPPER_NOT_CONFIGURED') {
      console.error('teacher.register failed (EDUCAFE_TEACHER_CPF_PEPPER_NOT_CONFIGURED)');
      return response({ error: 'O cadastro docente ainda não está configurado neste ambiente.' }, 503);
    }
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.register failed (${/^[A-Z0-9_]{1,40}$/u.test(code) ? code : 'UNEXPECTED'})`);
    return response({ error: 'Não foi possível receber o cadastro agora.' }, 503);
  }
}
