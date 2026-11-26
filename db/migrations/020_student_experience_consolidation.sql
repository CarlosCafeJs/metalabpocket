-- Additive student experience consolidation. Existing academic, business,
-- social and economy records remain in place.

-- Preserve each class enrollment when a student changes their current class.
CREATE TABLE IF NOT EXISTS metalab_student_class_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  changed_by VARCHAR(16) NOT NULL DEFAULT 'student' CHECK (changed_by IN ('student','teacher','admin'))
);
CREATE INDEX IF NOT EXISTS metalab_student_class_history_student_idx
  ON metalab_student_class_history(student_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS metalab_student_class_history_one_active_idx
  ON metalab_student_class_history(student_id) WHERE ended_at IS NULL;
INSERT INTO metalab_student_class_history(student_id,class_id,started_at,changed_by)
SELECT assignment.student_id,assignment.class_id,assignment.assigned_at,'admin'
FROM metalab_student_class_assignments assignment
WHERE NOT EXISTS (
  SELECT 1 FROM metalab_student_class_history history
  WHERE history.student_id=assignment.student_id AND history.ended_at IS NULL
);

-- New deliveries can be text-only or file-only; class_id snapshots the class
-- at submission time, while mission_id is optional and scoped to that class.
ALTER TABLE metalab_student_deliveries
  ALTER COLUMN class_date DROP NOT NULL,
  ALTER COLUMN file_name DROP NOT NULL,
  ALTER COLUMN mime_type DROP NOT NULL,
  ALTER COLUMN size_bytes DROP NOT NULL,
  ALTER COLUMN file_data DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS text_content TEXT,
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES metalab_teacher_missions(id) ON DELETE SET NULL;
ALTER TABLE metalab_student_deliveries
  DROP CONSTRAINT IF EXISTS metalab_student_deliveries_size_check,
  DROP CONSTRAINT IF EXISTS metalab_student_deliveries_content_check,
  ADD CONSTRAINT metalab_student_deliveries_size_check
    CHECK (size_bytes IS NULL OR size_bytes BETWEEN 1 AND 4194304),
  ADD CONSTRAINT metalab_student_deliveries_content_check
    CHECK (file_data IS NOT NULL OR NULLIF(BTRIM(text_content), '') IS NOT NULL);
CREATE INDEX IF NOT EXISTS metalab_student_deliveries_class_date_idx
  ON metalab_student_deliveries(class_id, created_at DESC);

-- Forum is intentionally separate from the social feed and isolated by class.
CREATE TABLE IF NOT EXISTS metalab_forum_topics (
  id UUID PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  title VARCHAR(160) NOT NULL,
  body VARCHAR(4000) NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_forum_topics_class_date_idx
  ON metalab_forum_topics(class_id, created_at DESC);
CREATE TABLE IF NOT EXISTS metalab_forum_replies (
  id UUID PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES metalab_forum_topics(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_forum_replies_topic_date_idx
  ON metalab_forum_replies(topic_id, created_at ASC);

-- Legacy enterprise attribution is retained for old posts and campaigns;
-- new social posts may use the student's personal identity.
ALTER TABLE metalab_instalab_posts ALTER COLUMN business_id DROP NOT NULL;
ALTER TABLE metalab_students ADD COLUMN IF NOT EXISTS profile_bio VARCHAR(500) NOT NULL DEFAULT '';

-- New teacher presentations are owned by their creator; legacy documents keep
-- NULL and remain preserved for administrators / their already authorized readers.
ALTER TABLE metalab_presentations ADD COLUMN IF NOT EXISTS created_by UUID
  REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT;
