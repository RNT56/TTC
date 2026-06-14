ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS jobs_worker_claim_idx
  ON jobs (status, provider, kind, created_at);
