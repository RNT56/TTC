-- Remaining P4-P12 live-path interfaces: platform gate signoffs,
-- quote/link commerce, and usage-beta marketplace economics. This intentionally
-- adds no payment, payout, or direct-checkout tables.

CREATE TABLE IF NOT EXISTS platform_gate_signoffs (
  id text PRIMARY KEY DEFAULT ('gate-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  gate_key text NOT NULL CHECK (gate_key IN (
    'd28.hardware',
    'p11.policy-sharing',
    'p11.marketplace-economics'
  )),
  status text NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked', 'accepted', 'revoked')),
  policy_version text NOT NULL,
  jurisdiction text NOT NULL DEFAULT 'unspecified',
  reviewer text NOT NULL DEFAULT 'system',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evidence_url text,
  effective_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_gate_signoffs_gate_created_idx
  ON platform_gate_signoffs (gate_key, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_gate_signoffs_active_idx
  ON platform_gate_signoffs (gate_key, status)
  WHERE revoked_at IS NULL;

INSERT INTO platform_gate_signoffs (
  gate_key, status, policy_version, jurisdiction, reviewer, evidence
)
SELECT gate_key, 'blocked', 'p4-p12-live-gates-2026-06-14', 'unspecified', 'system',
       jsonb_build_object('reason', reason)
  FROM (
    VALUES
      ('d28.hardware', 'D28 legal/hardware signoff has not been recorded'),
      ('p11.policy-sharing', 'dual-use/export-control platform signoff has not been recorded'),
      ('p11.marketplace-economics', 'usage-beta economics decision is active; payout economics are deferred')
  ) AS defaults(gate_key, reason)
 WHERE NOT EXISTS (
   SELECT 1 FROM platform_gate_signoffs existing
    WHERE existing.gate_key = defaults.gate_key
 );

CREATE TABLE IF NOT EXISTS vendor_offers (
  id text PRIMARY KEY DEFAULT ('offer-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  component_id text NOT NULL,
  vendor text NOT NULL,
  sku text,
  url text NOT NULL,
  price numeric,
  currency text,
  availability text NOT NULL DEFAULT 'unknown'
    CHECK (availability IN ('in-stock', 'backorder', 'out-of-stock', 'unknown')),
  source text NOT NULL DEFAULT 'catalog' CHECK (source IN ('catalog', 'live', 'sandbox')),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendor_offers_component_fetched_idx
  ON vendor_offers (component_id, fetched_at DESC);
CREATE INDEX IF NOT EXISTS vendor_offers_vendor_idx
  ON vendor_offers (vendor, fetched_at DESC);

CREATE TABLE IF NOT EXISTS print_quote_requests (
  id text PRIMARY KEY DEFAULT ('pqr-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  model_id text REFERENCES model_registry (id) ON DELETE SET NULL,
  job_id text REFERENCES jobs (id) ON DELETE SET NULL,
  artifact_blob_id text REFERENCES object_blobs (id) ON DELETE SET NULL,
  process text NOT NULL DEFAULT 'fdm',
  material text NOT NULL DEFAULT 'pla',
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  dfm_artifact jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'quoted'
    CHECK (status IN ('draft', 'requested', 'quoted', 'failed', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS print_quote_requests_owner_created_idx
  ON print_quote_requests (owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS print_quote_offers (
  id text PRIMARY KEY DEFAULT ('pqo-' || substr(encode(gen_random_bytes(8), 'hex'), 1, 16)),
  request_id text NOT NULL REFERENCES print_quote_requests (id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_quote_id text,
  quote_url text NOT NULL,
  price numeric,
  currency text,
  lead_time_days integer,
  expires_at timestamptz,
  terms jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS print_quote_offers_request_idx
  ON print_quote_offers (request_id, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_usage_rollups (
  bucket_date date NOT NULL,
  listing_id text REFERENCES marketplace_listings (id) ON DELETE CASCADE,
  listing_kind text NOT NULL CHECK (listing_kind IN ('model', 'course', 'skill', 'component', 'policy')),
  views integer NOT NULL DEFAULT 0,
  equips integer NOT NULL DEFAULT 0,
  quote_clicks integer NOT NULL DEFAULT 0,
  policy_downloads integer NOT NULL DEFAULT 0,
  training_jobs integer NOT NULL DEFAULT 0,
  credits_spent numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_date, listing_id)
);

CREATE INDEX IF NOT EXISTS marketplace_usage_rollups_kind_date_idx
  ON marketplace_usage_rollups (listing_kind, bucket_date DESC);
