import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPool } from '@/server/db';

export const CLASS_FILE_MAX_BYTES = 15 * 1024 * 1024;

export type ClassFileSummary = {
  id: string;
  classId: string;
  className: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

type FileRow = {
  id: string;
  class_id: string;
  class_name: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date | string;
  content?: Buffer | null;
};

function mapFile(row: FileRow): ClassFileSummary {
  return {
    id: row.id,
    classId: row.class_id,
    className: row.class_name,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

export async function listTeacherClassFiles(responsibleTeacherId?: string): Promise<ClassFileSummary[]> {
  const result = await getPool().query<FileRow>(`
    SELECT file.id,file.class_id,classroom.name AS class_name,file.file_name,file.mime_type,
           file.size_bytes,file.created_at
    FROM metalab_class_files file
    JOIN metalab_classes classroom ON classroom.id=file.class_id
    WHERE file.deleted_at IS NULL
      AND ($1::uuid IS NULL OR classroom.responsible_teacher_id=$1)
    ORDER BY file.created_at DESC
    LIMIT 300
  `, [responsibleTeacherId ?? null]);
  return result.rows.map(mapFile);
}

export async function createTeacherClassFile(input: {
  classId: string;
  teacherId: string;
  responsibleTeacherId?: string;
  fileName: string;
  mimeType: string;
  content: Buffer;
}) {
  const result = await getPool().query<{ id: string }>(`
    INSERT INTO metalab_class_files
      (id,class_id,uploaded_by,file_name,mime_type,size_bytes,content)
    SELECT $1,classroom.id,$2,$4,$5,$6,$7
    FROM metalab_classes classroom
    WHERE classroom.id=$3
      AND ($8::uuid IS NULL OR classroom.responsible_teacher_id=$8)
    RETURNING id
  `, [randomUUID(), input.teacherId, input.classId, input.fileName, input.mimeType,
    input.content.byteLength, input.content, input.responsibleTeacherId ?? null]);
  return result.rows[0]?.id ?? null;
}

export async function getTeacherClassFile(id: string, responsibleTeacherId?: string) {
  const result = await getPool().query<FileRow>(`
    SELECT file.id,file.class_id,classroom.name AS class_name,file.file_name,file.mime_type,
           file.size_bytes,file.created_at,file.content
    FROM metalab_class_files file
    JOIN metalab_classes classroom ON classroom.id=file.class_id
    WHERE file.id=$1 AND file.deleted_at IS NULL
      AND ($2::uuid IS NULL OR classroom.responsible_teacher_id=$2)
    LIMIT 1
  `, [id, responsibleTeacherId ?? null]);
  return result.rows[0] ?? null;
}

export async function deleteTeacherClassFile(id: string, responsibleTeacherId?: string) {
  const result = await getPool().query(`
    UPDATE metalab_class_files file SET deleted_at=NOW(),content=NULL
    FROM metalab_classes classroom
    WHERE file.id=$1 AND file.class_id=classroom.id AND file.deleted_at IS NULL
      AND ($2::uuid IS NULL OR classroom.responsible_teacher_id=$2)
    RETURNING file.id
  `, [id, responsibleTeacherId ?? null]);
  return Boolean(result.rowCount);
}

export async function listStudentClassFiles(classId: string): Promise<ClassFileSummary[]> {
  const result = await getPool().query<FileRow>(`
    SELECT file.id,file.class_id,classroom.name AS class_name,file.file_name,file.mime_type,
           file.size_bytes,file.created_at
    FROM metalab_class_files file
    JOIN metalab_classes classroom ON classroom.id=file.class_id
    WHERE file.class_id=$1 AND file.deleted_at IS NULL
    ORDER BY file.created_at DESC
    LIMIT 300
  `, [classId]);
  return result.rows.map(mapFile);
}

export async function getStudentClassFile(id: string, classId: string) {
  const result = await getPool().query<FileRow>(`
    SELECT file.id,file.class_id,classroom.name AS class_name,file.file_name,file.mime_type,
           file.size_bytes,file.created_at,file.content
    FROM metalab_class_files file
    JOIN metalab_classes classroom ON classroom.id=file.class_id
    WHERE file.id=$1 AND file.class_id=$2 AND file.deleted_at IS NULL
    LIMIT 1
  `, [id, classId]);
  return result.rows[0] ?? null;
}
