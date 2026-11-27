-- GameFlows: investigation templates, class publications, live sessions and audit-safe progress.
-- Additive only: no existing Edu Café Flow records are modified or removed.

CREATE TABLE IF NOT EXISTS gameflows_cases (
  id UUID PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  title VARCHAR(140) NOT NULL,
  description VARCHAR(1000) NOT NULL DEFAULT '',
  opening_story TEXT NOT NULL DEFAULT '',
  investigation_objective VARCHAR(1000) NOT NULL DEFAULT '',
  weekly_content VARCHAR(2000) NOT NULL DEFAULT '',
  closing_message TEXT NOT NULL DEFAULT '',
  status VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gameflows_cases_author_idx ON gameflows_cases(created_by,updated_at DESC);
CREATE INDEX IF NOT EXISTS gameflows_cases_published_idx ON gameflows_cases(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS gameflows_gates (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES gameflows_cases(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 10),
  gate_type VARCHAR(32) NOT NULL CHECK (gate_type IN (
    'scene_exploration','interview','forensic_crossword','cipher','collective_fragments',
    'phishing_analysis','timeline','ai_audit','deduction','verdict'
  )),
  title VARCHAR(140) NOT NULL,
  narrative TEXT NOT NULL DEFAULT '',
  prompt VARCHAR(2000) NOT NULL,
  public_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(public_payload)='object'),
  private_payload JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(private_payload)='object'),
  hint_text VARCHAR(1000) NOT NULL DEFAULT '',
  explanation TEXT NOT NULL DEFAULT '',
  max_xp SMALLINT NOT NULL DEFAULT 160 CHECK (max_xp BETWEEN 0 AND 200),
  requires_all_participants BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gameflows_gates_case_position_uidx UNIQUE(case_id,position),
  CONSTRAINT gameflows_gates_id_case_uidx UNIQUE(id,case_id)
);
CREATE INDEX IF NOT EXISTS gameflows_gates_case_idx ON gameflows_gates(case_id,position);

CREATE TABLE IF NOT EXISTS gameflows_evidence (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES gameflows_cases(id) ON DELETE CASCADE,
  gate_id UUID NOT NULL,
  title VARCHAR(160) NOT NULL,
  body TEXT NOT NULL,
  reveal_after_position SMALLINT NOT NULL CHECK (reveal_after_position BETWEEN 1 AND 10),
  position SMALLINT NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 100),
  CONSTRAINT gameflows_evidence_gate_case_fk FOREIGN KEY(gate_id,case_id)
    REFERENCES gameflows_gates(id,case_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS gameflows_evidence_case_reveal_idx ON gameflows_evidence(case_id,reveal_after_position,position);

CREATE TABLE IF NOT EXISTS gameflows_suspects (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES gameflows_cases(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  profile VARCHAR(1500) NOT NULL DEFAULT '',
  public_details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(public_details)='object'),
  position SMALLINT NOT NULL DEFAULT 1 CHECK (position BETWEEN 1 AND 100),
  UNIQUE(case_id,position)
);

CREATE TABLE IF NOT EXISTS gameflows_case_classes (
  case_id UUID NOT NULL REFERENCES gameflows_cases(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  published_by UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(case_id,class_id)
);
CREATE INDEX IF NOT EXISTS gameflows_case_classes_class_idx ON gameflows_case_classes(class_id,published_at DESC);

CREATE TABLE IF NOT EXISTS gameflows_sessions (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES gameflows_cases(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  teacher_id UUID NOT NULL REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  state VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (state IN ('waiting','running','paused','completed','ended','cancelled')),
  director_message VARCHAR(1000) NOT NULL DEFAULT 'Aguardando o diretor da investigação iniciar a operação.',
  roster_frozen_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  ended_by UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  end_reason VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gameflows_sessions_teacher_idx ON gameflows_sessions(teacher_id,state,created_at DESC);
CREATE INDEX IF NOT EXISTS gameflows_sessions_class_idx ON gameflows_sessions(class_id,state,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS gameflows_sessions_one_open_case_class_uidx
  ON gameflows_sessions(case_id,class_id) WHERE state IN ('waiting','running','paused');

CREATE TABLE IF NOT EXISTS gameflows_participants (
  session_id UUID NOT NULL REFERENCES gameflows_sessions(id) ON DELETE RESTRICT,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  ready_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  connection_state VARCHAR(12) NOT NULL DEFAULT 'online' CHECK (connection_state IN ('online','offline')),
  frozen_position SMALLINT,
  PRIMARY KEY(session_id,student_id),
  CONSTRAINT gameflows_participants_position_check CHECK (frozen_position IS NULL OR frozen_position BETWEEN 1 AND 500)
);
CREATE INDEX IF NOT EXISTS gameflows_participants_seen_idx ON gameflows_participants(session_id,last_seen_at DESC);

CREATE TABLE IF NOT EXISTS gameflows_gate_progress (
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  gate_id UUID NOT NULL REFERENCES gameflows_gates(id) ON DELETE RESTRICT,
  state VARCHAR(20) NOT NULL DEFAULT 'locked' CHECK (state IN ('locked','available','in_progress','pending_review','completed')),
  hint_revealed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  points_awarded SMALLINT NOT NULL DEFAULT 0 CHECK (points_awarded BETWEEN 0 AND 200),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,student_id,gate_id),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS gameflows_gate_progress_student_idx ON gameflows_gate_progress(student_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS gameflows_attempts (
  id UUID PRIMARY KEY,
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  gate_id UUID NOT NULL REFERENCES gameflows_gates(id) ON DELETE RESTRICT,
  idempotency_key UUID NOT NULL,
  answer JSONB NOT NULL CHECK (jsonb_typeof(answer) IN ('object','array','string','number','boolean')),
  result_state VARCHAR(20) NOT NULL CHECK (result_state IN ('incorrect','correct','pending_review')),
  awarded_xp SMALLINT NOT NULL DEFAULT 0 CHECK (awarded_xp BETWEEN 0 AND 200),
  reviewed_by UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  review_note VARCHAR(1000) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT,
  UNIQUE(session_id,student_id,gate_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS gameflows_attempts_gate_idx ON gameflows_attempts(session_id,gate_id,created_at DESC);

CREATE TABLE IF NOT EXISTS gameflows_fragments (
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  gate_id UUID NOT NULL REFERENCES gameflows_gates(id) ON DELETE RESTRICT,
  fragments JSONB NOT NULL CHECK (jsonb_typeof(fragments)='array' AND jsonb_array_length(fragments) BETWEEN 0 AND 100),
  redistributed_at TIMESTAMPTZ,
  redistribution_version INTEGER NOT NULL DEFAULT 0 CHECK (redistribution_version >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,student_id,gate_id),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gameflows_xp_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  gate_id UUID REFERENCES gameflows_gates(id) ON DELETE RESTRICT,
  source_key VARCHAR(160) NOT NULL,
  event_type VARCHAR(32) NOT NULL CHECK (event_type IN ('gate_correct','justification','no_hint','collaboration','teacher_review')),
  xp SMALLINT NOT NULL CHECK (xp BETWEEN 0 AND 200),
  details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT,
  UNIQUE(session_id,student_id,source_key,event_type)
);
CREATE INDEX IF NOT EXISTS gameflows_xp_events_student_idx ON gameflows_xp_events(student_id,created_at DESC);
CREATE INDEX IF NOT EXISTS gameflows_xp_events_class_idx ON gameflows_xp_events(session_id,student_id);

CREATE TABLE IF NOT EXISTS gameflows_collective_contributions (
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  gate_id UUID NOT NULL REFERENCES gameflows_gates(id) ON DELETE RESTRICT,
  contribution_hash CHAR(64) NOT NULL CHECK (contribution_hash ~ '^[0-9a-f]{64}$'),
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,student_id,gate_id),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS gameflows_achievements (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  achievement_key VARCHAR(40) NOT NULL,
  title VARCHAR(100) NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT,
  UNIQUE(session_id,student_id,achievement_key)
);

CREATE TABLE IF NOT EXISTS gameflows_session_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES gameflows_sessions(id) ON DELETE RESTRICT,
  actor_teacher_id UUID REFERENCES metalab_teacher_accounts(id) ON DELETE RESTRICT,
  actor_student_id UUID REFERENCES metalab_students(id) ON DELETE RESTRICT,
  event_type VARCHAR(40) NOT NULL CHECK (event_type IN (
    'session_created','participant_joined','session_started','session_paused','session_resumed','session_cancelled',
    'hint_released','fragment_redistributed','announcement','gate_attempt','gate_completed',
    'session_completed','session_ended','verdict_reviewed'
  )),
  details JSONB NOT NULL DEFAULT '{}'::JSONB CHECK (jsonb_typeof(details)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gameflows_session_events_actor_check CHECK ((actor_teacher_id IS NULL) <> (actor_student_id IS NULL))
);
CREATE INDEX IF NOT EXISTS gameflows_session_events_idx ON gameflows_session_events(session_id,created_at DESC);

CREATE TABLE IF NOT EXISTS gameflows_student_evidence (
  session_id UUID NOT NULL,
  student_id UUID NOT NULL,
  evidence_id UUID NOT NULL REFERENCES gameflows_evidence(id) ON DELETE RESTRICT,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(session_id,student_id,evidence_id),
  FOREIGN KEY(session_id,student_id) REFERENCES gameflows_participants(session_id,student_id) ON DELETE RESTRICT
);
