# Component Database & Compatibility Engine — implementation doc

**Status:** P3 deterministic/local production slice implemented; native Claude ETL contract exists, credentialed sandbox/live ingestion does not · **Phases:** P3 · **Home:** Postgres (data plane) +
`crates/forge-validate::compat` (compatibility rules — CORE-side per D16, corrected from the earlier gateway *(proposed)* placement; gateway/studio consume) + `workers/etl`; lockfile resolution in `crates/forge-contract` (live) · **Plan refs:** §9 (v3.0) · **Decisions:** D1,
D5, D10, D12, D36

## 1. Purpose

Turn the FPV ecosystem's published truth — datasheets, manufacturer CAD, bench
thrust tables — into exact, parametric, license-tracked catalog parts that back
contract slots via `componentRef`. This is the **verify-first wedge (D1)**: the
catalog and its honest numbers are the first public artifact, shipping before
generation GA.

## 2. Schema (Postgres DDL — P3 local slice)

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
CREATE TABLE prices (component_id text, vendor text, sku text, price numeric, currency text,
  url text, fetched_at timestamptz, region text, purchasable boolean);
CREATE TABLE provenance (artifact_id text, field text, source_url text,
  extractor text, confidence numeric, cited_at timestamptz);  -- per-field citations
CREATE TABLE review_queue (...);
CREATE TABLE reference_rigs (...);
CREATE TABLE reference_rig_items (...);
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

### Bench-grid authority boundary (D65)

The checked-in file-catalog row currently declares `voltage` once per thrust table;
the loader assigns that voltage to every throttle point. It therefore represents a
single-voltage sweep, not one multi-voltage grid capable of covering a non-degenerate
battery operating range. D65 retains and rejects such rows when voltage/prop coverage
does not match, and it never merges separate single-voltage tables implicitly.

Before applicable catalog thrust can be claimed, version the row and loader so each
point (or an equivalently explicit reviewed grid axis) carries sourced voltage
authority. The change needs compatibility classification, old-row migration/read
semantics, ETL and boundary-corpus cases, rectangular-grid/duplicate/ambiguity
refusals, generated-doc/golden review where affected, and source/review/license proof
for the actual grid. Until then the analytic fallback is the only honest curve for a
battery range.

## 4. ETL pipeline (P3-004; worker detail in [`compute-workers.md`](compute-workers.md))

fetch manufacturer pages/datasheets/STEP → Claude-extracted structured specs against
the component schema with **per-field source citations** → OCCT tessellation +
meshoptimizer LOD chain → dedupe by (brand, model, rev) → **license-ledger entry
(non-optional)** → low-confidence extractions to a human review queue. **Nothing
auto-publishes.** Batch API for bulk runs.

Contract/fixture implementation 2026-07-13 (D36): the worker retains deterministic
fixture extraction and a deployment-command override, then adds a native pinned
Haiku 4.5 Messages API path behind deployment credentials. Source data is explicitly
delimited as untrusted; the request uses an exact public HTTPS host, forced strict
tool selection, and byte/time/depth/node ceilings. Anthropic's supported strict
schema constrains the transport envelope; the worker reparses and validates the full
category-dependent row locally, including required identity, finite SI mass,
confidence, license/export policy, offers, and per-field citations. Extraction
model/API/source-hash provenance is retained. This produces only a review candidate:
real credential proof, dedupe, immutable revision/ledger persistence, live OCCT/LOD,
and end-to-end human review from the worker result remain P3-004 work.

QA-007 makes the publication edge explicit: row and per-field confidence must be
finite in `[0,1]`; NaN, infinity, booleans, and out-of-range values require review
and block publication. Every citation has a non-empty extractor and credential-free
HTTPS source. Invalid citations may still identify a field for diagnostics, but they
never satisfy publication authority.

## 5. License ledger & export filter (D10; XC-17)

License class set at ingestion drives the export matrix
([`security-safety-legal.md`](../security-safety-legal.md) §4): restricted classes
serve derived LODs in-studio and degrade to dimensioned envelopes + link-out in
STEP/3MF exports. The filter lives in the exporters; the *data* lives here.

Live 2026-06-14: gateway `GET /v1/license-ledger` exposes a read-only ledger of
license classes, source terms, component counts, priced/cited row counts, review
counts, blocked exports, and export-policy distribution. Studio renders the ledger
in the platform panel so restricted/export-filtered catalog state is user-visible.

Live 2026-07-13 (`SEC-001`): the deterministic gateway/worker export paths now refuse
missing or contradictory ledger evidence and derive one assembly policy. Open assets
retain full geometry; attribution assets bind a versioned 1.0 license-export manifest;
restricted assets require a complete millimeter envelope, datum ports, component ID,
and credential-free HTTPS source link, then emit only derived-LOD/envelope references
and BOM link-outs. Command-backed OCCT output must return a proof bound to the exact
manifest hash; unknown fields and raw restricted export references are discarded.
This is fixture/adapter enforcement, not live-OCCT or legal-review evidence.

## 6. Lockfiles & upgrades (D5; P3-006, XC-03)

`componentRef`s are semver ranges; each model's lockfile resolves to immutable
`component_revisions`. Catalog updates never silently change a model. The upgrade
flow re-resolves, **re-validates (LIF-001)**, and diffs consequences — mass, hover
throttle, price — before the user accepts. *Live 2026-06-12 (P3-006/XC-03):
`forge-contract::{semver, pin_refs, upgrade_lockfile, RevisionSource}` — exact/^/~
ranges, pin stability (existing pins survive catalog updates), yanked revisions
verify-but-never-freshly-resolve, upgrade returns explicit diffs; tested incl.
yanked behavior.*

## 7. Proof pair & reference rigs (P3-007/008; D12)

Proof pair: one real 2207-class motor + one 4S 1500 mAh pack ingested from
datasheets; VX-2 `rotors` and `battery` slots converted to `componentRef`. Exit
proof: rendered geometry matches datasheet dimensions in tolerance; HUD hover
throttle/endurance respond to the pack swap; BOM exports purchasable SKUs.
Reference rigs: ArduPilot-capable 5″ quad + Pi-class rover, SKUs pinned at ingestion,
recorded in DECISIONS — they become P8's pilot hardware, the tutorials, and standing
test fixtures.

Live P3 fixture set (2026-06-13): `catalog/reference-rigs/` pins the quad and rover;
`forge-validate bom --catalog catalog --format json` and gateway `/v1/bom` emit
purchasable SKU rows; catalog-backed HUD includes equipped component masses and
responds to the CNHL 1500 -> 1300 pack swap.

D64 co-design authority (2026-07-17): the proof contract now retains both exact
CNHL battery revisions in one slot while equipping exactly one under D32. The file
catalog exposes a deterministic SHA-256 authority over every sorted component
filename and raw-row digest plus each row digest. Search choice authority binds the
slot/variant/ref/exact pin, mass, capacity, maximum discharge, confidence, review
note, and license/export source. Native co-design evaluation records only equipped
rows and keeps both catalog choices `reviewRequired=true`,
`marketplacePublicationReviewed=false`, and `marketplaceExposable=false`. This is
repository catalog/fixture authority, not owner publication approval, live Postgres
persistence, vendor freshness, or a credentialed ingestion result. Changing any
catalog byte partitions plan/batch cache and blocks checkpoint resume before engine
work.

## 8. Dependencies

Postgres + object storage; OCCT worker (tessellation); Claude (extraction);
`contract` (componentRef semantics); configurator UI (explanations); exporters
(license filter).

## 9. Testing

Schema migration tests; compatibility rule unit tests (fixture pairs with known
verdicts + explanation strings); lockfile resolution incl. yanked-revision behavior;
ETL extraction goldens (datasheet fixtures → expected rows with citations);
ingestion-without-license rejection test. The registered QA-007 citation/provider
corpora cover complete rows, missing citations/prices/revisions, low and invalid
confidence, invalid source/extractor identity, prototype-pollution keys, non-finite
claims, and excessive nesting. D10 corpus cases cover open, attribution, restricted,
and mixed assemblies plus contradictory/missing license evidence.

## 10. Phase mapping & backlog

P3: P3-001..010, XC-03, XC-06 (thrust tables), XC-17 (ledger UI/filter). P11:
BOM agent live vendor offers; price tracking as catalog-pro feature (D3).

## 11. Open questions

Embedding dimensionality/model for pgvector (pin at P3 with the embedding provider);
how photoscan components (P5, `source: photoscan`, lower confidence) rank in
configurator search; vendor price-fetch cadence and ToS compliance per vendor.
