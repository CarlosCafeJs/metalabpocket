import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readJson } from '@/server/validation';
import { isDesktopSameOrigin } from '@/server/desktop/auth';
import { DesktopBackendError, requestDesktopBackend, resolveDesktopBackend, verifyMetaLabDesktopBackend } from '@/server/desktop/backend';
import { DEFAULT_DESKTOP_BACKEND_ORIGIN, getDesktopBackendOrigin, saveDesktopBackendOrigin } from '@/server/desktop/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const settingsSchema = z.object({
  backendUrl: z.string().min(1).max(300),
  teacherCpf: z.string().min(1).max(20),
  teacherPassword: z.string().min(1).max(256)
}).strict();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: noStore });
}

export async function GET() {
  if (process.env.METALAB_DESKTOP_MODE !== '1') return json({ error: 'Recurso disponível apenas no Desktop.' }, 404);
  try {
    return json({ backendOrigin: getDesktopBackendOrigin() });
  } catch {
    return json({ error: 'Não foi possível ler as configurações locais.' }, 500);
  }
}

export async function POST(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return json({ error: 'Origem local não permitida.' }, 403);
  if (process.env.METALAB_DESKTOP_MODE !== '1') return json({ error: 'Alteração de servidor indisponível neste ambiente.' }, 404);

  try {
    const input = settingsSchema.parse(await readJson(request, 4096));
    const authorityUrl = process.env.METALAB_DESKTOP_TEST_MODE === '1' ? getDesktopBackendOrigin() : DEFAULT_DESKTOP_BACKEND_ORIGIN;
    const [authority, candidate] = await Promise.all([
      resolveDesktopBackend(authorityUrl, { allowTestLocal: process.env.METALAB_DESKTOP_TEST_MODE === '1' }),
      resolveDesktopBackend(input.backendUrl, { allowTestLocal: process.env.METALAB_DESKTOP_TEST_MODE === '1' })
    ]);
    const authorityHeaders = { Accept: 'application/json', Origin: authority.origin };

    // Check both destinations before transmitting teacher credentials to the official authority.
    await verifyMetaLabDesktopBackend(authority, authorityHeaders);
    if (candidate.origin !== authority.origin) {
      await verifyMetaLabDesktopBackend(candidate, { Accept: 'application/json', Origin: candidate.origin });
    }

    const login = await requestDesktopBackend(authority, '/api/teacher/session', {
      method: 'POST', timeoutMs: 15_000,
      headers: { ...authorityHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpf: input.teacherCpf, password: input.teacherPassword })
    });
    if (login.status === 401 || login.status === 403) throw new DesktopBackendError('authentication');
    if (login.status === 404) throw new DesktopBackendError('not_found');
    if (login.status >= 500 || login.status === 0) throw new DesktopBackendError('remote_server_error');
    if (login.status !== 200 || !(login.headers['set-cookie'] || []).some(cookie => cookie.startsWith('metalab_teacher_session='))) {
      throw new DesktopBackendError('incompatible');
    }

    saveDesktopBackendOrigin(candidate.origin);
    return json({ backendOrigin: candidate.origin, changed: true });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: 'Informe o endereço HTTPS e as credenciais do professor.' }, 400);
    if (error instanceof DesktopBackendError) {
      if (error.code === 'authentication') return json({ error: 'As credenciais do professor não foram aceitas pelo servidor oficial.' }, 401);
      if (error.code === 'not_found') return json({ error: 'A versão Web atual ainda não publicou as rotas necessárias do Desktop. Publique o backend atualizado primeiro.' }, 502);
      if (error.code === 'remote_unauthorized' || error.code === 'remote_forbidden') return json({ error: 'O servidor recusou a validação de identidade.' }, 502);
      if (error.code === 'remote_server_error') return json({ error: 'O servidor Web respondeu com erro interno.' }, 502);
      if (error.code === 'tls_certificate') return json({ error: 'Certificado HTTPS inválido.' }, 502);
      if (error.code === 'dns_failure') return json({ error: 'Não foi possível localizar o servidor pelo DNS.' }, 503);
      if (error.code === 'network_unavailable') return json({ error: 'A rede está indisponível.' }, 503);
      if (error.code === 'timeout') return json({ error: 'A conexão expirou.' }, 504);
      if (error.code === 'server_unavailable') return json({ error: 'O servidor está indisponível.' }, 503);
      if (error.code === 'blocked_destination') return json({ error: 'O endereço aponta para um destino de rede não permitido.' }, 400);
      if (error.code === 'invalid_url') return json({ error: 'Informe uma URL HTTPS válida; apenas origem ou /dashboard são aceitos.' }, 400);
    }
    console.error('desktop.config.update failed');
    return json({ error: 'Não foi possível salvar a configuração do servidor.' }, 500);
  }
}
