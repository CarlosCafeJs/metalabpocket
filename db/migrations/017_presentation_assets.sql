CREATE TABLE IF NOT EXISTS metalab_presentation_assets (
  id UUID PRIMARY KEY,
  presentation_id UUID NOT NULL REFERENCES metalab_presentations(id) ON DELETE CASCADE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  content BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (octet_length(content) = size_bytes),
  UNIQUE (presentation_id, id)
);

CREATE INDEX IF NOT EXISTS metalab_presentation_assets_presentation_idx
  ON metalab_presentation_assets (presentation_id, created_at);
