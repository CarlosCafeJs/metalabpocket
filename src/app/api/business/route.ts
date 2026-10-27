import { NextRequest, NextResponse } from 'next/server';
import { findEnrolledStudentBySessionToken, getBusiness, upsertBusiness } from '@/server/repository';
import { clearSessionCookie, readSessionToken } from '@/server/session';
import { businessSchema, readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET(request: NextRequest) {
  try {
    const student = await currentStudent(request);
    if (!student) return expiredResponse();
    return json({ business: await getBusiness(student.id) });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`business.read failed (${code})`);
    return json({ error: 'Não foi possível carregar o negócio agora.' }, 503);
  }
}

export async function PUT(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'Origem da solicitação não permitida.' }, 403);

  try {
    const student = await currentStudent(request);
    if (!student) return expiredResponse();
    const parsed = businessSchema.safeParse(await readJson(request, 8192));
    if (!parsed.success) return json({ error: 'Confira os dados do negócio.' }, 400);
    const business = await upsertBusiness(student.id, parsed.data);
    return json({ business });
  } catch (error) {
    if (error instanceof Response) return thrownResponse(error);
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`business.save failed (${code})`);
    return json({ error: 'Não foi possível salvar o negócio agora.' }, 503);
  }
}
