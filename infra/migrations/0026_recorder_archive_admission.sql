-- D54 / P8-003: sovereign server-side recorder archive-v1 verification and
-- explicit telemetry admission. D53 materialization remains immutable and
-- false for archive semantics; this separate row owns the stronger proof.

CREATE TABLE IF NOT EXISTS recorder_archive_admissions (
  id text PRIMARY KEY CHECK (id ~ '^raa-[0-9a-f]{20}$'),
  owner_user_id text NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  materialization_id text NOT NULL UNIQUE
    REFERENCES recorder_archive_materializations (id) ON DELETE CASCADE,
  telemetry_log_id text NOT NULL UNIQUE
    REFERENCES telemetry_logs (id) ON DELETE CASCADE,
  model_id text NOT NULL REFERENCES model_registry (id) ON DELETE CASCADE,
  schema_version text NOT NULL DEFAULT 'forge-recorder-admission/1.0.0'
    CHECK (schema_version = 'forge-recorder-admission/1.0.0'),
  verification jsonb NOT NULL CHECK (jsonb_typeof(verification) = 'object'),
  replay_file_sha256 text NOT NULL CHECK (replay_file_sha256 ~ '^[0-9a-f]{64}$'),
  frame_count bigint NOT NULL CHECK (frame_count BETWEEN 1 AND 1000000),
  duration_s double precision NOT NULL CHECK (
    duration_s >= 0
    AND duration_s <> 'NaN'::double precision
    AND duration_s <> 'Infinity'::double precision
  ),
  gateway_archive_semantics_verified boolean NOT NULL DEFAULT true
    CHECK (gateway_archive_semantics_verified = true),
  recorded_device_attested boolean NOT NULL DEFAULT false
    CHECK (recorded_device_attested = false),
  device_identity_verified boolean NOT NULL DEFAULT false
    CHECK (device_identity_verified = false),
  field_session_verified boolean NOT NULL DEFAULT false
    CHECK (field_session_verified = false),
  sharing_authorized boolean NOT NULL DEFAULT false
    CHECK (sharing_authorized = false),
  training_reuse_authorized boolean NOT NULL DEFAULT false
    CHECK (training_reuse_authorized = false),
  no_auto_arm boolean NOT NULL DEFAULT true CHECK (no_auto_arm = true),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((verification ->> 'schemaVersion' = 'forge-recorder-verification/1.0.0') IS TRUE),
  CHECK ((verification ->> 'archiveSemanticsVerified' = 'true') IS TRUE),
  CHECK ((verification ->> 'recordedDeviceAttested' = 'false') IS TRUE),
  CHECK ((verification ->> 'deviceIdentityVerified' = 'false') IS TRUE),
  CHECK ((verification ->> 'fieldSessionVerified' = 'false') IS TRUE),
  CHECK ((verification ->> 'sharingAuthorized' = 'false') IS TRUE),
  CHECK ((verification ->> 'trainingReuseAuthorized' = 'false') IS TRUE),
  CHECK ((verification ->> 'noAutoArm' = 'true') IS TRUE)
);

CREATE INDEX IF NOT EXISTS recorder_archive_admissions_owner_created_idx
  ON recorder_archive_admissions (owner_user_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS recorder_archive_admissions_model_created_idx
  ON recorder_archive_admissions (model_id, created_at DESC, id);

COMMENT ON TABLE recorder_archive_admissions IS
  'D54 sovereign archive-v1 proof and object-backed telemetry admission; no device, sharing, training, lab, or field authority';
COMMENT ON COLUMN recorder_archive_admissions.verification IS
  'Exact forge-validate recorder-verify report; the private temporary download is deleted after verification';
