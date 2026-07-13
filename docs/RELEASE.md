# Validator release procedure

Owner: repository maintainers  
Applies to: standalone `forge-validate` and `@forge/validate-wasm`  
Current candidate: **v0.2.0**

The release workflow is the only supported artifact builder. A local build is useful
for diagnosis, but it is not release evidence.

## Published baseline

Validator `v0.1.0` is the first verified public baseline. Protected-main manual run
[`29241883791`](https://github.com/RNT56/TTC/actions/runs/29241883791) passed every
platform, both SPDX SBOMs, checksum/payload verification, provenance attestation, and
aggregate upload at commit `1093842`; its downloaded aggregate passed independently.
Annotated tag `v0.1.0` then drove publication run
[`29244972303`](https://github.com/RNT56/TTC/actions/runs/29244972303), which published
the [nine-asset GitHub Release](https://github.com/RNT56/TTC/releases/tag/v0.1.0).
Every public asset was downloaded after publication and the verifier again passed
checksums, artifact SPDX, macOS binary/version/canonical admission, and a clean WASM
consumer. crates.io/npm publication was explicitly deferred because no owner-scoped
registry credentials or publication decision were supplied.

The x86_64 macOS lane uses GitHub's supported `macos-26-intel` image and every native
matrix job has a 60-minute ceiling. `macos-15-intel` is the rollback image through
August 2027, but it is not the default: protected manual run `29216053372` spent
5h10m in full-LTO build/smoke without producing a macOS artifact. The release profile
uses thin LTO after a clean local comparison showed materially lower wall time while
preserving version and canonical-admission smoke; macOS 26 full-LTO branch run
`29227763639` subsequently hit the one-hour ceiling before artifact upload. Any
runner or profile change must preserve the same artifact, smoke, SBOM, checksum, and
downloaded-attestation proof.

GitHub Actions artifact transfer does not preserve staged executable bits. The Linux
aggregate must therefore normalize `forge-validate` to mode 0755 immediately before
creating the deterministic tarball; the verifier checks that the extracted payload
still has an execute bit before running it. Manual thin-LTO run `29230415603` is the
negative proof: every platform build passed, but aggregate verification failed with
`EACCES` before this normalization was added.

## Outputs

Every successful manual or tag run produces one aggregate Actions artifact with:

- `forge-validate-<version>-linux-x86_64.tar.gz`;
- `forge-validate-<version>-macos-x86_64.tar.gz`;
- `forge-validate-<version>-windows-x86_64.zip`;
- `forge-validate-wasm-<version>.tgz`;
- source and artifact SPDX JSON SBOMs;
- `release-manifest.json`, `SHA256SUMS`, and release notes.

The aggregate job creates a GitHub build-provenance attestation over every payload.
It then verifies all checksums from the assembled artifact, requires all three native
bundles, and preflights archives before extraction or installation. Native and WASM
archives have compressed and expanded byte ceilings, normalized exact member
allowlists, traversal/absolute/drive/backslash/duplicate rejection, and refusal of
symlinks, hard links, devices, FIFOs, or other non-regular members. Only then does
the verifier extract the host bundle into a clean temporary directory, require a
bounded regular executable, check `--version`, admit the canonical example, and
install the packed WASM package with scripts disabled into a clean consumer. Tag runs
attach the same files to a GitHub Release
only after that proof succeeds. Manual run `29236010204` is the branch-level positive
proof: every build and aggregate job passed, and its downloaded artifact independently
passed the same verifier on macOS using the macOS x86_64 payload.

## Pre-release

1. `main` is protected, clean, and green in CI, security, nightly, and the 35-step
   local gate.
2. Cargo, npm/WASM, compatibility-matrix, release-note, and tag versions agree.
3. `docs/releases/v<version>.md` lists compatibility, migrations, rollback, known
   limitations, and no broader product claim than the evidence permits.
4. Dependency audits and CodeQL are green on the exact release commit.
5. Run `.github/workflows/release.yml` manually first. Download its aggregate
   artifact and verify it again outside the workflow. This also installs the WASM
   tarball into a clean temporary npm consumer and checks its runtime version:

   ```bash
   gh run download <run-id> --name forgedttc-validator-release-<sha> --dir /tmp/forgedttc-release
   pnpm release:validator:verify -- --dir /tmp/forgedttc-release --example examples/vx2-mini.forge.json
   ```

## Publication

Create an annotated `v<workspace-version>` tag only after the manual artifact run is
green and externally downloaded. The tag workflow requires an annotated tag whose
name exactly matches the Cargo workspace version; lightweight or mismatched tags
fail closed. It publishes the GitHub Release after assembly, SBOM generation,
checksum verification, smoke validation, and provenance attestation.

crates.io and npm publication are separate owner-token operations under GOV-009.
No workflow receives those tokens until the internal crate-order dry run and a clean
consumer install have been proved. Do not release FORGE Desktop from this workflow;
its signing, update, and Linux dependency gates are separate.

## Failure and rollback

- Database changes follow D37 and [`MIGRATIONS.md`](MIGRATIONS.md): retain the
  additive schema on normal application rollback, refuse edited/gapped ledger
  history, use a new forward migration for a committed defect, and restore only from
  a verified eligible backup under the reviewed recovery plan.
- Before publication: fix the source and rerun; never replace files inside a passed
  artifact or reuse a failed tag.
- After a bad GitHub Release: mark it withdrawn, document the affected checksums,
  publish a patch version, and retain the audit trail. Do not silently overwrite an
  asset with the same name.
- Standalone validator v0.2.0 rollback removes the binary/package and restores
  v0.1.0. ModelSpec 2.2 migration is document-local: single-variant 2.1 slots migrate
  deterministically, while multi-variant slots require an explicit equipped choice.
  A hosted gateway at this repository version also applies additive migration
  `0015_generation_refusals.sql`; application rollback retains that audit table and
  its rows unless an explicit retention/privacy decision authorizes an exported and
  backed-up purge. SEC-003 adds no migration: reverting the gateway removes the
  account export/delete routes but cannot restore primary rows or objects already
  deleted through them. SEC-004 adds additive `0016_user_consent_events.sql`;
  rollback may stop new consent actions but retains
  its append-only history, makes no old grant current under a changed notice, and
  cannot recall already completed provider work. A release that changes a consent
  notice must publish the new policy/hash and prove prior grants become inactive.
  SEC-005 adds additive `0017_data_lifecycle.sql` and
  `0018_authority_event_sequences.sql`, followed by
  `0019_authority_sequence_backfill.sql` to derive pre-existing chronology from
  causal links. Deletion receipt 2.0.0 proves primary/object
  removal plus restore suppression, not physical backup erasure. Rollback must retain
  hold, backup, tombstone, restore-test, lifecycle-audit, and monotonic authority data;
  do not re-enable a pre-deletion backup or drop tombstones. Real provider backup
  deletion, sandbox restore, and measured RPO/RTO remain the `OPS-005` release gate.
  SEC-006 adds no migration or public format. Rollback may remove the application
  guards only by reverting the whole release; it must not weaken the release archive
  preflight, re-enable body/server-fallback provider keys, trust forwarded hosts, or
  claim that external egress/rate/rotation operations existed when only deterministic
  controls were proved.
  Persisted
  ModelSpec/replay/EnvSpec support remains governed by
  [`COMPATIBILITY.md`](COMPATIBILITY.md).
