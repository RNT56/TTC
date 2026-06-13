-- P3 completion: local production slice around the catalog data plane.
-- The migration runner also creates schema_migrations defensively before it
-- applies any file; this table remains here so a raw docker init gets it too.

CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   text PRIMARY KEY,
    checksum   text NOT NULL,
    applied_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prices ADD COLUMN IF NOT EXISTS sku text;
ALTER TABLE prices ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'US';
ALTER TABLE prices ADD COLUMN IF NOT EXISTS purchasable boolean NOT NULL DEFAULT true;

ALTER TABLE provenance ADD COLUMN IF NOT EXISTS value text;
ALTER TABLE provenance ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE provenance DROP CONSTRAINT IF EXISTS provenance_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS provenance_artifact_field_source_idx
    ON provenance (artifact_id, field, source_url);

CREATE TABLE IF NOT EXISTS review_queue (
    id           bigserial PRIMARY KEY,
    artifact_id  text NOT NULL,
    artifact_kind text NOT NULL CHECK (artifact_kind IN ('component', 'reference-rig')),
    reason       text NOT NULL,
    status       text NOT NULL DEFAULT 'needs_review'
                 CHECK (status IN ('needs_review', 'approved', 'rejected')),
    confidence   numeric NOT NULL,
    payload      jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    reviewed_at  timestamptz,
    reviewer     text,
    UNIQUE (artifact_id, reason, status)
);

CREATE TABLE IF NOT EXISTS reference_rigs (
    id          text PRIMARY KEY,
    name        text NOT NULL,
    class       text NOT NULL,
    purpose     text NOT NULL,
    decision_id text NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reference_rig_items (
    rig_id       text NOT NULL REFERENCES reference_rigs (id) ON DELETE CASCADE,
    role         text NOT NULL,
    component_id text NOT NULL REFERENCES components (id),
    revision     text NOT NULL,
    quantity     integer NOT NULL CHECK (quantity > 0),
    required     boolean NOT NULL DEFAULT true,
    PRIMARY KEY (rig_id, role, component_id),
    FOREIGN KEY (component_id, revision)
        REFERENCES component_revisions (component_id, version)
);

CREATE INDEX IF NOT EXISTS components_category_idx ON components (category);
CREATE INDEX IF NOT EXISTS prices_component_purchasable_idx
    ON prices (component_id, purchasable);
CREATE INDEX IF NOT EXISTS review_queue_status_idx ON review_queue (status);
