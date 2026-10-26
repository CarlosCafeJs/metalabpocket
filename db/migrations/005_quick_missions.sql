CREATE TABLE IF NOT EXISTS metalab_quick_missions (
  id UUID PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  request VARCHAR(2000) NOT NULL,
  estimated_minutes SMALLINT NOT NULL DEFAULT 15,
  due_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT metalab_quick_missions_estimate_check CHECK (estimated_minutes BETWEEN 5 AND 180)
);

ALTER TABLE metalab_student_deliveries
  ADD COLUMN IF NOT EXISTS quick_mission_id UUID REFERENCES metalab_quick_missions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS metalab_quick_missions_active_due_idx
  ON metalab_quick_missions (is_active, due_at, created_at DESC);
CREATE INDEX IF NOT EXISTS metalab_student_deliveries_quick_mission_idx
  ON metalab_student_deliveries (quick_mission_id, student_id, created_at DESC)
  WHERE quick_mission_id IS NOT NULL;
