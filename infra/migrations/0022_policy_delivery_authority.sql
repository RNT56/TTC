-- P7-011: bind each materialized policy to its owning job and retain the
-- byte-free policy envelope needed to verify an object-backed ONNX download.

ALTER TABLE policy_artifacts
  ADD COLUMN IF NOT EXISTS job_id text REFERENCES jobs (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS policy_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Historical materializers recorded their job identifier on the object row.
-- Backfill only unambiguous one-to-one rows; ambiguous legacy data stays nullable
-- and therefore cannot masquerade as authoritative one-click delivery evidence.
WITH candidates AS (
  SELECT p.id AS policy_id,
         j.id AS job_id,
         count(*) OVER (PARTITION BY j.id) AS candidate_count
    FROM policy_artifacts p
    JOIN object_blobs b ON b.id = p.artifact_blob_id
    JOIN jobs j ON j.id = b.metadata->>'jobId'
   WHERE j.kind = 'train.policy'
     AND j.owner_user_id IS NOT DISTINCT FROM p.owner_user_id
)
UPDATE policy_artifacts p
   SET job_id = candidates.job_id
  FROM candidates
 WHERE p.id = candidates.policy_id
   AND candidates.candidate_count = 1
   AND p.job_id IS NULL;

-- Preserve the useful historical policy envelope without duplicating inline
-- model bytes into the new metadata column. Existing jobs keep their old output
-- for pre-P7-011 compatibility; new writers persist object-backed output only.
UPDATE policy_artifacts p
   SET policy_metadata = jsonb_set(
         j.output,
         '{onnx}',
         COALESCE(j.output->'onnx', '{}'::jsonb) - 'modelBase64',
         true
       )
  FROM jobs j
 WHERE p.job_id = j.id
   AND j.kind = 'train.policy'
   AND jsonb_typeof(j.output) = 'object'
   AND p.policy_metadata = '{}'::jsonb;

ALTER TABLE policy_artifacts
  DROP CONSTRAINT IF EXISTS policy_artifacts_policy_metadata_object_check,
  ADD CONSTRAINT policy_artifacts_policy_metadata_object_check
    CHECK (jsonb_typeof(policy_metadata) = 'object');

CREATE UNIQUE INDEX IF NOT EXISTS policy_artifacts_job_id_idx
  ON policy_artifacts (job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON COLUMN policy_artifacts.job_id IS
  'P7-011 one-winner job identity; D38 allows at most one authoritative policy materialization';
COMMENT ON COLUMN policy_artifacts.policy_metadata IS
  'Byte-free worker artifact envelope binding model revision, scorecard, tensor contract, and ONNX digest';
