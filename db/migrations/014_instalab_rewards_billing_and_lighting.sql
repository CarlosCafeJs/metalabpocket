-- Additive migration for revised InstaLab rewards and prepaid ten-minute ad intervals.
-- Run only after a verified backup/snapshot. This file is intentionally not executed here.
ALTER TABLE metalab_instalab_economy_settings
  ADD COLUMN IF NOT EXISTS post_reward INTEGER NOT NULL DEFAULT 20 CHECK (post_reward BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS like_reward INTEGER NOT NULL DEFAULT 15 CHECK (like_reward BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS comment_reward INTEGER NOT NULL DEFAULT 15 CHECK (comment_reward BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS daily_like_reward_limit INTEGER NOT NULL DEFAULT 10 CHECK (daily_like_reward_limit BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS daily_comment_reward_limit INTEGER NOT NULL DEFAULT 5 CHECK (daily_comment_reward_limit BETWEEN 0 AND 1000),
  ADD COLUMN IF NOT EXISTS ad_interval_minutes INTEGER NOT NULL DEFAULT 10 CHECK (ad_interval_minutes = 10),
  ADD COLUMN IF NOT EXISTS ad_interval_cost INTEGER NOT NULL DEFAULT 10 CHECK (ad_interval_cost BETWEEN 1 AND 100000);

UPDATE metalab_instalab_economy_settings
SET first_post_reward=20, second_post_reward=20, third_post_reward=20,
    post_reward=20, like_reward=15, comment_reward=15,
    daily_reward_cap=200,
    daily_like_reward_limit=10, daily_comment_reward_limit=5,
    ad_interval_minutes=10, ad_interval_cost=10
WHERE singleton=TRUE;

DO $$ DECLARE constraint_name TEXT; BEGIN
  SELECT conname INTO constraint_name FROM pg_constraint
  WHERE conrelid='metalab_instalab_wallet_entries'::regclass AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%entry_type%';
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE metalab_instalab_wallet_entries DROP CONSTRAINT %I', constraint_name);
  END IF;
END $$;
ALTER TABLE metalab_instalab_wallet_entries ADD CONSTRAINT metalab_instalab_wallet_entry_type_check
  CHECK (entry_type IN ('post_reward','like_reward','comment_reward','ad_spend','refund','reversal','adjustment'));

ALTER TABLE metalab_instalab_campaigns
  ADD COLUMN IF NOT EXISTS budget_limit INTEGER NOT NULL DEFAULT 0 CHECK (budget_limit >= 0),
  ADD COLUMN IF NOT EXISTS amount_spent INTEGER NOT NULL DEFAULT 0 CHECK (amount_spent >= 0),
  ADD COLUMN IF NOT EXISTS paid_through TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_interval_count INTEGER NOT NULL DEFAULT 0 CHECK (billing_interval_count >= 0),
  ADD COLUMN IF NOT EXISTS billing_reason TEXT;

-- Historical active campaigns already paid their old flat price. Keep their remaining prepaid
-- end time, then let the scheduler end them without adding a free recurring interval.
UPDATE metalab_instalab_campaigns
SET budget_limit=cost, amount_spent=cost, paid_through=COALESCE(ends_at,NOW()),
    billing_reason='legacy_prepaid_period'
WHERE status='active' AND paid_through IS NULL;
UPDATE metalab_instalab_campaigns
SET budget_limit=cost, amount_spent=cost
WHERE budget_limit=0;

-- Submitted legacy ads were charged when created. Return that flat prepayment because new pending
-- ads are only charged after approval and the first interval starts.
INSERT INTO metalab_instalab_wallet_entries(id,student_id,amount,entry_type,description,operation_key,campaign_id)
SELECT gen_random_uuid(),campaign.student_id,ABS(spend.amount),'refund','Reembolso do plano antigo de anúncio aguardando aprovação','campaign-upgrade-refund:'||campaign.id,campaign.id
FROM metalab_instalab_campaigns campaign
JOIN metalab_instalab_wallet_entries spend ON spend.operation_key='ad-spend:'||campaign.id::text AND spend.amount<0
WHERE campaign.status='pending'
ON CONFLICT(operation_key) DO NOTHING;
UPDATE metalab_instalab_campaigns SET amount_spent=0 WHERE status='pending';

CREATE TABLE IF NOT EXISTS metalab_instalab_campaign_charges (
  campaign_id UUID NOT NULL REFERENCES metalab_instalab_campaigns(id) ON DELETE RESTRICT,
  interval_number INTEGER NOT NULL CHECK (interval_number > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  starts_at TIMESTAMPTZ NOT NULL,
  paid_through TIMESTAMPTZ NOT NULL,
  wallet_operation_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(campaign_id, interval_number)
);
CREATE INDEX IF NOT EXISTS metalab_instalab_campaign_due_idx
  ON metalab_instalab_campaigns(paid_through) WHERE status='active';

ALTER TABLE metalab_student_photos
  ADD COLUMN IF NOT EXISTS lighting_settings JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE TABLE IF NOT EXISTS metalab_instalab_like_reward_claims (
  student_id UUID NOT NULL REFERENCES metalab_students(id) ON DELETE RESTRICT,
  post_id UUID NOT NULL REFERENCES metalab_instalab_posts(id) ON DELETE CASCADE,
  first_liked_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  local_activity_date DATE NOT NULL,
  PRIMARY KEY(student_id,post_id)
);
