-- InstaLab economy and virtual promotion. Additive only; do not run on production without a reviewed backup.
ALTER TABLE metalab_instalab_posts
  ADD COLUMN IF NOT EXISTS creation_request_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS metalab_instalab_post_request_uidx
  ON metalab_instalab_posts (student_id, creation_request_id)
  WHERE creation_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS metalab_instalab_economy_settings (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  timezone_name TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  first_post_reward INTEGER NOT NULL DEFAULT 10 CHECK (first_post_reward BETWEEN 0 AND 1000),
  second_post_reward INTEGER NOT NULL DEFAULT 5 CHECK (second_post_reward BETWEEN 0 AND 1000),
  third_post_reward INTEGER NOT NULL DEFAULT 5 CHECK (third_post_reward BETWEEN 0 AND 1000),
  daily_reward_cap INTEGER NOT NULL DEFAULT 20 CHECK (daily_reward_cap BETWEEN 0 AND 5000),
  one_day_cost INTEGER NOT NULL DEFAULT 20 CHECK (one_day_cost BETWEEN 1 AND 100000),
  three_day_cost INTEGER NOT NULL DEFAULT 50 CHECK (three_day_cost BETWEEN 1 AND 100000),
  seven_day_cost INTEGER NOT NULL DEFAULT 100 CHECK (seven_day_cost BETWEEN 1 AND 100000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);
INSERT INTO metalab_instalab_economy_settings(singleton) VALUES (TRUE) ON CONFLICT (singleton) DO NOTHING;
CREATE TABLE IF NOT EXISTS metalab_instalab_economy_rule_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_role TEXT NOT NULL DEFAULT 'teacher',
  event_type TEXT NOT NULL DEFAULT 'rules_updated',
  previous_rules JSONB NOT NULL,
  new_rules JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS metalab_instalab_wallet_entries (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('post_reward','ad_spend','refund','reversal','adjustment')),
  description TEXT NOT NULL,
  operation_key TEXT NOT NULL UNIQUE,
  post_id UUID,
  campaign_id UUID,
  local_activity_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CHECK (amount <> 0 OR entry_type = 'reversal')
);
CREATE INDEX IF NOT EXISTS metalab_instalab_wallet_student_time_idx
  ON metalab_instalab_wallet_entries(student_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS metalab_instalab_wallet_daily_reward_idx
  ON metalab_instalab_wallet_entries(student_id, local_activity_date)
  WHERE entry_type = 'post_reward';
CREATE TABLE IF NOT EXISTS metalab_instalab_daily_content_claims (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  post_id UUID,
  local_activity_date DATE NOT NULL,
  content_fingerprint TEXT NOT NULL CHECK (content_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(student_id,local_activity_date,content_fingerprint)
);
CREATE INDEX IF NOT EXISTS metalab_instalab_daily_claims_student_date_idx
  ON metalab_instalab_daily_content_claims(student_id,local_activity_date);
CREATE TABLE IF NOT EXISTS metalab_instalab_economy_security_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  class_id UUID,
  event_type TEXT NOT NULL CHECK (event_type IN ('duplicate_content_suppressed')),
  operation_key TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(student_id,operation_key)
);
CREATE INDEX IF NOT EXISTS metalab_instalab_economy_security_student_time_idx
  ON metalab_instalab_economy_security_events(student_id,created_at DESC);

CREATE TABLE IF NOT EXISTS metalab_instalab_campaigns (
  id UUID PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES metalab_classes(id) ON DELETE RESTRICT,
  creation_request_id UUID NOT NULL,
  source_post_id UUID REFERENCES metalab_instalab_posts(id) ON DELETE SET NULL,
  caption VARCHAR(1000) NOT NULL,
  objective TEXT NOT NULL CHECK (objective IN ('awareness','visits','engagement')),
  duration_days INTEGER NOT NULL CHECK (duration_days IN (1,3,7)),
  cost INTEGER NOT NULL CHECK (cost > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','active','rejected','suspended','ended')),
  image_name VARCHAR(255),
  image_mime_type VARCHAR(40),
  image_size_bytes INTEGER,
  image_data BYTEA,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  rejection_reason VARCHAR(500),
  remaining_seconds INTEGER CHECK (remaining_seconds IS NULL OR remaining_seconds >= 0),
  CHECK (source_post_id IS NOT NULL OR image_data IS NOT NULL),
  CHECK ((image_data IS NULL AND image_mime_type IS NULL AND image_size_bytes IS NULL)
    OR (image_data IS NOT NULL AND image_mime_type IN ('image/jpeg','image/png','image/webp') AND image_size_bytes BETWEEN 1 AND 4194304))
);
CREATE INDEX IF NOT EXISTS metalab_instalab_campaign_class_status_idx
  ON metalab_instalab_campaigns(class_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS metalab_instalab_campaign_student_idx
  ON metalab_instalab_campaigns(student_id, created_at DESC);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='metalab_instalab_wallet_campaign_fk') THEN
    ALTER TABLE metalab_instalab_wallet_entries ADD CONSTRAINT metalab_instalab_wallet_campaign_fk
      FOREIGN KEY (campaign_id) REFERENCES metalab_instalab_campaigns(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS metalab_instalab_campaign_request_uidx
  ON metalab_instalab_campaigns(student_id, creation_request_id);

CREATE TABLE IF NOT EXISTS metalab_instalab_campaign_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES metalab_instalab_campaigns(id) ON DELETE RESTRICT,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('student','teacher','system')),
  actor_key TEXT,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS metalab_instalab_campaign_events_idx
  ON metalab_instalab_campaign_events(campaign_id, created_at DESC);

CREATE TABLE IF NOT EXISTS metalab_instalab_campaign_impressions (
  campaign_id UUID NOT NULL REFERENCES metalab_instalab_campaigns(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE CASCADE,
  impression_day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (campaign_id, student_id, impression_day)
);
CREATE INDEX IF NOT EXISTS metalab_instalab_campaign_impressions_day_idx
  ON metalab_instalab_campaign_impressions(campaign_id, impression_day);

CREATE OR REPLACE FUNCTION metalab_capture_instalab_economy_activity() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE
  v_class UUID;
  v_event TEXT;
  v_student UUID;
  v_campaign UUID;
BEGIN
  IF TG_TABLE_NAME='metalab_instalab_wallet_entries' THEN
    v_student := NEW.student_id;
    v_campaign := NEW.campaign_id;
    IF NEW.entry_type='post_reward' THEN v_event := 'instalab.coins_earned';
    ELSIF NEW.entry_type='ad_spend' THEN v_event := 'instalab.ad_spend';
    ELSIF NEW.entry_type='refund' THEN v_event := 'instalab.ad_refund';
    ELSIF NEW.entry_type='reversal' THEN v_event := 'instalab.coins_reversed';
    ELSE v_event := 'instalab.coins_adjusted'; END IF;
    IF v_campaign IS NOT NULL THEN SELECT class_id INTO v_class FROM metalab_instalab_campaigns WHERE id=v_campaign;
    ELSIF NEW.post_id IS NOT NULL THEN SELECT class_id INTO v_class FROM metalab_instalab_posts WHERE id=NEW.post_id;
    ELSE SELECT class_id INTO v_class FROM metalab_student_class_assignments WHERE student_id=v_student; END IF;
    PERFORM metalab_record_student_activity(v_student,v_event,'wallet_entry',NEW.id::TEXT,jsonb_build_object('amount',NEW.amount,'description',NEW.description,'entryType',NEW.entry_type,'campaignId',v_campaign,'postId',NEW.post_id),'metalab_instalab_wallet_entries',NEW.id::TEXT,v_class,COALESCE(NULLIF(current_setting('metalab.actor_role',TRUE),''),'system'));
  ELSIF TG_TABLE_NAME='metalab_instalab_campaigns' THEN
    IF TG_OP='INSERT' THEN v_event := 'instalab.ad_created';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN v_event := CASE NEW.status WHEN 'active' THEN CASE WHEN OLD.status='suspended' THEN 'instalab.ad_resumed' ELSE 'instalab.ad_approved' END WHEN 'rejected' THEN 'instalab.ad_rejected' WHEN 'suspended' THEN 'instalab.ad_suspended' WHEN 'ended' THEN 'instalab.ad_ended' ELSE 'instalab.ad_updated' END;
    ELSE RETURN NEW; END IF;
    PERFORM metalab_record_student_activity(NEW.student_id,v_event,'instalab_campaign',NEW.id::TEXT,jsonb_build_object('status',NEW.status,'cost',NEW.cost,'durationDays',NEW.duration_days,'caption',NEW.caption,'rejectionReason',NEW.rejection_reason),'metalab_instalab_campaigns',NEW.id::TEXT||':'||v_event||':'||clock_timestamp(),NEW.class_id,CASE WHEN TG_OP='INSERT' THEN 'student' ELSE 'teacher' END);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS metalab_instalab_wallet_activity ON metalab_instalab_wallet_entries;
CREATE TRIGGER metalab_instalab_wallet_activity AFTER INSERT ON metalab_instalab_wallet_entries
  FOR EACH ROW EXECUTE FUNCTION metalab_capture_instalab_economy_activity();
DROP TRIGGER IF EXISTS metalab_instalab_campaign_activity ON metalab_instalab_campaigns;
CREATE TRIGGER metalab_instalab_campaign_activity AFTER INSERT OR UPDATE ON metalab_instalab_campaigns
  FOR EACH ROW EXECUTE FUNCTION metalab_capture_instalab_economy_activity();

-- Keep financial history immutable and reverse earned rewards when a rewarded post is removed.
CREATE OR REPLACE FUNCTION metalab_instalab_wallet_immutable() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'wallet entries are immutable';
END $$;
DROP TRIGGER IF EXISTS metalab_instalab_wallet_no_update ON metalab_instalab_wallet_entries;
CREATE TRIGGER metalab_instalab_wallet_no_update
  BEFORE UPDATE OR DELETE ON metalab_instalab_wallet_entries
  FOR EACH ROW EXECUTE FUNCTION metalab_instalab_wallet_immutable();
DROP TRIGGER IF EXISTS metalab_instalab_rule_events_no_update ON metalab_instalab_economy_rule_events;
CREATE TRIGGER metalab_instalab_rule_events_no_update
  BEFORE UPDATE OR DELETE ON metalab_instalab_economy_rule_events
  FOR EACH ROW EXECUTE FUNCTION metalab_instalab_wallet_immutable();
DROP TRIGGER IF EXISTS metalab_instalab_campaign_events_no_update ON metalab_instalab_campaign_events;
CREATE TRIGGER metalab_instalab_campaign_events_no_update
  BEFORE UPDATE OR DELETE ON metalab_instalab_campaign_events
  FOR EACH ROW EXECUTE FUNCTION metalab_instalab_wallet_immutable();
DROP TRIGGER IF EXISTS metalab_instalab_security_events_no_update ON metalab_instalab_economy_security_events;
CREATE TRIGGER metalab_instalab_security_events_no_update
  BEFORE UPDATE OR DELETE ON metalab_instalab_economy_security_events
  FOR EACH ROW EXECUTE FUNCTION metalab_instalab_wallet_immutable();

CREATE OR REPLACE FUNCTION metalab_instalab_reverse_post_reward() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_earned INTEGER;
  v_reversed INTEGER;
  v_balance INTEGER;
  v_reversal INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(OLD.student_id::text, 731902));
  SELECT COALESCE(SUM(amount), 0) INTO v_earned FROM metalab_instalab_wallet_entries
    WHERE post_id = OLD.id AND entry_type = 'post_reward';
  SELECT COALESCE(SUM(-amount), 0) INTO v_reversed FROM metalab_instalab_wallet_entries
    WHERE operation_key = 'post-delete:' || OLD.id::text AND entry_type = 'reversal';
  v_reversal := GREATEST(0, v_earned - v_reversed);
  IF v_reversal > 0 THEN
    SELECT COALESCE(SUM(amount),0) INTO v_balance FROM metalab_instalab_wallet_entries WHERE student_id = OLD.student_id;
    -- Never create a negative wallet. If part of the reward was already spent, record the unreversed remainder in metadata.
    INSERT INTO metalab_instalab_wallet_entries(id, student_id, amount, entry_type, description, operation_key, metadata)
      VALUES (gen_random_uuid(), OLD.student_id, -LEAST(v_reversal, GREATEST(v_balance,0)), 'reversal', 'Estorno por remoção de publicação', 'post-delete:' || OLD.id::text,
        jsonb_build_object('postId', OLD.id, 'requestedReversal', v_reversal, 'unreversedSpentAmount', GREATEST(0, v_reversal - GREATEST(v_balance,0))));
  END IF;
  RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS metalab_instalab_reverse_reward_on_delete ON metalab_instalab_posts;
CREATE TRIGGER metalab_instalab_reverse_reward_on_delete
  BEFORE DELETE ON metalab_instalab_posts
  FOR EACH ROW EXECUTE FUNCTION metalab_instalab_reverse_post_reward();
