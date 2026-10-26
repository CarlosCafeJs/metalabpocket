-- Form-style questions, module-owned publication, quick-mission modules and class assignment.
ALTER TABLE metalab_teacher_tasks
  ADD COLUMN IF NOT EXISTS description VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_required BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE metalab_teacher_tasks DROP CONSTRAINT IF EXISTS metalab_teacher_tasks_type_check;
ALTER TABLE metalab_teacher_tasks ADD CONSTRAINT metalab_teacher_tasks_type_check
  CHECK (task_type IN ('text','multiple_choice','complete','short_answer','checkboxes','dropdown','linear_scale','date'));

CREATE TABLE IF NOT EXISTS metalab_quick_modules (
  id UUID PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE metalab_quick_missions
  ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES metalab_quick_modules(id) ON DELETE CASCADE;

DO $$
DECLARE legacy_module UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM metalab_quick_missions WHERE module_id IS NULL) THEN
    INSERT INTO metalab_quick_modules (id, title, description, is_published)
    SELECT gen_random_uuid(), 'Missões Relâmpago anteriores', 'Desafios criados antes da organização por módulos.', COALESCE(bool_or(is_active), FALSE)
    FROM metalab_quick_missions WHERE module_id IS NULL
    RETURNING id INTO legacy_module;
    UPDATE metalab_quick_missions SET module_id = legacy_module WHERE module_id IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS metalab_quick_modules_published_idx ON metalab_quick_modules (is_published, position);
CREATE INDEX IF NOT EXISTS metalab_quick_missions_module_idx ON metalab_quick_missions (module_id, created_at DESC);

ALTER TABLE metalab_teacher_task_submissions ADD COLUMN IF NOT EXISTS response_id UUID;
CREATE INDEX IF NOT EXISTS metalab_teacher_task_submissions_response_idx ON metalab_teacher_task_submissions (response_id) WHERE response_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS metalab_classes (
  id UUID PRIMARY KEY,
  name VARCHAR(120) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metalab_student_class_assignments (
  student_id UUID PRIMARY KEY REFERENCES metalab_students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_student_class_assignments_class_idx ON metalab_student_class_assignments (class_id, assigned_at DESC);
