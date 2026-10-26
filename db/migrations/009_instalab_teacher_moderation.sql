ALTER TABLE metalab_instalab_likes DROP CONSTRAINT IF EXISTS metalab_instalab_likes_pkey;
ALTER TABLE metalab_instalab_likes ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE metalab_instalab_likes ADD COLUMN IF NOT EXISTS teacher_like BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE metalab_instalab_likes ADD CONSTRAINT metalab_instalab_likes_actor_check
  CHECK ((teacher_like = TRUE AND student_id IS NULL) OR (teacher_like = FALSE AND student_id IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS metalab_instalab_likes_student_uidx
  ON metalab_instalab_likes (post_id, student_id) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metalab_instalab_likes_teacher_uidx
  ON metalab_instalab_likes (post_id) WHERE teacher_like = TRUE;

ALTER TABLE metalab_instalab_comments ADD COLUMN IF NOT EXISTS author_role VARCHAR(12) NOT NULL DEFAULT 'student';
ALTER TABLE metalab_instalab_comments ADD COLUMN IF NOT EXISTS author_name VARCHAR(120);
UPDATE metalab_instalab_comments comment
SET author_name = student.full_name
FROM metalab_students student
WHERE comment.student_id = student.id AND comment.author_name IS NULL;
ALTER TABLE metalab_instalab_comments ALTER COLUMN student_id DROP NOT NULL;
ALTER TABLE metalab_instalab_comments ALTER COLUMN author_name SET NOT NULL;
ALTER TABLE metalab_instalab_comments ADD CONSTRAINT metalab_instalab_comments_author_check
  CHECK ((author_role = 'student' AND student_id IS NOT NULL) OR (author_role = 'teacher' AND student_id IS NULL));
