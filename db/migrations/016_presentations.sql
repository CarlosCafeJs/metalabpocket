CREATE TABLE IF NOT EXISTS metalab_presentations (
  id UUID PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object' AND document->>'schemaVersion' = schema_version::TEXT),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS metalab_presentations_active_updated_idx
  ON metalab_presentations (updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS metalab_presentation_classes (
  presentation_id UUID NOT NULL REFERENCES metalab_presentations(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (presentation_id, class_id)
);

CREATE INDEX IF NOT EXISTS metalab_presentation_classes_class_idx
  ON metalab_presentation_classes (class_id, presentation_id);

CREATE TABLE IF NOT EXISTS metalab_presentation_versions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  presentation_id UUID NOT NULL REFERENCES metalab_presentations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  title VARCHAR(120) NOT NULL,
  document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object'),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (presentation_id, revision)
);

CREATE INDEX IF NOT EXISTS metalab_presentation_versions_recent_idx
  ON metalab_presentation_versions (presentation_id, revision DESC);
