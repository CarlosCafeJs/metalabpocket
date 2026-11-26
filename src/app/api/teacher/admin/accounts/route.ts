import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { changeTeacherAccountState, getTeacherAccountSession, listTeacherSignupRequests } from '@/server/teacher-accounts';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

async function requireAdmin(request: NextRequest) {
  const identity = await getTeacherAccountSession(request);
  return identity?.role === 'admin' ? identity : null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403, headers });
    return NextResponse.json({ accounts: await listTeacherSignupRequests() }, { headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.admin.accounts.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar as solicitações.' }, { status: 503, headers });
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem da solicitação não permitida.' }, { status: 403, headers });
  try {
    const admin = await requireAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403, headers });
    const input = z.object({ teacherId: z.string().uuid(), action: z.enum(['approve','reject','suspend','reactivate','disable']) }).strict().parse(await readJson(request, 2048));
    const updated = await changeTeacherAccountState(admin.id, input.teacherId, input.action);
    return updated
      ? NextResponse.json({ ok: true }, { headers })
      : NextResponse.json({ error: 'A transição solicitada não é permitida para o estado atual.' }, { status: 409, headers });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.admin.accounts.update failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível atualizar a conta.' }, { status: 503, headers });
  }
}
