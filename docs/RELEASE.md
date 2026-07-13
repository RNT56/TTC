# Validator release procedure

Owner: repository maintainers  
Applies to: standalone `forge-validate` and `@forge/validate-wasm`  
Current candidate: **v0.1.0**

The release workflow is the only supported artifact builder. A local build is useful
for diagnosis, but it is not release evidence.

The x86_64 macOS lane uses GitHub's supported `macos-26-intel` image and every native
matrix job has a 60-minute ceiling. `macos-15-intel` is the rollback image through
August 2027, but it is not the default: protected manual run `29216053372` spent
5h10m in full-LTO build/smoke without producing a macOS artifact. Any runner change
must preserve the same binary smoke, aggregate verification, and downloaded proof.

## Outputs

Every successful manual or tag run produces one aggregate Actions artifact with:

- `forge-validate-<version>-linux-x86_64.tar.gz`;
- `forge-validate-<version>-macos-x86_64.tar.gz`;
- `forge-validate-<version>-windows-x86_64.zip`;
- `forge-validate-wasm-<version>.tgz`;
- source and artifact SPDX JSON SBOMs;
- `release-manifest.json`, `SHA256SUMS`, and release notes.

The aggregate job creates a GitHub build-provenance attestation over every payload.
It then verifies all checksums from the assembled artifact, extracts the Linux bundle
into a clean temporary directory, checks `--version`, admits the canonical example,
and inspects the packed WASM package. Tag runs attach the same files to a GitHub
Release only after that proof succeeds.

## Pre-release

1. `main` is protected, clean, and green in CI, security, nightly, and the 31-step
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

- Before publication: fix the source and rerun; never replace files inside a passed
  artifact or reuse a failed tag.
- After a bad GitHub Release: mark it withdrawn, document the affected checksums,
  publish a patch version, and retain the audit trail. Do not silently overwrite an
  asset with the same name.
- Validator v0.1.0 has no database migration. Rollback removes the binary/package and
  restores the previous installed version. Persisted ModelSpec/replay/EnvSpec support
  remains governed by [`COMPATIBILITY.md`](COMPATIBILITY.md).
