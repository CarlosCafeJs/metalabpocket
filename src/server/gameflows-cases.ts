import 'server-only';
import { randomUUID } from 'node:crypto';
import { gameFlowCaseInputSchema, gameFlowGateInputSchema, type GameFlowCaseInput } from '@/domain/gameflows';
import { getPool, transaction } from '@/server/db';

export type GameFlowsActor = { id: string; role: 'teacher' | 'admin' };
const gateTypeToConfig = (gate: GameFlowCaseInput['gates'][number]) => ({
  publicPayload: { items: gate.items, options: gate.options },
  privatePayload: { answers: gate.answers }
});

export async function listGameFlowCases(actor: GameFlowsActor) {
  const result = await getPool().query(`
    SELECT game.id,game.title,game.description,game.status,game.updated_at AS "updatedAt",
      COUNT(DISTINCT publication.class_id)::int AS "publishedClasses",
      COUNT(DISTINCT gate.id)::int AS "gateCount"
    FROM gameflows_cases game
    LEFT JOIN gameflows_case_classes publication ON publication.case_id=game.id
    LEFT JOIN gameflows_gates gate ON gate.case_id=game.id
    WHERE ($1::uuid IS NULL OR game.created_by=$1)
    GROUP BY game.id
    ORDER BY game.updated_at DESC
  `, [actor.role === 'teacher' ? actor.id : null]);
  return result.rows;
}

export async function getGameFlowCaseForTeacher(caseId: string, actor: GameFlowsActor) {
  const caseResult = await getPool().query(`
    SELECT id,title,description,opening_story AS "openingStory",investigation_objective AS objective,
      weekly_content AS "weeklyContent",closing_message AS "closingMessage",status,version
    FROM gameflows_cases WHERE id=$1 AND ($2::uuid IS NULL OR created_by=$2)
  `, [caseId, actor.role === 'teacher' ? actor.id : null]);
  if (!caseResult.rows[0]) return null;
  const [gates, publications] = await Promise.all([
    getPool().query(`SELECT id,position,gate_type AS type,title,narrative,prompt,public_payload AS "publicPayload",private_payload AS "privatePayload",hint_text AS hint,explanation,max_xp AS "maxXp" FROM gameflows_gates WHERE case_id=$1 ORDER BY position`, [caseId]),
    getPool().query(`SELECT class_id AS "classId",classroom.name AS "className" FROM gameflows_case_classes publication JOIN metalab_classes classroom ON classroom.id=publication.class_id WHERE case_id=$1 ORDER BY classroom.name`, [caseId])
  ]);
  return { ...caseResult.rows[0], gates: gates.rows, publications: publications.rows };
}

export async function saveGameFlowCase(input: unknown, actor: GameFlowsActor, caseId?: string) {
  const parsed = gameFlowCaseInputSchema.safeParse(input);
  if (!parsed.success) return { kind: 'invalid' as const, issues: parsed.error.issues };
  const definition = parsed.data;
  return transaction(async client => {
    let id = caseId || randomUUID();
    if (caseId) {
      const current = await client.query<{ status: string }>(`
        SELECT game.status FROM gameflows_cases game
        WHERE game.id=$1 AND ($2::uuid IS NULL OR game.created_by=$2) FOR UPDATE
      `, [caseId, actor.role === 'teacher' ? actor.id : null]);
      if (!current.rows[0]) return { kind: 'not-found' as const };
      if (current.rows[0].status !== 'draft') return { kind: 'not-editable' as const };
      const sessions = await client.query('SELECT 1 FROM gameflows_sessions WHERE case_id=$1 LIMIT 1', [caseId]);
      if (sessions.rowCount) return { kind: 'has-sessions' as const };
      await client.query(`UPDATE gameflows_cases SET title=$2,description=$3,opening_story=$4,investigation_objective=$5,weekly_content=$6,closing_message=$7,version=version+1,updated_at=NOW() WHERE id=$1`,
        [caseId,definition.title,definition.description,definition.openingStory,definition.objective,definition.weeklyContent,definition.closingMessage]);
      await client.query('DELETE FROM gameflows_gates WHERE case_id=$1', [caseId]);
    } else {
      await client.query(`INSERT INTO gameflows_cases(id,created_by,title,description,opening_story,investigation_objective,weekly_content,closing_message) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id,actor.id,definition.title,definition.description,definition.openingStory,definition.objective,definition.weeklyContent,definition.closingMessage]);
    }
    for (const [index,gate] of definition.gates.entries()) {
      const { publicPayload, privatePayload } = gateTypeToConfig(gate);
      const gateId=randomUUID();
      await client.query(`
        INSERT INTO gameflows_gates(id,case_id,position,gate_type,title,narrative,prompt,public_payload,private_payload,hint_text,explanation,max_xp,requires_all_participants)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$13)
      `, [gateId,id,index+1,gate.type,gate.title,gate.narrative,gate.prompt,JSON.stringify(publicPayload),JSON.stringify(privatePayload),gate.hint,gate.explanation,gate.maxXp,gate.type==='collective_fragments']);
      for(const [evidenceIndex,item] of gate.items.entries())await client.query(`INSERT INTO gameflows_evidence(id,case_id,gate_id,title,body,reveal_after_position,position) VALUES($1,$2,$3,$4,$5,$6,$7)`,[randomUUID(),id,gateId,`Pista ${evidenceIndex+1}`,item,index+1,evidenceIndex+1]);
    }
    return { kind: 'saved' as const, id };
  });
}

export async function publishGameFlowCase(caseId: string, classIds: string[], actor: GameFlowsActor) {
  if (!classIds.length || classIds.length > 100) return { kind: 'invalid-classes' as const };
  return transaction(async client => {
    const selected = await client.query<{ id:string; status:string }>(`
      SELECT id,status FROM gameflows_cases WHERE id=$1 AND ($2::uuid IS NULL OR created_by=$2) FOR UPDATE
    `,[caseId,actor.role==='teacher'?actor.id:null]);
    if (!selected.rows[0]) return { kind:'not-found' as const };
    const gates = await client.query<{ position:number; gate_type:string; title:string; narrative:string; prompt:string; public_payload:{items?:unknown;options?:unknown}; private_payload:{answers?:unknown}; hint_text:string; explanation:string; max_xp:number }>(
      'SELECT position,gate_type,title,narrative,prompt,public_payload,private_payload,hint_text,explanation,max_xp FROM gameflows_gates WHERE case_id=$1 ORDER BY position',[caseId]);
    if (gates.rows.length < 5 || gates.rows.length > 10 || gates.rows.some((gate,index)=>gate.position!==index+1 || !gate.title.trim() || !gate.prompt.trim())) return { kind:'incomplete' as const };
    for (const gate of gates.rows) {
      const valid=gameFlowGateInputSchema.safeParse({type:gate.gate_type,title:gate.title,narrative:gate.narrative,prompt:gate.prompt,
        items:Array.isArray(gate.public_payload?.items)?gate.public_payload.items:[],options:Array.isArray(gate.public_payload?.options)?gate.public_payload.options:[],
        answers:Array.isArray(gate.private_payload?.answers)?gate.private_payload.answers:[],hint:gate.hint_text,explanation:gate.explanation,maxXp:Number(gate.max_xp)});
      if(!valid.success)return {kind:'incomplete' as const};
    }
    const classes = await client.query<{id:string}>(`
      SELECT id FROM metalab_classes WHERE id=ANY($1::uuid[])
        AND ($2::uuid IS NULL OR responsible_teacher_id=$2) FOR SHARE
    `,[classIds,actor.role==='teacher'?actor.id:null]);
    if (classes.rowCount!==new Set(classIds).size) return {kind:'class-out-of-scope' as const};
    for (const classId of classIds) await client.query(`
      INSERT INTO gameflows_case_classes(case_id,class_id,published_by) VALUES($1,$2,$3)
      ON CONFLICT(case_id,class_id) DO UPDATE SET published_by=EXCLUDED.published_by,published_at=NOW()
    `,[caseId,classId,actor.id]);
    await client.query(`UPDATE gameflows_cases SET status='published',updated_at=NOW() WHERE id=$1`,[caseId]);
    return {kind:'published' as const, classCount:new Set(classIds).size};
  });
}

export function validateSavedGateConfiguration(value: unknown) {
  return gameFlowGateInputSchema.safeParse(value);
}
