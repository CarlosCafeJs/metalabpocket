ALTER TABLE metalab_students
  ADD COLUMN IF NOT EXISTS cpf_digest CHAR(64),
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'metalab_students_credentials_pair_check'
  ) THEN
    ALTER TABLE metalab_students
      ADD CONSTRAINT metalab_students_credentials_pair_check
      CHECK ((cpf_digest IS NULL) = (password_hash IS NULL));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'metalab_students_cpf_digest_check'
  ) THEN
    ALTER TABLE metalab_students
      ADD CONSTRAINT metalab_students_cpf_digest_check
      CHECK (cpf_digest IS NULL OR cpf_digest ~ '^[0-9a-f]{64}$');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'metalab_students_password_hash_check'
  ) THEN
    ALTER TABLE metalab_students
      ADD CONSTRAINT metalab_students_password_hash_check
      CHECK (password_hash IS NULL OR (length(password_hash) BETWEEN 80 AND 200 AND password_hash LIKE 'scrypt$%'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS metalab_students_active_cpf_digest_uidx
  ON metalab_students (cpf_digest)
  WHERE archived_at IS NULL AND cpf_digest IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS metalab_students_active_credential_email_uidx
  ON metalab_students (LOWER(email))
  WHERE archived_at IS NULL AND password_hash IS NOT NULL;

COMMENT ON COLUMN metalab_students.cpf_digest IS
  'HMAC-SHA-256 of normalized CPF; the original CPF is never stored.';
COMMENT ON COLUMN metalab_students.password_hash IS
  'Versioned scrypt hash; legacy rows remain NULL and cannot authenticate with the new credential flow.';
