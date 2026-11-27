-- Private academic evaluations and teacher-only InstaFlow recognition.
-- Additive: existing student deliveries, task submissions, posts and economy rows remain intact.

CREATE UNIQUE INDEX IF NOT EXISTS metalab_student_deliveries_id_student_uidx
  ON metalab_student_deliveries(id, student_id);
CREATE UNIQUE INDEX IF NOT EXISTS metalab_teacher_task_submissions_id_student_uidx
  ON metalab_teacher_task_submissions(id, student_id);

CREATE TABLE IF NOT EXISTS metalab_academic_evaluations (
  id UUID PRIMARY KEY,
  target_kind VARCHAR(32) NOT NULL CHECK (target_kind IN ('delivery','classroom_submission')),
  delivery_id UUID,
  classroom_submission_id UUID,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  evaluator_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  score NUMERIC(5,2) NOT NULL CHECK (score BETWEEN 0 AND 10),
  maximum_score NUMERIC(5,2) NOT NULL CHECK (maximum_score > 0 AND maximum_score <= 10),
  comment VARCHAR(2000) NOT NULL DEFAULT '',
  publication_state VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (publication_state IN ('draft','published')),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_academic_evaluations_score_max_check CHECK (score <= maximum_score),
  CONSTRAINT metalab_academic_evaluations_target_check CHECK (
    (target_kind='delivery' AND delivery_id IS NOT NULL AND classroom_submission_id IS NULL)
    OR
    (target_kind='classroom_submission' AND classroom_submission_id IS NOT NULL AND delivery_id IS NULL)
  ),
  CONSTRAINT metalab_academic_evaluations_delivery_fk
    FOREIGN KEY (delivery_id,student_id) REFERENCES metalab_student_deliveries(id,student_id) ON DELETE CASCADE,
  CONSTRAINT metalab_academic_evaluations_submission_fk
    FOREIGN KEY (classroom_submission_id,student_id) REFERENCES metalab_teacher_task_submissions(id,student_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS metalab_academic_evaluations_delivery_uidx
  ON metalab_academic_evaluations(delivery_id) WHERE delivery_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS metalab_academic_evaluations_submission_uidx
  ON metalab_academic_evaluations(classroom_submission_id) WHERE classroom_submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS metalab_academic_evaluations_student_published_idx
  ON metalab_academic_evaluations(student_id,published_at DESC)
  WHERE publication_state='published';
CREATE INDEX IF NOT EXISTS metalab_academic_evaluations_class_idx
  ON metalab_academic_evaluations(class_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS metalab_academic_evaluation_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evaluation_id UUID REFERENCES metalab_academic_evaluations(id) ON DELETE SET NULL,
  actor_teacher_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  action VARCHAR(16) NOT NULL CHECK (action IN ('created','updated','published','unpublished')),
  previous_value JSONB,
  new_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_academic_evaluation_history_evaluation_idx
  ON metalab_academic_evaluation_history(evaluation_id,created_at DESC);

CREATE TABLE IF NOT EXISTS metalab_instalab_post_ratings (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES metalab_instalab_posts(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_instalab_post_ratings_teacher_post_uidx UNIQUE(post_id,teacher_id)
);
CREATE INDEX IF NOT EXISTS metalab_instalab_post_ratings_post_idx
  ON metalab_instalab_post_ratings(post_id);

CREATE TABLE IF NOT EXISTS metalab_instalab_post_rating_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rating_id UUID NOT NULL,
  -- Keep the post identifier as an audit reference even after moderation removes the post.
  post_id UUID NOT NULL,
  teacher_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  action VARCHAR(12) NOT NULL CHECK (action IN ('created','updated','removed')),
  previous_stars SMALLINT CHECK (previous_stars BETWEEN 1 AND 5),
  new_stars SMALLINT CHECK (new_stars BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS metalab_instalab_post_rating_history_post_idx
  ON metalab_instalab_post_rating_history(post_id,created_at DESC);
