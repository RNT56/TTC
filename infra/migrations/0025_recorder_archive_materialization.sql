-- D53 / P8-003: stage and materialize the exact five Desktop recorder-v1
-- files as private checksum-bound objects. This table deliberately stops before
-- telemetry admission, device attestation, sharing, or training authority.

CREATE TABLE IF NOT EXISTS recorder_archive_materializations (
  id text PRIMARY KEY DEFAULT ('ram-' || substr(encode(gen_random_bytes(10), 'hex'), 1, 20)),
  owner_user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  artifact_id text NOT NULL CHECK (artifact_id ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$'),
  schema_version text NOT NULL DEFAULT 'forge-recorder-materialization/1.0.0'
    CHECK (schema_version = 'forge-recorder-materialization/1.0.0'),
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'materialized')),
  manifest_blob_id text NOT NULL REFERENCES object_blobs (id),
  frame_blob_id text NOT NULL REFERENCES object_blobs (id),
  index_blob_id text NOT NULL REFERENCES object_blobs (id),
  replay_blob_id text NOT NULL REFERENCES object_blobs (id),
  receipt_blob_id text NOT NULL REFERENCES object_blobs (id),
  upload_plan jsonb NOT NULL CHECK (jsonb_typeof(upload_plan) = 'object'),
  aggregate_byte_size bigint NOT NULL CHECK (aggregate_byte_size > 0 AND aggregate_byte_size <= 536870912),
  gateway_object_integrity_verified boolean NOT NULL DEFAULT false,
  gateway_archive_semantics_verified boolean NOT NULL DEFAULT false
    CHECK (gateway_archive_semantics_verified = false),
  recorded_device_attested boolean NOT NULL DEFAULT false CHECK (recorded_device_attested = false),
  device_identity_verified boolean NOT NULL DEFAULT false CHECK (device_identity_verified = false),
  field_session_verified boolean NOT NULL DEFAULT false CHECK (field_session_verified = false),
  sharing_authorized boolean NOT NULL DEFAULT false CHECK (sharing_authorized = false),
  training_reuse_authorized boolean NOT NULL DEFAULT false CHECK (training_reuse_authorized = false),
  no_auto_arm boolean NOT NULL DEFAULT true CHECK (no_auto_arm = true),
  verification_error_code text CHECK (
    verification_error_code IS NULL
    OR verification_error_code ~ '^[a-z0-9][a-z0-9-]{0,79}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  materialized_at timestamptz,
  UNIQUE (owner_user_id, artifact_id),
  CHECK (
    manifest_blob_id <> frame_blob_id
    AND manifest_blob_id <> index_blob_id
    AND manifest_blob_id <> replay_blob_id
    AND manifest_blob_id <> receipt_blob_id
    AND frame_blob_id <> index_blob_id
    AND frame_blob_id <> replay_blob_id
    AND frame_blob_id <> receipt_blob_id
    AND index_blob_id <> replay_blob_id
    AND index_blob_id <> receipt_blob_id
    AND replay_blob_id <> receipt_blob_id
  ),
  CHECK (
    (status = 'staged' AND gateway_object_integrity_verified = false AND materialized_at IS NULL)
    OR
    (status = 'materialized' AND gateway_object_integrity_verified = true AND materialized_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS recorder_archive_materializations_owner_created_idx
  ON recorder_archive_materializations (owner_user_id, created_at DESC, id);

COMMENT ON TABLE recorder_archive_materializations IS
  'D53 private five-object recorder archive materialization; not telemetry admission or provenance authority';
COMMENT ON COLUMN recorder_archive_materializations.gateway_archive_semantics_verified IS
  'False in D53: object length/type/checksum and bounded manifest/receipt bindings do not replace sovereign streaming archive verification';
