CREATE TABLE IF NOT EXISTS metalab_students (
  id UUID PRIMARY KEY,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  birth_date DATE NOT NULL,
  privacy_notice_version VARCHAR(32) NOT NULL DEFAULT '2026-10-21-v1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE metalab_students
  ADD COLUMN IF NOT EXISTS privacy_notice_version VARCHAR(32) NOT NULL DEFAULT '2026-10-21-v1',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE TABLE IF NOT EXISTS metalab_student_sessions (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT metalab_student_sessions_token_hash_check
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT metalab_student_sessions_expiry_check
    CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS metalab_student_sessions_student_idx
  ON metalab_student_sessions (student_id);

CREATE INDEX IF NOT EXISTS metalab_student_sessions_active_idx
  ON metalab_student_sessions (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS metalab_businesses (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL UNIQUE REFERENCES metalab_students(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  segment VARCHAR(80) NOT NULL,
  description VARCHAR(500) NOT NULL,
  main_offering VARCHAR(160) NOT NULL,
  target_audience VARCHAR(240) NOT NULL,
  differentiator VARCHAR(240) NOT NULL,
  primary_color CHAR(7) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_businesses_primary_color_check
    CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$')
);

CREATE TABLE IF NOT EXISTS metalab_mission_progress (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  mission_id VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL,
  answer JSONB NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  feedback VARCHAR(500) NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT metalab_mission_progress_student_mission_key
    UNIQUE (student_id, mission_id),
  CONSTRAINT metalab_mission_progress_status_check
    CHECK (status IN ('in_progress', 'completed')),
  CONSTRAINT metalab_mission_progress_attempt_count_check
    CHECK (attempt_count >= 1)
);

CREATE INDEX IF NOT EXISTS metalab_mission_progress_student_status_idx
  ON metalab_mission_progress (student_id, status);
