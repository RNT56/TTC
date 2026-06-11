# Environments & Courses — implementation doc

**Status:** not started · **Phases:** P10 (seam designed at P4) · **Home:**
`forge-contract` (EnvSpec schema) + gateway (registry/leaderboards) *(proposed)* ·
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
  meta:      { id, name, version, provenance, license },
  terrain:   heightfield | primitive composition,
  obstacles: [{ kind: gate | block | ..., pose, dims }],
  spawns:    [{ pose, archetypeFilter? }],
  win:       { gateOrder?, timeLimit?, contactPenalties? },
  env:       { wind, lighting }            // overrides the model's env defaults
}
```

Same conventions as ModelSpec (Y-up meters, semver, provenance). Generated via the
P4 pipeline with a smaller schema (orchestrator is schema-generic by design, P4-013).

## 3. The course gatekeeper (P10-002)

Same sovereign-validator discipline — ENV-* checks in the harness catalog:
ENV-001 spawn validity · ENV-002 reachability spawn → goals (archetype-aware:
a gate sequence flyable/driveable by the declared class) · ENV-003 bounds sanity ·
ENV-004 no degenerate colliders. Courses carry validator reports like models.

## 4. Leaderboards (P10-005; D17 makes them honest)

Per-course, per-archetype, and per-class (e.g. stock VX-2 vs open class). A run
submits its replay `{contract hash + lockfile, env, seed, input tape}` — under D17 a
tape is **universally checkable** (anyone can replay it bit-exactly on any surface);
the server re-verifies (`replay.verify` worker, XC-25) before a time enters the
official board, as **anti-cheat hygiene** rather than as the only place truth
exists.

## 5. Courses as RL tasks (P10-006)

A course compiles to a task definition (spawn → win conditions → reward shaping
defaults per archetype), entering the P7 task suite without conversion work —
community content becomes training curriculum, the flywheel's social gear.

## 6. Dependencies

Generation pipeline (env generation), harness (ENV checks), `forge-sim` (course
physics + replay), gateway (registry, verification), learning engine (task adapter),
studio (editor + boards).

## 7. Testing

ENV-check fixtures (valid/invalid courses); reachability known-cases per archetype;
leaderboard verification integration test (tampered tape must reject); course→task
adapter smoke (a fixture course trains a few steps with learning signal).

## 8. Phase mapping & backlog

P4: schema-generic orchestrator seam (P4-013). P10: P10-001..006, XC-25.

## 9. Open questions

Heightfield format + resolution caps (collider budget for terrain); course
versioning vs leaderboard continuity (a course edit likely forks the board *(proposed)*);
anti-cheat depth beyond bit-exact replay (input-tape plausibility heuristics —
defer until abused).
