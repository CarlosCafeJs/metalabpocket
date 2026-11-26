import { NextRequest, NextResponse } from 'next/server';
import { getTeacherStudent } from '@/server/repository';
import { getPool } from '@/server/db';
import { hasTeacherOrAdminSession, hasTeacherSession } from '@/server/teacher-auth';
import { getTeacherAccountSession } from '@/server/teacher-accounts';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ studentId: string }> };
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u).refine(value => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
});
const querySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0)
}).strict();

export async function GET(request: NextRequest, context: RouteContext) {
  const legacy = hasTeacherSession(request);
  const account = legacy ? null : await getTeacherAccountSession(request).catch(() => null);
  if (!legacy && !account) return NextResponse.json({ error: 'Sessão do professor necessária.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const responsibleTeacherId = account?.role === 'teacher' ? account.id : undefined;
  const studentId = (await context.params).studentId;
  if (!z.string().uuid().safeParse(studentId).success) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success || (query.data.from && query.data.to && query.data.from > query.data.to)) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    // Keep the same student authorization boundary as the profile endpoint.
    const student = await getTeacherStudent(studentId, responsibleTeacherId);
    if (!student) return NextResponse.json({ error: 'Aluno não encontrado.' }, { status: 404 });
    const { from = null, to = null, limit, offset } = query.data;
    const pool = getPool();
    const dateFilter = `($2::date IS NULL OR event.occurred_at >= ($2::date::timestamp AT TIME ZONE 'America/Sao_Paulo'))
      AND ($3::date IS NULL OR event.occurred_at < (($3::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))`;
    // A regular teacher can only inspect events attached to one of their classes.
    // Legacy/unassigned activity stays available to the administrative transition only.
    const classScope = `($6::uuid IS NULL OR EXISTS (
      SELECT 1 FROM metalab_classes owned_class
      WHERE owned_class.id = event.class_id AND owned_class.responsible_teacher_id = $6
    ))`;
    const countClassScope = `($4::uuid IS NULL OR EXISTS (
      SELECT 1 FROM metalab_classes owned_class
      WHERE owned_class.id = event.class_id AND owned_class.responsible_teacher_id = $4
    ))`;
    const daysClassScope = `($2::uuid IS NULL OR EXISTS (
      SELECT 1 FROM metalab_classes owned_class
      WHERE owned_class.id = event.class_id AND owned_class.responsible_teacher_id = $2
    ))`;
    const [events, count, days] = await Promise.all([
      pool.query(`SELECT event.id::text, event.actor_student_id, event.class_id,
          event.occurred_at, event.actor_role, event.event_type, event.entity_type,
          event.entity_id, event.payload, event.legacy
        FROM metalab_student_activity_events event
        WHERE (event.student_id = $1 OR event.actor_student_id = $1) AND ${dateFilter} AND ${classScope}
        ORDER BY event.occurred_at ASC, event.id ASC
        LIMIT $4 OFFSET $5`, [studentId, from, to, limit, offset, responsibleTeacherId ?? null]),
      pool.query(`SELECT COUNT(*)::int AS total FROM metalab_student_activity_events event
        WHERE (event.student_id = $1 OR event.actor_student_id = $1) AND ${dateFilter} AND ${countClassScope}`, [studentId, from, to, responsibleTeacherId ?? null]),
      pool.query(`SELECT DISTINCT (event.occurred_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day
        FROM metalab_student_activity_events event
        WHERE (event.student_id = $1 OR event.actor_student_id = $1) AND ${daysClassScope}
        ORDER BY day DESC LIMIT 180`, [studentId, responsibleTeacherId ?? null])
    ]);
    return NextResponse.json({
      events: events.rows.map(row => ({
        id: row.id,
        occurredAt: new Date(row.occurred_at).toISOString(),
        actorRole: row.actor_role,
        eventType: row.event_type,
        entityType: row.entity_type,
        entityId: row.entity_id,
        classId: row.class_id,
        payload: row.payload,
        legacy: row.legacy === true,
        actorIsStudent: row.actor_student_id !== null
      })),
      total: count.rows[0]?.total ?? 0,
      limit,
      offset,
      hasMore: offset + events.rowCount! < Number(count.rows[0]?.total ?? 0),
      recordedDays: days.rows.map(row => row.day)
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'UNEXPECTED';
    console.error(`teacher.student.history.read failed (${code})`);
    const message = code === '42P01'
      ? 'O histórico ainda não está instalado neste banco. Depois de conferir o destino e ter um backup, aplique as migrations pendentes.'
      : 'Não foi possível carregar o histórico deste aluno agora.';
    return NextResponse.json({ error: message }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
