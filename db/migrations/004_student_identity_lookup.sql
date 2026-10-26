CREATE INDEX IF NOT EXISTS metalab_students_email_birth_date_idx
  ON metalab_students (LOWER(email), birth_date);
