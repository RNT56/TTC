# Package publication boundary

Owner: repository maintainers  
Current decision: **defer crates.io and npm registry publication for v0.1.0 until the
GitHub release proof is complete**

The Apache-2.0 crates and WASM package are intentionally packageable, but package
registries are not the first proof boundary. The first public artifact is the
checksummed, SBOM-backed, attested GitHub Release produced by `release.yml`.

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
Release remains installable and independently verifiable. After its proof is linked,
the maintainer either supplies protected registry credentials and publishes in the
order above, or retains the deferral in the release notes. A registry failure never
causes replacement of an existing version; fix forward with a patch release.

GOV-009 closes only when the final disposition and clean downloaded install evidence
are recorded in `PROJECT-STATE.md`. See [`RELEASE.md`](RELEASE.md) for artifact and
rollback mechanics and [`COMPATIBILITY.md`](COMPATIBILITY.md) for support promises.
