import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPool, transaction } from '@/server/db';
import type { z } from 'zod';
import { academicEvaluationInputSchema, canEditEvaluation } from '@/domain/academic-grade-policy';

type Input = z.infer<typeof academicEvaluationInputSchema>;
type EvaluationRow = {
  id: string;
  target_kind: 'delivery' | 'classroom_submission';
  delivery_id: string | null;
  classroom_submission_id: string | null;
  student_id: string;
  class_id: string;
  evaluator_id: string;
  evaluator_name?: string;
  score: number | string;
  maximum_score: number | string;
  comment: string;
  publication_state: 'draft' | 'published';
  published_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  class_name?: string;
  activity_title?: string;
};

function toIso(value: Date | string | null) { return value ? value instanceof Date ? value.toISOString() : new Date(value).toISOString() : null; }
function mapEvaluation(row: EvaluationRow) {
  return {
    id: row.id,
    targetKind: row.target_kind,
    targetId: row.target_kind === 'delivery' ? row.delivery_id : row.classroom_submission_id,
    studentId: row.student_id,
    classId: row.class_id,
    className: row.class_name ?? null,
    evaluatorId: row.evaluator_id,
    evaluatorName: row.evaluator_name ?? null,
    activityTitle: row.activity_title ?? null,
    score: Number(row.score),
    maximumScore: Number(row.maximum_score),
    comment: row.comment,
    publicationState: row.publication_state,
    publishedAt: toIso(row.published_at),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

export async function listTeacherAcademicEvaluationsForStudent(studentId: string, responsibleTeacherId?: string) {
  const result = await getPool().query<EvaluationRow>(`
    SELECT evaluation.*, evaluator.full_name AS evaluator_name, classroom.name AS class_name,
      CASE evaluation.target_kind
        WHEN 'delivery' THEN delivery.activity_name
        ELSE CONCAT(module.title, ' · ', mission.title, ' · ', task.prompt)
      END AS activity_title
    FROM metalab_academic_evaluations evaluation
    JOIN metalab_teacher_accounts evaluator ON evaluator.id=evaluation.evaluator_id
    JOIN metalab_classes classroom ON classroom.id=evaluation.class_id
    LEFT JOIN metalab_student_deliveries delivery ON delivery.id=evaluation.delivery_id
    LEFT JOIN metalab_teacher_task_submissions submission ON submission.id=evaluation.classroom_submission_id
    LEFT JOIN metalab_teacher_tasks task ON task.id=submission.task_id
    LEFT JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
    LEFT JOIN metalab_teacher_modules module ON module.id=mission.module_id
    WHERE evaluation.student_id=$1
      AND ($2::uuid IS NULL OR classroom.responsible_teacher_id=$2)
    ORDER BY evaluation.updated_at DESC
  `, [studentId, responsibleTeacherId ?? null]);
  return result.rows.map(mapEvaluation);
}

export async function listStudentPublishedAcademicEvaluations(studentId: string) {
  const result = await getPool().query<EvaluationRow>(`
    SELECT evaluation.*, classroom.name AS class_name,
      CASE evaluation.target_kind
        WHEN 'delivery' THEN COALESCE(delivery.activity_name,'Entrega')
        ELSE CONCAT_WS(' · ', module.title, mission.title, task.prompt)
      END AS activity_title
    FROM metalab_academic_evaluations evaluation
    JOIN metalab_classes classroom ON classroom.id=evaluation.class_id
    LEFT JOIN metalab_student_deliveries delivery ON delivery.id=evaluation.delivery_id
    LEFT JOIN metalab_teacher_task_submissions submission ON submission.id=evaluation.classroom_submission_id
    LEFT JOIN metalab_teacher_tasks task ON task.id=submission.task_id
    LEFT JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
    LEFT JOIN metalab_teacher_modules module ON module.id=mission.module_id
    WHERE evaluation.student_id=$1 AND evaluation.publication_state='published'
    ORDER BY evaluation.published_at DESC,evaluation.updated_at DESC
    LIMIT 300
  `, [studentId]);
  return result.rows.map(mapEvaluation).map(({ evaluatorId, ...evaluation }) => evaluation);
}

export async function saveTeacherAcademicEvaluation(input: Input, actor: { id: string; role: 'teacher' | 'admin' }) {
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`academic-evaluation:${input.targetKind}:${input.targetId}`]);
    let target: { student_id: string; class_id: string } | undefined;
    if (input.targetKind === 'delivery') {
      const result = await client.query<{ student_id: string; class_id: string }>(`
        SELECT delivery.student_id, classroom.id AS class_id
        FROM metalab_student_deliveries delivery
        JOIN metalab_students student ON student.id=delivery.student_id
          AND student.archived_at IS NULL AND student.password_hash IS NOT NULL
        JOIN LATERAL (
          SELECT COALESCE(delivery.class_id, (
            SELECT history.class_id FROM metalab_student_class_history history
            WHERE history.student_id=delivery.student_id AND history.started_at<=delivery.created_at
              AND (history.ended_at IS NULL OR history.ended_at>delivery.created_at)
            ORDER BY history.started_at DESC LIMIT 1
          )) AS id
        ) resolved_class ON resolved_class.id IS NOT NULL
        JOIN metalab_classes classroom ON classroom.id=resolved_class.id
        WHERE delivery.id=$1
          AND ($2::uuid IS NULL OR classroom.responsible_teacher_id=$2)
        FOR SHARE OF delivery,classroom
      `, [input.targetId, actor.role === 'teacher' ? actor.id : null]);
      target = result.rows[0];
    } else {
      const result = await client.query<{ student_id: string; class_id: string }>(`
        SELECT submission.student_id, classroom.id AS class_id
        FROM metalab_teacher_task_submissions submission
        JOIN metalab_students student ON student.id=submission.student_id
          AND student.archived_at IS NULL AND student.password_hash IS NOT NULL
        JOIN metalab_teacher_tasks task ON task.id=submission.task_id
        JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
        JOIN metalab_teacher_modules module ON module.id=mission.module_id
        JOIN metalab_classes classroom ON classroom.id=module.class_id
        WHERE submission.id=$1
          AND ($2::uuid IS NULL OR classroom.responsible_teacher_id=$2)
        FOR SHARE OF submission,classroom
      `, [input.targetId, actor.role === 'teacher' ? actor.id : null]);
      target = result.rows[0];
    }
    if (!target) return { kind: 'not-found' as const };

    const existingResult = await client.query<EvaluationRow>(`
      SELECT * FROM metalab_academic_evaluations
      WHERE ${input.targetKind === 'delivery' ? 'delivery_id' : 'classroom_submission_id'}=$1
      FOR UPDATE
    `, [input.targetId]);
    const previous = existingResult.rows[0];
    if (previous && !canEditEvaluation(actor.role, actor.id, previous.evaluator_id)) return { kind: 'forbidden' as const };

    const id = previous?.id ?? randomUUID();
    const status = input.publicationState;
    const current = previous
      ? await client.query<EvaluationRow>(`
          UPDATE metalab_academic_evaluations SET evaluator_id=$2,score=$3,maximum_score=$4,comment=$5,
            publication_state=$6,published_at=CASE WHEN $6::text='published' THEN NOW() ELSE NULL END,updated_at=NOW()
          WHERE id=$1
          RETURNING *
        `, [id, actor.id, input.score, input.maximumScore, input.comment, status])
      : await client.query<EvaluationRow>(`
          INSERT INTO metalab_academic_evaluations
            (id,target_kind,delivery_id,classroom_submission_id,student_id,class_id,evaluator_id,score,maximum_score,comment,publication_state,published_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CASE WHEN $11::text='published' THEN NOW() ELSE NULL END)
          RETURNING *
        `, [id, input.targetKind, input.targetKind === 'delivery' ? input.targetId : null,
          input.targetKind === 'classroom_submission' ? input.targetId : null, target.student_id,
          target.class_id, actor.id, input.score, input.maximumScore, input.comment, status]);
    const saved = current.rows[0];
    if (!saved) throw new Error('ACADEMIC_EVALUATION_WRITE_FAILED');

    const action = !previous ? 'created' : previous.publication_state !== status
      ? status === 'published' ? 'published' : 'unpublished'
      : 'updated';
    const snapshot = (row: EvaluationRow) => ({
      targetKind: row.target_kind, targetId: row.target_kind === 'delivery' ? row.delivery_id : row.classroom_submission_id,
      score: Number(row.score), maximumScore: Number(row.maximum_score), comment: row.comment,
      publicationState: row.publication_state, evaluatorId: row.evaluator_id
    });
    await client.query(`
      INSERT INTO metalab_academic_evaluation_history(evaluation_id,actor_teacher_id,action,previous_value,new_value)
      VALUES($1,$2,$3,$4::jsonb,$5::jsonb)
    `, [id, actor.id, action, previous ? JSON.stringify(snapshot(previous)) : null, JSON.stringify(snapshot(saved))]);

    const mapped = mapEvaluation(saved);
    const details = await client.query<{ evaluator_name: string; class_name: string; activity_title: string }>(`
      SELECT evaluator.full_name AS evaluator_name, classroom.name AS class_name,
        CASE $2::text
          WHEN 'delivery' THEN delivery.activity_name
          ELSE CONCAT(module.title, ' · ', mission.title, ' · ', task.prompt)
        END AS activity_title
      FROM metalab_teacher_accounts evaluator
      JOIN metalab_classes classroom ON classroom.id=$3
      LEFT JOIN metalab_student_deliveries delivery ON delivery.id=$4
      LEFT JOIN metalab_teacher_task_submissions submission ON submission.id=$5
      LEFT JOIN metalab_teacher_tasks task ON task.id=submission.task_id
      LEFT JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
      LEFT JOIN metalab_teacher_modules module ON module.id=mission.module_id
      WHERE evaluator.id=$1
    `, [saved.evaluator_id, saved.target_kind, saved.class_id, saved.delivery_id, saved.classroom_submission_id]);
    return { kind: 'saved' as const, evaluation: { ...mapped, evaluatorName: details.rows[0]?.evaluator_name ?? null, className: details.rows[0]?.class_name ?? null, activityTitle: details.rows[0]?.activity_title ?? null } };
  });
}
