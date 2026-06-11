# Component Database & Compatibility Engine — implementation doc

**Status:** not started · **Phases:** P3 · **Home:** Postgres (data plane) +
`packages/gateway` (compatibility rules) + `workers/etl` *(proposed)* · **Plan
refs:** §9 · **Decisions:** D1, D5, D10, D12

## 1. Purpose

Turn the FPV ecosystem's published truth — datasheets, manufacturer CAD, bench
thrust tables — into exact, parametric, license-tracked catalog parts that back
contract slots via `componentRef`. This is the **verify-first wedge (D1)**: the
catalog and its honest numbers are the first public artifact, shipping before
generation GA.

## 2. Schema (Postgres DDL sketch — finalize at P3-001)

```sql
CREATE TABLE components (
  id            text PRIMARY KEY,            -- cmp_motor_2207_brandx
  brand         text NOT NULL, model text NOT NULL, rev text NOT NULL,
  category      text NOT NULL,               -- motor | esc | fc | battery | prop | frame | ...
  dims          jsonb NOT NULL,              -- exact envelope + datum geometry params
  mass_g        numeric NOT NULL,
  elec          jsonb,  -- {kv, cells_min, cells_max, max_current_a, r_int_mohm, capacity_mah, c_rating}
  mech          jsonb,  -- {mount_pattern, shaft, thread, prop_interface}
  geometry_ref  text,                        -- object-storage key (mesh/B-rep)
  lods          int[],                       -- tri counts per LOD (≤800 / ≤150)
  ports         jsonb NOT NULL,
  price_ref     text, license_id text NOT NULL REFERENCES licenses(id),
  source        text NOT NULL,               -- datasheet | manufacturer-cad | photoscan
  confidence    numeric NOT NULL,
  embedding     vector(1536),                -- pgvector search
  UNIQUE (brand, model, rev)
);
CREATE TABLE component_revisions (           -- IMMUTABLE; lockfiles pin these (D5)
  component_id text REFERENCES components(id),
  version      text NOT NULL,                -- semver
  snapshot     jsonb NOT NULL,               -- full frozen row + geometry refs
  created_at   timestamptz NOT NULL,
  PRIMARY KEY (component_id, version)
);
CREATE TABLE connector_types (id text PRIMARY KEY, kind text, params jsonb);
CREATE TABLE licenses (id text PRIMARY KEY, class text NOT NULL  -- open|attribution|no-redistribution|view-only
  , terms text, source_url text);
CREATE TABLE thrust_tables (component_id text, voltage numeric, throttle numeric,
  thrust_g numeric, current_a numeric, rpm numeric);
CREATE TABLE prices (component_id text, vendor text, price numeric, currency text,
  url text, fetched_at timestamptz);
CREATE TABLE provenance (artifact_id text, field text, source_url text,
  extractor text, confidence numeric, cited_at timestamptz);  -- per-field citations
```

Connector taxonomy seed (P3-002): `stack-30.5×30.5-M3`, `stack-20×20-M2`,
`motor-mount-16×16-M3`, `prop-shaft-M5`, `XT60`, `XT30`, `JST-PH`, `UART`, `I2C`, …

## 3. Compatibility rules (P3-003)

Declarative constraints evaluated at equip time (configurator) and by the validator —
each violation carries an **explanation string**; compatibility is explained, never
merely enforced (the reason a card is greyed):

| Rule | Constraint |
|---|---|
| mount-pattern | equality between stack parts and frame |
| voltage window | intersection across battery ↔ ESC ↔ motor non-empty |
| current budget | battery max discharge ≥ Σ motor max × **1.2** |
| prop clearance | tip circles vs frame and adjacent tips (geometric, via BVH) |
| TWR floor | per preset: freestyle reject < 1.8, warn < 2.5 |
| connectors | electrical port types match across pairs |

## 4. ETL pipeline (P3-004; worker detail in [`compute-workers.md`](compute-workers.md))

fetch manufacturer pages/datasheets/STEP → Claude-extracted structured specs against
the component schema with **per-field source citations** → OCCT tessellation +
meshoptimizer LOD chain → dedupe by (brand, model, rev) → **license-ledger entry
(non-optional)** → low-confidence extractions to a human review queue. **Nothing
auto-publishes.** Batch API for bulk runs.

## 5. License ledger & export filter (D10; XC-17)

License class set at ingestion drives the export matrix
([`security-safety-legal.md`](../security-safety-legal.md) §4): restricted classes
serve derived LODs in-studio and degrade to dimensioned envelopes + link-out in
STEP/3MF exports. The filter lives in the exporters; the *data* lives here.

## 6. Lockfiles & upgrades (D5; P3-006, XC-03)

`componentRef`s are semver ranges; each model's lockfile resolves to immutable
`component_revisions`. Catalog updates never silently change a model. The upgrade
flow re-resolves, **re-validates (LIF-001)**, and diffs consequences — mass, hover
throttle, price — before the user accepts.

## 7. Proof pair & reference rigs (P3-007/008; D12)

Proof pair: one real 2207-class motor + one 4S 1500 mAh pack ingested from
datasheets; VX-2 `rotors` and `battery` slots converted to `componentRef`. Exit
proof: rendered geometry matches datasheet dimensions in tolerance; HUD hover
throttle/endurance respond to the pack swap; BOM exports purchasable SKUs.
Reference rigs: ArduPilot-capable 5″ quad + Pi-class rover, SKUs pinned at ingestion,
recorded in DECISIONS — they become P8's pilot hardware, the tutorials, and standing
test fixtures.

## 8. Dependencies

Postgres + object storage; OCCT worker (tessellation); Claude (extraction);
`contract` (componentRef semantics); configurator UI (explanations); exporters
(license filter).

## 9. Testing

Schema migration tests; compatibility rule unit tests (fixture pairs with known
verdicts + explanation strings); lockfile resolution incl. yanked-revision behavior;
ETL extraction goldens (datasheet fixtures → expected rows with citations);
ingestion-without-license rejection test.

## 10. Phase mapping & backlog

P3: P3-001..010, XC-03, XC-06 (thrust tables), XC-17 (ledger UI/filter — UI lands
P11). P11: BOM agent live vendor offers; price tracking as catalog-pro feature (D3).

## 11. Open questions

Embedding dimensionality/model for pgvector (pin at P3 with the embedding provider);
how photoscan components (P5, `source: photoscan`, lower confidence) rank in
configurator search; vendor price-fetch cadence and ToS compliance per vendor.
