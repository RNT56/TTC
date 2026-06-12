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
