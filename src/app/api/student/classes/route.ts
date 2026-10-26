import { NextRequest, NextResponse } from 'next/server';
import { findStudentBySessionToken, getStudentClass, joinStudentClassByCode } from '@/server/repository';
import { readSessionToken } from '@/server/session';
import { readJson, sameOrigin } from '@/server/validation';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

export async function GET(request: NextRequest) {
  const token = readSessionToken(request);
  const student = token ? await findStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers });
  try {
    return NextResponse.json({ class: await getStudentClass(student.id) }, { headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.classes.read failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível consultar sua turma.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  const token = readSessionToken(request);
  const student = token ? await findStudentBySessionToken(token) : null;
  if (!student) return NextResponse.json({ error: 'Sua sessão expirou.' }, { status: 401, headers });
  try {
    const input = z.object({ code: z.string().trim().regex(/^[a-hj-np-z2-9]{8}$/iu) }).strict().parse(await readJson(request, 512));
    const joined = await joinStudentClassByCode(student.id, input.code);
    if (!joined) return NextResponse.json({ error: 'Esse código não corresponde a uma turma ativa.' }, { status: 404, headers });
    return NextResponse.json({ class: joined }, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Digite o código de 8 caracteres informado pelo professor.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`student.classes.join failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível entrar na turma agora.' }, { status: 503, headers });
  }
}
