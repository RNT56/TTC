-- Recompute authority chronology from causal links before event_sequence becomes
-- the sole latest-event ordering key. ADD COLUMN bigserial assigns values in heap
-- scan order for pre-existing rows, which is not an authority guarantee.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM user_consent_events child
      JOIN user_consent_events parent ON parent.id = child.previous_event_id
     WHERE (child.owner_user_id, child.purpose, child.subject_kind, child.subject_id)
        IS DISTINCT FROM
           (parent.owner_user_id, parent.purpose, parent.subject_kind, parent.subject_id)
  ) THEN
    RAISE EXCEPTION 'consent previous-event link crosses an authority subject';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM legal_hold_events child
      JOIN legal_hold_events parent ON parent.id = child.previous_event_id
     WHERE (child.hold_key, child.subject_kind, child.subject_digest)
        IS DISTINCT FROM
           (parent.hold_key, parent.subject_kind, parent.subject_digest)
  ) THEN
    RAISE EXCEPTION 'legal-hold previous-event link crosses an authority subject';
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS user_consent_events_append_only ON user_consent_events;
DROP TRIGGER IF EXISTS legal_hold_events_append_only ON legal_hold_events;
DROP INDEX IF EXISTS user_consent_events_sequence_idx;
DROP INDEX IF EXISTS legal_hold_events_sequence_idx;

WITH RECURSIVE consent_chain AS (
  SELECT id, 0::bigint AS depth
    FROM user_consent_events
   WHERE previous_event_id IS NULL
  UNION ALL
  SELECT child.id, parent.depth + 1
    FROM user_consent_events child
    JOIN consent_chain parent ON parent.id = child.previous_event_id
), consent_rank AS (
  SELECT event.id,
         row_number() OVER (
           ORDER BY event.owner_user_id, event.purpose, event.subject_kind,
                    event.subject_id, chain.depth, event.created_at, event.id
         )::bigint AS sequence
    FROM user_consent_events event
    JOIN consent_chain chain ON chain.id = event.id
)
UPDATE user_consent_events event
   SET event_sequence = rank.sequence
  FROM consent_rank rank
 WHERE rank.id = event.id;

WITH RECURSIVE hold_chain AS (
  SELECT id, 0::bigint AS depth
    FROM legal_hold_events
   WHERE previous_event_id IS NULL
  UNION ALL
  SELECT child.id, parent.depth + 1
    FROM legal_hold_events child
    JOIN hold_chain parent ON parent.id = child.previous_event_id
), hold_rank AS (
  SELECT event.id,
         row_number() OVER (
           ORDER BY event.subject_kind, event.subject_digest, event.hold_key,
                    chain.depth, event.created_at, event.id
         )::bigint AS sequence
    FROM legal_hold_events event
    JOIN hold_chain chain ON chain.id = event.id
)
UPDATE legal_hold_events event
   SET event_sequence = rank.sequence
  FROM hold_rank rank
 WHERE rank.id = event.id;

DO $$
DECLARE
  consent_reached bigint;
  consent_total bigint;
  hold_reached bigint;
  hold_total bigint;
BEGIN
  WITH RECURSIVE chain AS (
    SELECT id FROM user_consent_events WHERE previous_event_id IS NULL
    UNION ALL
    SELECT child.id
      FROM user_consent_events child
      JOIN chain parent ON parent.id = child.previous_event_id
  )
  SELECT count(*) INTO consent_reached FROM chain;
  SELECT count(*) INTO consent_total FROM user_consent_events;
  IF consent_reached <> consent_total THEN
    RAISE EXCEPTION 'consent authority chain is cyclic or unreachable';
  END IF;

  WITH RECURSIVE chain AS (
    SELECT id FROM legal_hold_events WHERE previous_event_id IS NULL
    UNION ALL
    SELECT child.id
      FROM legal_hold_events child
      JOIN chain parent ON parent.id = child.previous_event_id
  )
  SELECT count(*) INTO hold_reached FROM chain;
  SELECT count(*) INTO hold_total FROM legal_hold_events;
  IF hold_reached <> hold_total THEN
    RAISE EXCEPTION 'legal-hold authority chain is cyclic or unreachable';
  END IF;
END;
$$;

SELECT setval(
  pg_get_serial_sequence('user_consent_events', 'event_sequence'),
  GREATEST(COALESCE(max(event_sequence), 0), 1),
  true
) FROM user_consent_events;

SELECT setval(
  pg_get_serial_sequence('legal_hold_events', 'event_sequence'),
  GREATEST(COALESCE(max(event_sequence), 0), 1),
  true
) FROM legal_hold_events;

CREATE UNIQUE INDEX user_consent_events_sequence_idx
  ON user_consent_events (event_sequence);

CREATE UNIQUE INDEX legal_hold_events_sequence_idx
  ON legal_hold_events (event_sequence);

CREATE TRIGGER user_consent_events_append_only
BEFORE UPDATE ON user_consent_events
FOR EACH ROW EXECUTE FUNCTION reject_user_consent_event_update();

CREATE TRIGGER legal_hold_events_append_only
BEFORE UPDATE ON legal_hold_events
FOR EACH ROW EXECUTE FUNCTION reject_data_lifecycle_event_update();

COMMENT ON COLUMN user_consent_events.event_sequence IS
  'Monotonic causal order backfilled from previous-event links; timestamps and random IDs are not authority ordering';
COMMENT ON COLUMN legal_hold_events.event_sequence IS
  'Monotonic causal order backfilled from previous-event links; timestamps and random IDs are not authority ordering';
