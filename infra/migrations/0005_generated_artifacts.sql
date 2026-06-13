-- P4 generated artifact audit/provenance rows.
-- Every admitted or draft generation can be replayed against its prompt, model pins,
-- approved-catalog context, validator report, and attempt history.

CREATE TABLE IF NOT EXISTS generated_artifacts (
  id bigserial PRIMARY KEY,
  artifact_id text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('admitted', 'draft', 'rejected')),
  prompt text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('template', 'anthropic')),
  archetype text,
  categories text[] NOT NULL DEFAULT '{}'::text[],
  seed integer,
  contract_hash text NOT NULL,
  prompt_hash text,
  model_id text,
  contract jsonb NOT NULL,
  validator_report jsonb,
  attempts jsonb NOT NULL,
  context jsonb NOT NULL,
  model_pins jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generated_artifacts_status_created_idx
  ON generated_artifacts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS generated_artifacts_provider_created_idx
  ON generated_artifacts (provider, created_at DESC);
