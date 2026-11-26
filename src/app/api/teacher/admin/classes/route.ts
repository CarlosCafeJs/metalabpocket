import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { getPool, transaction } from '@/server/db';
import { listTeacherClasses } from '@/server/repository';
import { readJson, sameOrigin } from '@/server/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };

async function admin(request: NextRequest) {
  const identity = await getTeacherAccountSession(request);
  return identity?.role === 'admin' ? identity : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!await admin(request)) return NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403, headers });
    const unassigned = await getPool().query('SELECT COUNT(*)::int AS count FROM metalab_classes WHERE responsible_teacher_id IS NULL');
    return NextResponse.json({ classes: await listTeacherClasses(), unassignedCount: unassigned.rows[0]?.count ?? 0 }, { headers });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.admin.classes.list failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível carregar as turmas.' }, { status: 503, headers });
  }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Origem da solicitação não permitida.' }, { status: 403, headers });
  try {
    const identity = await admin(request);
    if (!identity) return NextResponse.json({ error: 'Acesso administrativo necessário.' }, { status: 403, headers });
    const input = z.object({ classId: z.string().uuid(), teacherId: z.string().uuid().nullable() }).strict().parse(await readJson(request, 2048));
    const changed = await transaction(async client => {
      if (input.teacherId) {
        const teacher = await client.query("SELECT id FROM metalab_teacher_accounts WHERE id=$1 AND account_role='teacher' AND account_state='active'", [input.teacherId]);
        if (!teacher.rowCount) return false;
      }
      const current = await client.query<{ responsible_teacher_id: string | null }>('SELECT responsible_teacher_id FROM metalab_classes WHERE id=$1 FOR UPDATE', [input.classId]);
      if (!current.rowCount) return false;
      await client.query('UPDATE metalab_classes SET responsible_teacher_id=$2 WHERE id=$1', [input.classId, input.teacherId]);
      await client.query('INSERT INTO metalab_teacher_class_audit (admin_id,class_id,previous_teacher_id,new_teacher_id) VALUES ($1,$2,$3,$4)', [identity.id,input.classId,current.rows[0].responsible_teacher_id,input.teacherId]);
      return true;
    });
    return changed ? NextResponse.json({ ok: true }, { headers }) : NextResponse.json({ error: 'Turma ou professor ativo não encontrado.' }, { status: 404, headers });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers });
    if (error instanceof z.ZodError) return NextResponse.json({ error: 'Solicitação inválida.' }, { status: 400, headers });
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.admin.classes.update failed (${code})`);
    return NextResponse.json({ error: 'Não foi possível atualizar o responsável da turma.' }, { status: 503, headers });
  }
}
