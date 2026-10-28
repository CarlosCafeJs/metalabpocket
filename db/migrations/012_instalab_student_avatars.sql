-- Student-controlled InstaLab avatars. Images remain in PostgreSQL and are
-- only served through class/teacher-authorized routes.
ALTER TABLE metalab_students
  ADD COLUMN IF NOT EXISTS instalab_avatar_data BYTEA,
  ADD COLUMN IF NOT EXISTS instalab_avatar_mime_type VARCHAR(40),
  ADD COLUMN IF NOT EXISTS instalab_avatar_size_bytes INTEGER,
  ADD COLUMN IF NOT EXISTS instalab_avatar_updated_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'metalab_students_instalab_avatar_check'
  ) THEN
    ALTER TABLE metalab_students ADD CONSTRAINT metalab_students_instalab_avatar_check CHECK (
      (instalab_avatar_data IS NULL AND instalab_avatar_mime_type IS NULL AND instalab_avatar_size_bytes IS NULL)
      OR (instalab_avatar_data IS NOT NULL
        AND instalab_avatar_mime_type IN ('image/jpeg','image/png','image/webp')
        AND instalab_avatar_size_bytes BETWEEN 1 AND 2097152)
    );
  END IF;
END $$;
