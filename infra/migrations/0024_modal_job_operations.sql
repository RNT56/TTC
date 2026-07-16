-- P7-013: durable Modal call identity, cancellation, refund, and cost authority.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS provider_call_id text,
  ADD COLUMN IF NOT EXISTS provider_function_version bigint,
  ADD COLUMN IF NOT EXISTS provider_environment text,
  ADD COLUMN IF NOT EXISTS provider_deployment_contract_hash text,
  ADD COLUMN IF NOT EXISTS provider_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_cost_usd numeric,
  ADD COLUMN IF NOT EXISTS provider_billing_report_id text,
  ADD COLUMN IF NOT EXISTS provider_cost_reconciled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS credit_refunded_at timestamptz;

ALTER TABLE jobs
  DROP CONSTRAINT IF EXISTS jobs_provider_call_id_check,
  ADD CONSTRAINT jobs_provider_call_id_check CHECK (
    provider_call_id IS NULL
    OR provider_call_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$'
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_function_version_check,
  ADD CONSTRAINT jobs_provider_function_version_check CHECK (
    provider_function_version IS NULL OR provider_function_version > 0
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_environment_check,
  ADD CONSTRAINT jobs_provider_environment_check CHECK (
    provider_environment IS NULL
    OR (length(provider_environment) BETWEEN 1 AND 80 AND provider_environment !~ '[[:cntrl:]]')
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_deployment_contract_hash_check,
  ADD CONSTRAINT jobs_provider_deployment_contract_hash_check CHECK (
    provider_deployment_contract_hash IS NULL
    OR provider_deployment_contract_hash ~ '^[0-9a-f]{64}$'
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_cost_usd_check,
  ADD CONSTRAINT jobs_provider_cost_usd_check CHECK (
    provider_cost_usd IS NULL OR provider_cost_usd >= 0
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_billing_report_id_check,
  ADD CONSTRAINT jobs_provider_billing_report_id_check CHECK (
    provider_billing_report_id IS NULL
    OR (
      length(provider_billing_report_id) BETWEEN 1 AND 200
      AND btrim(provider_billing_report_id) = provider_billing_report_id
      AND provider_billing_report_id !~ '[[:cntrl:]]'
    )
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_cost_reconciliation_shape_check,
  ADD CONSTRAINT jobs_provider_cost_reconciliation_shape_check CHECK (
    (provider_cost_usd IS NULL AND provider_billing_report_id IS NULL AND provider_cost_reconciled_at IS NULL)
    OR
    (provider_cost_usd IS NOT NULL AND provider_billing_report_id IS NOT NULL AND provider_cost_reconciled_at IS NOT NULL)
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_operation_shape_check,
  ADD CONSTRAINT jobs_provider_operation_shape_check CHECK (
    provider_call_id IS NULL
    OR (
      provider = 'modal'
      AND provider_function_version IS NOT NULL
      AND provider_environment IS NOT NULL
      AND provider_deployment_contract_hash IS NOT NULL
      AND provider_submitted_at IS NOT NULL
    )
  ),
  DROP CONSTRAINT IF EXISTS jobs_provider_operation_time_check,
  ADD CONSTRAINT jobs_provider_operation_time_check CHECK (
    (provider_completed_at IS NULL OR provider_submitted_at IS NOT NULL)
    AND (provider_cancelled_at IS NULL OR provider_submitted_at IS NOT NULL)
    AND (provider_cost_reconciled_at IS NULL OR provider_submitted_at IS NOT NULL)
    AND (credit_refunded_at IS NULL OR cancel_requested_at IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS jobs_provider_call_unique_idx
  ON jobs (provider_call_id)
  WHERE provider_call_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS jobs_modal_active_quota_idx
  ON jobs (created_at, status)
  WHERE provider = 'modal' AND status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS job_provider_calls (
  call_id text PRIMARY KEY
    CHECK (call_id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{2,199}$'),
  job_id text NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  attempt integer NOT NULL CHECK (attempt BETWEEN 1 AND 10),
  provider text NOT NULL CHECK (provider = 'modal'),
  function_version bigint NOT NULL CHECK (function_version > 0),
  environment text NOT NULL
    CHECK (length(environment) BETWEEN 1 AND 80 AND environment !~ '[[:cntrl:]]'),
  deployment_contract_hash text NOT NULL
    CHECK (deployment_contract_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted', 'succeeded', 'failed', 'cancellation-requested', 'cancelled')),
  submitted_at timestamptz NOT NULL,
  completed_at timestamptz,
  cancelled_at timestamptz,
  provider_cost_usd numeric CHECK (provider_cost_usd IS NULL OR provider_cost_usd >= 0),
  billing_report_id text CHECK (
    billing_report_id IS NULL
    OR (
      length(billing_report_id) BETWEEN 1 AND 200
      AND btrim(billing_report_id) = billing_report_id
      AND billing_report_id !~ '[[:cntrl:]]'
    )
  ),
  cost_reconciled_at timestamptz,
  UNIQUE (job_id, attempt),
  CHECK (completed_at IS NULL OR completed_at >= submitted_at),
  CHECK (cancelled_at IS NULL OR cancelled_at >= submitted_at),
  CHECK (
    (provider_cost_usd IS NULL AND billing_report_id IS NULL AND cost_reconciled_at IS NULL)
    OR
    (provider_cost_usd IS NOT NULL AND billing_report_id IS NOT NULL AND cost_reconciled_at IS NOT NULL)
  ),
  CHECK (cost_reconciled_at IS NULL OR cost_reconciled_at >= submitted_at)
);

CREATE INDEX IF NOT EXISTS job_provider_calls_job_idx
  ON job_provider_calls (job_id, attempt DESC);

COMMENT ON COLUMN jobs.provider_call_id IS
  'P7-013 exact Modal FunctionCall ID; persisted before waiting so cancellation can terminate provider work';
COMMENT ON COLUMN jobs.provider_deployment_contract_hash IS
  'P7-013 source-bound forge-modal-training-deployment/1.0.0 contract SHA-256';
COMMENT ON COLUMN jobs.credit_refunded_at IS
  'P7-013 exact one-time credit reversal timestamp for cancellation before artifact materialization';
COMMENT ON COLUMN jobs.provider_billing_report_id IS
  'P7-013 bounded provider billing report reference owning the reconciled USD amount';
COMMENT ON TABLE job_provider_calls IS
  'P7-013 append-preserved provider attempt identity for cancellation, recovery, cost, and billing reconciliation';
