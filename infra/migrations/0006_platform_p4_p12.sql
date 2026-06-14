-- P4-P12 platform plane: account/session ownership, immutable shares,
-- deterministic eval history, job/object records, and the fixture-backed
-- product ladder surfaces. Auth.js table names/columns intentionally match
-- the @auth/pg-adapter contract.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name text,
  email text UNIQUE,
  "emailVerified" timestamptz,
  image text
);

CREATE TABLE IF NOT EXISTS accounts (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "userId" text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider text NOT NULL,
  type text NOT NULL,
  "providerAccountId" text NOT NULL,
  access_token text,
  expires_at integer,
  refresh_token text,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "sessionToken" text NOT NULL UNIQUE,
  "userId" text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS verification_token (
  identifier text NOT NULL,
  expires timestamptz NOT NULL,
  token text NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE INDEX IF NOT EXISTS accounts_user_idx ON accounts ("userId");
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions ("userId");

CREATE TABLE IF NOT EXISTS credit_accounts (
  user_id text PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  balance_credits numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delta_credits numeric NOT NULL,
  reason text NOT NULL,
  source_kind text NOT NULL,
  source_id text,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_events (
  id bigserial PRIMARY KEY,
  user_id text REFERENCES users (id) ON DELETE SET NULL,
  event_kind text NOT NULL,
  provider text,
  units jsonb NOT NULL DEFAULT '{}'::jsonb,
  cost_credits numeric NOT NULL DEFAULT 0,
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE generated_artifacts
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'generation',
  ADD COLUMN IF NOT EXISTS share_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lineage jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS generated_artifacts_owner_created_idx
  ON generated_artifacts (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS model_registry (
  id text PRIMARY KEY DEFAULT ('mdl-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  source_artifact_id text REFERENCES generated_artifacts (artifact_id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('admitted', 'draft', 'rejected')),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  name text NOT NULL,
  archetype text,
  contract_hash text NOT NULL,
  contract jsonb NOT NULL,
  validator_report jsonb,
  lineage jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS model_registry_owner_updated_idx
  ON model_registry (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS model_registry_contract_hash_idx
  ON model_registry (contract_hash);

CREATE TABLE IF NOT EXISTS share_snapshots (
  id text PRIMARY KEY DEFAULT ('shr-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  model_id text NOT NULL REFERENCES model_registry (id) ON DELETE CASCADE,
  owner_user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  contract_hash text NOT NULL,
  contract jsonb NOT NULL,
  validator_report jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS share_snapshots_model_created_idx
  ON share_snapshots (model_id, created_at DESC);
CREATE INDEX IF NOT EXISTS share_snapshots_public_idx
  ON share_snapshots (id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS pattern_library (
  id text PRIMARY KEY DEFAULT ('pat-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  source_artifact_id text REFERENCES generated_artifacts (artifact_id) ON DELETE SET NULL,
  source_kind text NOT NULL DEFAULT 'first-party',
  archetype text NOT NULL,
  consent text NOT NULL CHECK (consent IN ('opt-in', 'opt-out', 'first-party', 'marketplace-default')),
  summary jsonb NOT NULL,
  embedding vector(1536),
  token_vector jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pattern_library_archetype_idx
  ON pattern_library (archetype, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_runs (
  id text PRIMARY KEY DEFAULT ('eval-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  suite text NOT NULL,
  mode text NOT NULL,
  validator_kind text NOT NULL,
  provider text NOT NULL,
  summary jsonb NOT NULL,
  artifact jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS eval_runs_suite_created_idx
  ON eval_runs (suite, created_at DESC);

CREATE TABLE IF NOT EXISTS eval_brief_results (
  eval_run_id text NOT NULL REFERENCES eval_runs (id) ON DELETE CASCADE,
  brief_id text NOT NULL,
  archetype text NOT NULL,
  verdict text NOT NULL,
  repair_iterations integer NOT NULL,
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (eval_run_id, brief_id)
);

CREATE TABLE IF NOT EXISTS object_blobs (
  id text PRIMARY KEY DEFAULT ('obj-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  cache_key text UNIQUE,
  bucket text NOT NULL,
  object_key text NOT NULL,
  content_type text,
  byte_size bigint,
  sha256 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id text PRIMARY KEY DEFAULT ('job-' || substr(encode(gen_random_bytes(10), 'hex'), 1, 20)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN (
    'etl.ingest-component',
    'occt.tessellate',
    'photoscan.single',
    'photoscan.multiview',
    'train.policy',
    'train.sysid-fit',
    'replay.verify',
    'codesign.evaluate'
  )),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  provider text NOT NULL DEFAULT 'fixture'
    CHECK (provider IN ('fixture', 'local', 'modal')),
  idempotency_key text UNIQUE,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error text,
  cost_credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS jobs_owner_created_idx
  ON jobs (owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS jobs_status_kind_idx
  ON jobs (status, kind);

CREATE TABLE IF NOT EXISTS job_events (
  id bigserial PRIMARY KEY,
  job_id text NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photoscan_artifacts (
  id text PRIMARY KEY DEFAULT ('scan-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  job_id text REFERENCES jobs (id) ON DELETE SET NULL,
  source_blob_ids text[] NOT NULL DEFAULT '{}'::text[],
  scale_axes_ports jsonb NOT NULL DEFAULT '{}'::jsonb,
  refit_primitives jsonb NOT NULL DEFAULT '[]'::jsonb,
  candidate_component jsonb,
  validator_report jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS replay_artifacts (
  id text PRIMARY KEY DEFAULT ('rpl-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  tape jsonb NOT NULL,
  verification jsonb,
  tamper_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_artifacts (
  id text PRIMARY KEY DEFAULT ('pol-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  task_kind text NOT NULL,
  scorecard jsonb NOT NULL,
  artifact_blob_id text REFERENCES object_blobs (id) ON DELETE SET NULL,
  export_gate text NOT NULL DEFAULT 'blocked'
    CHECK (export_gate IN ('blocked', 'draft', 'exportable')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS courses (
  id text PRIMARY KEY DEFAULT ('course-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  name text NOT NULL,
  env_spec jsonb NOT NULL,
  validator_report jsonb,
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS leaderboard_runs (
  id text PRIMARY KEY DEFAULT ('lb-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  course_id text NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  policy_id text REFERENCES policy_artifacts (id) ON DELETE SET NULL,
  replay_id text REFERENCES replay_artifacts (id) ON DELETE SET NULL,
  user_id text REFERENCES users (id) ON DELETE SET NULL,
  score numeric NOT NULL,
  verified boolean NOT NULL DEFAULT false,
  verification jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS leaderboard_runs_course_score_idx
  ON leaderboard_runs (course_id, verified DESC, score DESC);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id text PRIMARY KEY DEFAULT ('list-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  course_id text REFERENCES courses (id) ON DELETE SET NULL,
  listing_kind text NOT NULL CHECK (listing_kind IN ('model', 'course', 'skill', 'component', 'policy')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'review', 'listed', 'rejected', 'delisted')),
  title text NOT NULL,
  license_class text,
  export_policy text NOT NULL DEFAULT 'blocked',
  price_credits numeric NOT NULL DEFAULT 0,
  validator_report jsonb,
  moderation jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telemetry_logs (
  id text PRIMARY KEY DEFAULT ('tel-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('webserial', 'desktop', 'fixture')),
  captured_at timestamptz NOT NULL DEFAULT now(),
  tape jsonb NOT NULL,
  privacy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id text PRIMARY KEY DEFAULT ('mnt-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  telemetry_id text REFERENCES telemetry_logs (id) ON DELETE SET NULL,
  record_kind text NOT NULL CHECK (record_kind IN ('wear', 'crash-forensics', 'repair-sheet', 'reorder')),
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warn', 'critical')),
  summary text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
