# catalog/ — file-backed component rows (P3-007a)

The pre-Postgres catalog: one JSON row per component under `components/`,
consumed by `forge-validate --catalog catalog` (CLI) and the
`FileCatalog` source (`forge-validate::file_catalog`). The P3-001 Postgres
schema ingests the same rows; this directory is the review-queue staging
area, not a second source of truth.

## Row rules (binding — D10, P3-004, BEST-PRACTICES §1)

- **No invented data.** Every numeric field carries a citation in
  `citations` — the value as printed, source URLs, accessed date, and a
  note for any derivation (e.g. C-rating × capacity) or discrepancy.
- **`confidence` < 1 ⇒ `review` is mandatory** and states exactly what
  blocks full confidence. Nothing below confidence 1.0 is marketplace-
  exposable; the human review queue (P3-004) clears it by verifying each
  field against its citations.
- **`licenseClass` is non-optional** (open / attribution /
  no-redistribution / view-only) and governs the export matrix.
- **Revisions are immutable.** Fixing a field = new semver revision;
  yanking hides a revision from fresh resolution while existing lockfile
  pins keep verifying (D5).

## Current rows

| id | what | confidence |
|---|---|---|
| `cmp_motor_emax-eco2-2207-1900kv` | EMAX ECO II 2207 1900KV (proof motor) | 0.7 — transcribed from search-result quotations of the cited pages; this build environment's egress allowlist blocks direct datasheet fetch. Owner verification against citations required. |
| `cmp_batt_cnhl-black-4s-1500` | CNHL Black Series 4S 1500 mAh 100C (proof pack) | 0.7 — same provenance path. |

The proof pair is exercised end to end by `examples/vx2-proof.forge.json`
(slots → semver refs → lockfile pins → CTR-006) and
`crates/forge-validate/tests/proof_pair.rs` (datasheet-dimension tolerance,
resolver pins, CAT compatibility, review-note enforcement).
