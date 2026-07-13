-- QA-005 / D38: at-least-once worker leases and verified client uploads.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_token text,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS timeout_seconds integer NOT NULL DEFAULT 3600,
  ADD COLUMN IF NOT EXISTS last_error_code text;

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_max_attempts_check,
  ADD CONSTRAINT jobs_max_attempts_check
    CHECK (max_attempts BETWEEN 1 AND 10),
  DROP CONSTRAINT IF EXISTS jobs_timeout_seconds_check,
  ADD CONSTRAINT jobs_timeout_seconds_check
    CHECK (timeout_seconds BETWEEN 1 AND 28800),
  DROP CONSTRAINT IF EXISTS jobs_last_error_code_check,
  ADD CONSTRAINT jobs_last_error_code_check
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  DROP CONSTRAINT IF EXISTS jobs_lease_state_check;

-- Deployments stop old workers before this migration. Any row left running has no
-- fence token and is therefore safely returned to the at-least-once queue.
UPDATE jobs
   SET status = 'queued',
       available_at = now(),
       started_at = NULL,
       finished_at = NULL,
       error = 'requeued during D38 lease migration',
       last_error_code = 'lease-migration-requeue'
 WHERE status = 'running'
   AND lease_token IS NULL;

ALTER TABLE jobs
  ADD CONSTRAINT jobs_lease_state_check CHECK (
    (status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'running' AND lease_token IS NULL AND lease_expires_at IS NULL)
  );

DROP INDEX IF EXISTS jobs_worker_claim_idx;
CREATE INDEX IF NOT EXISTS jobs_worker_ready_idx
  ON jobs (available_at, created_at, provider, kind)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS jobs_worker_lease_expiry_idx
  ON jobs (lease_expires_at, created_at)
  WHERE status = 'running';

ALTER TABLE object_blobs
  ADD COLUMN IF NOT EXISTS upload_status text NOT NULL DEFAULT 'complete',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_error_code text;

ALTER TABLE object_blobs
  DROP CONSTRAINT IF EXISTS object_blobs_upload_status_check,
  ADD CONSTRAINT object_blobs_upload_status_check
    CHECK (upload_status IN ('staged', 'complete')),
  DROP CONSTRAINT IF EXISTS object_blobs_verification_error_code_check,
  ADD CONSTRAINT object_blobs_verification_error_code_check CHECK (
    verification_error_code IS NULL
    OR verification_error_code ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  );

COMMENT ON COLUMN jobs.lease_token IS
  'D38 attempt fence; only the current unexpired lease may finish, retry, or fail a job';
COMMENT ON COLUMN object_blobs.upload_status IS
  'D38 client uploads remain staged until exact length/type/checksum metadata is verified';
