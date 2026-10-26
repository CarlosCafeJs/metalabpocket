CREATE TABLE IF NOT EXISTS metalab_teacher_modules (
  id UUID PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metalab_teacher_missions (
  id UUID PRIMARY KEY,
  module_id UUID NOT NULL REFERENCES metalab_teacher_modules(id) ON DELETE CASCADE,
  title VARCHAR(120) NOT NULL,
  objective VARCHAR(500) NOT NULL DEFAULT '',
  description VARCHAR(1500) NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS metalab_teacher_tasks (
  id UUID PRIMARY KEY,
  mission_id UUID NOT NULL REFERENCES metalab_teacher_missions(id) ON DELETE CASCADE,
  prompt VARCHAR(1500) NOT NULL,
  task_type VARCHAR(20) NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::JSONB,
  position INTEGER NOT NULL DEFAULT 1,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_teacher_tasks_type_check CHECK (task_type IN ('text','multiple_choice','complete')),
  CONSTRAINT metalab_teacher_tasks_options_check CHECK (jsonb_typeof(options) = 'array')
);

CREATE TABLE IF NOT EXISTS metalab_teacher_task_submissions (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES metalab_teacher_tasks(id) ON DELETE CASCADE,
  answer JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS metalab_teacher_modules_published_idx ON metalab_teacher_modules (is_published, position);
CREATE INDEX IF NOT EXISTS metalab_teacher_missions_module_idx ON metalab_teacher_missions (module_id, position);
CREATE INDEX IF NOT EXISTS metalab_teacher_tasks_mission_idx ON metalab_teacher_tasks (mission_id, position);
CREATE INDEX IF NOT EXISTS metalab_teacher_task_submissions_student_idx ON metalab_teacher_task_submissions (student_id, submitted_at DESC);
CREATE INDEX IF NOT EXISTS metalab_teacher_task_submissions_task_idx ON metalab_teacher_task_submissions (task_id, student_id, submitted_at DESC);
