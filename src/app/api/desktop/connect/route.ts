import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { studentSchema, readJson } from '@/server/validation';
import { desktopClaimsCookie, isDesktopSameOrigin, setDesktopCookie } from '@/server/desktop/auth';
import { saveProvision, type DesktopModule } from '@/server/desktop/store';
import { DesktopBackendError, requestDesktopBackend, resolveDesktopBackend, verifyMetaLabDesktopBackend } from '@/server/desktop/backend';
import { getDesktopBackendOrigin } from '@/server/desktop/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const noStore = { 'Cache-Control': 'no-store' };
const connectSchema = studentSchema.extend({ backendUrl: z.string().max(300).optional() }).strict();

function backendFailure(error: DesktopBackendError) {
  switch (error.code) {
    case 'invalid_url': return NextResponse.json({ error: 'URL inválida. Informe o endereço HTTPS do MetaLab; você também pode usar /dashboard.' }, { status: 400, headers: noStore });
    case 'blocked_destination': return NextResponse.json({ error: 'Destino não permitido. O endereço aponta para uma rede local ou privada.' }, { status: 400, headers: noStore });
    case 'dns_failure': return NextResponse.json({ error: 'Não foi possível localizar o servidor pelo DNS. Confira sua conexão e o endereço do MetaLab.' }, { status: 503, headers: noStore });
    case 'network_unavailable': return NextResponse.json({ error: 'A rede está indisponível. Conecte-se à internet e tente novamente; sua sessão offline permanece salva.' }, { status: 503, headers: noStore });
    case 'timeout': return NextResponse.json({ error: 'A conexão demorou demais. Verifique sua internet ou tente novamente em instantes.' }, { status: 504, headers: noStore });
    case 'tls_certificate': return NextResponse.json({ error: 'Certificado HTTPS inválido. Confira o domínio e o certificado do servidor.' }, { status: 502, headers: noStore });
    case 'server_unavailable': return NextResponse.json({ error: 'Servidor indisponível. Confira a conexão e tente novamente.' }, { status: 503, headers: noStore });
    case 'authentication': return NextResponse.json({ error: 'Falha de autenticação. Confira os dados do aluno.' }, { status: 401, headers: noStore });
    case 'not_found': return NextResponse.json({ error: 'O servidor Web ainda não publicou a rota de identidade Desktop (/api/desktop/identity, HTTP 404). Publique a versão Web atual antes de conectar.' }, { status: 502, headers: noStore });
    case 'remote_unauthorized': return NextResponse.json({ error: 'O servidor exigiu autenticação para verificar sua identidade (HTTP 401). A rota pública de identidade precisa estar disponível.' }, { status: 502, headers: noStore });
    case 'remote_forbidden': return NextResponse.json({ error: 'O servidor recusou a verificação de identidade (HTTP 403). Confira a configuração do backend Web.' }, { status: 502, headers: noStore });
    case 'remote_server_error': return NextResponse.json({ error: 'O servidor Web respondeu com erro interno (HTTP 5xx). Tente novamente quando estiver disponível.' }, { status: 502, headers: noStore });
    case 'incompatible': return NextResponse.json({ error: 'Backend incompatível. O endereço não respondeu como uma instalação compatível do MetaLab Pocket.' }, { status: 502, headers: noStore });
  }
}

function parseBackendJson(text: string): unknown {
  try { return JSON.parse(text) as unknown; } catch { return null; }
}

export async function POST(request: NextRequest) {
  if (!isDesktopSameOrigin(request)) return NextResponse.json({ error: 'Origem local não permitida.' }, { status: 403, headers: noStore });
  if (process.env.METALAB_DESKTOP_MODE !== '1') return NextResponse.json({ error: 'Recurso disponível apenas no aplicativo Desktop.' }, { status: 404, headers: noStore });
  try {
    const body = connectSchema.parse(await readJson(request, 8192));
    const backend = await resolveDesktopBackend(body.backendUrl?.trim() || getDesktopBackendOrigin(), { allowTestLocal: process.env.METALAB_DESKTOP_TEST_MODE === '1' });
    const remoteHeaders = { Accept: 'application/json', Origin: backend.origin };

    // Verify the application before sending student identity data or session credentials.
    await verifyMetaLabDesktopBackend(backend, remoteHeaders);

    const login = await requestDesktopBackend(backend, '/api/students', {
      method: 'POST', headers: { ...remoteHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: body.name, email: body.email, birthDate: body.birthDate, photoSharingConsent: true, website: '' }),
      timeoutMs: 15_000
    });
    const loginBody = parseBackendJson(login.text) as { student?: { id?: string; displayName?: string }; error?: string } | null;
    if (login.status === 401) throw new DesktopBackendError('authentication');
    if (login.status === 403) return NextResponse.json({ error: 'O servidor bloqueou o acesso deste aluno (HTTP 403). Peça ajuda ao professor.' }, { status: 403, headers: noStore });
    if (login.status === 404) throw new DesktopBackendError('not_found');
    if (login.status >= 500 || login.status === 0) throw new DesktopBackendError('remote_server_error');
    if ((login.status !== 200 && login.status !== 201) || !loginBody?.student?.id || !loginBody.student.displayName) throw new DesktopBackendError('incompatible');
    const setCookies = login.headers['set-cookie'] || [];
    const cookie = setCookies.map(item => item.split(';', 1)[0]).find(item => item.startsWith('metalab_session='));
    const remoteToken = cookie?.slice('metalab_session='.length) || '';
    if (!/^[A-Za-z0-9_-]{43}$/u.test(remoteToken)) throw new DesktopBackendError('incompatible');

    const provisionResponse = await requestDesktopBackend(backend, '/api/student/desktop-sync', {
      method: 'POST', headers: { ...remoteHeaders, 'Content-Type': 'application/json', Cookie: `metalab_session=${remoteToken}` },
      body: JSON.stringify({ action: 'provision' }), timeoutMs: 20_000
    });
    const provision = parseBackendJson(provisionResponse.text) as {
      provisionId?: string; syncToken?: string; classId?: string; expiresAt?: string; modules?: DesktopModule[];
      versions?: Record<string, string>; student?: { id?: string }; error?: string
    } | null;
    if (provisionResponse.status === 401) throw new DesktopBackendError('authentication');
    if (provisionResponse.status === 403) {
      return NextResponse.json({ error: provision?.error || 'Entre em uma turma para preparar o modo offline.' }, { status: 403, headers: noStore });
    }
    if (provisionResponse.status === 404) throw new DesktopBackendError('not_found');
    if (provisionResponse.status >= 500 || provisionResponse.status === 0) throw new DesktopBackendError('remote_server_error');
    if (!provisionResponse.status || !provision || !provisionResponse.text || provisionResponse.status >= 300) {
      throw new DesktopBackendError('incompatible');
    }
    if (provisionResponse.status !== 200 || !provision.provisionId || !provision.syncToken || !provision.classId || !provision.expiresAt || !Array.isArray(provision.modules) || provision.student?.id !== loginBody.student.id) {
      throw new DesktopBackendError('incompatible');
    }
    saveProvision({ id: provision.provisionId, studentId: loginBody.student.id, studentName: loginBody.student.displayName, classId: provision.classId, backendUrl: backend.origin, remoteToken, syncToken: provision.syncToken, expiresAt: provision.expiresAt, modules: provision.modules, versions: provision.versions || {} });
    const expiresAt = Date.parse(provision.expiresAt);
    const claims = desktopClaimsCookie(loginBody.student.id, provision.provisionId, expiresAt);
    const response = NextResponse.json({ student: { id: loginBody.student.id, displayName: loginBody.student.displayName }, enrolled: true, provisioned: true, expiresAt: provision.expiresAt }, { headers: noStore });
    setDesktopCookie(response, claims, expiresAt);
    return response;
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: { ...Object.fromEntries(error.headers), ...noStore } });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Confira nome, e-mail e data de nascimento.' }, { status: 400, headers: noStore });
    if (error instanceof DesktopBackendError) return backendFailure(error);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`desktop.connect failed (${code})`);
    return NextResponse.json({ error: 'Erro interno ao preparar o acesso Desktop. Tente novamente.' }, { status: 500, headers: noStore });
  }
}
