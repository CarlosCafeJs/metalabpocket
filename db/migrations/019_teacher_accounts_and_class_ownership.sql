-- Individual teacher accounts, revocable server-side sessions, approval audit,
-- and optional class ownership. Existing classes and academic records remain untouched.
CREATE TABLE IF NOT EXISTS metalab_teacher_accounts (
  id UUID PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  cpf_digest CHAR(64) NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash TEXT NOT NULL,
  account_state VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (account_state IN ('pending','active','rejected','suspended','disabled')),
  account_role VARCHAR(16) NOT NULL DEFAULT 'teacher'
    CHECK (account_role IN ('teacher','admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  last_authenticated_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_teacher_accounts_cpf_digest_check CHECK (cpf_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT metalab_teacher_accounts_password_hash_check CHECK (length(password_hash) BETWEEN 80 AND 200 AND password_hash LIKE 'scrypt$%')
);

CREATE UNIQUE INDEX IF NOT EXISTS metalab_teacher_accounts_cpf_digest_uidx
  ON metalab_teacher_accounts (cpf_digest);
CREATE UNIQUE INDEX IF NOT EXISTS metalab_teacher_accounts_email_uidx
  ON metalab_teacher_accounts (LOWER(email));
CREATE INDEX IF NOT EXISTS metalab_teacher_accounts_state_created_idx
  ON metalab_teacher_accounts (account_state, created_at DESC);

CREATE TABLE IF NOT EXISTS metalab_teacher_sessions (
  id UUID PRIMARY KEY,
  teacher_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE CASCADE,
  token_digest CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS metalab_teacher_sessions_teacher_active_idx
  ON metalab_teacher_sessions (teacher_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS metalab_teacher_account_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  teacher_id UUID REFERENCES metalab_teacher_accounts(id) ON DELETE SET NULL,
  action VARCHAR(32) NOT NULL CHECK (action IN ('approved','rejected','suspended','reactivated','disabled')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome VARCHAR(16) NOT NULL DEFAULT 'success' CHECK (outcome IN ('success','denied'))
);
CREATE INDEX IF NOT EXISTS metalab_teacher_account_audit_teacher_idx
  ON metalab_teacher_account_audit (teacher_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS metalab_teacher_class_audit (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  previous_teacher_id UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  new_teacher_id UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_teacher_class_audit_class_idx
  ON metalab_teacher_class_audit (class_id, occurred_at DESC);

ALTER TABLE metalab_classes
  ADD COLUMN IF NOT EXISTS responsible_teacher_id UUID
    REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT;
ALTER TABLE metalab_teacher_modules
  ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS metalab_classes_responsible_teacher_idx
  ON metalab_classes (responsible_teacher_id, name);
CREATE INDEX IF NOT EXISTS metalab_teacher_modules_class_idx
  ON metalab_teacher_modules (class_id, is_published, position);

COMMENT ON COLUMN metalab_classes.responsible_teacher_id IS
  'NULL means legacy/unassigned. Never auto-assign legacy classes to a newly registered teacher.';
