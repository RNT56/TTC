ALTER TABLE object_blobs
  ADD COLUMN IF NOT EXISTS owner_user_id text REFERENCES users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

ALTER TABLE object_blobs
  DROP CONSTRAINT IF EXISTS object_blobs_visibility_check;

ALTER TABLE object_blobs
  ADD CONSTRAINT object_blobs_visibility_check
  CHECK (visibility IN ('private', 'unlisted', 'public'));

CREATE INDEX IF NOT EXISTS object_blobs_owner_created_idx
  ON object_blobs (owner_user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS object_blobs_bucket_object_key_idx
  ON object_blobs (bucket, object_key);
