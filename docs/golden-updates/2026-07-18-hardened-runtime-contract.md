# Golden artifact update: govern the D69 hardened deployable runtime

## Artifact IDs

- `golden-policy-registry`
- `deployment-policy-and-schema`
- `hardened-runtime-contract`
- `api-event-artifact-docs`

## Changed paths

- `docs/golden-artifact-registry.json`
- `infra/deployment/deployment-policy.v1.json`
- `infra/deployment/hardened-runtime.v1.json`
- `infra/compose.hardened.json`
- `infra/docker/runtime.Dockerfile`
- `infra/docker/studio.nginx.conf`
- `docs/API-EVENT-ARTIFACT-REFERENCE.md`
- `docs/contracts/openapi.v0.2.0.json`
- `docs/contracts/artifacts.v0.2.0.json`

## Drift classification

- `fixture`
- `schema`

## Why this is intentional

OPS-002 needs a deployable contract that cannot inherit the mutable images, source
mounts, development credentials, broad write access, and public data-plane exposure
of the local development profile. Gateway and worker readiness plus runtime-secret
semantics also need to be visible at the generated API and compatibility boundaries.

## Source-of-truth change

D69 and `forge-hardened-runtime/1.0.0` define the first single-host substrate. The
contract pins reviewed base and evidence-tool images, application build targets,
numeric users, writable paths, probe meanings, TLS/private-network constraints,
least privilege, resource bounds, graceful termination, required evidence, and
permanent fixture nonclaims. The D68 policy adds runtime-managed artifact and
file-secret bindings. Runtime route registration adds public `GET /readyz` without
changing an existing route.

## Compatibility and user impact

This adds one independent major-1 compatibility surface and one additive pre-1.0
Gateway route. Existing ModelSpec, report, API request, event, and worker artifact
inputs retain their meanings. Managed gateway and worker processes now require their
own exact image artifact digest and file-mounted secret source; non-managed local
execution remains available. Neither the contract nor a CI smoke proves sandbox,
rollback, live, production, external-beta, hardware, or field maturity.

## Evidence before

Protected parent `f68314dffbda1859298b2ba141fb43e2a68a2869` has only the D68 manifest
contract and the source-mounted development Compose profile. It has no governed
hardened runtime family, multi-stage application image targets, generated readiness
route, runtime-secret file boundary, or image SBOM/provenance/vulnerability smoke.

## Evidence after

`pnpm verify:deployment` passes 11 policy and adversarial tests. `pnpm
verify:hardened-runtime` passes seven exact contract/refusal tests and the repository
check. `pnpm verify:compatibility` passes 22 surfaces. `pnpm docs:contracts`
generates 82 routes, two event families, and seventeen worker families. Gateway
typecheck and the focused worker deployment/health tests pass; Docker Compose renders
the hardened profile with explicit fixture inputs. The complete `pnpm verify` passes
all 46 required local gates under Python 3.12.13, including 81 Gateway, 255 worker,
39 Studio, exact native/WASM, packaging, training, and co-design checks. The protected CI image build
and managed-sandbox install/rollback remain required evidence, not assumed results.

## Reviewer focus

Review every upstream tag/digest and registry endpoint; application target/user/
writable-path agreement; secret-file ambiguity and symlink refusal; image-to-D68
artifact binding; the sole published TLS port; internal data plane; root-only bounded
initializers; dropped capabilities and security options; resource/termination/probe
semantics; migration ordering; SBOM/provenance/vulnerability retention; and every
false maturity claim.

## Decision and task references

D69 owns the runtime major and R38 owns false container/rollback maturity. OPS-002
is in progress at contract/fixture candidate maturity. D68 and R37 remain the
environment, promotion, artifact, secret-reference, and authority owners.
