-- SEC-002: minimal, non-content logging for prohibited generation briefs.
-- Raw prompts and provider credentials are deliberately absent from this table.

CREATE TABLE IF NOT EXISTS generation_refusals (
  id text PRIMARY KEY DEFAULT ('ref-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  prompt_hash text NOT NULL CHECK (prompt_hash ~ '^[0-9a-f]{64}$'),
  prompt_length_bucket text NOT NULL
    CHECK (prompt_length_bucket IN ('1-64', '65-256', '257-1024', '1025-4000', '4001+')),
  policy_version text NOT NULL,
  detector_version text NOT NULL,
  categories text[] NOT NULL CHECK (cardinality(categories) > 0),
  rule_ids text[] NOT NULL CHECK (cardinality(rule_ids) > 0),
  surface text NOT NULL
    CHECK (surface IN ('context', 'generation', 'stream', 'course-generation', 'model-edit')),
  provider_requested text CHECK (provider_requested IS NULL OR provider_requested IN ('template', 'anthropic')),
  archetype text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_refusals_created_idx
  ON generation_refusals (created_at DESC);

CREATE INDEX IF NOT EXISTS generation_refusals_owner_created_idx
  ON generation_refusals (owner_user_id, created_at DESC)
  WHERE owner_user_id IS NOT NULL;

COMMENT ON TABLE generation_refusals IS
  'SEC-002 refusal audit metadata only; never stores raw brief text or credentials';
