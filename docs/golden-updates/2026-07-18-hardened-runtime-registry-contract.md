# Golden artifact update: govern digest-only hardened runtime publication

## Artifact IDs

- `golden-policy-registry`
- `hardened-runtime-contract`
- `hardened-runtime-registry-contract`
- `api-event-artifact-docs`

## Changed paths

- `docs/golden-artifact-registry.json`
- `infra/docker/runtime.Dockerfile`
- `infra/deployment/hardened-registry.v1.json`
- `schema/forge-hardened-runtime-publication.schema.json`
- `.github/workflows/hardened-runtime-release.yml`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `fixture`
- `schema`

## Why this is intentional

OPS-002 requires an immutable-registry boundary between ephemeral D69 CI images and
any later managed-sandbox installation. The publication path must bind protected
source, registry digest, configuration digest, SBOM, vulnerability result, build
record, attached provenance, independent pull, and runtime smoke without treating
publication as deployment or operational authority.

## Source-of-truth change

D70 and `forge-hardened-runtime-registry/1.0.0` define a manual, protected-main-only,
build-once, digest-only GHCR publication contract. The companion evidence schema and
workflow require all three application images to be verified from exact registry
digests, while the Docker image metadata now declares the repository's proprietary
license identifier. The registry adds this new compatibility-governed family.

## Compatibility and user impact

This adds one independent major-1 publication surface and changes no existing
ModelSpec, report, API request, event, worker artifact, or D69 runtime meaning. It
creates a reviewable path for exact images but grants no managed-sandbox, rollback,
live, production, external-beta, hardware, or field authority. Mutable registry tags
remain outside the contract.

## Evidence before

Protected parent `f6f262039d72d182249ec883431477730d08caf1` proves the D69 image and
ephemeral runtime contract but has no protected publication workflow, fixed GHCR
names, attached registry attestations, exact-pull verification, or durable
publication evidence format.

## Evidence after

The focused registry suite passes six policy, complete-evidence, substitution,
changed-byte, attestation-subject, and non-promotion tests. Repository validation
accepts all three exact digest-only build/publish/attest paths and rejects mutable or
permissive variants. Hardened-runtime validation passes eight tests, workflow pin
validation accepts 87 immutable action references across five workflows,
compatibility validates 23 public surfaces, and contract documentation regenerates
82 routes, two event families, and seventeen worker families. The complete
`pnpm verify` passes all 47 required local gates under Python 3.12.13, including
39 Studio, 81 Gateway, and 255 worker tests plus Brief-25 25/25, native/WASM parity,
packaging, training/offline/MJX smokes, and the unchanged 200-candidate batch with
97 admissions, two Pareto points, and two held finalists. Protected publication and
independent registry execution remain required evidence, not assumed results.

## Reviewer focus

Review protected-source authorization; the absence of mutable tags; fixed registry
names and license metadata; build-once digest capture; BuildKit and GitHub provenance;
SPDX and fixed-vulnerability thresholds; raw manifest hashing; exact independent
pulls; attestation signer/source constraints; artifact retention; permission and
environment scope; and every false managed/live maturity claim.

## Decision and task references

D70 owns immutable registry publication and its authority ceiling. OPS-002 remains
in progress until a protected run and later managed-sandbox upgrade, rollback, and
corrected roll-forward evidence exist. R39 tracks registry substitution, mutable-tag,
and false-promotion risk; D69 remains the application-runtime owner.
