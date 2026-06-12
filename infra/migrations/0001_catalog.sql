-- FORGE catalog schema v0 (docs/systems/component-database.md §2; plan §9.1).
-- Forward-only migrations; reviewed like code. pgvector for embedding search.
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS licenses (
    id          text PRIMARY KEY,
    class       text NOT NULL CHECK (class IN ('open', 'attribution', 'no-redistribution', 'view-only')),
    terms       text,
    source_url  text
);

CREATE TABLE IF NOT EXISTS connector_types (
    id     text PRIMARY KEY,          -- e.g. 'stack-30.5x30.5-M3', 'XT60', 'UART'
    kind   text NOT NULL CHECK (kind IN ('mechanical', 'electrical', 'data')),
    params jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS components (
    id           text PRIMARY KEY,    -- cmp_motor_2207_brandx
    brand        text NOT NULL,
    model        text NOT NULL,
    rev          text NOT NULL,
    category     text NOT NULL,       -- motor | esc | fc | battery | prop | frame | ...
    dims         jsonb NOT NULL,
    mass_g       numeric NOT NULL,
    elec         jsonb,
    mech         jsonb,
    geometry_ref text,
    lods         integer[],
    ports        jsonb NOT NULL DEFAULT '[]'::jsonb,
    price_ref    text,
    license_id   text NOT NULL REFERENCES licenses (id),  -- non-optional (D10)
    source       text NOT NULL CHECK (source IN ('datasheet', 'manufacturer-cad', 'photoscan')),
    confidence   numeric NOT NULL,
    embedding    vector(1536),
    UNIQUE (brand, model, rev)
);

-- Immutable rows lockfiles pin against (D5). Never UPDATE; only INSERT.
CREATE TABLE IF NOT EXISTS component_revisions (
    component_id text NOT NULL REFERENCES components (id),
    version      text NOT NULL,       -- exact semver
    snapshot     jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (component_id, version)
);

CREATE TABLE IF NOT EXISTS thrust_tables (
    component_id text NOT NULL REFERENCES components (id),
    voltage      numeric NOT NULL,
    throttle     numeric NOT NULL,
    thrust_g     numeric NOT NULL,
    current_a    numeric NOT NULL,
    rpm          numeric,
    PRIMARY KEY (component_id, voltage, throttle)
);

CREATE TABLE IF NOT EXISTS prices (
    component_id text NOT NULL REFERENCES components (id),
    vendor       text NOT NULL,
    price        numeric NOT NULL,
    currency     text NOT NULL,
    url          text NOT NULL,
    fetched_at   timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (component_id, vendor, fetched_at)
);

-- Per-field source citations (doctrine #2: datasheets and citations or nothing).
CREATE TABLE IF NOT EXISTS provenance (
    artifact_id text NOT NULL,
    field       text NOT NULL,
    source_url  text NOT NULL,
    extractor   text NOT NULL,
    confidence  numeric NOT NULL,
    cited_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (artifact_id, field)
);

-- Validator reports stored with artifacts (reports are provenance).
CREATE TABLE IF NOT EXISTS validator_reports (
    contract_hash     text NOT NULL,
    validator_version text NOT NULL,
    target            text NOT NULL,
    verdict           text NOT NULL CHECK (verdict IN ('admitted', 'draft', 'rejected')),
    report            jsonb NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (contract_hash, validator_version, created_at)
);
