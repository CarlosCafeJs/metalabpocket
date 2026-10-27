ALTER TABLE metalab_students
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS metalab_students_archived_idx
  ON metalab_students (archived_at, full_name);
