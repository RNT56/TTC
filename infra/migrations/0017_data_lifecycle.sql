-- SEC-005: retention, legal-hold, deletion-tombstone, and backup lifecycle.
-- Subject identifiers are domain-separated SHA-256 digests. Raw user IDs, object
-- keys, content, credentials, and free-form legal narrative do not belong here.

CREATE TABLE IF NOT EXISTS data_retention_policies (
  policy_version text NOT NULL,
  data_class text NOT NULL CHECK (data_class IN (
    'user-content',
    'consent-history',
    'safety-refusal-audit',
    'auth-operational',
    'job-operational',
    'lifecycle-audit'
  )),
  primary_rule text NOT NULL,
  primary_retention_days integer CHECK (primary_retention_days IS NULL OR primary_retention_days > 0),
  backup_max_days integer NOT NULL CHECK (backup_max_days BETWEEN 1 AND 365),
  tombstone_days integer NOT NULL CHECK (tombstone_days > backup_max_days),
  legal_basis text NOT NULL,
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (policy_version, data_class)
);

INSERT INTO data_retention_policies (
  policy_version, data_class, primary_rule, primary_retention_days,
  backup_max_days, tombstone_days, legal_basis, effective_at
) VALUES
  ('1.0.0', 'user-content', 'account-lifetime-or-owner-deletion', NULL, 30, 45,
   'contract-or-consent-until-owner-deletion; explicit current legal hold may defer', '2026-07-13T00:00:00Z'),
  ('1.0.0', 'consent-history', 'account-lifetime-or-owner-deletion', NULL, 30, 45,
   'accountability while account exists; explicit current legal hold may defer', '2026-07-13T00:00:00Z'),
  ('1.0.0', 'safety-refusal-audit', 'expire-after-created-at', 90, 30, 45,
   'bounded safety and abuse prevention audit', '2026-07-13T00:00:00Z'),
  ('1.0.0', 'auth-operational', 'expire-after-native-expiry', 30, 30, 45,
   'security and authentication operations', '2026-07-13T00:00:00Z'),
  ('1.0.0', 'job-operational', 'expire-after-terminal-at', 30, 30, 45,
   'service operation and incident diagnosis', '2026-07-13T00:00:00Z'),
  ('1.0.0', 'lifecycle-audit', 'expire-after-created-at', 400, 30, 45,
   'pseudonymous accountability evidence for deletion and restore suppression', '2026-07-13T00:00:00Z')
ON CONFLICT (policy_version, data_class) DO NOTHING;

CREATE TABLE IF NOT EXISTS legal_hold_events (
  id text PRIMARY KEY DEFAULT ('hld-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  lifecycle_version text NOT NULL,
  hold_key text NOT NULL CHECK (hold_key ~ '^[a-zA-Z0-9._:-]{3,120}$'),
  action text NOT NULL CHECK (action IN ('place', 'release')),
  subject_kind text NOT NULL CHECK (subject_kind IN ('user', 'object', 'audit')),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  reason_code text NOT NULL CHECK (reason_code IN (
    'litigation', 'regulatory', 'security-incident', 'billing-dispute'
  )),
  authority_reference text NOT NULL CHECK (
    authority_reference ~ '^[a-zA-Z0-9._:/-]{3,160}$'
  ),
  jurisdiction text NOT NULL CHECK (jurisdiction ~ '^[a-zA-Z0-9._:-]{2,35}$'),
  evidence_reference text NOT NULL CHECK (
    evidence_reference ~ '^[a-zA-Z0-9._:/-]{3,200}$'
  ),
  expires_at timestamptz NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[a-zA-Z0-9._:-]{3,160}$'),
  previous_event_id text REFERENCES legal_hold_events (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS legal_hold_events_subject_latest_idx
  ON legal_hold_events (subject_kind, subject_digest, hold_key, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS backup_records (
  id text PRIMARY KEY DEFAULT ('bkp-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  lifecycle_version text NOT NULL,
  provider text NOT NULL CHECK (provider ~ '^[a-zA-Z0-9._:-]{2,80}$'),
  external_reference text NOT NULL CHECK (external_reference ~ '^[a-zA-Z0-9._:/-]{3,200}$'),
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL,
  delete_after timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'available'
    CHECK (status IN ('available', 'deleting', 'deleted', 'delete-failed')),
  deleted_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_reference),
  CHECK (delete_after > captured_at),
  CHECK ((status = 'deleted') = (deleted_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS backup_records_due_idx
  ON backup_records (status, delete_after);

CREATE TABLE IF NOT EXISTS backup_subjects (
  backup_id text NOT NULL REFERENCES backup_records (id) ON DELETE CASCADE,
  subject_kind text NOT NULL CHECK (subject_kind IN ('user', 'object', 'audit')),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  PRIMARY KEY (backup_id, subject_kind, subject_digest)
);

CREATE INDEX IF NOT EXISTS backup_subjects_subject_idx
  ON backup_subjects (subject_kind, subject_digest);

CREATE TABLE IF NOT EXISTS deletion_tombstones (
  id text PRIMARY KEY,
  lifecycle_version text NOT NULL,
  deletion_id text NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN ('user', 'object')),
  subject_digest text NOT NULL CHECK (subject_digest ~ '^[0-9a-f]{64}$'),
  primary_deleted_at timestamptz NOT NULL,
  backup_delete_after timestamptz NOT NULL,
  tombstone_expires_at timestamptz NOT NULL,
  backup_deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_digest),
  CHECK (backup_delete_after > primary_deleted_at),
  CHECK (tombstone_expires_at > backup_delete_after),
  CHECK (backup_deleted_at IS NULL OR backup_deleted_at >= primary_deleted_at)
);

CREATE INDEX IF NOT EXISTS deletion_tombstones_restore_idx
  ON deletion_tombstones (subject_kind, subject_digest, tombstone_expires_at);

CREATE TABLE IF NOT EXISTS backup_restore_tests (
  id text PRIMARY KEY DEFAULT ('rst-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  lifecycle_version text NOT NULL,
  backup_id text NOT NULL REFERENCES backup_records (id) ON DELETE RESTRICT,
  manifest_sha256 text NOT NULL CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$'),
  result text NOT NULL CHECK (result IN ('eligible', 'blocked', 'failed', 'restored')),
  blocked_subject_count integer NOT NULL DEFAULT 0 CHECK (blocked_subject_count >= 0),
  evidence_reference text NOT NULL CHECK (
    evidence_reference ~ '^[a-zA-Z0-9._:/-]{3,200}$'
  ),
  tested_at timestamptz NOT NULL DEFAULT now(),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (octet_length(details::text) <= 4096)
);

CREATE INDEX IF NOT EXISTS backup_restore_tests_backup_idx
  ON backup_restore_tests (backup_id, tested_at DESC);

CREATE TABLE IF NOT EXISTS data_lifecycle_events (
  id text PRIMARY KEY DEFAULT ('lce-' || substr(encode(gen_random_bytes(12), 'hex'), 1, 24)),
  lifecycle_version text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'legal-hold-blocked',
    'deletion-primary-complete',
    'backup-registered',
    'backup-deleted',
    'backup-delete-failed',
    'restore-eligible',
    'restore-blocked',
    'retention-sweep'
  )),
  subject_kind text CHECK (subject_kind IN ('user', 'object', 'audit', 'backup')),
  subject_digest text CHECK (subject_digest IS NULL OR subject_digest ~ '^[0-9a-f]{64}$'),
  actor_kind text NOT NULL CHECK (actor_kind IN ('owner', 'operator', 'system')),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-zA-Z0-9._:-]{2,120}$'),
  evidence_reference text CHECK (
    evidence_reference IS NULL OR evidence_reference ~ '^[a-zA-Z0-9._:/-]{3,200}$'
  ),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(details) = 'object'),
  CHECK (octet_length(details::text) <= 4096)
);

CREATE INDEX IF NOT EXISTS data_lifecycle_events_subject_created_idx
  ON data_lifecycle_events (subject_kind, subject_digest, created_at DESC);

CREATE OR REPLACE FUNCTION reject_data_lifecycle_event_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'data lifecycle authority events are append-only';
END;
$$;

DROP TRIGGER IF EXISTS legal_hold_events_append_only ON legal_hold_events;
CREATE TRIGGER legal_hold_events_append_only
BEFORE UPDATE ON legal_hold_events
FOR EACH ROW EXECUTE FUNCTION reject_data_lifecycle_event_update();

DROP TRIGGER IF EXISTS data_lifecycle_events_append_only ON data_lifecycle_events;
CREATE TRIGGER data_lifecycle_events_append_only
BEFORE UPDATE ON data_lifecycle_events
FOR EACH ROW EXECUTE FUNCTION reject_data_lifecycle_event_update();

COMMENT ON TABLE data_retention_policies IS
  'SEC-005 versioned product defaults; jurisdiction-specific durations require reviewed replacement policy';
COMMENT ON TABLE legal_hold_events IS
  'Append-only time-bounded hold authority; references only, never free-form legal narrative or user content';
COMMENT ON TABLE deletion_tombstones IS
  'Pseudonymous restore-suppression records retained beyond the maximum backup window';
COMMENT ON TABLE data_lifecycle_events IS
  'Bounded pseudonymous lifecycle audit; never stores raw IDs, object keys, content, or credentials';
