-- Append-only authority needs causal ordering even when events share a timestamp.
-- Random text IDs are uniqueness, not chronology.

ALTER TABLE user_consent_events
  ADD COLUMN IF NOT EXISTS event_sequence bigserial;

ALTER TABLE legal_hold_events
  ADD COLUMN IF NOT EXISTS event_sequence bigserial;

CREATE UNIQUE INDEX IF NOT EXISTS user_consent_events_sequence_idx
  ON user_consent_events (event_sequence);

CREATE UNIQUE INDEX IF NOT EXISTS legal_hold_events_sequence_idx
  ON legal_hold_events (event_sequence);

DROP INDEX IF EXISTS user_consent_events_latest_idx;
CREATE INDEX user_consent_events_latest_idx
  ON user_consent_events (
    owner_user_id, purpose, subject_kind, subject_id, event_sequence DESC
  );

DROP INDEX IF EXISTS legal_hold_events_subject_latest_idx;
CREATE INDEX legal_hold_events_subject_latest_idx
  ON legal_hold_events (subject_kind, subject_digest, hold_key, event_sequence DESC);

ALTER TABLE legal_hold_events
  DROP CONSTRAINT IF EXISTS legal_hold_events_previous_event_id_fkey;

ALTER TABLE legal_hold_events
  ADD CONSTRAINT legal_hold_events_previous_event_id_fkey
  FOREIGN KEY (previous_event_id) REFERENCES legal_hold_events (id) ON DELETE RESTRICT;

COMMENT ON COLUMN user_consent_events.event_sequence IS
  'Monotonic causal order; timestamps and random IDs are not authority ordering';
COMMENT ON COLUMN legal_hold_events.event_sequence IS
  'Monotonic causal order; timestamps and random IDs are not authority ordering';
