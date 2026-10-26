ALTER TABLE metalab_classes ADD COLUMN IF NOT EXISTS join_code VARCHAR(8);

UPDATE metalab_classes
SET join_code = upper(substr(replace(id::text, '-', ''), 1, 8))
WHERE join_code IS NULL;

ALTER TABLE metalab_classes ALTER COLUMN join_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metalab_classes_join_code_uidx ON metalab_classes (join_code);

CREATE TABLE IF NOT EXISTS metalab_instalab_posts (
  id UUID PRIMARY KEY,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES metalab_businesses(id) ON DELETE CASCADE,
  body VARCHAR(2000) NOT NULL DEFAULT '',
  image_name VARCHAR(255),
  image_mime_type VARCHAR(40),
  image_size_bytes INTEGER,
  image_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(trim(body)) > 0 OR image_data IS NOT NULL),
  CHECK ((image_data IS NULL AND image_mime_type IS NULL AND image_size_bytes IS NULL)
      OR (image_data IS NOT NULL AND image_mime_type IN ('image/jpeg','image/png','image/webp') AND image_size_bytes > 0))
);
CREATE INDEX IF NOT EXISTS metalab_instalab_posts_class_created_idx ON metalab_instalab_posts (class_id, created_at DESC);
CREATE INDEX IF NOT EXISTS metalab_instalab_posts_student_idx ON metalab_instalab_posts (student_id, created_at DESC);

CREATE TABLE IF NOT EXISTS metalab_instalab_likes (
  post_id UUID NOT NULL REFERENCES metalab_instalab_posts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (post_id, student_id)
);

CREATE TABLE IF NOT EXISTS metalab_instalab_comments (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES metalab_instalab_posts(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  body VARCHAR(1000) NOT NULL CHECK (length(trim(body)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_instalab_comments_post_created_idx ON metalab_instalab_comments (post_id, created_at ASC);
