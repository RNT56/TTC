# Environments & Courses — implementation doc

**Status:** EnvSpec seam, course registry, replay verification, and course-to-task adapter live · **Phases:** P10 (seam designed at P4) · **Home:**
`forge-sim::runtime`, gateway (registry/leaderboards), workers/replay ·
**Plan refs:** §13, §8.3 (v3.0) · **Decisions:** D17

## 1. Purpose

**EnvSpec** is the contract's sibling: the same data-not-code discipline applied to
the world. Courses are generated, validated, shared by URL, raced on verified
leaderboards — and every popular course doubles as a ready-made RL task. This is the
first genuinely social surface (the FPV simulator culture has already proven the
loop commercially).

## 2. EnvSpec schema (P10-001)

```
{
  schemaVersion: "1.0.0",
  id, name, version, provenance, license,
  terrain:   heightfield | primitive composition,
  obstacles: [{ kind: gate | block | ..., pose, dims }],
  spawns:    [{ pose, archetypeFilter? }],
  win:       { gateOrder?, timeLimit?, contactPenalties? },
  env:       { wind, lighting }            // overrides the model's env defaults
}
```

`schemaVersion` governs the EnvSpec shape; `version` is the individual course
document revision. Same conventions as ModelSpec (Y-up meters, semver, provenance). Generated via the
P4 pipeline with a smaller schema (orchestrator is schema-generic by design, P4-013).
Bounds, obstacle/gate dimensions, poses, and time limits must be finite SI values;
NaN and infinity are invalid even when an ordinary `<= 0` comparison would not catch
them.

## 3. The course gatekeeper (P10-002)

Same sovereign-validator discipline — ENV-* checks in the harness catalog:
ENV-001 identity/spawn validity · ENV-002 bounds/reference sanity · ENV-003 task and
win-condition sanity · ENV-004 no degenerate obstacle/gate colliders. Courses carry
validator reports like models. `forge-validate env` is the distributable gatekeeper
surface; the gateway calls it before persisting courses. Archetype-aware reachability
for "flyable/driveable by this class" remains the next fidelity step.

## 4. Leaderboards (P10-005; D17 makes them honest)

Per-course, per-archetype, and per-class (e.g. stock VX-2 vs open class). A run
submits its replay `{contract hash + lockfile, env, seed, input tape}` — under D17 a
tape is **universally checkable** (anyone can replay it bit-exactly on any surface);
the server re-verifies (gateway replay verifier / `replay.verify` worker contract,
XC-25) before a time enters the official board, as **anti-cheat hygiene** rather
than as the only place truth exists. A client-provided `verified: true` claim is
recorded only as a claim; official `verified` is computed from tape hash,
monotonic timestamps, and optional contract-hash checks.
Timestamps are finite and strictly increasing, including a single-frame tape.

Replay producers emit `schemaVersion: "1.0.0"`. Native and worker readers retain
the historical `replay.v1` spelling during the deprecation window and reject unknown
format majors. The exact window and removal conditions are in
[`../COMPATIBILITY.md`](../COMPATIBILITY.md).

Live Studio board UI (2026-06-14) shows the selected course's verified/held runs
with filters for EnvSpec-derived archetype, verification-header class, and official
verification status. Live 2026-06-15: `replay.verify` emits those durable dimensions
(`courseId`, `archetype`, `class`, `modelId`, `policyId`, `contractHash`) in its
verification payload. Persisting them as first-class server-side columns remains the
next leaderboard data-model step before P10-005 can close.

## 5. Courses as RL tasks (P10-006)

A course compiles to a task definition (spawn → win conditions → reward shaping
defaults per archetype), entering the P7 task suite without conversion work —
community content becomes training curriculum, the flywheel's social gear.

Live 2026-06-15: `forge-sim::heavy::course_to_task` maps EnvSpec/course task lists
and archetypes to RL task specs, and the Python training worker now accepts explicit
`envSpec` or `course.envSpec` payloads in `train.policy` without a gateway
conversion step. Course task artifacts preserve course id/name/version, archetype,
spawn/gates/bounds/terrain, reward metadata, and ONNX/scorecard task ids. Gateway
course and leaderboard routes are live; `/v1/replays` persists replay verification
artifacts and leaderboard writes compute verification server-side; Studio renders a
filtered verified-board surface for the selected course, an editable EnvSpec course
form for the create/validate route, and copyable `?course=<id>` URLs for
public/unlisted course selection.

## 6. Dependencies

Generation pipeline (env generation), harness (ENV checks), `forge-sim` (course
physics + replay), gateway (registry, verification), learning engine (task adapter),
studio (editor + boards).

## 7. Testing

ENV-check fixtures (valid/invalid courses); reachability known-cases per archetype;
leaderboard verification integration test (tampered tape must reject); course→task
adapter smoke (a fixture course trains a few steps with learning signal). QA-007's
registered corpus adds eleven EnvSpec and ten cross-language replay cases for schema
major, finite bounds/poses/dimensions/time, task/gate references, empty/duplicate/
descending/non-finite time, legacy/current formats, and hash mismatch.

## 8. Phase mapping & backlog

P4: schema-generic orchestrator seam (P4-013). P10: P10-001..006, XC-25.

## 9. Open questions

Heightfield format + resolution caps (collider budget for terrain); course
versioning vs leaderboard continuity (a course edit likely forks the board *(proposed)*);
anti-cheat depth beyond bit-exact replay (input-tape plausibility heuristics —
defer until abused).
