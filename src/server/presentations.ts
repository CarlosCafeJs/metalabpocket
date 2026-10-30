import 'server-only';
import { randomUUID } from 'node:crypto';
import { getPool, transaction } from '@/server/db';
import { presentationDocumentSchema, type PresentationDocument } from '@/domain/presentations';

export type PresentationSummary = {
  id: string;
  title: string;
  schemaVersion: 1;
  revision: number;
  isPublished: boolean;
  classIds: string[];
  classNames: string[];
  slideCount: number;
  updatedAt: string;
};

type PresentationRow = {
  id: string; title: string; schema_version: number; document: unknown; revision: number;
  is_published: boolean; class_ids: string[] | null; class_names: string[] | null; updated_at: Date | string;
};

function mapSummary(row: PresentationRow): PresentationSummary {
  const document = presentationDocumentSchema.parse(row.document);
  return {
    id: row.id, title: row.title, schemaVersion: 1, revision: row.revision,
    isPublished: row.is_published, classIds: row.class_ids || [], classNames: row.class_names || [],
    slideCount: document.slides.length, updatedAt: new Date(row.updated_at).toISOString()
  };
}

const selectSummary = `
  SELECT presentation.id,presentation.title,presentation.schema_version,presentation.document,presentation.revision,presentation.is_published,presentation.updated_at,
         COALESCE(array_agg(DISTINCT classroom.id) FILTER (WHERE classroom.id IS NOT NULL),'{}') AS class_ids,
         COALESCE(array_agg(DISTINCT classroom.name) FILTER (WHERE classroom.name IS NOT NULL),'{}') AS class_names
  FROM metalab_presentations presentation
  LEFT JOIN metalab_presentation_classes link ON link.presentation_id=presentation.id
  LEFT JOIN metalab_classes classroom ON classroom.id=link.class_id
`;

export async function listTeacherPresentations(): Promise<PresentationSummary[]> {
  const result = await getPool().query<PresentationRow>(`${selectSummary} WHERE presentation.deleted_at IS NULL GROUP BY presentation.id ORDER BY presentation.updated_at DESC`);
  return result.rows.map(mapSummary);
}

export async function listStudentPresentations(classId: string): Promise<PresentationSummary[]> {
  const result = await getPool().query<PresentationRow>(`${selectSummary}
    JOIN metalab_presentation_classes authorized_link ON authorized_link.presentation_id=presentation.id AND authorized_link.class_id=$1
    WHERE presentation.deleted_at IS NULL AND presentation.is_published=TRUE
    GROUP BY presentation.id ORDER BY presentation.updated_at DESC`, [classId]);
  return result.rows.map(mapSummary);
}

export async function getPresentation(id: string): Promise<(PresentationSummary & { document: PresentationDocument }) | null> {
  const result = await getPool().query<PresentationRow>(`${selectSummary} WHERE presentation.id=$1 AND presentation.deleted_at IS NULL GROUP BY presentation.id`, [id]);
  const row = result.rows[0];
  return row ? { ...mapSummary(row), document: presentationDocumentSchema.parse(row.document) } : null;
}

export async function getStudentPresentation(id: string, classId: string) {
  const result = await getPool().query<PresentationRow>(`${selectSummary}
    JOIN metalab_presentation_classes authorized_link ON authorized_link.presentation_id=presentation.id AND authorized_link.class_id=$2
    WHERE presentation.id=$1 AND presentation.deleted_at IS NULL AND presentation.is_published=TRUE
    GROUP BY presentation.id`, [id, classId]);
  const row = result.rows[0];
  return row ? { ...mapSummary(row), document: presentationDocumentSchema.parse(row.document) } : null;
}

export async function createPresentation(input: { title: string; document: PresentationDocument; classIds: string[]; isPublished: boolean }) {
  const id = randomUUID();
  const document = presentationDocumentSchema.parse(input.document);
  const created = await transaction(async client => {
    if (input.classIds.length) {
      const classes = await client.query<{ id: string }>('SELECT id FROM metalab_classes WHERE id=ANY($1::uuid[])', [input.classIds]);
      if (classes.rowCount !== input.classIds.length) return null;
    }
    await client.query(`INSERT INTO metalab_presentations(id,title,schema_version,document,revision,is_published) VALUES($1,$2,1,$3::jsonb,1,$4)`, [id, input.title, JSON.stringify(document), input.isPublished]);
    for (const classId of input.classIds) await client.query('INSERT INTO metalab_presentation_classes(presentation_id,class_id) VALUES($1,$2)', [id,classId]);
    await client.query('INSERT INTO metalab_presentation_versions(presentation_id,revision,title,document,is_published) VALUES($1,1,$2,$3::jsonb,$4)', [id,input.title,JSON.stringify(document),input.isPublished]);
    return id;
  });
  return created ? getPresentation(created) : null;
}

export async function duplicatePresentation(id: string, title: string) {
  return transaction(async client => {
    const source = await client.query<{ document: unknown }>('SELECT document FROM metalab_presentations WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!source.rows[0]) return null;
    const document = presentationDocumentSchema.parse(source.rows[0].document);
    const newId = randomUUID();
    await client.query('INSERT INTO metalab_presentations(id,title,schema_version,document,revision,is_published) VALUES($1,$2,1,$3::jsonb,1,FALSE)', [newId,title,JSON.stringify(document)]);
    await client.query('INSERT INTO metalab_presentation_versions(presentation_id,revision,title,document,is_published) VALUES($1,1,$2,$3::jsonb,FALSE)', [newId,title,JSON.stringify(document)]);
    return newId;
  });
}

export async function updatePresentation(input: { id: string; title: string; classIds: string[]; isPublished: boolean; expectedRevision: number }) {
  return transaction(async client => {
    if (input.classIds.length) {
      const classes = await client.query<{ id: string }>('SELECT id FROM metalab_classes WHERE id=ANY($1::uuid[])', [input.classIds]);
      if (classes.rowCount !== input.classIds.length) return { kind: 'missing-class' as const };
    }
    const updated = await client.query<{ document: unknown; revision: number }>(`UPDATE metalab_presentations SET title=$2,is_published=$3,revision=revision+1,updated_at=NOW()
      WHERE id=$1 AND deleted_at IS NULL AND revision=$4 RETURNING document,revision`, [input.id,input.title,input.isPublished,input.expectedRevision]);
    if (!updated.rows[0]) {
      const exists = await client.query('SELECT 1 FROM metalab_presentations WHERE id=$1 AND deleted_at IS NULL', [input.id]);
      return { kind: exists.rowCount ? 'conflict' as const : 'missing' as const };
    }
    await client.query('DELETE FROM metalab_presentation_classes WHERE presentation_id=$1', [input.id]);
    for (const classId of input.classIds) await client.query('INSERT INTO metalab_presentation_classes(presentation_id,class_id) VALUES($1,$2)', [input.id,classId]);
    await client.query('INSERT INTO metalab_presentation_versions(presentation_id,revision,title,document,is_published) VALUES($1,$2,$3,$4::jsonb,$5)', [input.id,updated.rows[0].revision,input.title,JSON.stringify(updated.rows[0].document),input.isPublished]);
    await client.query(`DELETE FROM metalab_presentation_versions WHERE presentation_id=$1 AND revision NOT IN (SELECT revision FROM metalab_presentation_versions WHERE presentation_id=$1 ORDER BY revision DESC LIMIT 50)`, [input.id]);
    return { kind: 'updated' as const };
  });
}

export async function softDeletePresentation(id: string, expectedRevision: number) {
  const result = await getPool().query(`UPDATE metalab_presentations SET deleted_at=NOW(),updated_at=NOW() WHERE id=$1 AND revision=$2 AND deleted_at IS NULL`, [id,expectedRevision]);
  return result.rowCount === 1;
}
