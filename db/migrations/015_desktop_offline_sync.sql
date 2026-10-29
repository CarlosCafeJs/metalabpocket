-- Desktop offline Phase 1: short-lived mission snapshot authorization and idempotent submissions.
-- This migration is additive. It is intentionally not run automatically by the desktop app.
CREATE TABLE IF NOT EXISTS metalab_desktop_provisions (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE CASCADE,
  sync_token_hash CHAR(64) NOT NULL UNIQUE CHECK (sync_token_hash ~ '^[0-9a-f]{64}$'),
  mission_hashes JSONB NOT NULL DEFAULT '{}'::JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_desktop_provisions_expiry_check CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS metalab_desktop_provisions_student_idx
  ON metalab_desktop_provisions(student_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS metalab_desktop_sync_operations (
  operation_id UUID PRIMARY KEY,
  provision_id UUID NOT NULL REFERENCES metalab_desktop_provisions(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  mission_id UUID NOT NULL REFERENCES metalab_teacher_missions(id) ON DELETE RESTRICT,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  result JSONB NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_desktop_sync_student_idx
  ON metalab_desktop_sync_operations(student_id, synced_at DESC);
