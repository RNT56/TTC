# catalog/ — file-backed component rows (P3-007a)

The pre-Postgres catalog: one JSON row per component under `components/`,
consumed by `forge-validate --catalog catalog` (CLI) and the
`FileCatalog` source (`forge-validate::file_catalog`). The P3-001 Postgres
schema ingests the same rows through `pnpm db:migrate && pnpm db:seed-catalog`;
this directory is the review-queue staging area, not a second source of truth.

## Row rules (binding — D10, P3-004, BEST-PRACTICES §1)

- **No invented data.** Every numeric field carries a citation in
  `citations` — the value as printed, source URLs, accessed date, and a
  note for any derivation (e.g. C-rating × capacity) or discrepancy.
- **`confidence` < 1 ⇒ `review` is mandatory** and states exactly what
  blocks full confidence. Nothing below confidence 1.0 is marketplace-
  exposable; the human review queue (P3-004) clears it by verifying each
  field against its citations.
- **`license` is non-optional** (`id`, `class`, `terms`, `sourceUrl`,
  `exportPolicy`) and governs the export matrix.
- **`prices` are non-optional** for P3 BOM export. At least one row must be a
  purchasable SKU with vendor, URL, currency, fetched date, and region.
- **Revisions are immutable.** Fixing a field = new semver revision;
  yanking hides a revision from fresh resolution while existing lockfile
  pins keep verifying (D5).

## Current rows

| id | what | confidence |
|---|---|---|
| `cmp_motor_emax-eco2-2207-1900kv` | EMAX ECO II 2207 1900KV (proof motor) | 0.7 — review-gated; includes sparse cited thrust/current table. |
| `cmp_batt_cnhl-black-4s-1500` | CNHL Black Series V2.0 4S 1500 mAh (proof pack) | 0.85 — review-gated; purchasable package is a two-pack. |
| `cmp_batt_cnhl-black-v2-4s-1300` | CNHL Black Series V2.0 4S 1300 mAh (pack-swap fixture) | 0.9 — review-gated. |
| `cmp_fc_holybro-kakute-h7-v15` | Holybro Kakute H7 V1.5 FC | 0.85 — review-gated reference-rig row. |
| `cmp_esc_holybro-tekko32-f4-4in1-50a` | Holybro Tekko32 F4 4in1 50A ESC | 0.9 — review-gated reference-rig row. |
| `cmp_frame_tbs-source-one-v6-5in` | TBS Source One V6-class 5-inch frame | 0.75 — retailer-sourced, review-gated. |
| `cmp_prop_gemfan-hurricane-51466-v2` | Gemfan Hurricane 51466 V2 prop | 0.75 — retailer-sourced, review-gated. |
| `cmp_rover_waveshare-ugv-rover-pt-pi5-ros2` | Waveshare UGV Rover PT PI5 ROS2 Kit | 0.8 — review-gated selected-option price. |

The proof pair is exercised end to end by `examples/vx2-proof.forge.json`
(slots → semver refs → lockfile pins → CTR-006) and
`crates/forge-validate/tests/proof_pair.rs` (datasheet-dimension tolerance,
resolver pins, CAT compatibility, review-note enforcement).
