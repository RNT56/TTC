-- OPS-003 / D72: trusted request-to-job correlation and durable D38 attempt spans.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS observability_request_id uuid,
  ADD COLUMN IF NOT EXISTS observability_trace_id text,
  ADD COLUMN IF NOT EXISTS observability_parent_span_id text;

-- Historical jobs did not retain a request boundary. Give each one a new opaque
-- trace root without fabricating request or parent-span authority.
UPDATE jobs
   SET observability_trace_id = encode(gen_random_bytes(16), 'hex')
 WHERE observability_trace_id IS NULL;

ALTER TABLE jobs
  ALTER COLUMN observability_trace_id SET DEFAULT encode(gen_random_bytes(16), 'hex'),
  ALTER COLUMN observability_trace_id SET NOT NULL,
  DROP CONSTRAINT IF EXISTS jobs_observability_trace_id_check,
  ADD CONSTRAINT jobs_observability_trace_id_check CHECK (
    observability_trace_id ~ '^[a-f0-9]{32}$'
    AND observability_trace_id <> repeat('0', 32)
  ),
  DROP CONSTRAINT IF EXISTS jobs_observability_parent_span_id_check,
  ADD CONSTRAINT jobs_observability_parent_span_id_check CHECK (
    observability_parent_span_id IS NULL
    OR (
      observability_parent_span_id ~ '^[a-f0-9]{16}$'
      AND observability_parent_span_id <> repeat('0', 16)
    )
  ),
  DROP CONSTRAINT IF EXISTS jobs_observability_request_parent_check,
  ADD CONSTRAINT jobs_observability_request_parent_check CHECK (
    (observability_request_id IS NULL AND observability_parent_span_id IS NULL)
    OR
    (observability_request_id IS NOT NULL AND observability_parent_span_id IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS job_observability_attempts (
  job_id text NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 10),
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  request_id uuid,
  trace_id text NOT NULL CHECK (
    trace_id ~ '^[a-f0-9]{32}$' AND trace_id <> repeat('0', 32)
  ),
  span_id text NOT NULL CHECK (
    span_id ~ '^[a-f0-9]{16}$' AND span_id <> repeat('0', 16)
  ),
  parent_span_id text CHECK (
    parent_span_id IS NULL
    OR (parent_span_id ~ '^[a-f0-9]{16}$' AND parent_span_id <> repeat('0', 16))
  ),
  outcome text NOT NULL DEFAULT 'running' CHECK (
    outcome IN ('running', 'succeeded', 'retry-scheduled', 'failed', 'cancelled', 'expired')
  ),
  error_code text CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  ),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  PRIMARY KEY (job_id, attempt),
  UNIQUE (attempt_id),
  CHECK (
    (request_id IS NULL AND parent_span_id IS NULL)
    OR
    (request_id IS NOT NULL AND parent_span_id IS NOT NULL)
  ),
  CHECK (
    (outcome = 'running' AND finished_at IS NULL AND error_code IS NULL)
    OR
    (outcome = 'succeeded' AND finished_at IS NOT NULL AND error_code IS NULL)
    OR
    (outcome NOT IN ('running', 'succeeded') AND finished_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS job_observability_attempts_started_idx
  ON job_observability_attempts (started_at, job_id, attempt);

COMMENT ON COLUMN jobs.observability_request_id IS
  'D72 server-generated Gateway request UUID; null for historical or non-request jobs';
COMMENT ON COLUMN jobs.observability_trace_id IS
  'D72 trusted W3C-compatible trace ID; never accepted from a public caller';
COMMENT ON COLUMN jobs.observability_parent_span_id IS
  'D72 trusted Gateway request span parent; null for non-request jobs';
COMMENT ON TABLE job_observability_attempts IS
  'D72 non-secret D38 attempt correlation; lease tokens, payloads, and error text are excluded';
