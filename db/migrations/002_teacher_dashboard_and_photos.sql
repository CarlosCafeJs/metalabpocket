ALTER TABLE metalab_students
  ADD COLUMN IF NOT EXISTS photo_sharing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS photo_sharing_consent_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS metalab_student_photos (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  client_photo_id VARCHAR(100) NOT NULL,
  file_name VARCHAR(160) NOT NULL,
  product VARCHAR(80) NOT NULL,
  angle INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  mime_type VARCHAR(40) NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880),
  image_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, client_photo_id)
);

CREATE INDEX IF NOT EXISTS metalab_student_photos_student_created_idx
  ON metalab_student_photos (student_id, created_at DESC);
