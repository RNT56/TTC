-- SEC-004: immutable, versioned consent grants and withdrawals.
-- Subject ownership is polymorphic and is therefore enforced by the gateway in the
-- same serializable transaction that appends each event.

CREATE TABLE IF NOT EXISTS user_consent_events (
  id text PRIMARY KEY DEFAULT ('cns-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  ledger_version text NOT NULL,
  owner_user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN (
    'photoscan.processing',
    'telemetry.sharing',
    'pattern.contribution',
    'leaderboard.publication',
    'training.reuse'
  )),
  subject_kind text NOT NULL CHECK (subject_kind IN (
    'account',
    'object-blob',
    'telemetry-log',
    'model'
  )),
  subject_id text NOT NULL,
  policy_version text NOT NULL,
  notice_hash text NOT NULL CHECK (notice_hash ~ '^[0-9a-f]{64}$'),
  action text NOT NULL CHECK (action IN ('grant', 'withdraw')),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text,
  previous_event_id text REFERENCES user_consent_events (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS user_consent_events_latest_idx
  ON user_consent_events (
    owner_user_id, purpose, subject_kind, subject_id, created_at DESC, id DESC
  );

ALTER TABLE pattern_library
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_model_id text REFERENCES model_registry (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pattern_library_user_opt_in_model_idx
  ON pattern_library (source_model_id)
  WHERE consent = 'opt-in' AND source_model_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS pattern_library_owner_created_idx
  ON pattern_library (owner_user_id, created_at DESC)
  WHERE owner_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION reject_user_consent_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'user consent events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS user_consent_events_append_only ON user_consent_events;
CREATE TRIGGER user_consent_events_append_only
BEFORE UPDATE ON user_consent_events
FOR EACH ROW EXECUTE FUNCTION reject_user_consent_event_update();

COMMENT ON TABLE user_consent_events IS
  'SEC-004 append-only consent grant/withdrawal history; evidence must not contain user content or credentials';
