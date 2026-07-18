# Package publication boundary

Owner: repository maintainers  
Current decision: **defer crates.io and npm registry publication for v0.1.0 because
no owner-scoped registry credentials or explicit publication decision were supplied**

The Apache-2.0 crates and WASM package are intentionally packageable, but package
registries are not the first proof boundary. The first public artifact is the
checksummed, SBOM-backed, attested GitHub Release produced by `release.yml`.

Application-container publication is a separate proprietary delivery boundary, not
crates.io or npm publication. D70 and
[`hardened-registry.v1.json`](../infra/deployment/hardened-registry.v1.json) permit
only the three reviewed `LicenseRef-ForgedTTC-Proprietary` runtime images to be built
once from the exact dispatched protected `main` head and pushed to repository-owned
GHCR by digest, without mutable tags. The manual environment-gated workflow must
attach and independently verify registry provenance, SPDX, scan, manifest, and exact-
image runtime evidence. Registry visibility is recorded as an observed fact and is
not a license grant. Container publication does not change the explicit crates.io/npm
deferral and cannot prove managed-sandbox, live, production, or external-beta
maturity.

## What must be true before registry publication

- GOV-007 compatibility policy is merged.
- GOV-008 manual and tagged workflows pass on protected `main`; the aggregate is
  downloaded, checksums reverified, the Linux binary admits the canonical example,
  and a clean temporary npm consumer initializes the packed WASM facade and reports
  the intended version.
- The `@forge/validate-wasm` npm scope/name and all seven `forge-*` crates are owned
  by the publisher account; names are checked immediately before publication.
- Owner-scoped npm/crates.io tokens are stored only as protected environment secrets,
  require an approval gate, and are never available to pull-request workflows.
- Cargo packages publish in dependency order:
  `forge-num -> forge-contract -> forge-geometry -> forge-motion -> forge-sim ->
  forge-validate -> forge-wasm`. Each registry result is downloaded and tested before
  the next dependent package is published.

## v0.1.0 disposition

crates.io and npm are **explicitly deferred**, not silently omitted. The GitHub
Release is published, installable, and independently verified; protected-main run
`29241883791`, tag run `29244972303`, and the public nine-asset release are recorded
in `PROJECT-STATE.md` and `RELEASE.md`. A future registry publication requires an
explicit maintainer decision plus owner-scoped protected credentials, then follows
the order above. A registry failure never causes replacement of an existing version;
fix forward with a patch release.

GOV-009 closed when that final disposition and clean downloaded install evidence were
recorded in `PROJECT-STATE.md`. See [`RELEASE.md`](RELEASE.md) for artifact and
rollback mechanics and [`COMPATIBILITY.md`](COMPATIBILITY.md) for support promises.
