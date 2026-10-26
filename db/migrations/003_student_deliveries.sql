CREATE TABLE IF NOT EXISTS metalab_student_deliveries (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  activity_name VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  class_date DATE NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  file_data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_student_deliveries_size_check CHECK (size_bytes BETWEEN 1 AND 4194304),
  CONSTRAINT metalab_student_deliveries_mime_check CHECK (mime_type IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4','video/webm'))
);

CREATE INDEX IF NOT EXISTS metalab_student_deliveries_student_date_idx
  ON metalab_student_deliveries (student_id, created_at DESC);
