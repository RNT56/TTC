# Examples

## `vx2-mini.forge.json` — synthetic demo quad

A 16-part, 5-inch-class multirotor contract that exercises the whole v0 loop:
schema → bake → validate → HUD → studio render. **It is synthetic**: its motor
constants, masses, and pack values are demo parameters (clearly named so), *not*
catalog data and *not* the prototype translation. The real VX-2 Hornet and
humanoid translations (P0-005..007) require the prototype monolith — PRE-002 —
and replace nothing here; this file stays as a fast fixture.

Try it:

```sh
cargo run -p forge-validate -- run  examples/vx2-mini.forge.json   # gatekeeper + HUD
cargo run -p forge-validate -- bake examples/vx2-mini.forge.json   # buffers + counts
pnpm bake:demo                                                     # refresh studio artifacts
pnpm --filter @forge/studio dev                                    # orbit it in the browser
```

Current verdict: **Admitted** — 0 errors, 0 warnings; AUW 479 g, TWR 4.70,
hover 43 %, endurance 21.8 min (assumptions listed in the report).

## `qd-mini.forge.json` — generated quadruped (zero hand-written code)

Produced entirely by the parametric generator (P2-005):

```sh
cargo run -p forge-gen -- quadruped --out examples/qd-mini.forge.json
cargo run -p forge-validate -- run examples/qd-mini.forge.json
```

13 parts, 2.5 kg budget closing exactly, trot gait passing the BEH-001 walking
smoke. Regenerate with different sliders (`--leg-pairs 3 --wheelbase 0.6 …`) —
every grid point admits. In the studio, enable **drive** to watch the core tick
walk it in-browser.

## `hrx7.forge.json` + `vx2-hornet.forge.json` — the prototype translations (P0-005/006)

**Mechanically translated** from the frozen monolith: `scripts/
translate-monolith.mjs` instruments the prototype's own `N()`/`P()` calls in a
vm sandbox and emits the contracts — no hand transcription. **Byte-equivalent**
to the oracle (`prototype/extracted-counts.json`): hrx7 125 parts · 2195 faces ·
2581 vertices; vx2-hornet 73 · 924 · 1250 — enforced in CI.

```sh
node scripts/translate-monolith.mjs       # regenerate (CI fails on drift)
cargo run -p forge-validate -- bake examples/hrx7.forge.json
node scripts/compare-counts.mjs prototype/extracted-counts.json <bakes…>
```

Known finding: both fail CTR-004 (explode coverage 69 %/42 % < 80 %) — the
historical models predate the v2.1 completeness gates. The gates stand; the
translations document the spec as it was. The drone's "combat" naming did not
survive translation (plan §17.2).

Both **drive** in the studio through the ported oracle pipelines (P1-001):
hrx7 walks its phase gait (drive slider = forward stick), vx2-hornet flies the
angle-mode flight model (throttle slider) — the same code the trajectory tapes
pin at ULP level (`crates/forge-motion/tests/tape_parity.rs`).

## `vx2-proof.forge.json` — the proof pair (P3-007)

VX-2 Mini with `rotors` + `battery` slots as **semver componentRefs** pinned
through the lockfile against `catalog/` (EMAX ECO II 2207 1900KV + CNHL Black
4S 1500 — per-field citations, review-gated at confidence 0.7).
**Admitted with `--catalog catalog`, CTR-006-rejected without it** — the
resolution chain is the point. Dimension/compat evidence:
`crates/forge-validate/tests/proof_pair.rs`.
