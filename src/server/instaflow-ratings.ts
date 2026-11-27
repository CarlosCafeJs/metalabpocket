import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { transaction } from '@/server/db';

export type InstaflowRatingSummary = {
  average: number | null;
  count: number;
  teacherStars: number | null;
};

async function readSummary(client: PoolClient, postId: string, teacherId: string): Promise<InstaflowRatingSummary> {
  const result = await client.query<{ average: number | string | null; count: number | string; teacher_stars: number | null }>(`
    SELECT ROUND(AVG(rating.stars)::numeric,1) AS average, COUNT(*)::int AS count,
      (SELECT own.stars FROM metalab_instalab_post_ratings own
       JOIN metalab_teacher_accounts active_teacher ON active_teacher.id=own.teacher_id AND active_teacher.account_state='active'
       WHERE own.post_id=$1 AND own.teacher_id=$2) AS teacher_stars
    FROM metalab_instalab_post_ratings rating
    JOIN metalab_teacher_accounts active_teacher ON active_teacher.id=rating.teacher_id AND active_teacher.account_state='active'
    WHERE rating.post_id=$1
  `, [postId, teacherId]);
  const row = result.rows[0];
  return { average: row?.average === null || row?.average === undefined ? null : Number(row.average), count: Number(row?.count ?? 0), teacherStars: row?.teacher_stars ?? null };
}

export async function saveInstaflowPostRating(input: {
  postId: string;
  teacherId: string;
  responsibleTeacherId?: string;
  stars: number | null;
}) {
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [`instaflow-rating:${input.postId}:${input.teacherId}`]);
    const post = await client.query<{ id: string }>(`
      SELECT post.id
      FROM metalab_instalab_posts post
      WHERE post.id=$1
        AND ($2::uuid IS NULL OR EXISTS(
          SELECT 1 FROM metalab_classes classroom
          WHERE classroom.id=post.class_id AND classroom.responsible_teacher_id=$2
        ))
      FOR SHARE OF post
    `, [input.postId, input.responsibleTeacherId ?? null]);
    if (!post.rowCount) return { kind: 'not-found' as const };

    const current = await client.query<{ id: string; stars: number }>(
      'SELECT id,stars FROM metalab_instalab_post_ratings WHERE post_id=$1 AND teacher_id=$2 FOR UPDATE',
      [input.postId, input.teacherId]
    );
    const previous = current.rows[0];
    if (input.stars === null) {
      if (previous) {
        await client.query(`
          INSERT INTO metalab_instalab_post_rating_history(rating_id,post_id,teacher_id,action,previous_stars)
          VALUES($1,$2,$3,'removed',$4)
        `, [previous.id, input.postId, input.teacherId, previous.stars]);
        await client.query('DELETE FROM metalab_instalab_post_ratings WHERE id=$1', [previous.id]);
      }
    } else if (previous) {
      if (previous.stars !== input.stars) {
        await client.query(`
          INSERT INTO metalab_instalab_post_rating_history(rating_id,post_id,teacher_id,action,previous_stars,new_stars)
          VALUES($1,$2,$3,'updated',$4,$5)
        `, [previous.id, input.postId, input.teacherId, previous.stars, input.stars]);
        await client.query('UPDATE metalab_instalab_post_ratings SET stars=$2,updated_at=NOW() WHERE id=$1', [previous.id, input.stars]);
      }
    } else {
      const id = randomUUID();
      await client.query('INSERT INTO metalab_instalab_post_ratings(id,post_id,teacher_id,stars) VALUES($1,$2,$3,$4)', [id, input.postId, input.teacherId, input.stars]);
      await client.query(`
        INSERT INTO metalab_instalab_post_rating_history(rating_id,post_id,teacher_id,action,new_stars)
        VALUES($1,$2,$3,'created',$4)
      `, [id, input.postId, input.teacherId, input.stars]);
    }
    return { kind: 'saved' as const, summary: await readSummary(client, input.postId, input.teacherId) };
  });
}
