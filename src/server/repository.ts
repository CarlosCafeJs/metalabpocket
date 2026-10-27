import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { getPool, transaction } from '@/server/db';
import { createSessionMaterial, hashSessionToken, isSessionToken } from '@/server/session';

export type StudentSummary = {
  id: string;
  displayName: string;
  createdAt: string;
  photoSharingConsent: boolean;
};

export type TeacherStudentSummary = {
  id: string;
  fullName: string;
  email: string;
  birthDate: string;
  createdAt: string;
  businessName: string | null;
  businessSegment?: string | null;
  businessDescription?: string | null;
  mainOffering?: string | null;
  targetAudience?: string | null;
  differentiator?: string | null;
  completedMissions: number;
  totalMissions: number;
  photoCount: number;
  lastActivity: string;
  classId: string | null;
  className: string | null;
};

export type TeacherClass = { id: string; name: string; joinCode: string; studentCount: number };
export type StudentClass = { id: string; name: string; joinCode: string };
export type InstalabComment = { id: string; studentId: string | null; authorName: string; authorRole: 'student' | 'teacher'; body: string; createdAt: string };
export type InstalabPost = {
  id: string; studentId: string; authorName: string; businessName: string; classId: string; className?: string; body: string;
  imageName: string | null; imageMimeType: string | null; imageSizeBytes: number | null;
  createdAt: string; likeCount: number; likedByMe: boolean; isMine: boolean; comments: InstalabComment[];
};

export type StudentPhotoSummary = {
  id: string;
  fileName: string;
  product: string;
  angle: number;
  height: number;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

export type StudentDeliverySummary = {
  id: string;
  activityName: string;
  description: string;
  classDate: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  quickMissionId?: string | null;
  quickMissionTitle?: string | null;
};

export type StudentDeliveryFile = StudentDeliverySummary & { fileData: Buffer };

export type BusinessInput = {
  name: string;
  segment: string;
  description: string;
  mainOffering: string;
  targetAudience: string;
  differentiator: string;
  primaryColor: string;
};

export type BusinessRecord = BusinessInput & {
  id: string;
  updatedAt: string;
};

export type MissionStatus = 'in_progress' | 'completed';

export type MissionAttempt = {
  missionId: string;
  status: MissionStatus;
  answer: unknown;
  evidence: Record<string, string | number | boolean>;
  feedback: string;
  attemptCount: number;
  updatedAt: string;
  completedAt: string | null;
};

type StudentRow = {
  id: string;
  full_name: string;
  created_at: Date | string;
  photo_sharing_consent: boolean;
};

type BusinessRow = {
  id: string;
  name: string;
  segment: string;
  description: string;
  main_offering: string;
  target_audience: string;
  differentiator: string;
  primary_color: string;
  updated_at: Date | string;
};

type MissionRow = {
  mission_id: string;
  status: MissionStatus;
  answer: unknown;
  evidence: Record<string, string | number | boolean>;
  feedback: string;
  attempt_count: number;
  updated_at: Date | string;
  completed_at: Date | string | null;
};

type DeliveryRow = {
  id: string; activity_name: string; description: string; class_date: Date | string;
  file_name: string; mime_type: string; size_bytes: number; file_data?: Buffer; created_at: Date | string;
  quick_mission_id?: string | null; quick_mission_title?: string | null;
};

export type QuickMission = {
  id: string; title: string; description: string; request: string; estimatedMinutes: number;
  dueAt: string | null; isActive: boolean; createdAt: string; submissionCount?: number; isExpired?: boolean;
};

export type ClassroomTaskType = 'text' | 'short_answer' | 'multiple_choice' | 'checkboxes' | 'dropdown' | 'linear_scale' | 'date' | 'complete';
export type ClassroomTask = { id: string; prompt: string; description: string; type: ClassroomTaskType; required: boolean; settings: Record<string, unknown>; options: Array<{ value: string; label: string }>; position: number; isPublished: boolean; submissionCount?: number; submissions?: Array<{ id: string; studentId: string; studentName?: string; answer: unknown; submittedAt: string }> };
export type ClassroomMission = { id: string; moduleId: string; title: string; objective: string; description: string; position: number; isPublished: boolean; tasks: ClassroomTask[] };
export type ClassroomModule = { id: string; title: string; description: string; position: number; isPublished: boolean; missions: ClassroomMission[] };

export type QuickModule = { id: string; title: string; description: string; position: number; isPublished: boolean; missions: Array<QuickMission & { submitted?: boolean }> };

type QuickMissionRow = { id: string; title: string; description: string; request: string; estimated_minutes: number; due_at: Date | string | null; is_active: boolean; created_at: Date | string; submission_count?: number | string };
const mapQuickMission = (row: QuickMissionRow): QuickMission => ({
  id: row.id, title: row.title, description: row.description, request: row.request,
  estimatedMinutes: row.estimated_minutes, dueAt: row.due_at ? toIso(row.due_at) : null,
  isActive: row.is_active, createdAt: toIso(row.created_at),
  ...(row.submission_count === undefined ? {} : { submissionCount: Number(row.submission_count) })
});

const toIso = (value: Date | string) => value instanceof Date ? value.toISOString() : new Date(value).toISOString();
const displayName = (fullName: string) => fullName.trim().split(/\s+/u)[0] || 'estudante';

function mapStudent(row: StudentRow): StudentSummary {
  return {
    id: row.id,
    displayName: displayName(row.full_name),
    createdAt: toIso(row.created_at),
    photoSharingConsent: row.photo_sharing_consent === true
  };
}

function mapBusiness(row: BusinessRow): BusinessRecord {
  return {
    id: row.id,
    name: row.name,
    segment: row.segment,
    description: row.description,
    mainOffering: row.main_offering,
    targetAudience: row.target_audience,
    differentiator: row.differentiator,
    primaryColor: row.primary_color,
    updatedAt: toIso(row.updated_at)
  };
}

function mapMission(row: MissionRow): MissionAttempt {
  return {
    missionId: row.mission_id,
    status: row.status,
    answer: row.answer,
    evidence: row.evidence || {},
    feedback: row.feedback,
    attemptCount: row.attempt_count,
    updatedAt: toIso(row.updated_at),
    completedAt: row.completed_at ? toIso(row.completed_at) : null
  };
}

function mapDelivery(row: DeliveryRow): StudentDeliverySummary {
  return { id: row.id, activityName: row.activity_name, description: row.description,
    classDate: String(row.class_date).slice(0, 10), fileName: row.file_name,
    mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: toIso(row.created_at),
    quickMissionId: row.quick_mission_id ?? null, quickMissionTitle: row.quick_mission_title ?? null };
}

export async function createStudentDelivery(input: {
  studentId: string; activityName: string; description: string; classDate: string; quickMissionId?: string | null;
  fileName: string; mimeType: string; fileData: Buffer;
}) {
  const result = await getPool().query<DeliveryRow>(`
    INSERT INTO metalab_student_deliveries
      (id, student_id, activity_name, description, class_date, file_name, mime_type, size_bytes, file_data, quick_mission_id)
    SELECT $1,$2,COALESCE(mission.title,$3),$4,$5,$6,$7,$8,$9,$10
    FROM (SELECT 1) seed
    LEFT JOIN metalab_quick_missions mission ON mission.id = $10::uuid
    LEFT JOIN metalab_quick_modules module ON module.id=mission.module_id AND module.is_published=TRUE
    WHERE $10::uuid IS NULL OR (mission.id IS NOT NULL AND module.id IS NOT NULL)
    RETURNING id, activity_name, description, class_date, file_name, mime_type, size_bytes, created_at, quick_mission_id
  `, [randomUUID(), input.studentId, input.activityName, input.description, input.classDate,
    input.fileName, input.mimeType, input.fileData.byteLength, input.fileData, input.quickMissionId ?? null]);
  if (!result.rows[0]) throw new Error('QUICK_MISSION_UNAVAILABLE');
  return mapDelivery(result.rows[0]);
}

export async function listStudentDeliveries(studentId: string) {
  const result = await getPool().query<DeliveryRow>(`
    SELECT delivery.id, delivery.activity_name, delivery.description, delivery.class_date, delivery.file_name, delivery.mime_type, delivery.size_bytes, delivery.created_at,
           delivery.quick_mission_id, mission.title AS quick_mission_title
    FROM metalab_student_deliveries delivery
    LEFT JOIN metalab_quick_missions mission ON mission.id = delivery.quick_mission_id
    WHERE delivery.student_id = $1 ORDER BY delivery.created_at DESC
  `, [studentId]);
  return result.rows.map(mapDelivery);
}

export async function listQuickMissionsForStudent(studentId: string): Promise<QuickModule[]> {
  const result = await getPool().query<any>(`
    SELECT module.id module_id,module.title module_title,module.description module_description,module.position module_position,
      mission.id,mission.title,mission.description,mission.request,mission.estimated_minutes,mission.due_at,
      mission.is_active,mission.created_at,
      (mission.due_at IS NOT NULL AND mission.due_at <= NOW()) AS is_expired,
      EXISTS (SELECT 1 FROM metalab_student_deliveries delivery WHERE delivery.quick_mission_id = mission.id AND delivery.student_id = $1) AS submitted
    FROM metalab_quick_modules module
    JOIN metalab_quick_missions mission ON mission.module_id=module.id
    WHERE module.is_published = TRUE
    ORDER BY module.position,mission.created_at DESC
  `, [studentId]);
  const modules = new Map<string, QuickModule>();
  for (const row of result.rows) {
    let module = modules.get(row.module_id);
    if (!module) {
      module = { id: row.module_id, title: row.module_title, description: row.module_description, position: row.module_position, isPublished: true, missions: [] };
      modules.set(module.id, module);
    }
    module.missions.push({ ...mapQuickMission(row), isExpired: row.is_expired, submitted: row.submitted });
  }
  return [...modules.values()];
}

export async function listQuickModulesForTeacher(): Promise<QuickModule[]> {
  const result = await getPool().query<any>(`
    SELECT module.id module_id,module.title module_title,module.description module_description,module.position module_position,module.is_published,
      mission.id,mission.title,mission.description,mission.request,mission.estimated_minutes,mission.due_at,mission.is_active,mission.created_at,
      (SELECT COUNT(*) FROM metalab_student_deliveries delivery WHERE delivery.quick_mission_id=mission.id)::int submission_count
    FROM metalab_quick_modules module LEFT JOIN metalab_quick_missions mission ON mission.module_id=module.id
    ORDER BY module.position,module.created_at,mission.created_at DESC
  `);
  const modules = new Map<string, QuickModule>();
  for (const row of result.rows) {
    let module = modules.get(row.module_id);
    if (!module) {
      module = { id: row.module_id, title: row.module_title, description: row.module_description, position: row.module_position, isPublished: row.is_published, missions: [] };
      modules.set(module.id, module);
    }
    if (row.id) module.missions.push(mapQuickMission(row));
  }
  return [...modules.values()];
}

export async function createQuickModule(input: { title: string; description: string }) {
  const id = randomUUID();
  await getPool().query(`INSERT INTO metalab_quick_modules (id,title,description,position) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(position),0)+1 FROM metalab_quick_modules))`, [id,input.title,input.description]);
  return id;
}

export async function setQuickModulePublished(id: string, published: boolean) {
  const result = await getPool().query(`UPDATE metalab_quick_modules SET is_published=$2,updated_at=NOW() WHERE id=$1 RETURNING id`, [id,published]);
  return Boolean(result.rowCount);
}

export async function createQuickMission(input: { moduleId: string; title: string; description: string; request: string; estimatedMinutes: number; dueAt: string | null }) {
  const result = await getPool().query<QuickMissionRow>(`
    INSERT INTO metalab_quick_missions (id,module_id,title,description,request,estimated_minutes,due_at,is_active)
    SELECT $1,module.id,$3,$4,$5,$6,$7,FALSE FROM metalab_quick_modules module WHERE module.id=$2
    RETURNING id,title,description,request,estimated_minutes,due_at,is_active,created_at
  `, [randomUUID(),input.moduleId,input.title,input.description,input.request,input.estimatedMinutes,input.dueAt]);
  return result.rows[0] ? mapQuickMission(result.rows[0]) : null;
}

export async function listClassroomForTeacher(): Promise<ClassroomModule[]> {
  const pool = getPool();
  const [modules, missions, tasks, submissions] = await Promise.all([
    pool.query<any>('SELECT id,title,description,position,is_published FROM metalab_teacher_modules ORDER BY position,created_at'),
    pool.query<any>('SELECT id,module_id,title,objective,description,position,is_published FROM metalab_teacher_missions ORDER BY position,created_at'),
    pool.query<any>(`SELECT id,mission_id,prompt,description,task_type,options,settings,is_required,position,is_published FROM metalab_teacher_tasks ORDER BY position,created_at`),
    pool.query<any>(`SELECT answer.task_id, COUNT(answer.id)::int AS count FROM metalab_teacher_task_submissions answer GROUP BY answer.task_id`)
  ]);
  const counts = new Map(submissions.rows.map((row: any) => [row.task_id, row.count]));
  const taskMap = new Map<string, ClassroomTask[]>();
  for (const row of tasks.rows) {
    const list = taskMap.get(row.mission_id) || [];
    list.push({ id: row.id, prompt: row.prompt, description: row.description || '', type: row.task_type, required: row.is_required !== false, settings: row.settings || {}, options: row.options || [], position: row.position, isPublished: row.is_published, submissionCount: Number(counts.get(row.id) || 0) });
    taskMap.set(row.mission_id, list);
  }
  const missionMap = new Map<string, ClassroomMission[]>();
  for (const row of missions.rows) {
    const list = missionMap.get(row.module_id) || [];
    list.push({ id: row.id, moduleId: row.module_id, title: row.title, objective: row.objective, description: row.description, position: row.position, isPublished: row.is_published, tasks: taskMap.get(row.id) || [] });
    missionMap.set(row.module_id, list);
  }
  return modules.rows.map((row: any) => ({ id: row.id, title: row.title, description: row.description, position: row.position, isPublished: row.is_published, missions: missionMap.get(row.id) || [] }));
}

export async function listClassroomForStudent(studentId: string): Promise<ClassroomModule[]> {
  const result = await getPool().query<any>(`
    SELECT module.id module_id,module.title module_title,module.description module_description,module.position module_position,
      mission.id mission_id,mission.title mission_title,mission.objective mission_objective,mission.description mission_description,mission.position mission_position,
      task.id task_id,task.prompt task_prompt,task.description task_description,task.task_type,task.options,task.settings task_settings,task.is_required task_required,task.position task_position,
      submission.id submission_id,submission.answer,submission.submitted_at
    FROM metalab_teacher_modules module
    LEFT JOIN metalab_teacher_missions mission ON mission.module_id=module.id
    LEFT JOIN metalab_teacher_tasks task ON task.mission_id=mission.id
    LEFT JOIN LATERAL (SELECT id,answer,submitted_at FROM metalab_teacher_task_submissions WHERE task_id=task.id AND student_id=$1 ORDER BY submitted_at DESC LIMIT 1) submission ON TRUE
    WHERE module.is_published=TRUE ORDER BY module.position,mission.position,task.position
  `, [studentId]);
  const modules = new Map<string, ClassroomModule>();
  for (const row of result.rows) {
    let module = modules.get(row.module_id);
    if (!module) { module = { id: row.module_id, title: row.module_title, description: row.module_description, position: row.module_position, isPublished: true, missions: [] }; modules.set(row.module_id, module); }
    if (row.mission_id) {
      let mission = module.missions.find(item => item.id === row.mission_id);
      if (!mission) { mission = { id: row.mission_id, moduleId: row.module_id, title: row.mission_title, objective: row.mission_objective, description: row.mission_description, position: row.mission_position, isPublished: true, tasks: [] }; module.missions.push(mission); }
      if (row.task_id) mission.tasks.push({ id: row.task_id, prompt: row.task_prompt, description: row.task_description || '', type: row.task_type, required: row.task_required !== false, settings: row.task_settings || {}, options: row.options || [], position: row.task_position, isPublished: true, ...(row.submission_id ? { submissions: [{ id: row.submission_id, studentId, answer: row.answer, submittedAt: toIso(row.submitted_at) }] } : {}) });
    }
  }
  return [...modules.values()];
}

export async function createClassroomModule(input: { title: string; description: string }) {
  const id = randomUUID();
  await getPool().query(`INSERT INTO metalab_teacher_modules (id,title,description,position) VALUES ($1,$2,$3,(SELECT COALESCE(MAX(position),0)+1 FROM metalab_teacher_modules))`, [id,input.title,input.description]);
  return id;
}
export async function createClassroomMission(input: { moduleId: string; title: string; objective: string; description: string }) {
  const id = randomUUID();
  await getPool().query(`INSERT INTO metalab_teacher_missions (id,module_id,title,objective,description,position) SELECT $1,$2,$3,$4,$5,COALESCE(MAX(position),0)+1 FROM metalab_teacher_missions WHERE module_id=$2`, [id,input.moduleId,input.title,input.objective,input.description]);
  return id;
}
export async function createClassroomTask(input: { missionId: string; prompt: string; description: string; type: ClassroomTaskType; required: boolean; settings: Record<string, unknown>; options: Array<{ value: string; label: string }> }) {
  const id = randomUUID();
  await getPool().query(`INSERT INTO metalab_teacher_tasks (id,mission_id,prompt,description,task_type,options,settings,is_required,position,is_published) SELECT $1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,COALESCE(MAX(position),0)+1,TRUE FROM metalab_teacher_tasks WHERE mission_id=$2`, [id,input.missionId,input.prompt,input.description,input.type,JSON.stringify(input.options),JSON.stringify(input.settings),input.required]);
  return id;
}
export async function setClassroomPublished(kind: 'module', id: string, published: boolean) {
  if (kind !== 'module') return false;
  const result = await getPool().query(`UPDATE metalab_teacher_modules SET is_published=$2,updated_at=NOW() WHERE id=$1 RETURNING id`, [id,published]);
  return Boolean(result.rowCount);
}
export async function submitClassroomTask(input: { studentId: string; taskId: string; answer: unknown }) {
  const result = await getPool().query<{ id: string; submitted_at: Date | string }>(`
    INSERT INTO metalab_teacher_task_submissions (id,student_id,task_id,answer)
    SELECT $1,$2,task.id,$4::jsonb FROM metalab_teacher_tasks task
      JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
      JOIN metalab_teacher_modules module ON module.id=mission.module_id AND module.is_published=TRUE
    WHERE task.id=$3
    RETURNING id,submitted_at
  `, [randomUUID(),input.studentId,input.taskId,JSON.stringify(input.answer)]);
  return result.rows[0] ? { id: result.rows[0].id, submittedAt: toIso(result.rows[0].submitted_at) } : null;
}

export async function getPublishedClassroomMissionTasks(missionId:string) {
  const result=await getPool().query<any>(`
    SELECT task.id,task.prompt,task.description,task.task_type,task.options,task.settings,task.is_required
    FROM metalab_teacher_tasks task JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
    JOIN metalab_teacher_modules module ON module.id=mission.module_id AND module.is_published=TRUE
    WHERE mission.id=$1 ORDER BY task.position,task.created_at
  `,[missionId]);
  return result.rows.map(row=>({id:row.id,prompt:row.prompt,description:row.description,type:row.task_type as ClassroomTaskType,options:row.options as Array<{value:string;label:string}>,settings:row.settings||{},required:row.is_required!==false}));
}

export async function submitClassroomMissionResponse(input:{studentId:string;missionId:string;answers:Array<{taskId:string;answer:unknown}>}) {
  const responseId=randomUUID();
  return transaction(async client=>{
    const inserted:string[]=[];
    for(const item of input.answers){
      const result=await client.query<{id:string;submitted_at:Date|string}>(`
        INSERT INTO metalab_teacher_task_submissions (id,response_id,student_id,task_id,answer)
        SELECT $1,$2,$3,task.id,$5::jsonb FROM metalab_teacher_tasks task
        JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
        JOIN metalab_teacher_modules module ON module.id=mission.module_id AND module.is_published=TRUE
        WHERE task.id=$4 AND mission.id=$6
          AND NOT EXISTS(SELECT 1 FROM metalab_teacher_task_submissions old WHERE old.task_id=task.id AND old.student_id=$3)
        RETURNING id,submitted_at
      `,[randomUUID(),responseId,input.studentId,item.taskId,JSON.stringify(item.answer),input.missionId]);
      if(result.rows[0])inserted.push(result.rows[0].id);
    }
    if(!inserted.length)return null;
    const time=await client.query<{submitted_at:Date|string}>(`SELECT submitted_at FROM metalab_teacher_task_submissions WHERE id=$1`,[inserted[0]]);
    return {responseId,submissionCount:inserted.length,submittedAt:toIso(time.rows[0].submitted_at)};
  });
}

export async function getPublishedClassroomTask(taskId: string) {
  const result = await getPool().query<any>(`
    SELECT task.id,task.task_type,task.options,task.is_required,task.settings FROM metalab_teacher_tasks task
    JOIN metalab_teacher_missions mission ON mission.id=task.mission_id
    JOIN metalab_teacher_modules module ON module.id=mission.module_id AND module.is_published=TRUE
    WHERE task.id=$1
  `, [taskId]);
  const row = result.rows[0];
  return row ? { id: row.id, type: row.task_type as ClassroomTaskType, required: row.is_required !== false, settings: row.settings || {}, options: row.options as Array<{ value: string; label: string }> } : null;
}
export async function listTeacherClassroomSubmissionsForStudent(studentId: string) {
  const result = await getPool().query<any>(`
    SELECT submission.id,submission.answer,submission.submitted_at,task.prompt,task.task_type,mission.title mission_title,module.title module_title
    FROM metalab_teacher_task_submissions submission JOIN metalab_teacher_tasks task ON task.id=submission.task_id
    JOIN metalab_teacher_missions mission ON mission.id=task.mission_id JOIN metalab_teacher_modules module ON module.id=mission.module_id
    WHERE submission.student_id=$1 ORDER BY submission.submitted_at DESC
  `, [studentId]);
  return result.rows.map(row => ({ id: row.id, answer: row.answer, submittedAt: toIso(row.submitted_at), prompt: row.prompt, type: row.task_type, missionTitle: row.mission_title, moduleTitle: row.module_title }));
}
export async function getTeacherClassroomProgress(studentId: string) {
  const result = await getPool().query<{ completed: number | string; total: number | string }>(`
    SELECT
      (SELECT COUNT(DISTINCT submission.task_id) FROM metalab_teacher_task_submissions submission JOIN metalab_teacher_tasks task ON task.id=submission.task_id JOIN metalab_teacher_missions mission ON mission.id=task.mission_id JOIN metalab_teacher_modules module ON module.id=mission.module_id WHERE submission.student_id=$1 AND module.is_published) AS completed,
      (SELECT COUNT(*) FROM metalab_teacher_tasks task JOIN metalab_teacher_missions mission ON mission.id=task.mission_id JOIN metalab_teacher_modules module ON module.id=mission.module_id WHERE module.is_published) AS total
  `,[studentId]);
  return { completed:Number(result.rows[0]?.completed||0), total:Number(result.rows[0]?.total||0) };
}

export async function getStudentDelivery(studentId: string, deliveryId: string): Promise<StudentDeliveryFile | null> {
  const result = await getPool().query<DeliveryRow>(`
    SELECT id, activity_name, description, class_date, file_name, mime_type, size_bytes, file_data, created_at
    FROM metalab_student_deliveries WHERE student_id = $1 AND id = $2
  `, [studentId, deliveryId]);
  return result.rows[0] ? { ...mapDelivery(result.rows[0]), fileData: result.rows[0].file_data! } : null;
}

export async function getTeacherDelivery(deliveryId: string): Promise<StudentDeliveryFile | null> {
  const result = await getPool().query<DeliveryRow>(`
    SELECT id, activity_name, description, class_date, file_name, mime_type, size_bytes, file_data, created_at
    FROM metalab_student_deliveries WHERE id = $1
  `, [deliveryId]);
  return result.rows[0] ? { ...mapDelivery(result.rows[0]), fileData: result.rows[0].file_data! } : null;
}

export async function createOrResumeStudentWithSession(input: {
  name: string;
  email: string;
  birthDate: string;
  privacyNoticeVersion: string;
  photoSharingConsent: boolean;
}) {
  const session = createSessionMaterial();

  const result = await transaction(async client => {
    // Serialize retries for the same normalized email and birth date, preventing duplicate records.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${input.email}:${input.birthDate}`]);
    const match = await client.query<StudentRow>(`
      SELECT student.id, student.full_name, student.created_at, student.photo_sharing_consent
      FROM metalab_students student
      WHERE LOWER(student.email) = $1 AND student.birth_date = $2::date
        AND student.archived_at IS NULL
      ORDER BY
        (SELECT COUNT(*) FROM metalab_mission_progress progress
         WHERE progress.student_id = student.id AND progress.status = 'completed') DESC,
        (SELECT MAX(progress.updated_at) FROM metalab_mission_progress progress
         WHERE progress.student_id = student.id) DESC NULLS LAST,
        student.created_at ASC
      LIMIT 1
    `, [input.email, input.birthDate]);

    let student: StudentSummary;
    let resumed = Boolean(match.rows[0]);
    if (match.rows[0]) {
      const updated = await client.query<StudentRow>(`
        UPDATE metalab_students SET photo_sharing_consent = TRUE,
          photo_sharing_consent_at = COALESCE(photo_sharing_consent_at, NOW()), updated_at = NOW()
        WHERE id = $1
        RETURNING id, full_name, created_at, photo_sharing_consent
      `, [match.rows[0].id]);
      student = mapStudent(updated.rows[0]);
    } else {
      const archived = await client.query(`
        SELECT 1 FROM metalab_students
        WHERE LOWER(email) = $1 AND birth_date = $2::date AND archived_at IS NOT NULL
        LIMIT 1
      `, [input.email, input.birthDate]);
      if (archived.rowCount) throw new Error('STUDENT_ARCHIVED');

      const studentId = randomUUID();
      const created = await client.query<StudentRow>(`
        INSERT INTO metalab_students
          (id, full_name, email, birth_date, privacy_notice_version, photo_sharing_consent, photo_sharing_consent_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END, NOW())
        RETURNING id, full_name, created_at, photo_sharing_consent
      `, [studentId, input.name, input.email, input.birthDate, input.privacyNoticeVersion, input.photoSharingConsent]);
      student = mapStudent(created.rows[0]);
      resumed = false;
    }

    await client.query(`
      INSERT INTO metalab_student_sessions
        (id, student_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [session.id, student.id, session.tokenHash, session.expiresAt]);

    return { student, resumed };
  });

  return { ...result, token: session.token };
}

// Backward compatibility for any dev-server module graph still holding the previous export name.
export const createStudentWithSession = createOrResumeStudentWithSession;

export async function findStudentBySessionToken(token: string) {
  if (!isSessionToken(token)) return null;
  const tokenHash = hashSessionToken(token);
  const result = await getPool().query<StudentRow>(`
    WITH active_session AS (
      UPDATE metalab_student_sessions
      SET last_seen_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      RETURNING student_id
    )
    SELECT student.id, student.full_name, student.created_at, student.photo_sharing_consent
    FROM active_session session
    JOIN metalab_students student ON student.id = session.student_id
    WHERE student.archived_at IS NULL
  `, [tokenHash]);
  return result.rows[0] ? mapStudent(result.rows[0]) : null;
}

/** Authenticates a student only when they belong to an active classroom. */
export async function findEnrolledStudentBySessionToken(token: string) {
  const student = await findStudentBySessionToken(token);
  if (!student) return null;
  const membership = await getPool().query(`
    SELECT 1
    FROM metalab_student_class_assignments assignment
    JOIN metalab_classes classroom ON classroom.id = assignment.class_id
    WHERE assignment.student_id = $1
    LIMIT 1
  `, [student.id]);
  return membership.rowCount ? student : null;
}

export async function revokeSession(token: string) {
  if (!isSessionToken(token)) return;
  await getPool().query(`
    UPDATE metalab_student_sessions
    SET revoked_at = COALESCE(revoked_at, NOW())
    WHERE token_hash = $1
  `, [hashSessionToken(token)]);
}

export async function setStudentPhotoSharingConsent(studentId: string, _consent: boolean) {
  const result = await getPool().query<{ photo_sharing_consent: boolean }>(`
    UPDATE metalab_students
    SET photo_sharing_consent = TRUE,
        photo_sharing_consent_at = COALESCE(photo_sharing_consent_at, NOW()),
        updated_at = NOW()
    WHERE id = $1
    RETURNING photo_sharing_consent
  `, [studentId]);
  return result.rows[0]?.photo_sharing_consent === true;
}

export async function listTeacherStudents(totalMissions: number, archived = false): Promise<TeacherStudentSummary[]> {
  const result = await getPool().query<{
    id: string;
    full_name: string;
    email: string;
    birth_date: Date | string;
    created_at: Date | string;
    business_name: string | null;
    business_segment: string | null;
    business_description: string | null;
    class_id: string | null;
    class_name: string | null;
    main_offering: string | null;
    target_audience: string | null;
    differentiator: string | null;
    classroom_completed: number | string;
    classroom_total: number | string;
    completed_missions: number | string;
    photo_count: number | string;
    last_activity: Date | string;
  }>(`
    SELECT student.id, student.full_name, student.email, student.birth_date, student.created_at,
           business.name AS business_name, business.segment AS business_segment,
           business.description AS business_description, business.main_offering, business.target_audience, business.differentiator,
           class_row.id AS class_id, class_row.name AS class_name,
           COUNT(DISTINCT progress.mission_id) FILTER (WHERE progress.status = 'completed') AS completed_missions,
           COUNT(DISTINCT photo.id) AS photo_count,
           (SELECT COUNT(DISTINCT submission.task_id) FROM metalab_teacher_task_submissions submission JOIN metalab_teacher_tasks task ON task.id=submission.task_id JOIN metalab_teacher_missions mission ON mission.id=task.mission_id JOIN metalab_teacher_modules module ON module.id=mission.module_id WHERE submission.student_id=student.id AND module.is_published) AS classroom_completed,
           (SELECT COUNT(*) FROM metalab_teacher_tasks task JOIN metalab_teacher_missions mission ON mission.id=task.mission_id JOIN metalab_teacher_modules module ON module.id=mission.module_id WHERE module.is_published) AS classroom_total,
           GREATEST(student.created_at, COALESCE(MAX(progress.updated_at), student.created_at),
             COALESCE(MAX(photo.created_at), student.created_at),
             COALESCE((SELECT MAX(delivery.created_at) FROM metalab_student_deliveries delivery WHERE delivery.student_id = student.id), student.created_at),
             COALESCE((SELECT MAX(answer.submitted_at) FROM metalab_teacher_task_submissions answer WHERE answer.student_id = student.id), student.created_at)) AS last_activity
    FROM metalab_students student
    LEFT JOIN metalab_businesses business ON business.student_id = student.id
    LEFT JOIN metalab_student_class_assignments assignment ON assignment.student_id=student.id
    LEFT JOIN metalab_classes class_row ON class_row.id=assignment.class_id
    LEFT JOIN metalab_mission_progress progress ON progress.student_id = student.id
    LEFT JOIN metalab_student_photos photo ON photo.student_id = student.id
    WHERE student.archived_at IS ${archived ? 'NOT ' : ''}NULL
    GROUP BY student.id, business.name, business.segment, business.description, business.main_offering, business.target_audience, business.differentiator, class_row.id, class_row.name
    ORDER BY last_activity DESC, student.full_name ASC
  `);
  return result.rows.map(row => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    birthDate: row.birth_date instanceof Date ? row.birth_date.toISOString().slice(0, 10) : String(row.birth_date).slice(0, 10),
    createdAt: toIso(row.created_at),
    businessName: row.business_name,
    businessSegment: row.business_segment,
    businessDescription: row.business_description,
    mainOffering: row.main_offering,
    targetAudience: row.target_audience,
    differentiator: row.differentiator,
    completedMissions: Number(row.completed_missions) + Number(row.classroom_completed),
    totalMissions: totalMissions + Number(row.classroom_total),
    photoCount: Number(row.photo_count),
    lastActivity: toIso(row.last_activity)
    ,classId: row.class_id,
    className: row.class_name
  }));
}

export async function listTeacherClasses(): Promise<TeacherClass[]> {
  const result = await getPool().query<{ id:string; name:string; join_code:string; student_count:number|string }>(`
    SELECT class.id,class.name,class.join_code,COUNT(student.id)::int AS student_count
    FROM metalab_classes class
    LEFT JOIN metalab_student_class_assignments assignment ON assignment.class_id=class.id
    LEFT JOIN metalab_students student ON student.id=assignment.student_id AND student.archived_at IS NULL
    GROUP BY class.id,class.name,class.join_code ORDER BY class.name
  `);
  return result.rows.map(row=>({id:row.id,name:row.name,joinCode:row.join_code,studentCount:Number(row.student_count)}));
}

export async function createTeacherClass(name:string) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(randomBytes(8), byte => alphabet[byte & 31]).join('');
  const result=await getPool().query<{id:string;join_code:string}>(`INSERT INTO metalab_classes (id,name,join_code) VALUES ($1,$2,$3) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id,join_code`,[randomUUID(),name,code]);
  return result.rows[0] ? { id: result.rows[0].id, joinCode: result.rows[0].join_code } : null;
}

export async function assignStudentToClass(studentId:string,classId:string|null) {
  if(classId===null){await getPool().query(`DELETE FROM metalab_student_class_assignments WHERE student_id=$1`,[studentId]);return true;}
  const result=await getPool().query(`INSERT INTO metalab_student_class_assignments (student_id,class_id) SELECT $1,$2 WHERE EXISTS(SELECT 1 FROM metalab_students WHERE id=$1 AND archived_at IS NULL) AND EXISTS(SELECT 1 FROM metalab_classes WHERE id=$2) ON CONFLICT(student_id) DO UPDATE SET class_id=EXCLUDED.class_id,assigned_at=NOW() RETURNING student_id`,[studentId,classId]);
  return Boolean(result.rowCount);
}

export async function getStudentClass(studentId: string): Promise<StudentClass | null> {
  const result = await getPool().query<{ id: string; name: string; join_code: string }>(`
    SELECT class.id, class.name, class.join_code
    FROM metalab_student_class_assignments assignment
    JOIN metalab_classes class ON class.id = assignment.class_id
    WHERE assignment.student_id = $1
  `, [studentId]);
  const row = result.rows[0];
  return row ? { id: row.id, name: row.name, joinCode: row.join_code } : null;
}

export async function listStudentClassmates(studentId: string) {
  const result = await getPool().query<{ id: string; full_name: string; business_name: string | null }>(`
    SELECT student.id, student.full_name, business.name AS business_name
    FROM metalab_student_class_assignments own_assignment
    JOIN metalab_student_class_assignments class_assignment ON class_assignment.class_id = own_assignment.class_id
    JOIN metalab_students student ON student.id = class_assignment.student_id AND student.archived_at IS NULL
    LEFT JOIN metalab_businesses business ON business.student_id = student.id
    WHERE own_assignment.student_id = $1
    ORDER BY student.full_name ASC
  `, [studentId]);
  return result.rows.map(row => ({ id: row.id, fullName: row.full_name, businessName: row.business_name }));
}

export async function joinStudentClassByCode(studentId: string, joinCode: string): Promise<StudentClass | null> {
  return transaction(async client => {
    const result = await client.query<{ id: string; name: string; join_code: string }>(`
      SELECT id, name, join_code FROM metalab_classes WHERE join_code = $1 FOR SHARE
    `, [joinCode.trim().toUpperCase()]);
    const row = result.rows[0];
    if (!row) return null;
    await client.query(`
      INSERT INTO metalab_student_class_assignments (student_id, class_id)
      VALUES ($1, $2)
      ON CONFLICT (student_id) DO UPDATE SET class_id = EXCLUDED.class_id, assigned_at = NOW()
    `, [studentId, row.id]);
    return { id: row.id, name: row.name, joinCode: row.join_code };
  });
}

export async function getStudentBusinessAndClass(studentId: string) {
  const result = await getPool().query<{ class_id: string | null; class_name: string | null; business_id: string | null; business_name: string | null }>(`
    SELECT class.id AS class_id, class.name AS class_name, business.id AS business_id, business.name AS business_name
    FROM (SELECT $1::uuid AS student_id) current_student
    LEFT JOIN metalab_student_class_assignments assignment ON assignment.student_id = current_student.student_id
    LEFT JOIN metalab_classes class ON class.id = assignment.class_id
    LEFT JOIN metalab_businesses business ON business.student_id = current_student.student_id
  `, [studentId]);
  const row = result.rows[0];
  return row ? { classId: row.class_id, className: row.class_name, businessId: row.business_id, businessName: row.business_name } : null;
}

async function listInstalabPosts(studentId: string, authorOnly = false, teacherView = false): Promise<InstalabPost[]> {
  const result = await getPool().query<{
    id: string; student_id: string; class_id: string; author_name: string; business_name: string; class_name: string; body: string;
    image_name: string | null; image_mime_type: string | null; image_size_bytes: number | null;
    created_at: Date | string; like_count: number | string; liked_by_me: boolean; comments: InstalabComment[] | null;
  }>(`
    SELECT post.id, post.student_id, post.class_id, student.full_name AS author_name, business.name AS business_name, class.name AS class_name,
      post.body, post.image_name, post.image_mime_type, post.image_size_bytes, post.created_at,
      (SELECT COUNT(*) FROM metalab_instalab_likes likes WHERE likes.post_id = post.id) AS like_count,
      CASE WHEN $3::boolean
        THEN EXISTS (SELECT 1 FROM metalab_instalab_likes mine WHERE mine.post_id = post.id AND mine.teacher_like = TRUE)
        ELSE EXISTS (SELECT 1 FROM metalab_instalab_likes mine WHERE mine.post_id = post.id AND mine.student_id = $1)
      END AS liked_by_me,
      COALESCE((
        SELECT json_agg(comment_row ORDER BY comment_row."createdAt" ASC)
        FROM (
          SELECT comment.id, comment.student_id AS "studentId", COALESCE(comment.author_name, commenter.full_name) AS "authorName",
            comment.author_role AS "authorRole", comment.body, comment.created_at AS "createdAt"
          FROM metalab_instalab_comments comment
          LEFT JOIN metalab_students commenter ON commenter.id = comment.student_id
          WHERE comment.post_id = post.id ORDER BY comment.created_at DESC LIMIT 30
        ) comment_row
      ), '[]'::json) AS comments
    FROM metalab_instalab_posts post
    JOIN metalab_students student ON student.id = post.student_id
      AND ($3::boolean = TRUE OR student.archived_at IS NULL)
    JOIN metalab_businesses business ON business.id = post.business_id
    JOIN metalab_classes class ON class.id = post.class_id
    WHERE ($3::boolean = TRUE OR post.class_id = (SELECT assignment.class_id FROM metalab_student_class_assignments assignment WHERE assignment.student_id = $1))
      AND ($2::boolean = FALSE OR post.student_id = $1)
    ORDER BY post.created_at DESC LIMIT CASE WHEN $3::boolean THEN NULL::integer ELSE 100 END
  `, [studentId, authorOnly, teacherView]);
  return result.rows.map(row => ({
    id: row.id, studentId: row.student_id, classId: row.class_id, authorName: row.author_name, businessName: row.business_name, className: row.class_name,
    body: row.body, imageName: row.image_name, imageMimeType: row.image_mime_type,
    imageSizeBytes: row.image_size_bytes === null ? null : Number(row.image_size_bytes),
    createdAt: toIso(row.created_at), likeCount: Number(row.like_count), likedByMe: row.liked_by_me,
    isMine: row.student_id === studentId, comments: row.comments ?? []
  }));
}

export async function listStudentInstalabPosts(studentId: string) { return listInstalabPosts(studentId); }
export async function listTeacherInstalabPostsForStudent(studentId: string) { return listInstalabPosts(studentId, true, true); }
export async function listTeacherInstalabPosts() { return listInstalabPosts('00000000-0000-0000-0000-000000000000', false, true); }

export async function createInstalabPost(input: { studentId: string; body: string; imageName: string | null; imageMimeType: string | null; imageData: Buffer | null }) {
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO metalab_instalab_posts
      (id, class_id, student_id, business_id, body, image_name, image_mime_type, image_size_bytes, image_data)
    SELECT $1, assignment.class_id, student.id, business.id, $2, $3, $4, $5, $6
    FROM metalab_students student
    JOIN metalab_student_class_assignments assignment ON assignment.student_id = student.id
    JOIN metalab_businesses business ON business.student_id = student.id
    WHERE student.id = $7 AND student.archived_at IS NULL
    RETURNING id
  `, [randomUUID(), input.body, input.imageName, input.imageMimeType, input.imageData?.byteLength ?? null, input.imageData, input.studentId]);
  return result.rows[0]?.id ?? null;
}

export async function getStudentInstalabImage(postId: string, studentId: string, teacher = false) {
  const result = await getPool().query<{ image_data: Buffer; image_mime_type: string; image_name: string }>(`
    SELECT post.image_data, post.image_mime_type, post.image_name
    FROM metalab_instalab_posts post
    WHERE post.id = $1 AND post.image_data IS NOT NULL
      AND ($3::boolean = TRUE OR post.class_id = (SELECT assignment.class_id FROM metalab_student_class_assignments assignment WHERE assignment.student_id = $2))
      AND ($3::boolean = TRUE OR EXISTS (SELECT 1 FROM metalab_businesses WHERE student_id = $2))
  `, [postId, studentId, teacher]);
  return result.rows[0] ?? null;
}

export async function setInstalabLike(postId: string, studentId: string, liked: boolean) {
  if (liked) {
    await getPool().query(`
      INSERT INTO metalab_instalab_likes (post_id, student_id)
      SELECT post.id, $2 FROM metalab_instalab_posts post
      JOIN metalab_student_class_assignments assignment ON assignment.class_id = post.class_id AND assignment.student_id = $2
      JOIN metalab_businesses business ON business.student_id = $2
      WHERE post.id = $1
      ON CONFLICT (post_id, student_id) DO NOTHING
    `, [postId, studentId]);
  } else {
    await getPool().query(`
      DELETE FROM metalab_instalab_likes likes USING metalab_instalab_posts post
      WHERE likes.post_id = post.id AND likes.post_id = $1 AND likes.student_id = $2
        AND EXISTS (SELECT 1 FROM metalab_businesses WHERE student_id = $2)
        AND post.class_id = (SELECT assignment.class_id FROM metalab_student_class_assignments assignment WHERE assignment.student_id = $2)
    `, [postId, studentId]);
  }
  const result = await getPool().query<{ like_count: number | string; liked_by_me: boolean }>(`
    SELECT COUNT(likes.student_id) AS like_count, BOOL_OR(likes.student_id = $2) AS liked_by_me
    FROM metalab_instalab_posts post
    JOIN metalab_student_class_assignments assignment ON assignment.student_id = $2 AND assignment.class_id = post.class_id
    JOIN metalab_businesses business ON business.student_id = $2
    LEFT JOIN metalab_instalab_likes likes ON likes.post_id = post.id
    WHERE post.id = $1 GROUP BY post.id
  `, [postId, studentId]);
  return result.rows[0] ? { likeCount: Number(result.rows[0].like_count), likedByMe: result.rows[0].liked_by_me === true } : null;
}

export async function createInstalabComment(postId: string, studentId: string, body: string) {
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO metalab_instalab_comments (id, post_id, student_id, author_role, author_name, body)
    SELECT $1, post.id, student.id, 'student', student.full_name, $3 FROM metalab_instalab_posts post
    JOIN metalab_students student ON student.id = $2
    JOIN metalab_student_class_assignments assignment ON assignment.class_id = post.class_id AND assignment.student_id = $2
    JOIN metalab_businesses business ON business.student_id = $2
    WHERE post.id = $4
    RETURNING id
  `, [randomUUID(), studentId, body, postId]);
  return result.rows[0]?.id ?? null;
}

export async function deleteInstalabPost(postId: string, studentId: string) {
  const result = await getPool().query(`DELETE FROM metalab_instalab_posts WHERE id = $1 AND student_id = $2 RETURNING id`, [postId, studentId]);
  return Boolean(result.rowCount);
}

export async function updateInstalabPost(input: { postId: string; studentId: string; body: string; imageName: string | null; imageMimeType: string | null; imageData: Buffer | null; removeImage: boolean }) {
  const result = await getPool().query(`
    UPDATE metalab_instalab_posts post SET
      body = $3,
      image_name = CASE WHEN $7 THEN NULL WHEN $5::bytea IS NOT NULL THEN $4 ELSE post.image_name END,
      image_mime_type = CASE WHEN $7 THEN NULL WHEN $5::bytea IS NOT NULL THEN $6 ELSE post.image_mime_type END,
      image_size_bytes = CASE WHEN $7 THEN NULL WHEN $5::bytea IS NOT NULL THEN octet_length($5::bytea) ELSE post.image_size_bytes END,
      image_data = CASE WHEN $7 THEN NULL WHEN $5::bytea IS NOT NULL THEN $5 ELSE post.image_data END
    WHERE post.id = $1 AND post.student_id = $2
      AND EXISTS (SELECT 1 FROM metalab_student_class_assignments assignment WHERE assignment.student_id = post.student_id AND assignment.class_id = post.class_id)
      AND EXISTS (SELECT 1 FROM metalab_businesses WHERE student_id = post.student_id)
      AND (length(trim($3)) > 0 OR (CASE WHEN $7 THEN NULL::bytea WHEN $5::bytea IS NOT NULL THEN $5 ELSE post.image_data END) IS NOT NULL)
    RETURNING post.id
  `, [input.postId, input.studentId, input.body, input.imageName, input.imageData, input.imageMimeType, input.removeImage]);
  return Boolean(result.rowCount);
}

export async function updateTeacherInstalabPost(input: { postId: string; body: string; imageName: string | null; imageMimeType: string | null; imageData: Buffer | null; removeImage: boolean }) {
  const result = await getPool().query(`
    UPDATE metalab_instalab_posts post SET
      body = $2,
      image_name = CASE WHEN $6 THEN NULL WHEN $4::bytea IS NOT NULL THEN $3 ELSE post.image_name END,
      image_mime_type = CASE WHEN $6 THEN NULL WHEN $4::bytea IS NOT NULL THEN $5 ELSE post.image_mime_type END,
      image_size_bytes = CASE WHEN $6 THEN NULL WHEN $4::bytea IS NOT NULL THEN octet_length($4::bytea) ELSE post.image_size_bytes END,
      image_data = CASE WHEN $6 THEN NULL WHEN $4::bytea IS NOT NULL THEN $4 ELSE post.image_data END
    WHERE post.id = $1
      AND (length(trim($2)) > 0 OR (CASE WHEN $6 THEN NULL::bytea WHEN $4::bytea IS NOT NULL THEN $4 ELSE post.image_data END) IS NOT NULL)
    RETURNING post.id
  `, [input.postId, input.body, input.imageName, input.imageData, input.imageMimeType, input.removeImage]);
  return Boolean(result.rowCount);
}

export async function deleteTeacherInstalabPost(postId: string) {
  const result = await getPool().query('DELETE FROM metalab_instalab_posts WHERE id = $1 RETURNING id', [postId]);
  return Boolean(result.rowCount);
}

export async function createTeacherInstalabComment(postId: string, body: string) {
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO metalab_instalab_comments (id, post_id, student_id, author_role, author_name, body)
    SELECT $1, post.id, NULL, 'teacher', 'Professor', $3 FROM metalab_instalab_posts post WHERE post.id = $2
    RETURNING id
  `, [randomUUID(), postId, body]);
  return result.rows[0]?.id ?? null;
}

export async function deleteTeacherInstalabComment(commentId: string) {
  const result = await getPool().query('DELETE FROM metalab_instalab_comments WHERE id = $1 RETURNING id', [commentId]);
  return Boolean(result.rowCount);
}

export async function setTeacherInstalabLike(postId: string, liked: boolean) {
  const exists = await getPool().query<{ exists: boolean }>('SELECT EXISTS (SELECT 1 FROM metalab_instalab_posts WHERE id = $1) AS exists', [postId]);
  if (!exists.rows[0]?.exists) return null;
  if (liked) {
    await getPool().query(`INSERT INTO metalab_instalab_likes (post_id, student_id, teacher_like) SELECT id, NULL, TRUE FROM metalab_instalab_posts WHERE id = $1 ON CONFLICT DO NOTHING`, [postId]);
  } else {
    await getPool().query('DELETE FROM metalab_instalab_likes WHERE post_id = $1 AND teacher_like = TRUE', [postId]);
  }
  const result = await getPool().query<{ like_count: number | string }>('SELECT COUNT(*) AS like_count FROM metalab_instalab_likes WHERE post_id = $1', [postId]);
  return Number(result.rows[0]?.like_count ?? 0);
}

export async function saveStudentPhoto(input: {
  studentId: string;
  clientPhotoId: string;
  fileName: string;
  product: string;
  angle: number;
  height: number;
  mimeType: string;
  imageData: Buffer;
}) {
  return transaction(async client => {
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`student-photo:${input.studentId}`]);
    const result = await client.query<{ id: string }>(`
      INSERT INTO metalab_student_photos
        (id, student_id, client_photo_id, file_name, product, angle, height, mime_type, size_bytes, image_data)
      SELECT $1::uuid, $2::uuid, $3::varchar, $4::varchar, $5::varchar,
        $6::integer, $7::integer, $8::varchar, $9::integer, $10::bytea
      WHERE EXISTS (SELECT 1 FROM metalab_students WHERE id = $2)
        AND (EXISTS (SELECT 1 FROM metalab_student_photos WHERE student_id = $2 AND client_photo_id = $3::varchar)
          OR ((SELECT COUNT(*) FROM metalab_student_photos WHERE student_id = $2) < 10
            AND (SELECT COALESCE(SUM(size_bytes), 0) FROM metalab_student_photos WHERE student_id = $2) + $9 <= 52428800))
      ON CONFLICT (student_id, client_photo_id) DO UPDATE SET
        file_name = EXCLUDED.file_name,
        product = EXCLUDED.product,
        angle = EXCLUDED.angle,
        height = EXCLUDED.height,
        mime_type = EXCLUDED.mime_type,
        size_bytes = EXCLUDED.size_bytes,
        image_data = EXCLUDED.image_data
      RETURNING id
    `, [randomUUID(), input.studentId, input.clientPhotoId, input.fileName, input.product, input.angle, input.height,
      input.mimeType, input.imageData.byteLength, input.imageData]);
    return result.rows[0]?.id ?? null;
  });
}

export async function deleteStudentPhoto(studentId: string, clientPhotoId: string) {
  const result = await getPool().query(`
    DELETE FROM metalab_student_photos
    WHERE student_id = $1 AND client_photo_id = $2
    RETURNING id
  `, [studentId, clientPhotoId]);
  return Boolean(result.rowCount);
}

export async function getTeacherStudent(studentId: string) {
  const result = await getPool().query<{
    id: string; full_name: string; email: string; birth_date: Date | string;
    created_at: Date | string; photo_sharing_consent: boolean;
  }>(`
    SELECT id, full_name, email, birth_date, created_at, photo_sharing_consent
    FROM metalab_students WHERE id = $1 AND archived_at IS NULL
  `, [studentId]);
  const row = result.rows[0];
  return row ? {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    birthDate: row.birth_date instanceof Date
      ? row.birth_date.toISOString().slice(0, 10)
      : String(row.birth_date).slice(0, 10),
    createdAt: toIso(row.created_at),
    photoSharingConsent: row.photo_sharing_consent === true
  } : null;
}

export async function archiveTeacherStudent(studentId: string) {
  return transaction(async client => {
    const archived = await client.query(`
      UPDATE metalab_students
      SET archived_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND archived_at IS NULL
      RETURNING id
    `, [studentId]);
    if (!archived.rowCount) return false;

    await client.query(`
      UPDATE metalab_student_sessions
      SET revoked_at = COALESCE(revoked_at, NOW())
      WHERE student_id = $1 AND revoked_at IS NULL
    `, [studentId]);
    return true;
  });
}

export async function restoreTeacherStudent(studentId: string) {
  const restored = await getPool().query(`
    UPDATE metalab_students student
    SET archived_at = NULL, updated_at = NOW()
    WHERE student.id = $1 AND student.archived_at IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM metalab_students active
        WHERE active.id <> student.id AND active.archived_at IS NULL
          AND LOWER(active.email) = LOWER(student.email)
          AND active.birth_date = student.birth_date
      )
    RETURNING student.id
  `, [studentId]);
  return Boolean(restored.rowCount);
}

export async function listStudentPhotos(studentId: string): Promise<StudentPhotoSummary[]> {
  const result = await getPool().query<{
    id: string; file_name: string; product: string; angle: number; height: number;
    mime_type: string; size_bytes: number; created_at: Date | string;
  }>(`
    SELECT id, file_name, product, angle, height, mime_type, size_bytes, created_at
    FROM metalab_student_photos WHERE student_id = $1 ORDER BY created_at DESC
  `, [studentId]);
  return result.rows.map(row => ({
    id: row.id, fileName: row.file_name, product: row.product, angle: row.angle,
    height: row.height, mimeType: row.mime_type, sizeBytes: row.size_bytes, createdAt: toIso(row.created_at)
  }));
}

export async function getTeacherPhoto(photoId: string) {
  const result = await getPool().query<{ mime_type: string; file_name: string; image_data: Buffer }>(`
    SELECT mime_type, file_name, image_data FROM metalab_student_photos WHERE id = $1
  `, [photoId]);
  return result.rows[0] ?? null;
}

export async function getBusiness(studentId: string) {
  const result = await getPool().query<BusinessRow>(`
    SELECT id, name, segment, description, main_offering, target_audience,
           differentiator, primary_color, updated_at
    FROM metalab_businesses
    WHERE student_id = $1
  `, [studentId]);
  return result.rows[0] ? mapBusiness(result.rows[0]) : null;
}

export async function upsertBusiness(studentId: string, input: BusinessInput) {
  const result = await getPool().query<BusinessRow>(`
    INSERT INTO metalab_businesses
      (id, student_id, name, segment, description, main_offering,
       target_audience, differentiator, primary_color)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (student_id) DO UPDATE SET
      name = EXCLUDED.name,
      segment = EXCLUDED.segment,
      description = EXCLUDED.description,
      main_offering = EXCLUDED.main_offering,
      target_audience = EXCLUDED.target_audience,
      differentiator = EXCLUDED.differentiator,
      primary_color = EXCLUDED.primary_color,
      updated_at = NOW()
    RETURNING id, name, segment, description, main_offering, target_audience,
              differentiator, primary_color, updated_at
  `, [randomUUID(), studentId, input.name, input.segment, input.description,
    input.mainOffering, input.targetAudience, input.differentiator, input.primaryColor]);
  return mapBusiness(result.rows[0]);
}

export async function getMissionAttempts(studentId: string) {
  const result = await getPool().query<MissionRow>(`
    SELECT mission_id, status, answer, evidence, feedback, attempt_count,
           updated_at, completed_at
    FROM metalab_mission_progress
    WHERE student_id = $1
    ORDER BY updated_at DESC
  `, [studentId]);
  return result.rows.map(mapMission);
}

export async function getMissionAttempt(studentId: string, missionId: string) {
  const result = await getPool().query<MissionRow>(`
    SELECT mission_id, status, answer, evidence, feedback, attempt_count,
           updated_at, completed_at
    FROM metalab_mission_progress
    WHERE student_id = $1 AND mission_id = $2
  `, [studentId, missionId]);
  return result.rows[0] ? mapMission(result.rows[0]) : null;
}

export async function saveMissionAttempt(input: {
  studentId: string;
  missionId: string;
  status: MissionStatus;
  answer: unknown;
  evidence: Record<string, string | number | boolean>;
  feedback: string;
}) {
  const result = await getPool().query<MissionRow>(`
    INSERT INTO metalab_mission_progress
      (id, student_id, mission_id, status, answer, evidence, feedback, completed_at)
    VALUES ($1, $2, $3, $4::text, $5::JSONB, $6::JSONB, $7,
      CASE WHEN $4 = 'completed' THEN NOW() ELSE NULL END)
    ON CONFLICT (student_id, mission_id) DO UPDATE SET
      status = CASE
        WHEN metalab_mission_progress.status = 'completed' THEN 'completed'
        ELSE EXCLUDED.status
      END,
      answer = EXCLUDED.answer,
      evidence = EXCLUDED.evidence,
      feedback = CASE
        WHEN metalab_mission_progress.status = 'completed' AND EXCLUDED.status <> 'completed'
          THEN metalab_mission_progress.feedback
        ELSE EXCLUDED.feedback
      END,
      attempt_count = metalab_mission_progress.attempt_count + 1,
      updated_at = NOW(),
      completed_at = CASE
        WHEN metalab_mission_progress.completed_at IS NOT NULL
          THEN metalab_mission_progress.completed_at
        WHEN EXCLUDED.status = 'completed' THEN NOW()
        ELSE NULL
      END
    RETURNING mission_id, status, answer, evidence, feedback, attempt_count,
              updated_at, completed_at
  `, [randomUUID(), input.studentId, input.missionId, input.status,
    JSON.stringify(input.answer), JSON.stringify(input.evidence), input.feedback]);
  return mapMission(result.rows[0]);
}

export async function databaseIsReady() {
  const result = await getPool().query<{ ready: boolean }>(`
    SELECT
      to_regclass('public.metalab_students') IS NOT NULL
      AND to_regclass('public.metalab_student_sessions') IS NOT NULL
      AND to_regclass('public.metalab_businesses') IS NOT NULL
      AND to_regclass('public.metalab_mission_progress') IS NOT NULL
      AND to_regclass('public.metalab_student_photos') IS NOT NULL
      AND to_regclass('public.metalab_student_deliveries') IS NOT NULL
      AND to_regclass('public.metalab_quick_missions') IS NOT NULL
      AND to_regclass('public.metalab_teacher_modules') IS NOT NULL
      AND to_regclass('public.metalab_teacher_missions') IS NOT NULL
      AND to_regclass('public.metalab_teacher_tasks') IS NOT NULL
      AND to_regclass('public.metalab_teacher_task_submissions') IS NOT NULL
      AND to_regclass('public.metalab_classes') IS NOT NULL
      AND to_regclass('public.metalab_instalab_posts') IS NOT NULL
      AND to_regclass('public.metalab_instalab_likes') IS NOT NULL
      AND to_regclass('public.metalab_instalab_comments') IS NOT NULL AS ready
  `);
  return result.rows[0]?.ready === true;
}
