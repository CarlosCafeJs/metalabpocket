CREATE TABLE IF NOT EXISTS metalab_class_files (
  id UUID PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  file_name VARCHAR(180) NOT NULL,
  mime_type VARCHAR(120) NOT NULL CHECK (mime_type IN (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv', 'image/jpeg', 'image/png', 'image/webp'
  )),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 15728640),
  content BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS metalab_class_files_class_created_idx
  ON metalab_class_files (class_id, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE metalab_class_files IS
  'Arquivos de apoio disponibilizados pelo professor exclusivamente para uma turma.';
