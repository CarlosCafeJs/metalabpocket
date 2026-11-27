import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { evaluateGameFlowAnswer, nextGameFlowSessionState, splitCollectiveFragments, type GameFlowGateType } from '@/domain/gameflows';
import { getPool, transaction } from '@/server/db';
import type { PoolClient } from 'pg';
import type { GameFlowsActor } from '@/server/gameflows-cases';

type SessionState='waiting'|'running'|'paused'|'completed'|'ended'|'cancelled';
type SessionAction='start'|'pause'|'resume'|'end'|'cancel'|'announce'|'hint'|'redistribute';
const noOp = <T extends string>(kind:T) => ({kind} as const);
const actorScope = (actor:GameFlowsActor) => actor.role==='teacher'?actor.id:null;

function seededOrder<T>(items:T[], seed:string) {
  return [...items].sort((left,right)=>{
    const key=(value:T)=>createHash('sha256').update(`${seed}:${JSON.stringify(value)}`).digest('hex');
    return key(left).localeCompare(key(right));
  });
}

export async function listStudentGameFlowOptions(studentId:string) {
  const result=await getPool().query(`
    SELECT game.id AS "caseId",game.title,game.description,game.opening_story AS "openingStory",
      classroom.id AS "classId",classroom.name AS "className",game.weekly_content AS "weeklyContent",
      session.id AS "sessionId",session.state AS "sessionState",session.director_message AS "directorMessage",
      (SELECT COUNT(*)::int FROM gameflows_participants participant WHERE participant.session_id=session.id) AS "participantCount",
      EXISTS(SELECT 1 FROM gameflows_participants participant WHERE participant.session_id=session.id AND participant.student_id=$1) AS "isParticipant"
    FROM metalab_student_class_assignments assignment
    JOIN metalab_classes classroom ON classroom.id=assignment.class_id
    JOIN gameflows_case_classes publication ON publication.class_id=classroom.id
    JOIN gameflows_cases game ON game.id=publication.case_id AND game.status='published'
    LEFT JOIN LATERAL (
      SELECT * FROM gameflows_sessions active_session
      WHERE active_session.case_id=game.id AND active_session.class_id=classroom.id AND active_session.state IN ('waiting','running','paused')
      ORDER BY active_session.created_at DESC LIMIT 1
    ) session ON TRUE
    WHERE assignment.student_id=$1
    ORDER BY CASE WHEN session.state='waiting' THEN 0 WHEN session.state IN ('running','paused') THEN 1 ELSE 2 END,game.updated_at DESC
  `,[studentId]);
  return result.rows;
}

export async function listStudentGameFlowHistory(studentId:string){
  const result=await getPool().query(`
    SELECT session.id AS "sessionId",session.case_id AS "caseId",session.class_id AS "classId",
      session.state,game.title AS "caseTitle",classroom.name AS "className",
      session.started_at AS "startedAt",session.ended_at AS "endedAt",
      COALESCE((SELECT SUM(xp.xp)::int FROM gameflows_xp_events xp WHERE xp.session_id=session.id AND xp.student_id=participant.student_id),0) AS "totalXp",
      (SELECT COUNT(*)::int FROM gameflows_gate_progress progress WHERE progress.session_id=session.id AND progress.student_id=participant.student_id AND progress.state='completed') AS "completedGates",
      (SELECT COUNT(*)::int FROM gameflows_gates gate WHERE gate.case_id=session.case_id) AS "gateCount"
    FROM gameflows_sessions session JOIN gameflows_participants participant ON participant.session_id=session.id
    JOIN gameflows_cases game ON game.id=session.case_id JOIN metalab_classes classroom ON classroom.id=session.class_id
    WHERE participant.student_id=$1 AND session.state IN ('completed','ended','cancelled')
    ORDER BY COALESCE(session.ended_at,session.updated_at) DESC LIMIT 100
  `,[studentId]);
  return result.rows;
}

export async function getStudentGameFlowClassRanking(classId:string,studentId:string){
  const result=await getPool().query(`
    SELECT participant.student_id AS "studentId",student.full_name AS "fullName",
      SUM(COALESCE((SELECT SUM(xp.xp)::int FROM gameflows_xp_events xp WHERE xp.session_id=session.id AND xp.student_id=participant.student_id),0))::int AS "totalXp",
      SUM((SELECT COUNT(*)::int FROM gameflows_gate_progress progress WHERE progress.session_id=session.id AND progress.student_id=participant.student_id AND progress.state='completed'))::int AS "completedGates",
      COUNT(DISTINCT session.id)::int AS "operations"
    FROM gameflows_sessions session JOIN gameflows_participants participant ON participant.session_id=session.id
    JOIN metalab_students student ON student.id=participant.student_id
    WHERE session.class_id=$1 AND EXISTS(SELECT 1 FROM metalab_student_class_assignments authorized WHERE authorized.class_id=$1 AND authorized.student_id=$2)
    GROUP BY participant.student_id,student.full_name
    ORDER BY "totalXp" DESC,"completedGates" DESC,student.full_name ASC LIMIT 200
  `,[classId,studentId]);
  return result.rows;
}

export async function listTeacherGameFlowSessions(actor:GameFlowsActor){
  const result=await getPool().query(`
    SELECT session.id,session.case_id AS "caseId",session.class_id AS "classId",session.state,
      game.title AS "caseTitle",classroom.name AS "className",session.created_at AS "createdAt",
      (SELECT COUNT(*)::int FROM gameflows_participants participant WHERE participant.session_id=session.id) AS "participantCount"
    FROM gameflows_sessions session JOIN gameflows_cases game ON game.id=session.case_id JOIN metalab_classes classroom ON classroom.id=session.class_id
    WHERE ($1::uuid IS NULL OR session.teacher_id=$1 OR classroom.responsible_teacher_id=$1)
    ORDER BY CASE WHEN session.state='waiting' THEN 0 WHEN session.state IN ('running','paused') THEN 1 ELSE 2 END,session.created_at DESC
    LIMIT 100
  `,[actorScope(actor)]);
  return result.rows;
}

export async function createGameFlowSession(input:{caseId:string;classId:string;teacherMessage?:string},actor:GameFlowsActor) {
  return transaction(async client=>{
    const allowed=await client.query(`
      SELECT game.id FROM gameflows_cases game
      JOIN gameflows_case_classes publication ON publication.case_id=game.id AND publication.class_id=$2
      JOIN metalab_classes classroom ON classroom.id=publication.class_id
      WHERE game.id=$1 AND game.status='published'
        AND ($3::uuid IS NULL OR (game.created_by=$3 AND classroom.responsible_teacher_id=$3))
      FOR SHARE OF game,classroom
    `,[input.caseId,input.classId,actorScope(actor)]);
    if(!allowed.rowCount)return noOp('not-found');
    const id=randomUUID();
    await client.query(`INSERT INTO gameflows_sessions(id,case_id,class_id,teacher_id,director_message) VALUES($1,$2,$3,$4,$5)`,[
      id,input.caseId,input.classId,actor.id,input.teacherMessage?.trim()||'Aguardando o diretor da investigação iniciar a operação.'
    ]);
    await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'session_created',$3::jsonb)`,[id,actor.id,JSON.stringify({caseId:input.caseId,classId:input.classId})]);
    return {kind:'created' as const,id};
  });
}

export async function joinGameFlowSession(sessionId:string,studentId:string) {
  return transaction(async client=>{
    const selected=await client.query<{id:string;class_id:string;state:SessionState}>(`SELECT id,class_id,state FROM gameflows_sessions WHERE id=$1 FOR UPDATE`,[sessionId]);
    const session=selected.rows[0];
    if(!session)return noOp('not-found');
    const enrolled=await client.query('SELECT 1 FROM metalab_student_class_assignments WHERE student_id=$1 AND class_id=$2',[studentId,session.class_id]);
    if(!enrolled.rowCount)return noOp('not-enrolled');
    if(['completed','ended','cancelled'].includes(session.state))return noOp('closed-session');
    const existing=await client.query('SELECT 1 FROM gameflows_participants WHERE session_id=$1 AND student_id=$2',[sessionId,studentId]);
    if(session.state!=='waiting'&&!existing.rowCount)return noOp('entry-closed');
    if(session.state==='waiting'&&!existing.rowCount){
      await client.query('INSERT INTO gameflows_participants(session_id,student_id) VALUES($1,$2)',[sessionId,studentId]);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_student_id,event_type,details) VALUES($1,$2,'participant_joined','{}'::jsonb)`,[sessionId,studentId]);
    }
    await client.query(`UPDATE gameflows_participants SET last_seen_at=NOW(),connection_state='online' WHERE session_id=$1 AND student_id=$2`,[sessionId,studentId]);
    return {kind:'joined' as const,state:session.state,created:!existing.rowCount};
  });
}

export async function startGameFlowSession(sessionId:string,actor:GameFlowsActor) {
  return transaction(async client=>{
    const result=await client.query<{id:string;case_id:string;class_id:string;state:SessionState}>(`
      SELECT session.id,session.case_id,session.class_id,session.state FROM gameflows_sessions session
      JOIN metalab_classes classroom ON classroom.id=session.class_id
      WHERE session.id=$1 AND ($2::uuid IS NULL OR session.teacher_id=$2 OR classroom.responsible_teacher_id=$2) FOR UPDATE OF session
    `,[sessionId,actorScope(actor)]);
    const session=result.rows[0];
    if(!session)return noOp('not-found');
    if(session.state!=='waiting')return noOp('invalid-state');
    const roster=await client.query<{student_id:string}>(`SELECT student_id FROM gameflows_participants WHERE session_id=$1 ORDER BY ready_at,student_id FOR UPDATE`,[sessionId]);
    if(!roster.rowCount)return noOp('empty-roster');
    const gates=await client.query<{id:string;position:number;gate_type:GameFlowGateType;private_payload:{answers?:string[]}}>(`SELECT id,position,gate_type,private_payload FROM gameflows_gates WHERE case_id=$1 ORDER BY position`,[session.case_id]);
    if(gates.rows.length<5||gates.rows.length>10||gates.rows.some((gate,index)=>gate.position!==index+1))return noOp('invalid-case');
    for(const gate of gates.rows.filter(item=>item.gate_type==='collective_fragments')){
      const answer=Array.isArray(gate.private_payload.answers)?gate.private_payload.answers[0]:'';
      try{splitCollectiveFragments(typeof answer==='string'?answer:'',roster.rowCount||0);}catch{return noOp('invalid-case');}
    }
    const frozen=await client.query(`UPDATE gameflows_participants participant SET frozen_position=roster.position FROM (SELECT student_id,ROW_NUMBER() OVER(ORDER BY ready_at,student_id)::smallint AS position FROM gameflows_participants WHERE session_id=$1) roster WHERE participant.session_id=$1 AND participant.student_id=roster.student_id`,[sessionId]);
    for(const gate of gates.rows){
      for(const [index,participant] of roster.rows.entries()){
        await client.query(`INSERT INTO gameflows_gate_progress(session_id,student_id,gate_id,state) VALUES($1,$2,$3,$4)`,[sessionId,participant.student_id,gate.id,gate.position===1?'available':'locked']);
      }
      if(gate.gate_type==='collective_fragments'){
        const answer=Array.isArray(gate.private_payload.answers)?gate.private_payload.answers[0]:'';
        const pieces=splitCollectiveFragments(answer,roster.rows.length);
        for(const [index,participant] of roster.rows.entries()){
          await client.query('INSERT INTO gameflows_fragments(session_id,student_id,gate_id,fragments) VALUES($1,$2,$3,$4::jsonb)',[sessionId,participant.student_id,gate.id,JSON.stringify(pieces[index])]);
        }
      }
    }
    await client.query(`UPDATE gameflows_sessions SET state='running',roster_frozen_at=NOW(),started_at=NOW(),updated_at=NOW() WHERE id=$1`,[sessionId]);
    await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'session_started',$3::jsonb)`,[sessionId,actor.id,JSON.stringify({participantCount:roster.rowCount,gateCount:gates.rows.length})]);
    return {kind:'started' as const,participantCount:frozen.rowCount};
  });
}

export async function getStudentGameFlowSession(sessionId:string,studentId:string) {
  await getPool().query(`UPDATE gameflows_participants SET last_seen_at=NOW(),connection_state='online' WHERE session_id=$1 AND student_id=$2`,[sessionId,studentId]);
  const selected=await getPool().query<any>(`
    SELECT session.id AS "sessionId",session.state AS "sessionState",session.director_message AS "directorMessage",
      session.started_at AS "startedAt",game.id AS "caseId",game.title AS "caseTitle",game.description,
      game.opening_story AS "openingStory",game.investigation_objective AS objective,game.weekly_content AS "weeklyContent",game.closing_message AS "closingMessage",
      classroom.name AS "className",(SELECT COUNT(*)::int FROM gameflows_participants all_participants WHERE all_participants.session_id=session.id) AS "participantCount"
    FROM gameflows_sessions session JOIN gameflows_cases game ON game.id=session.case_id
    JOIN metalab_classes classroom ON classroom.id=session.class_id
    JOIN gameflows_participants participant ON participant.session_id=session.id AND participant.student_id=$2
    WHERE session.id=$1
  `,[sessionId,studentId]);
  const header=selected.rows[0]; if(!header)return null;
  const [gates,evidence,achievements]=await Promise.all([
    getPool().query<any>(`SELECT gate.id,gate.position,gate.gate_type AS type,gate.title,gate.narrative,gate.prompt,gate.public_payload AS "publicPayload",gate.explanation,gate_progress.state,gate_progress.hint_revealed_at AS "hintRevealedAt",gate.hint_text AS hint,gate_progress.points_awarded AS "pointsAwarded",gate_progress.completed_at AS "completedAt" FROM gameflows_gate_progress gate_progress JOIN gameflows_gates gate ON gate.id=gate_progress.gate_id WHERE gate_progress.session_id=$1 AND gate_progress.student_id=$2 ORDER BY gate.position`,[sessionId,studentId]),
    getPool().query<any>(`SELECT evidence.id,evidence.title,evidence.body,evidence.reveal_after_position AS "revealAfterPosition",evidence_unlock.unlocked_at AS "unlockedAt" FROM gameflows_student_evidence evidence_unlock JOIN gameflows_evidence evidence ON evidence.id=evidence_unlock.evidence_id WHERE evidence_unlock.session_id=$1 AND evidence_unlock.student_id=$2 ORDER BY evidence_unlock.unlocked_at`,[sessionId,studentId]),
    getPool().query(`SELECT achievement_key AS key,title,awarded_at AS "awardedAt" FROM gameflows_achievements WHERE session_id=$1 AND student_id=$2 ORDER BY awarded_at`,[sessionId,studentId])
  ]);
  const totalXp=await getPool().query<{total:string|number}>(`SELECT COALESCE(SUM(xp),0)::int AS total FROM gameflows_xp_events WHERE session_id=$1 AND student_id=$2`,[sessionId,studentId]);
  const availableGates=gates.rows.map((gate:any)=>{
    const visible=gate.state!=='locked';
    const {items,options}=gate.publicPayload||{};
    const randomizedItems=gate.type==='timeline'&&visible?seededOrder(Array.isArray(items)?items:[],`${sessionId}:${studentId}:${gate.id}`):items;
    return {...gate,narrative:visible?gate.narrative:'',prompt:visible?gate.prompt:'',explanation:gate.state==='completed'?gate.explanation:null,
      publicPayload:visible?{items:randomizedItems||[],options:options||[]}:{items:[],options:[]},hint:gate.hintRevealedAt&&visible?gate.hint:null};
  });
  const current=availableGates.find((gate:any)=>gate.state==='available'||gate.state==='in_progress'||gate.state==='pending_review');
  let collective:null|{fragments:string[];contributed:boolean;contributedCount:number;participantCount:number}=null;
  if(current?.type==='collective_fragments'){
    const [own,count]=await Promise.all([
      getPool().query<{fragments:string[]}>(`SELECT fragments FROM gameflows_fragments WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[sessionId,studentId,current.id]),
      getPool().query<{contributed:number|string;total:number|string}>(`SELECT (SELECT COUNT(*) FROM gameflows_collective_contributions WHERE session_id=$1 AND gate_id=$2)::int AS contributed,(SELECT COUNT(*) FROM gameflows_participants WHERE session_id=$1)::int AS total`,[sessionId,current.id])
    ]);
    const contributed=await getPool().query('SELECT 1 FROM gameflows_collective_contributions WHERE session_id=$1 AND student_id=$2 AND gate_id=$3',[sessionId,studentId,current.id]);
    collective={fragments:own.rows[0]?.fragments||[],contributed:Boolean(contributed.rowCount),contributedCount:Number(count.rows[0]?.contributed||0),participantCount:Number(count.rows[0]?.total||0)};
  }
  return {...header,gates:availableGates,currentGateId:current?.id||null,collective,evidence:evidence.rows,achievements:achievements.rows,totalXp:Number(totalXp.rows[0]?.total||0)};
}

export async function getTeacherGameFlowSession(sessionId:string,actor:GameFlowsActor) {
  const sessionResult=await getPool().query<any>(`
    SELECT session.id,session.case_id AS "caseId",session.class_id AS "classId",session.teacher_id AS "teacherId",session.state,
      session.director_message AS "directorMessage",session.started_at AS "startedAt",session.created_at AS "createdAt",
      game.title AS "caseTitle",classroom.name AS "className"
    FROM gameflows_sessions session JOIN gameflows_cases game ON game.id=session.case_id JOIN metalab_classes classroom ON classroom.id=session.class_id
    WHERE session.id=$1 AND ($2::uuid IS NULL OR session.teacher_id=$2 OR classroom.responsible_teacher_id=$2)
  `,[sessionId,actorScope(actor)]);
  const session=sessionResult.rows[0];if(!session)return null;
  const [participants,events,gates,pendingVerdicts]=await Promise.all([
    getPool().query<any>(`
      SELECT participant.student_id AS "studentId",student.full_name AS "fullName",participant.ready_at AS "readyAt",
        participant.last_seen_at AS "lastSeenAt",participant.connection_state='online' AND participant.last_seen_at>NOW()-INTERVAL '25 seconds' AS connected,
        COALESCE((SELECT SUM(xp.xp)::int FROM gameflows_xp_events xp WHERE xp.session_id=participant.session_id AND xp.student_id=participant.student_id),0) AS "totalXp",
        (SELECT gate.position FROM gameflows_gate_progress progress JOIN gameflows_gates gate ON gate.id=progress.gate_id WHERE progress.session_id=participant.session_id AND progress.student_id=participant.student_id AND progress.state IN ('available','in_progress','pending_review') ORDER BY gate.position LIMIT 1) AS "currentGatePosition",
        (SELECT COUNT(*)::int FROM gameflows_gate_progress progress WHERE progress.session_id=participant.session_id AND progress.student_id=participant.student_id AND progress.state='completed') AS "completedGates",
        (SELECT COUNT(*)::int FROM gameflows_collective_contributions contribution JOIN gameflows_gates gate ON gate.id=contribution.gate_id WHERE contribution.session_id=participant.session_id AND contribution.student_id=participant.student_id) AS "collectiveContributions"
      FROM gameflows_participants participant JOIN metalab_students student ON student.id=participant.student_id
      WHERE participant.session_id=$1 ORDER BY participant.frozen_position NULLS LAST,student.full_name
    `,[sessionId]),
    getPool().query(`SELECT id,event_type AS type,details,created_at AS "createdAt",actor_teacher_id AS "teacherId",actor_student_id AS "studentId" FROM gameflows_session_events WHERE session_id=$1 ORDER BY created_at DESC LIMIT 100`,[sessionId]),
    getPool().query(`SELECT id,position,gate_type AS type,title,hint_text AS hint FROM gameflows_gates WHERE case_id=$1 ORDER BY position`,[session.caseId]),
    getPool().query<any>(`SELECT attempt.id,attempt.student_id AS "studentId",student.full_name AS "studentName",attempt.gate_id AS "gateId",gate.title AS "gateTitle",attempt.answer,gate.max_xp AS "maximumXp",attempt.created_at AS "submittedAt" FROM gameflows_attempts attempt JOIN gameflows_gates gate ON gate.id=attempt.gate_id JOIN metalab_students student ON student.id=attempt.student_id WHERE attempt.session_id=$1 AND attempt.result_state='pending_review' ORDER BY attempt.created_at`,[sessionId])
  ]);
  return {...session,participants:participants.rows,events:events.rows,gates:gates.rows,pendingVerdicts:pendingVerdicts.rows};
}

async function completeSessionIfRosterFinished(client:PoolClient,sessionId:string,actorTeacherId:string) {
  const finalGate=await client.query<{id:string}>(`SELECT gate.id FROM gameflows_sessions session JOIN gameflows_gates gate ON gate.case_id=session.case_id WHERE session.id=$1 ORDER BY gate.position DESC LIMIT 1`,[sessionId]);
  if(!finalGate.rows[0])return false;
  const completed=await client.query<{total:string|number;finished:string|number}>(`
    SELECT COUNT(participant.student_id)::int AS total,
      COUNT(progress.student_id) FILTER(WHERE progress.state='completed')::int AS finished
    FROM gameflows_participants participant LEFT JOIN gameflows_gate_progress progress
      ON progress.session_id=participant.session_id AND progress.student_id=participant.student_id AND progress.gate_id=$2
    WHERE participant.session_id=$1
  `,[sessionId,finalGate.rows[0].id]);
  if(Number(completed.rows[0]?.total||0)>0&&Number(completed.rows[0]?.total)===Number(completed.rows[0]?.finished)){
    await client.query(`UPDATE gameflows_sessions SET state='completed',ended_at=NOW(),updated_at=NOW() WHERE id=$1 AND state='running'`,[sessionId]);
    await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'session_completed',$3::jsonb)`,[sessionId,actorTeacherId,JSON.stringify({finalGateId:finalGate.rows[0].id})]);
    return true;
  }
  return false;
}

async function unlockNextGate(client:PoolClient,sessionId:string,studentId:string,gateId:string) {
  const next=await client.query<{id:string}>(`
    SELECT later.id FROM gameflows_gates current_gate JOIN gameflows_gates later ON later.case_id=current_gate.case_id AND later.position=current_gate.position+1
    JOIN gameflows_sessions session ON session.case_id=current_gate.case_id
    WHERE session.id=$1 AND current_gate.id=$2
  `,[sessionId,gateId]);
  if(next.rows[0])await client.query(`UPDATE gameflows_gate_progress SET state='available',updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3 AND state='locked'`,[sessionId,studentId,next.rows[0].id]);
}

async function unlockGateEvidence(client:PoolClient,sessionId:string,studentId:string,gateId:string) {
  await client.query(`INSERT INTO gameflows_student_evidence(session_id,student_id,evidence_id)
    SELECT $1,$2,evidence.id FROM gameflows_evidence evidence WHERE evidence.gate_id=$3
    ON CONFLICT DO NOTHING`,[sessionId,studentId,gateId]);
}

async function awardGateXp(client:PoolClient,sessionId:string,studentId:string,gateId:string,gateType:GameFlowGateType,maxXp:number,noHint:boolean,collective:boolean) {
  const desired=[{type:'gate_correct',xp:100},{type:'no_hint',xp:noHint?20:0},{type:'collaboration',xp:collective?40:0}].filter(item=>item.xp>0);
  let remaining=maxXp,total=0;
  for(const item of desired){
    const amount=Math.min(item.xp,remaining);remaining-=amount;total+=amount;
    await client.query(`INSERT INTO gameflows_xp_events(session_id,student_id,gate_id,source_key,event_type,xp,details) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING`,[sessionId,studentId,gateId,String(gateId),item.type,amount,JSON.stringify({gateType})]);
  }
  await client.query(`UPDATE gameflows_gate_progress SET points_awarded=LEAST($4,points_awarded+$5),state='completed',completed_at=COALESCE(completed_at,NOW()),updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[sessionId,studentId,gateId,maxXp,total]);
  await client.query(`
    INSERT INTO gameflows_student_evidence(session_id,student_id,evidence_id)
    SELECT $1,$2,evidence.id FROM gameflows_evidence evidence
    JOIN gameflows_gates gate ON gate.id=evidence.gate_id
    WHERE gate.id=$3 ON CONFLICT DO NOTHING
  `,[sessionId,studentId,gateId]);
  const badge:Record<string,string>={scene_exploration:'Olho de Águia',cipher:'Decifrador',forensic_crossword:'Analista de Evidências',deduction:'Investigador Lógico',phishing_analysis:'Especialista em Segurança',verdict:'Mestre da Investigação'};
  if(badge[gateType])await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[sessionId,studentId,badge[gateType].toLowerCase().replace(/[^a-z0-9]+/gu,'_'),badge[gateType]]);
}

export async function submitGameFlowAttempt(input:{sessionId:string;gateId:string;idempotencyKey:string;mode?:'answer'|'contribute'|'solve';answer:unknown},studentId:string) {
  return transaction(async client=>{
    const sessionResult=await client.query<{state:SessionState;teacher_id:string;case_id:string}>(`SELECT state,teacher_id,case_id FROM gameflows_sessions WHERE id=$1 FOR UPDATE`,[input.sessionId]);
    const session=sessionResult.rows[0];if(!session)return noOp('not-found');
    const participant=await client.query('SELECT 1 FROM gameflows_participants WHERE session_id=$1 AND student_id=$2 FOR UPDATE',[input.sessionId,studentId]);
    if(!participant.rowCount)return noOp('not-participant');
    const duplicate=await client.query<any>(`SELECT id,result_state AS result,awarded_xp AS xp FROM gameflows_attempts WHERE session_id=$1 AND student_id=$2 AND gate_id=$3 AND idempotency_key=$4`,[input.sessionId,studentId,input.gateId,input.idempotencyKey]);
    if(duplicate.rows[0])return {kind:'duplicate' as const,attempt:duplicate.rows[0]};
    if(session.state!=='running')return noOp(session.state==='paused'?'paused':'not-running');
    const selected=await client.query<any>(`
      SELECT gate.*,progress.state AS progress_state,progress.hint_revealed_at
      FROM gameflows_gates gate JOIN gameflows_gate_progress progress ON progress.gate_id=gate.id AND progress.session_id=$1 AND progress.student_id=$2
      WHERE gate.id=$3 AND gate.case_id=$4 FOR UPDATE OF progress
    `,[input.sessionId,studentId,input.gateId,session.case_id]);
    const gate=selected.rows[0];if(!gate)return noOp('gate-not-found');
    if(!['available','in_progress'].includes(gate.progress_state))return noOp('gate-locked');
    const recent=await client.query<{count:number|string}>(`SELECT COUNT(*)::int AS count FROM gameflows_attempts WHERE session_id=$1 AND student_id=$2 AND gate_id=$3 AND created_at>NOW()-INTERVAL '1 minute'`,[input.sessionId,studentId,input.gateId]);
    if(Number(recent.rows[0]?.count||0)>=15)return noOp('rate-limited');
    const type=gate.gate_type as GameFlowGateType,expected=Array.isArray(gate.private_payload?.answers)?gate.private_payload.answers:[];
    const mode=input.mode||'answer';
    const attemptId=randomUUID();
    if(type==='collective_fragments'){
      const owns=await client.query<{fragments:string[]}>(`SELECT fragments FROM gameflows_fragments WHERE session_id=$1 AND student_id=$2 AND gate_id=$3 FOR UPDATE`,[input.sessionId,studentId,input.gateId]);
      const fragments=owns.rows[0]?.fragments||[];
      if(mode==='contribute'){
        const contribution=typeof input.answer==='object'&&input.answer&&'contribution'in input.answer?String((input.answer as any).contribution):'';
        if(!fragments.some(fragment=>normalizeComparable(fragment)===normalizeComparable(contribution)))return noOp('fragment-mismatch');
        const hash=createHash('sha256').update(normalizeComparable(contribution)).digest('hex');
        await client.query(`INSERT INTO gameflows_collective_contributions(session_id,student_id,gate_id,contribution_hash) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,student_id,gate_id) DO UPDATE SET contribution_hash=EXCLUDED.contribution_hash,contributed_at=NOW()`,[input.sessionId,studentId,input.gateId,hash]);
        await client.query(`UPDATE gameflows_gate_progress SET state='in_progress',updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[input.sessionId,studentId,input.gateId]);
        await client.query(`INSERT INTO gameflows_attempts(id,session_id,student_id,gate_id,idempotency_key,answer,result_state) VALUES($1,$2,$3,$4,$5,'{}'::jsonb,'correct')`,[attemptId,input.sessionId,studentId,input.gateId,input.idempotencyKey]);
        await client.query(`INSERT INTO gameflows_session_events(session_id,actor_student_id,event_type,details) VALUES($1,$2,'gate_attempt',$3::jsonb)`,[input.sessionId,studentId,JSON.stringify({gateId:input.gateId,mode:'contribute'})]);
        const counts=await client.query<{total:number|string;contributed:number|string}>(`SELECT (SELECT COUNT(*) FROM gameflows_participants WHERE session_id=$1)::int AS total,(SELECT COUNT(*) FROM gameflows_collective_contributions WHERE session_id=$1 AND gate_id=$2)::int AS contributed`,[input.sessionId,input.gateId]);
        return {kind:'contributed' as const,contributed:Number(counts.rows[0]?.contributed||0),total:Number(counts.rows[0]?.total||0)};
      }
      if(mode!=='solve')return noOp('invalid-mode');
      const counts=await client.query<{total:number|string;contributed:number|string}>(`SELECT (SELECT COUNT(*) FROM gameflows_participants WHERE session_id=$1)::int AS total,(SELECT COUNT(*) FROM gameflows_collective_contributions WHERE session_id=$1 AND gate_id=$2)::int AS contributed`,[input.sessionId,input.gateId]);
      const total=Number(counts.rows[0]?.total||0),contributed=Number(counts.rows[0]?.contributed||0);
      if(!total||contributed!==total)return {kind:'waiting-contributions' as const,contributed,total};
      const submitted=typeof input.answer==='object'&&input.answer&&'solution'in input.answer?(input.answer as any).solution:input.answer;
      const result=evaluateGameFlowAnswer(type,expected,submitted);
      await client.query(`INSERT INTO gameflows_attempts(id,session_id,student_id,gate_id,idempotency_key,answer,result_state) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)`,[attemptId,input.sessionId,studentId,input.gateId,input.idempotencyKey,JSON.stringify({submitted}),result]);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_student_id,event_type,details) VALUES($1,$2,'gate_attempt',$3::jsonb)`,[input.sessionId,studentId,JSON.stringify({gateId:input.gateId,mode:'solve',result})]);
      if(result==='correct'){
        const roster=await client.query<{student_id:string}>(`SELECT student_id FROM gameflows_participants WHERE session_id=$1 ORDER BY student_id FOR UPDATE`,[input.sessionId]);
        for(const person of roster.rows){
          const ownProgress=await client.query<{hint_revealed_at:Date|null}>(`SELECT hint_revealed_at FROM gameflows_gate_progress WHERE session_id=$1 AND student_id=$2 AND gate_id=$3 FOR UPDATE`,[input.sessionId,person.student_id,input.gateId]);
          await awardGateXp(client,input.sessionId,person.student_id,input.gateId,type,Number(gate.max_xp),!ownProgress.rows[0]?.hint_revealed_at,true);
          await unlockNextGate(client,input.sessionId,person.student_id,input.gateId);
        }
        await client.query(`UPDATE gameflows_attempts SET awarded_xp=$2 WHERE id=$1`,[attemptId,Math.min(40,Number(gate.max_xp))]);
        await client.query(`INSERT INTO gameflows_session_events(session_id,actor_student_id,event_type,details) VALUES($1,$2,'gate_completed',$3::jsonb)`,[input.sessionId,studentId,JSON.stringify({gateId:input.gateId,collective:true,participants:roster.rows.length})]);
        await completeSessionIfRosterFinished(client,input.sessionId,session.teacher_id);
        return {kind:'correct' as const,xpAwarded:Math.min(160,Number(gate.max_xp)),explanation:gate.explanation,collectiveCompleted:true};
      }
      return {kind:'incorrect' as const,xpAwarded:0,explanation:null,collectiveCompleted:false};
    }
    if(mode!=='answer')return noOp('invalid-mode');
    const verdict=type==='verdict';
    const evaluation=verdict?'pending_review':evaluateGameFlowAnswer(type,expected,input.answer);
    const xp=evaluation==='correct'?Math.min(Number(gate.max_xp),100+(!gate.hint_revealed_at?20:0)):0;
    await client.query(`INSERT INTO gameflows_attempts(id,session_id,student_id,gate_id,idempotency_key,answer,result_state,awarded_xp) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,[attemptId,input.sessionId,studentId,input.gateId,input.idempotencyKey,JSON.stringify(input.answer),evaluation,xp]);
    await client.query(`INSERT INTO gameflows_session_events(session_id,actor_student_id,event_type,details) VALUES($1,$2,'gate_attempt',$3::jsonb)`,[input.sessionId,studentId,JSON.stringify({gateId:input.gateId,result:evaluation})]);
    if(evaluation==='correct'){
      if(xp>0)await client.query(`INSERT INTO gameflows_xp_events(session_id,student_id,gate_id,source_key,event_type,xp,details) VALUES($1,$2,$3,$4,'gate_correct',$5,$6::jsonb) ON CONFLICT DO NOTHING`,[input.sessionId,studentId,input.gateId,String(input.gateId),Math.min(100,xp),JSON.stringify({gateType:type})]);
      if(xp>100)await client.query(`INSERT INTO gameflows_xp_events(session_id,student_id,gate_id,source_key,event_type,xp,details) VALUES($1,$2,$3,$4,'no_hint',$5,'{}'::jsonb) ON CONFLICT DO NOTHING`,[input.sessionId,studentId,input.gateId,String(input.gateId),xp-100]);
      await client.query(`UPDATE gameflows_gate_progress SET state='completed',completed_at=NOW(),points_awarded=$4,updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[input.sessionId,studentId,input.gateId,xp]);
      await unlockGateEvidence(client,input.sessionId,studentId,input.gateId);
      await unlockNextGate(client,input.sessionId,studentId,input.gateId);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_student_id,event_type,details) VALUES($1,$2,'gate_completed',$3::jsonb)`,[input.sessionId,studentId,JSON.stringify({gateId:input.gateId})]);
      if(type==='scene_exploration')await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,'olho_de_aguia','Olho de Águia') ON CONFLICT DO NOTHING`,[input.sessionId,studentId]);
      if(type==='cipher')await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,'decifrador','Decifrador') ON CONFLICT DO NOTHING`,[input.sessionId,studentId]);
      if(type==='forensic_crossword')await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,'analista_de_evidencias','Analista de Evidências') ON CONFLICT DO NOTHING`,[input.sessionId,studentId]);
      if(type==='phishing_analysis')await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,'especialista_em_seguranca','Especialista em Segurança') ON CONFLICT DO NOTHING`,[input.sessionId,studentId]);
      if(type==='deduction')await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,'investigador_logico','Investigador Lógico') ON CONFLICT DO NOTHING`,[input.sessionId,studentId]);
      await completeSessionIfRosterFinished(client,input.sessionId,session.teacher_id);
      return {kind:'correct' as const,xpAwarded:xp,explanation:gate.explanation};
    }
    if(verdict){
      await client.query(`UPDATE gameflows_gate_progress SET state='pending_review',updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[input.sessionId,studentId,input.gateId]);
      return {kind:'pending-review' as const,xpAwarded:0};
    }
    await client.query(`UPDATE gameflows_gate_progress SET state='in_progress',updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[input.sessionId,studentId,input.gateId]);
    return {kind:'incorrect' as const,xpAwarded:0,explanation:null};
  });
}

function normalizeComparable(value:string){return value.normalize('NFKD').replace(/[\u0300-\u036f]/gu,'').toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/gu,' ');}

export async function operateGameFlowSession(sessionId:string,actor:GameFlowsActor,action:SessionAction,data:{message?:string;gateId?:string;fromStudentId?:string;toStudentId?:string;endReason?:string}) {
  if(action==='start')return startGameFlowSession(sessionId,actor);
  return transaction(async client=>{
    const result=await client.query<{id:string;case_id:string;class_id:string;state:SessionState;teacher_id:string}>(`SELECT session.id,session.case_id,session.class_id,session.state,session.teacher_id FROM gameflows_sessions session JOIN metalab_classes classroom ON classroom.id=session.class_id WHERE session.id=$1 AND ($2::uuid IS NULL OR session.teacher_id=$2 OR classroom.responsible_teacher_id=$2) FOR UPDATE OF session`,[sessionId,actorScope(actor)]);
    const session=result.rows[0];if(!session)return noOp('not-found');
    const next=action==='pause'?nextGameFlowSessionState(session.state,'pause'):action==='resume'?nextGameFlowSessionState(session.state,'resume'):action==='end'?nextGameFlowSessionState(session.state,'end'):action==='cancel'?nextGameFlowSessionState(session.state,'cancel'):null;
    if(action==='pause'||action==='resume'||action==='end'||action==='cancel'){
      if(!next)return noOp('invalid-state');
      const event=action==='pause'?'session_paused':action==='resume'?'session_resumed':action==='cancel'?'session_cancelled':'session_ended';
      await client.query(`UPDATE gameflows_sessions SET state=$2,paused_at=CASE WHEN $2='paused' THEN NOW() ELSE NULL END,ended_at=CASE WHEN $2 IN ('ended','cancelled') THEN NOW() ELSE ended_at END,ended_by=CASE WHEN $2 IN ('ended','cancelled') THEN $3 ELSE ended_by END,end_reason=CASE WHEN $2 IN ('ended','cancelled') THEN $4 ELSE end_reason END,updated_at=NOW() WHERE id=$1`,[sessionId,next,actor.id,data.endReason?.trim().slice(0,1000)||(action==='cancel'?'Cancelada pelo professor.':'Encerrado pelo professor.')]);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,$3,$4::jsonb)`,[sessionId,actor.id,event,JSON.stringify({reason:data.endReason?.trim().slice(0,1000)||''})]);
      return {kind:action==='end'?'ended' as const:'updated' as const,state:next};
    }
    if(action==='announce'){
      if(!['waiting','running','paused'].includes(session.state))return noOp('invalid-state');
      const message=(data.message||'').trim();if(message.length<2||message.length>1000)return noOp('invalid-message');
      await client.query('UPDATE gameflows_sessions SET director_message=$2,updated_at=NOW() WHERE id=$1',[sessionId,message]);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'announcement',$3::jsonb)`,[sessionId,actor.id,JSON.stringify({message})]);
      return {kind:'announced' as const};
    }
    if(action==='hint'){
      if(!['running','paused'].includes(session.state)||!data.gateId)return noOp('invalid-state');
      const gate=await client.query(`SELECT id FROM gameflows_gates WHERE id=$1 AND case_id=$2`,[data.gateId,session.case_id]);if(!gate.rowCount)return noOp('gate-not-found');
      await client.query(`UPDATE gameflows_gate_progress SET hint_revealed_at=COALESCE(hint_revealed_at,NOW()),updated_at=NOW() WHERE session_id=$1 AND gate_id=$2 AND state IN ('available','in_progress')`,[sessionId,data.gateId]);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'hint_released',$3::jsonb)`,[sessionId,actor.id,JSON.stringify({gateId:data.gateId})]);
      return {kind:'hint-released' as const};
    }
    if(action==='redistribute'){
      if(!['running','paused'].includes(session.state)||!data.gateId||!data.fromStudentId)return noOp('invalid-state');
      const source=await client.query<any>(`SELECT participant.student_id,participant.last_seen_at,fragments.fragments FROM gameflows_participants participant JOIN gameflows_fragments fragments USING(session_id,student_id) WHERE participant.session_id=$1 AND participant.student_id=$2 AND fragments.gate_id=$3 FOR UPDATE OF participant,fragments`,[sessionId,data.fromStudentId,data.gateId]);
      const absent=source.rows[0];if(!absent||Date.now()-new Date(absent.last_seen_at).getTime()<25000)return noOp('participant-online');
      const contribution=await client.query('SELECT 1 FROM gameflows_collective_contributions WHERE session_id=$1 AND student_id=$2 AND gate_id=$3',[sessionId,data.fromStudentId,data.gateId]);
      const completed=await client.query(`SELECT 1 FROM gameflows_gate_progress WHERE session_id=$1 AND student_id=$2 AND gate_id=$3 AND state='completed'`,[sessionId,data.fromStudentId,data.gateId]);
      if(contribution.rowCount||completed.rowCount)return noOp('progress-preserved');
      const targetId=data.toStudentId;
      const target=targetId?await client.query<any>(`SELECT participant.student_id,fragments.fragments FROM gameflows_participants participant JOIN gameflows_fragments fragments USING(session_id,student_id) WHERE participant.session_id=$1 AND participant.student_id=$2 AND fragments.gate_id=$3 AND participant.last_seen_at>NOW()-INTERVAL '25 seconds' FOR UPDATE OF participant,fragments`,[sessionId,targetId,data.gateId]):await client.query<any>(`SELECT participant.student_id,fragments.fragments FROM gameflows_participants participant JOIN gameflows_fragments fragments USING(session_id,student_id) WHERE participant.session_id=$1 AND participant.student_id<>$2 AND fragments.gate_id=$3 AND participant.last_seen_at>NOW()-INTERVAL '25 seconds' ORDER BY participant.frozen_position LIMIT 1 FOR UPDATE OF participant,fragments`,[sessionId,data.fromStudentId,data.gateId]);
      if(!target.rows[0])return noOp('no-online-recipient');
      const sourcePieces=Array.isArray(absent.fragments)?absent.fragments:[],targetPieces=Array.isArray(target.rows[0].fragments)?target.rows[0].fragments:[];
      if(!sourcePieces.length||sourcePieces.length+targetPieces.length>100)return noOp('invalid-fragments');
      await client.query(`UPDATE gameflows_fragments SET fragments=$4::jsonb,redistributed_at=NOW(),redistribution_version=redistribution_version+1,updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[sessionId,data.fromStudentId,data.gateId,'[]']);
      await client.query(`UPDATE gameflows_fragments SET fragments=$4::jsonb,redistributed_at=NOW(),redistribution_version=redistribution_version+1,updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[sessionId,target.rows[0].student_id,data.gateId,JSON.stringify([...targetPieces,...sourcePieces])]);
      await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'fragment_redistributed',$3::jsonb)`,[sessionId,actor.id,JSON.stringify({gateId:data.gateId,fromStudentId:data.fromStudentId,toStudentId:target.rows[0].student_id,count:sourcePieces.length})]);
      return {kind:'redistributed' as const,toStudentId:target.rows[0].student_id,fragmentCount:sourcePieces.length};
    }
    return noOp('invalid-action');
  });
}

export async function reviewGameFlowVerdict(input:{sessionId:string;attemptId:string;score:number;note:string},actor:GameFlowsActor){
  return transaction(async client=>{
    const found=await client.query<any>(`SELECT attempt.*,session.case_id,session.teacher_id,session.state,gate.max_xp,gate.gate_type FROM gameflows_attempts attempt JOIN gameflows_sessions session ON session.id=attempt.session_id JOIN metalab_classes classroom ON classroom.id=session.class_id JOIN gameflows_gates gate ON gate.id=attempt.gate_id WHERE attempt.id=$1 AND attempt.session_id=$2 AND attempt.result_state='pending_review' AND ($3::uuid IS NULL OR session.teacher_id=$3 OR classroom.responsible_teacher_id=$3) FOR UPDATE OF session,attempt`,[input.attemptId,input.sessionId,actorScope(actor)]);
    const attempt=found.rows[0];if(!attempt)return noOp('not-found');
    if(attempt.state!=='running'&&attempt.state!=='paused')return noOp('invalid-state');
    if(input.score<0||input.score>Number(attempt.max_xp))return noOp('invalid-score');
    const earned=Math.round(input.score);
    await client.query(`UPDATE gameflows_attempts SET result_state=$2,awarded_xp=$3,reviewed_by=$4,reviewed_at=NOW(),review_note=$5 WHERE id=$1`,[input.attemptId,earned?'correct':'incorrect',earned,actor.id,input.note.trim().slice(0,1000)]);
    await client.query(`UPDATE gameflows_gate_progress SET state='completed',points_awarded=$4,completed_at=NOW(),updated_at=NOW() WHERE session_id=$1 AND student_id=$2 AND gate_id=$3`,[attempt.session_id,attempt.student_id,attempt.gate_id,earned]);
    if(earned)await client.query(`INSERT INTO gameflows_xp_events(session_id,student_id,gate_id,source_key,event_type,xp,details) VALUES($1,$2,$3,$4,'teacher_review',$5,$6::jsonb) ON CONFLICT DO NOTHING`,[attempt.session_id,attempt.student_id,attempt.gate_id,String(attempt.gate_id),earned,JSON.stringify({reviewNote:input.note.trim().slice(0,1000)})]);
    if(attempt.gate_type==='verdict'&&earned>0&&earned>=Math.ceil(Number(attempt.max_xp)*0.75))await client.query(`INSERT INTO gameflows_achievements(session_id,student_id,achievement_key,title) VALUES($1,$2,'mestre_da_investigacao','Mestre da Investigação') ON CONFLICT DO NOTHING`,[attempt.session_id,attempt.student_id]);
    await unlockNextGate(client,attempt.session_id,attempt.student_id,attempt.gate_id);
    await unlockGateEvidence(client,attempt.session_id,attempt.student_id,attempt.gate_id);
    await client.query(`INSERT INTO gameflows_session_events(session_id,actor_teacher_id,event_type,details) VALUES($1,$2,'verdict_reviewed',$3::jsonb)`,[attempt.session_id,actor.id,JSON.stringify({attemptId:input.attemptId,studentId:attempt.student_id,awardedXp:earned})]);
    await completeSessionIfRosterFinished(client,attempt.session_id,attempt.teacher_id);
    return {kind:'reviewed' as const,studentId:attempt.student_id,awardedXp:earned};
  });
}

export async function getGameFlowRanking(caseId:string,classId:string,actor:GameFlowsActor){
  const result=await getPool().query(`
    SELECT participant.student_id AS "studentId",student.full_name AS "fullName",session.id AS "sessionId",
      session.state AS "sessionState",
      COALESCE((SELECT SUM(xp.xp)::int FROM gameflows_xp_events xp WHERE xp.session_id=session.id AND xp.student_id=participant.student_id),0) AS "totalXp",
      (SELECT COUNT(*)::int FROM gameflows_gate_progress progress WHERE progress.session_id=session.id AND progress.student_id=participant.student_id AND progress.state='completed') AS "completedGates",
      (SELECT COUNT(*)::int FROM gameflows_achievements achievement WHERE achievement.session_id=session.id AND achievement.student_id=participant.student_id) AS "achievementCount"
    FROM gameflows_sessions session JOIN gameflows_participants participant ON participant.session_id=session.id
    JOIN metalab_students student ON student.id=participant.student_id
    JOIN metalab_classes classroom ON classroom.id=session.class_id
    WHERE session.case_id=$1 AND session.class_id=$2 AND ($3::uuid IS NULL OR classroom.responsible_teacher_id=$3)
    ORDER BY "totalXp" DESC,"completedGates" DESC,student.full_name ASC
    LIMIT 500
  `,[caseId,classId,actorScope(actor)]);
  return result.rows;
}

export async function getStudentGameFlowRanking(sessionId:string,studentId:string){
  const result=await getPool().query(`
    SELECT participant.student_id AS "studentId",student.full_name AS "fullName",
      COALESCE((SELECT SUM(xp.xp)::int FROM gameflows_xp_events xp WHERE xp.session_id=participant.session_id AND xp.student_id=participant.student_id),0) AS "totalXp",
      (SELECT COUNT(*)::int FROM gameflows_gate_progress progress WHERE progress.session_id=participant.session_id AND progress.student_id=participant.student_id AND progress.state='completed') AS "completedGates"
    FROM gameflows_participants viewer JOIN gameflows_participants participant ON participant.session_id=viewer.session_id
    JOIN metalab_students student ON student.id=participant.student_id
    WHERE viewer.session_id=$1 AND viewer.student_id=$2
    ORDER BY "totalXp" DESC,"completedGates" DESC,student.full_name ASC
    LIMIT 200
  `,[sessionId,studentId]);
  return result.rows;
}
