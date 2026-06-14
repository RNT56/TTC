ALTER TABLE photoscan_artifacts
  ADD COLUMN IF NOT EXISTS artifact_blob_id text REFERENCES object_blobs (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS photoscan_artifacts_blob_idx
  ON photoscan_artifacts (artifact_blob_id);
