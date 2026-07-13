# Debugging and failure triage

Start by preserving the exact failing commit, command, environment, input, exit code,
and first causal error. Do not regenerate fixtures, weaken checks, or update golden
files until the failure is classified.

## Fast routing

| Symptom | First commands | Owning evidence |
|---|---|---|
| Rust/validator failure | `cargo test -p <crate> <test> -- --nocapture`; `cargo clippy --workspace -- -D warnings` | diagnostic ID, report JSON, failing fixture |
| Native/WASM disagreement | `pnpm build:wasm`; `pnpm parity` or the golden comparison in `pnpm verify` | canonical input plus both normalized outputs |
| Gateway failure | build `forge-validate`, then `pnpm --filter @forge/gateway test` | request, response, spawned-validator stderr |
| Studio failure | `pnpm --filter @forge/studio typecheck`; build; focused browser reproduction | URL/state, console error, screenshot only when visual |
| Builder browser E2E failure | inspect `artifacts/e2e/qa002-browser-e2e.json`; rerun `DATABASE_URL=... pnpm verify:db` on the exact SHA | failed flow, WASM asset, service tail, screenshot, isolated DB migration count |
| Worker failure | `PYTHONPATH=workers python3 -m pytest workers/tests/<file> -q` | job kind, sanitized payload, deterministic output/error |
| Database failure | `docker compose -f infra/docker-compose.yml up -d postgres`; `pnpm verify:db` | migration number, empty/populated state, SQL error |
| Release failure | follow `docs/RELEASE.md`; inspect the exact job and downloaded aggregate | run ID, SHA, manifest, checksum, attestation |
| Hardware failure | stop authority, disarm physically, preserve logs, follow D30/D12 runbook | rig ID, confirmation state, supervisor/FC events |

## Rules

- Reduce a failure to the smallest input that preserves the same stable diagnostic or
  behavior; add it to the appropriate regression corpus.
- Distinguish unavailable prerequisites from passing tests. A skip is not proof.
- Treat schema/codegen, generated WASM, trajectory, render, and simulation drift as a
  review event. Identify the intentional decision before re-pinning, then follow
  [`GOLDEN-ARTIFACTS.md`](GOLDEN-ARTIFACTS.md) and add a new append-only record.
- Redact secrets, provider payloads, user photos, telemetry identifiers, and signed
  URLs before sharing logs.
- For remote-only failures, download artifacts and reproduce at the exact SHA. Do not
  push speculative fixes merely to obtain a different runner.
- QA-002 must not be pointed at a shared or production database. Its runner requires
  the explicit marker set by `pnpm verify:db`, creates a unique development identity,
  and records only bounded service-log tails on failure.
- Record recurring failure modes in the owning system document or risk register.

If a vulnerability, credential, user-data exposure, or unsafe hardware authority is
suspected, stop ordinary debugging and follow [`../SECURITY.md`](../SECURITY.md).
