-- P4 review polish: owner decisions need audit text and an export-policy filter.
-- Rows created by P3 seeding remain pending with NULL decision fields.

ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS review_note text;
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS export_policy text;
ALTER TABLE review_queue ADD COLUMN IF NOT EXISTS decision_payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE review_queue DROP CONSTRAINT IF EXISTS review_queue_export_policy_check;
ALTER TABLE review_queue
  ADD CONSTRAINT review_queue_export_policy_check
  CHECK (
    export_policy IS NULL OR export_policy IN (
      'full-geometry-ok',
      'attribution-manifest-required',
      'envelope-link-out',
      'envelope-only',
      'bom-only',
      'blocked',
      'assembly-policy-derived'
    )
  );

CREATE INDEX IF NOT EXISTS review_queue_status_export_policy_idx
    ON review_queue (status, export_policy);
