# ForgedTTC threat model

Owner: repository maintainers and deployment operators
Last reviewed: **2026-07-18**
Applies to: gateway, Auth.js boundary, Postgres, object storage, generation providers,
Python workers, live command adapters, release archives, Studio-facing APIs
Implementation maturity: **contract and deterministic fixture**; production egress,
distributed abuse control, provider operations, restore exercises, and incident drills
remain operations work.

D69 runtime authority is machine-readable in
[`infra/deployment/hardened-runtime.v1.json`](../infra/deployment/hardened-runtime.v1.json).
Its pinned images, file-secret boundary, numeric non-root identities, read-only roots,
private networks, TLS, dropped capabilities, resource limits, probes, termination,
and CI evidence are contract/fixture controls. They do not prove a managed sandbox,
rollback, production perimeter, provider isolation, or live operation.

D70 registry authority is machine-readable in
[`infra/deployment/hardened-registry.v1.json`](../infra/deployment/hardened-registry.v1.json).
Only the manual environment-gated workflow may write the three repository-owned
GHCR image names, using the run-scoped repository token and no mutable tag. The
separate verifier hashes the raw registry manifest, verifies registry-attached
GitHub provenance against the exact signer/source/ref, scans and pulls the exact
digest, and reruns D69 runtime checks. Image visibility is not assumed; image bytes
remain proprietary. A pushed or attested manifest has no environment, secret,
traffic, rollback, live, production, or external-beta authority.

For D69's single-host Compose substrate, file secrecy is a host-side precondition:
the materializer stages referenced sources outside the checkout as
`root:10999`/`0440`, while only declared consumers receive supplemental GID `10999`.
The profile omits Compose `uid`/`gid`/`mode` mount attributes because the local-file
implementation ignores them. World-readable sources, repository-resident values,
and an unrecorded ownership workaround are fail-closed deployment errors.

This is the canonical application threat model. `security-safety-legal.md` owns
product exclusions, privacy promises, and legal gates; `DATA-LIFECYCLE.md` owns
retention, holds, backup, deletion, and restore authority; system documents own
surface-specific implementation contracts. A control listed here is not a live claim
unless `PROJECT-STATE.md` records current deployed evidence.

## 1. Security objectives

ForgedTTC must preserve five properties:

1. **Authority:** only an authenticated owner or explicitly authorized operator may
   read, mutate, publish, bill, or delete protected state.
2. **Integrity:** no prompt, provider, catalog row, upload, worker, archive, or UI may
   bypass contract validation, ownership, consent, license policy, or hardware gates.
3. **Confidentiality:** OAuth material, session tokens, provider keys, object-store
   credentials, private models, photos, telemetry, and operator evidence must not
   enter logs, responses, unrelated tenants, generated artifacts, or public shares.
4. **Availability and bounded cost:** external calls, JSON, subprocesses, archives,
   object declarations, jobs, and request classes consume explicit finite resources.
5. **Evidence:** security-relevant decisions fail closed and leave minimal,
   non-secret, owner-scoped or pseudonymous audit evidence.

The validator remains sovereign. This threat model does not turn provider output,
successful HTTP status, a presigned URL, or a worker result into admitted product
truth.

## 2. Scope and exclusions

In scope:

- Fastify request parsing, Auth.js forwarding, session and development identities;
- owner/operator authorization, origin checks, CSRF, and abuse throttling;
- Anthropic BYO credentials and generated-artifact persistence;
- catalog, vendor, print, Modal, ETL, and other outbound HTTP adapters;
- Postgres writes, object metadata, presigned S3-compatible access, and deletion;
- queue-driven Python workers and deployment-owned command adapters;
- imported URDF/MJCF text, JSON Patch edits, EnvSpec/replay documents, catalog
  citations, license/export manifests, and hardware bridge payloads;
- prompt/retrieval injection and provider/tool output;
- validator child processes and release archive verification;
- D51 read-only local Desktop recorder-directory inspection, D52 versioned
  status/start/stop control, D53 private five-object materialization, and D54
  sovereign server verification plus bounded telemetry admission;
- D55 read-only Desktop Betaflight MSP identity probing, strict two-pass stability,
  hashed identity/transcript evidence, and its explicit non-attestation boundary;
- D57 compact ghost-overlay worker/Gateway output, maintenance persistence, strict
  Studio parsing, bounded indexed seeking, and provenance nonclaims;
- error, log, secret-rotation, and incident boundaries.

Not yet in scope as implemented public surfaces:

- inbound provider callbacks or webhooks; none are currently accepted;
- arbitrary user code or controllers; contracts contain data only;
- general compressed or uploaded archive import; D53 uploads only the five already-
  expanded recorder-v1 files and no object ingestion path extracts user archives;
- public worker endpoints; workers are queue-driven;
- general hardware beta; only the D30/D12 controlled-lab boundary exists.

Any new callback, archive importer, user-code runtime, public worker listener, payment
provider, or hardware authority is a threat-model change and cannot inherit a generic
`SEC-006 complete` claim.

## 3. Assets and adversaries

| Asset | Required protection |
|---|---|
| OAuth/session/verification records | never expose; origin/CSRF-bound mutation; revocable |
| Anthropic BYO keys | request-ephemeral; header-only; provider-bound; never persisted, logged, returned, or read from a server fallback by the HTTP generation surface |
| Anthropic ETL service key | deployment-only; native worker transport uses it only in the exact provider header after fixture/command paths; never enters job or command JSON, row provenance, errors, or product logs |
| Object-store and operator credentials | server-only; explicit production config; rotate without changing public records |
| Models, photos, telemetry, replays, policies | tenant isolation, consent, retention, export/delete authority |
| Catalog/license/review rows | immutable revision/review evidence; no unreviewed generated use |
| Validator reports and admitted contracts | deterministic integrity; no UI/provider override |
| Jobs, provider-call identities, credits, quotes, external offers | idempotency, bounded cost, authorization, provider evidence |
| Release artifacts | checksums, exact contents, bounded extraction, provenance, install proof |
| Audit evidence | append-only or causal where specified; minimal content; redacted errors |

Threat actors include an unauthenticated internet client, a malicious or compromised
account, a cross-site attacker, a tenant attempting horizontal access, a hostile
catalog/prompt/upload, a compromised or buggy provider, DNS or network attacker, a
malicious deployment command, a poisoned release archive, accidental operator
misconfiguration, and a dependency/supply-chain compromise.

## 4. Trust boundaries and data flow

| Boundary | Untrusted side | Trusted decision point | Required control |
|---|---|---|---|
| Browser -> gateway | headers, cookies, origin, body, identifiers | Fastify/Auth.js/route authorization | pinned origin, built-in CSRF, bounded parsing, schema, owner checks, rate class |
| Gateway -> Postgres | API intent and provider-derived data | transaction/service functions | parameterized SQL, ownership, serializable locks where authority races, bounded JSON |
| Gateway -> provider | URL, DNS, remote response | bounded transport adapter | exact HTTPS host, no credentials/fragments/redirects, resolution check, timeout, byte/type/JSON caps |
| Gateway -> object store | owner key, MIME, declared size/checksum | presign/inspection/deletion adapter | explicit config, scoped key, declared length/type plus signed checksum, staged-until-inspected completion, short expiry, forced download, delete-before-commit |
| Queue -> worker | job payload and deployment config | worker dispatcher/adapter | kind allowlist, consent/cancellation, bounded JSON/network/process/result, opaque expiring attempt fence |
| Worker -> Modal function | sovereign bundle plus deployment identity | D46 adapter and exact function | durable call ID before wait, exact SDK/source/function/L4, no fallback/retry/secret/egress, lease polling, bounded result evidence |
| Provider/command -> validator | arbitrary contract/artifact/result | validator and license/admission gates | allowlisted result fields, provenance, bounded process, sovereign verdict |
| Import/course/replay -> core | XML/JSON numbers, graph identities, pointers, timestamps | forge-contract/forge-sim boundary | byte cap, finite SI/time, valid graph/pointer/schema, strict order, no-panic corpus |
| Local recorder directory -> Desktop/Studio | filenames, links, JSON/JSONL bytes, hashes, privacy/provenance claims, size | D51 native streaming verifier | exact five-file allowlist, non-symlink regular files, canonical strict v1 parsing, aggregate/frame/node/count bounds, index/replay/hash reconstruction, strict bounded nonclaim response, no upload |
| Desktop Studio -> native recorder | admitted report hashes/seed, output path, D12 rig, serial-port selection, sample rate, capture consent, reload/retry intent | D52 shell-owned recorder runtime | strict control/request/port/receipt parsing; D30/D12 and OS-enumerated 115200-baud gates re-enforced natively; one exclusive recorder; exact inactive/recording/finished state; no raw frames, upload, provenance, sharing, or training promotion |
| Desktop recorder -> object store/gateway | local five-file plan, presigned URLs/headers, mutable files, object metadata | D53 native uploader plus gateway completion | rerun D51; sanitized plan without paths/bytes; exact five names/types/sizes/hashes; one configured HTTPS or loopback origin; no credentials/redirects/system proxy; streamed sized bodies; owner-private rows; server HEAD plus bounded manifest/receipt readback; semantic/provenance/consent nonclaims remain false |
| Private recorder objects -> native validator/Postgres | substituted/partial objects, canonical-byte drift, oversized frames, temp-file disclosure, model/hash confusion, forged authority flags | D54 object stream plus `forge-validate recorder-verify` and migration 0026 | exact five complete owner objects; bounded 30-minute/default and one-hour/max read/process timeouts; size/SHA-256 enforcement while streaming; 0700 temporary root and 0600 exclusive files; exact native archive-v1 semantics/report; cleanup before persistence; admitted-model contract/lockfile binding; bounded reference only; D53/device/field/sharing/training nonclaims remain false |
| Desktop/Studio -> self-reported MSP device | OS descriptor, serial bytes, command/direction/checksum, firmware/board/build strings, UID, timing, and reconnect intent | D55 native read-only probe | D30/D12/props-off/OS-enumerated 115200-baud authority; native recorder atomically held inactive; exact MSP-v1 six-command allowlist; one-byte payload cap; checksum/command/direction validation; three-second deadline; two byte-stable identity passes on one open port; domain-separated hashes only; raw UID/responses stay native; all device/recorded-device/field/sharing/training authority remains false |
| Acceptance authority/trust bundle -> recorder session | public trust roots, signed authorization, evidence/signoff digests, revision/time/artifact/model/two-port/identity claims, replay intent | D56 native custody verifier and shell-owned recorder state | hash-pinned bounded public-key bundle; exact purpose/key validity/revocation; strict domain-separated Ed25519 verification; maximum eight-hour binding; exact protected revision, D30/D12, evidence, artifact/model, OS-descriptor, D55 identity/UID, and false-authority checks; pre-observation before telemetry open and post-observation after clean receipt; create-new proof outside archive v1; no signing key/raw UID/signature in Studio; no D54/training/field promotion |
| Worker/Gateway maintenance output -> Studio ghost view | oversized or malformed point rows, non-finite/duplicate time, inconsistent divergence/index, fake maturity or device/field authority, render/seek denial of service | D57 worker bounds plus independent Studio parser | exact schema/frame/layout/metric; ≤600 seconds/100,000 source samples/6,001 render points/602 seek entries; finite strict time and meter coordinates; recomputed Euclidean divergence; monotonic preceding-point index; precomputed static polylines and bounded indexed interpolation; only unverified or controlled-synthetic maturity; device/recorded-device/field flags must be false; no raw recorder frame JSON/JSONB |
| Protected source -> GHCR -> independent runtime verifier | branch/ref substitution, mutable tag, replaced or unattested manifest, stale scan/SBOM, proprietary-visibility confusion, workflow token misuse, false deployment claim | D70 manual publisher plus separate registry reader | exact dispatched protected `main` SHA; environment-gated repository token; fixed lowercase names; digest-only push; BuildKit and GitHub registry attestations; exact-registry SPDX/scan; raw-manifest SHA-256; signer/source/ref verification; exact pull/config/runtime smoke; 90-day evidence; visibility unreviewed and all managed/live claims false |
| Release archive -> machine/npm | filenames and compressed members | release verifier | checksum/SBOM, exact entry allowlist, traversal rejection, archive/member caps before extraction/install |
| Desktop -> hardware | model/config/policy intent | D30/D12 gate and supervisor | local-only, physical confirmation, no auto-arm, supervisor/FC authority |

Deployment must add network and storage controls around these application controls:
TLS termination, restricted database/object-store reachability, least-privilege service
identities, egress policy, secret manager, encrypted backups, audit shipping, and
resource quotas. Local fixtures do not supply those controls.

## 5. Authentication, sessions, origin, and operator authority

### 5.1 Production configuration

Gateway startup fails when production lacks a credential-free HTTPS `AUTH_URL` or
`FORGE_PUBLIC_ORIGIN`, or when `AUTH_SECRET` is absent, the development fallback, or
shorter than 32 characters. GitHub OAuth ID and secret must be configured together.
`FORGE_DEV_AUTH=1` is forbidden in production.

The Auth.js request URL and `Host` are rebuilt from the configured origin. Caller
`Host`, `Forwarded`, `X-Forwarded-Host`, and `X-Forwarded-Proto` are not trusted by
Auth.js, and Fastify proxy trust is disabled. Reverse-proxy deployments must therefore
pin the public origin in configuration instead of deriving it from request headers.
If a client sends an absolute-form or scheme-relative request target, only its parsed
path and query are retained; the configured scheme and authority remain pinned.

### 5.2 Request authority

- Auth.js's built-in CSRF behavior remains enabled; do not set a skip flag.
- A supplied `Origin` must equal the configured origin. In unconfigured development,
  only loopback origins are accepted.
- Cookie-authenticated unsafe production requests require `Origin`; safe methods are
  `GET`, `HEAD`, and `OPTIONS`.
- Development identity headers are accepted only in test mode or explicit
  non-production development mode. IDs, names, emails, image values, and cookies are
  length-bounded before use.
- Route services must enforce owner scope again at the query/transaction layer. UI
  visibility is never authorization.

### 5.3 Operator token

The current review/admin surface uses `FORGE_REVIEW_TOKEN` as an interim owner token.
Production fails closed when it is absent for protected operator routes, rejects a
configured value under 32 characters, and compares the complete bearer value using a
constant-shape digest comparison. Do not put the token in a query string, log, test
fixture shipped to production, or browser persistence.

Before multiple maintainers or delegated operators are supported, replace the shared
token with named, revocable roles and per-action audit identity. That is a residual
platform requirement, not a reason to widen the shared token.

## 6. Request, JSON, job, and process bounds

The gateway accepts at most 1 MiB per HTTP request, does not trust proxies, and caps
route parameters at 2,000 characters. Every parsed body passes an iterative bounded-
JSON guard: serializable JSON only, finite numbers, plain objects, no prototype keys
or cycles, and explicit byte/depth/node/array/object/string ceilings.

Direct service callers retain narrower controls:

- job payload: 512 KiB, depth 16, 20,000 nodes; idempotency key 1..200 characters;
- object metadata: 128 KiB, depth 12, 5,000 nodes, 256 object keys;
- object declared size: safe integer no larger than 2 GiB;
- provider tool input: 512 KiB, depth 24, 50,000 nodes;
- catalog/pattern summaries: 256 KiB and depth 12;
- ordinary validator child process: 30-second timeout and 1 MiB output buffer;
- D54 recorder verification: five-object aggregate at most 512 MiB, 30-minute
  default and one-hour maximum object-read/process timeout, 1 MiB process output,
  and a private failure-cleaned temporary root outside the verified five-file
  directory.

Python command adapters accept at most 4 MiB JSON input, 8 MiB stdout, and 256 KiB
stderr; run for 1 second to 8 hours; use temporary files instead of unbounded pipes;
and kill the process group on timeout or overflow. Exit failures never reflect
provider stdout/stderr. Output must be a bounded JSON object.

The P6-010 MuJoCo parity command is a narrower internal proof surface. It accepts at
most 4 MiB total and 512 KiB for each of four required MJCF scenes; requires a full
source Git object ID, request schema 1.0.0, a recomputed matching request SHA-256,
exact MuJoCo 3.9.0, finite SI inputs, a one-million-step ceiling, and an integer
1..64 substep count; and accepts only contract-exporter-marked MJCF with the radian
compiler declaration and a bounded safe body name. NUL, external include, asset,
plugin, or file references are refused before MuJoCo parses the scene. The runner
checks compiled gravity/timestep, the orchestrator rejects
source/provider/timestep/substep drift, and capture writes a registered baseline
candidate only after the Rust comparison passes. Required CI runs this command over
repository-generated primitive scenes in the worker job; it is not a general
user-supplied MJCF execution service or an OS sandbox.

QA-007 adds narrower surface limits and governed negative cases. Supported URDF/MJCF
text is capped at 4 MiB, contains no NUL, and must use finite supported numeric
attributes plus a non-empty unique valid-parent graph. Replay and EnvSpec physical/
time values are finite; replay time is strictly increasing. Hardware config,
telemetry, and supervisor inputs use bounded JSON; generated command fields are
single safe tokens, telemetry times are unique, vectors have exact arity, and safety
limits are finite and positive. Catalog confidence is finite in `[0,1]`, citation
sources are credential-free HTTPS, and D10 policy contradictions refuse.

Queued vendor refresh adds a narrower contract: 1..50 component IDs, a required
1..200-character idempotency key, a 1..120-second timeout, local provider only, and
at most 50 normalized rows. The worker requires `FORGE_VENDOR_REFRESH_CMD` again at
execution; disappearance is a failed job, never fixture fallback. Rejected rows retain
only bounded index/component/vendor/SKU/reason summaries, not raw provider payloads.
The gateway domain-separates the client key with authenticated owner identity before
persistence, binds reuse to exact kind/provider/input, rejects drift with 409, and
does not repeat fixture materialization. This prevents guessed global keys from
returning another tenant's row or suppressing that tenant's credit debit.

D38 makes non-fixture execution explicitly at-least-once. A claim increments the
attempt count and assigns an opaque token plus expiry; the persisted 1-second to
8-hour timeout is injected into the handler. Only that same unexpired token may
retry, fail, succeed, or materialize. Expired work can be reclaimed under a new
token; stale duplicates, cancelled attempts, and late timeout results are discarded.
Provider outage, rate limit, process timeout, and partial-object failures have stable
codes plus deterministic 5-second exponential backoff capped at 15 minutes and the
row's attempt ceiling. Unknown handler faults terminate rather than retry blindly.

Native Anthropic ETL accepts at most 4 MiB request JSON, 2 MiB response bytes, and
512 KiB of tool input. The fixed request uses 8,192 output tokens and a 1..120-second
timeout. The strict tool envelope contains only `canonicalRowJson` and
`sourceConflicts`; local parsing re-applies byte/depth/node/non-finite/prototype-key
guards and catalog identity, mass, confidence, license, price, and citation checks.

D46 narrows Modal training to one exact source-bound function. The gateway takes a
shared Postgres advisory lock, enforces active and UTC-day credit ceilings, inserts
the idempotent job, and debits only the new row. A product refund releases the active
slot but never erases the launch from the daily ceiling, so cancellation cannot reopen
unbounded provider authority while billing lags. The worker compiles the Rust bundle
locally, projects only the reviewed training fields plus compiled bundle across the
provider boundary, and persists the FunctionCall ID/attempt before waiting. Arbitrary
payload fields are rejected at the gateway and function; an ambiguous persisted call
must be recovered by ID and never authorizes replacement work. The function uses
exact SDK 1.5.2, Python 3.12, one L4, one single-use container, zero provider retries,
no function secrets, blocked network, restricted Modal access, and an eight-hour
ceiling; CUDA must resolve exactly without CPU fallback. Owner cancellation revokes
the D38 lease before provider termination and late-result discard. Product-credit
reversal is not provider-billing truth. Recorded-device/personal input is forbidden,
and credentialed sandbox maturity requires validated billing/tag, hard-stop,
alert/SLO, cancellation, retention/deletion, and recovery evidence.

These are admission ceilings, not capacity promises. Infrastructure must also cap
concurrent requests, worker concurrency, CPU, memory, disk, queue depth, and job cost.

## 7. Secrets and credential lifecycle

### 7.1 Anthropic BYO key

`POST /v1/generate` and `/v1/generate/stream` accept the provider key only in
`x-forge-anthropic-key`. A JSON `anthropicApiKey` field is rejected. The HTTP surface
does not fall back to `ANTHROPIC_API_KEY`; absence fails closed with a generic error.
The key exists only on the in-memory generation request and outbound authorization
header. Persistence functions select explicit non-secret fields, and regression tests
inspect all generated-artifact, usage, and model query parameters for key absence.

Do not add key fingerprints to ordinary product records: they still correlate a
secret across requests. If abuse investigation requires a correlation identifier,
derive and retain it only in a separately reviewed, time-bounded security event.

### 7.2 Anthropic ETL service key

The queue worker does not accept a user key in a job payload. Fixture injection runs
first; `FORGE_CLAUDE_EXTRACT_CMD` runs second and receives only
`apiKeyConfigured: true|false`; only the native third path reads deployment
`ANTHROPIC_API_KEY`. It calls the fixed `api.anthropic.com/v1/messages` endpoint and
puts the value only in `x-api-key`. The request body, canonical row, extraction
provenance, review result, and generic error path contain no key or fingerprint.

This is a service credential, not the HTTP BYO credential of §7.1. Production must
give it a separate least-privilege secret identity, provider account/budget boundary,
rotation drill, and seeded-secret scan. Repository tests prove application data flow
and error redaction only; no real provider/proxy/APM log has been inspected.

### 7.3 Service secrets and rotation

- Store production secrets in a deployment secret manager, not repository files,
  Compose defaults, client bundles, command arguments, or logs.
- On the D69 single-host profile, materialize only the selected immutable versions
  into a host directory unavailable to ordinary users, set each source
  `root:10999`/`0440`, verify metadata without reading values, and remove superseded
  material after consumers have restarted and the old version is revoked. Compose
  cannot supply or repair those source ownership semantics.
- Rotate a suspected provider key immediately at the provider, then restart/reload
  every consumer and confirm the old value fails. BYO users rotate their own key.
- Rotate `AUTH_SECRET` only with an explicit session-invalidation plan; treat all old
  sessions as revoked unless a reviewed multi-key overlap is implemented.
- Rotate `FORGE_REVIEW_TOKEN` and object credentials by installing the new secret,
  restarting consumers, exercising an authorized request, revoking the old value,
  and recording only time, operator, scope, and outcome.
- Never paste secret values into an incident, changelog, test output, URL, or support
  ticket. The public redactor is defense in depth, not permission to log secrets.

Modal tokens are submitting-worker deployment credentials only. They must not enter
the function secret set, image, job input, FunctionCall result, gateway response,
account export, tag, log, or retained evidence. Use a dedicated environment/service
identity, rotate it independently, and keep the exact environment/function/source/
contract identity as non-secret deployment evidence. Token presence alone never
enables a maturity claim.

Automated secret-manager reload and scheduled rotation evidence remain operational
work. Startup validation proves configuration shape, not custody or rotation.

## 8. Outbound network and SSRF

Gateway and worker live adapters allow only absolute, credential-free HTTPS URLs
without fragments. Provider-specific calls use exact host allowlists. Requests reject
literal private, loopback, link-local, multicast, documentation, benchmark, CGNAT,
IPv4-mapped IPv6, and relevant translation ranges; hostnames are resolved and all
answers must be public. Redirects are disabled, final host/scheme drift is refused,
timeouts are 1..120 seconds, response bodies are streamed under 1 KiB..8 MiB caps,
and allowed content types are explicit. JSON responses receive a second structural
bound before use.

The application resolution check does **not** eliminate DNS time-of-check/time-of-use
rebinding because the HTTP stack may resolve the hostname again. Production must
route provider traffic through an egress proxy/firewall that denies private and
metadata ranges at connection time, restricts destinations, and logs destination,
class, duration, byte count, and result without authorization headers. Provider
adapters must not accept an arbitrary URL when a known endpoint can be configured as
an exact host.

No provider response may choose a new callback, download, redirect, or object-store
destination without passing the same policy again.

The direct gateway vendor HTTP adapter is removed. A deployment-owned vendor command
may perform network I/O outside the application HTTP client, so process byte/time
bounds do not constrain its destinations. Production must run it in an isolated,
least-privilege worker with connection-time egress allowlisting, DNS/metadata/private-
range denial, provider quotas, and secret-safe telemetry. Returned offer and
provenance links must be bounded, credential-free public HTTPS and are stored as
references only; the gateway/worker does not fetch them.

## 9. Prompt, retrieval, and provider-result injection

Prompts, retrieved component rows, pattern summaries, provider tool input, and
diagnostics are untrusted data. Generation wraps user briefs, retrieval material, and
repair data in explicit data delimiters and places the instruction boundary before
the untrusted text. Markup-significant characters are escaped so data cannot close
its prompt container. Catalog and pattern text is labeled data, never instructions.
Native ETL applies the same delimiter escaping to the complete captured source bundle
before the provider call. Its strict envelope is reparsed locally; the provider is not
allowed to approve, persist, publish, or select a callback or follow-up URL.

This mitigates instruction confusion but does not prove model compliance. The hard
controls are:

- prohibited briefs are rejected locally before retrieval/provider/mutation;
- generation can consume only approved, license-permitted catalog revisions;
- provider tool JSON is structurally bounded;
- provider and external exporter fields are allowlisted;
- vendor provider rows are normalized once, then revalidated inside the same
  transaction that inserts offers and marks the job successful; any corrupt accepted
  row rolls back both state transitions, after which the runner marks the job failed
  and continues polling instead of terminating the worker;
- candidate contracts always pass the real validator;
- rejected candidates cannot train, share, export, deploy, or silently become
  admitted through UI state;
- provenance records the model, prompt hash, seed, attempts, and report without the
  provider key.

Future live-provider evaluation must include indirect prompt injection from catalog
fields, adversarial tool output, secret-exfiltration prompts, diagnostic injection,
and denial-of-wallet cases. Prompt text alone is never a security boundary.

## 10. Object storage, uploads, and archives

Production object storage requires an explicit endpoint, bucket, access key, and
secret; development defaults are rejected. HTTPS is required unless an explicit
internal-transport exception is documented and the network is otherwise protected.
Endpoints cannot contain credentials, query strings, or fragments.

Object keys reject absolute/traversal/control forms. Presign and delete operations
accept only the configured bucket and validate every key before network I/O, even
when the reference came from the database. Client upload registration requires a
bounded declared size, MIME type, and SHA-256; the upload contract carries length/type,
the signature binds the checksum, and new rows remain `staged`.
`POST /v1/blobs/:id/complete` performs a server-side HEAD
with checksum mode and compare-and-sets `complete` only if exact received metadata
matches the unchanged declaration. Partial, mismatched, checksum-less, or raced
objects stay staged and cannot be downloaded or authorize photoscan. URLs expire in
60..3,600 seconds and responses carry `Cache-Control: no-store`.
Downloads are forced as attachments with `application/octet-stream` to prevent active-
content rendering. Metadata registration validates purpose, MIME, safe integer size,
owner scope, and bounded metadata.

Policy delivery has a separate worker-owned write path with a 4 MiB ceiling. Canonical
base64 is decoded only in transient process memory; exact byte length and SHA-256
select an owner-scoped content-addressed key. The worker checks its unexpired D38
lease before upload and again in the serializable success transaction. A unique
job-to-policy constraint plus the lease fence prevents duplicate or stale attempts
from gaining product authority. Cancellation during the upload can leave an
unreferenced object, but no `object_blobs` or `policy_artifacts` authority; OPS-006
must inventory and delete such bounded orphans without treating them as user data.

`GET /v1/policies/:id/model` is authenticated and owner-scoped. Before streaming, the
gateway cross-checks the completed object declaration, job/model revision,
scorecard/export gate, tensor header, lineage, size, digest, and byte-free delivery
metadata, then rehashes the bounded stored bytes. The response is same-origin,
non-cacheable octet-stream with exact length and checksum; Studio rechecks both before
creating an ONNX session. Cross-owner IDs resolve as not found, and object-store
credentials, URLs, and inline model bytes never enter persisted metadata or the user-
data export.

The current surface does not extract uploaded archives. D53 is a narrow exception to
the old registration-only posture: it uploads the five expanded recorder-v1 files as
separate private objects, never a compressed container, and does not interpret frame,
index, or replay bytes server-side. Future general import must use a separate quarantine service with compressed and
expanded quotas, exact allowed formats, entry-count/path/link/device checks, malware
and parser isolation, content sniffing, admission validation, and promotion only after
success. Filename or supplied MIME is not sufficient trust.

D51 is narrower and local: it reads one already-expanded Desktop recorder directory
without extracting, executing, rendering, uploading, or gateway-materializing its
contents. The final directory and every entry must be a real non-symlink regular
filesystem object under an exact five-name allowlist, with actual aggregate bytes at
or below the archive-v1 cap. Strict canonical manifest/receipt/frame/index parsing,
depth/node/frame/count bounds, exact sparse offsets, replay reconstruction, and all
retained hashes fail closed. The command returns no frame data and Studio revalidates
its exact versioned bounded response. These controls expose corruption and v1
self-inconsistency; because a local user can rewrite both data and receipt, they do
not supply a signature, independent authenticity, device/session identity, field or
lab provenance, sharing consent, training authority, malware quarantine, or a safe
general archive/upload importer. Concurrent local mutation remains outside the
trustworthy-evidence claim; protected evidence must use separately retained hashes.

D52 keeps recorder authority out of the webview lifecycle. Studio cannot supply a
caller-authored contract identity or maturity: it forwards only the current admitted
report's contract/lockfile hashes and seed plus bounded capture intent, and native
validation independently applies D30/D12, consent, path, rate, and enumerated-port
requirements. The shell owns one recorder and reports strict
`inactive|recording|finished` state across reloads; finished state must be collected
by stop before another capture. Browser invocation, unknown request fields,
unsupported response fields/versions/states, and every device/field/sharing/training
promotion fail closed. These controls prevent UI reload/retry from inventing capture
authority, but they do not authenticate the local operator, source device, field
session, concurrent filesystem snapshot, or host-suspend behavior.

D53 reruns D51 before preparing a sanitized upload plan containing no local paths or
raw bytes. The plan fixes exactly five names, MIME types, safe sizes, SHA-256 values,
artifact/contract/lockfile/source identities, and false authority flags. The gateway
creates only owner-private, content-addressed staged objects and short-lived signed
PUTs. Native Desktop accepts URLs only on the exact configured object origin, requires
the complete signature query and exact content-type/checksum header allowlist,
disables redirects and reqwest's default system-proxy behavior, and streams each
regular file with an exact length. Gateway completion HEAD-checks all objects and
reads only bounded manifest/receipt JSON to cross-bind identity and the frame/index/
replay object hashes. A materialized row proves object length/type/checksum plus those
bounded bindings only: `gatewayArchiveSemanticsVerified`, device/field identity,
recorded-device attestation, sharing, and training reuse stay false. A later sovereign
streaming verifier must admit archive semantics before telemetry processing.

D54 supplies that separate semantics gate without mutating D53. The gateway accepts
no archive bytes in HTTP JSON. It streams the five already-complete owner objects
through declared length and SHA-256 checks into one private temporary root, writes
only exclusive regular files, runs the native sovereign verifier with bounded output
and time, and removes the root before opening the persistence transaction. Exact
report fields are rebound to the immutable object plan and selected owned admitted
model proof. Postgres retains one bounded object-backed reference, not frames, and
constraints prevent device/field/sharing/training promotion. A later consent grant
cannot bypass the explicit D45 object-backed training refusal. This closes archive-
semantics admission but still does not authenticate the source device, operator,
session custody, lab conditions, or field provenance.

D55 adds one read-only observation seam before recorder/device provenance. The native
Desktop atomically holds the recorder inactive, opens one D30/D12-authorized,
props-off, OS-enumerated 115200-baud port, and
issues only MSP-v1 API version, variant, FC version, board info, build info, and UID
queries. It requires protocol 0/API 1.47, `BTFL`, stable `2025.12.x`, target
`KAKUTEH7`, exact response framing/checksums, and two byte-identical identity passes
on the same open port. Studio receives only domain-separated SHA-256 values for the
source port, OS descriptor, UID, normalized identity, each response set, and the full transcript.
Raw responses and UID never cross the native boundary. These checks detect drift and
substitution within the observed session, but the replies are self-reported and can
be emulated or replayed. D55 therefore cannot attest a unique physical controller,
operator custody, recorder start/end binding, host suspend, lab conditions, or field
provenance and cannot mutate D54 or any sharing/training authority.

Release archives are a separate trusted-distribution path. Before extracting or
installing, the verifier checks the archive byte ceiling, exact normalized entry
allowlist, duplicate/traversal/absolute/drive/backslash rejection, and each member's
expanded ceiling. Symlinks, hard links, devices, FIFOs, and other non-regular members
are rejected before extraction. Native bundles may contain only the directory, installer text,
license, notice, artifact manifest, and platform binary; the WASM package has eight
exact package members. Checksums, SPDX, executable mode, version, admission smoke, and
clean `npm --ignore-scripts` consumer proof remain mandatory.

Object-store policy must independently enforce owner/service prefixes, TLS, encryption,
version/lifecycle policy, and maximum object size. Presigning does not replace later
content validation or the deletion/backup controls in `DATA-LIFECYCLE.md`.

## 11. Rate limits and denial of service

The gateway assigns each request to one class per 60-second window:

| Class | Default requests | Examples |
|---|---:|---|
| auth | 30 | `/auth/*` |
| generation | 20 | generation/context/stream/edit/course generation |
| job | 60 | jobs, training, photoscan, compute launches |
| object | 120 | object registration/access/deletion-related API |
| public | 300 | remaining API and health/read surfaces |

Model edits and course generation use the generation class. Validator/bake/BOM
process launches and live commerce refresh/quote calls use the job class.

The pre-auth edge identity is the peer IP with Fastify proxy trust disabled. It never
trusts a caller-supplied session cookie or development header as identity, so rotating
forged values cannot reset the bucket. Auth routes use the official Fastify 5-
compatible `@fastify/rate-limit` plugin inside the Auth.js route scope; the other four
classes use the bounded classed store. Both store only a short SHA-256-derived
identifier and cap in-memory state at 20,000 buckets. A denial returns `429`, limit
headers, and `Retry-After`.

These limiters are single-process and reset on restart. They are suitable for deterministic
proof and one replica, not multi-replica production abuse defense. Before scaling or
enabling billable providers, deploy a shared atomic limiter at the edge or data plane,
separate verified-account/IP/provider/cost quotas, concurrency limits, daily spend caps,
backpressure, and operator override/audit. Health checks and static assets should not
share scarce provider quota.

## 12. Inbound callbacks and replay

No provider callback/webhook route exists today. A future callback must not ship until
it has all of the following:

- exact provider and event allowlist;
- raw request bytes retained only long enough to verify a provider MAC/signature;
- constant-shape signature comparison with a secret from the deployment store;
- signed timestamp with a short skew window;
- unique event/nonce persistence and atomic replay rejection;
- binding to expected tenant, job, provider, artifact, and current consent/cancel
  state before mutation;
- bounded body/schema, no callback-selected URL, idempotent state transition, and
  safe retry response;
- secret rotation/dual-key procedure, negative signature/replay/cross-tenant tests,
  and minimal audit evidence.

Polling or a queue message is not implicitly trusted either; it must bind the same
job/tenant/provider identity and reject late output after cancellation or withdrawal.

## 13. Errors, logs, and audit evidence

Unexpected server failures return a generic service-unavailable response. Known 4xx
messages are bounded and redacted. Provider/network/process bodies, stack traces,
credentials, refused prompts, raw photos/telemetry, operator evidence, and private
object URLs do not enter client errors.

Security logs should record UTC time, deployment, request/event ID, route or operation
class, pseudonymous subject/tenant where needed, decision code, latency, bounded byte
counts, and outcome. They must not record authorization/cookie headers, query secrets,
request bodies, provider output, presigned URLs, or raw ownership content. Audit loss
for a fail-closed decision is an error, not permission to proceed.

Redaction patterns are regression-tested, but structured allowlist logging is the
primary control. Operators must verify proxy, platform, provider SDK, crash reporter,
and tracing defaults separately; application tests cannot prove those external logs.

D71 makes that primary control executable for Gateway request completion. D72 keeps
the v1 reader frozen and uses `forge-observability-event/2.0.0` for trusted request-
to-job and D38 attempt continuity. The server generates and persists the UUIDv4/W3C
root; the database creates one UUIDv4 attempt ID and span per atomic claim; workers
emit bounded start/completion lines; and terminal persistence carries only an outcome
plus stable code. Historical/direct jobs get an independent trace root with null
request/parent. Serializers and database constraints refuse unknown fields,
unpaired authority, raw queries, lease/idempotency/payload/result data, raw errors,
and unsupported actor/provider/deployment bindings. D73 keeps v1/v2 frozen and uses
major 3 to accept a managed deployment ID only from the exact active D68 startup
verifier and a Modal `train.policy` provider-call ID only after transactional
persistence on that same claimed job. Local/CI deployment, worker start, other
provider/job, actor, and Desktop fields remain null; provider/deployment IDs remain
forbidden metric labels. Sink failure cannot change
response, lease, retry, cancellation, or materialization authority. D74 leaves event
v3 frozen and adds an independent batch major plus hostile-input fixture consumer:
every line/event is revalidated, count/bytes/time are bounded, only exact loopback
HTTP with no credentials/query/fragment is permitted, redirects/non-2xx fail,
response bodies are discarded, and there is no retry or durable spool. A failed
batch is discarded and produces a nonzero fixture exit without changing any product
authority. This remains contract/fixture evidence: authenticated external collection,
other provider/Desktop continuity, proxy/backend seeded-secret scans, access/audit,
availability/failure monitoring, retention/deletion/export/residency operations,
metrics/traces, dashboards, alerts, and live delivery remain unproven.
D75 separately revalidates one D74 batch before projection. Metric route/method and
task labels require the generated 82-route/17-worker-task authority, and five exact
metric families forbid request/job/attempt/trace/span/provider-call/deployment/error/
status-code/retry/source-revision labels. Completion trace output includes every
failure, fixed-threshold slow spans, and only a deterministic 1/64 healthy baseline;
starts are excluded. Input, output, series, spans, memory, and stderr are bounded; the
projector has no network or persistence and cannot change product authority. A local
signal set still proves no external collector/custody, backend, dashboard, alert,
managed, live, or production monitoring.

## 14. Control and negative-test matrix

| Threat | Current deterministic evidence | Live evidence still required |
|---|---|---|
| Host-header/origin/CSRF confusion | pinned-origin config, forwarded-header stripping, unsafe cookie-origin tests, Auth.js CSRF enabled | deployed proxy/TLS/cookie inspection |
| Dev/admin auth bypass | production startup negatives, dev-header refusal, absent/short owner-token failures | named roles and revocation drill |
| Secret persistence/reflection | HTTP BYO header-only rejection/no env fallback/query audit plus ETL header-only body/command/error tests | provider/proxy/APM log inspection and separate BYO/service-key rotation drills |
| Log/correlation injection or telemetry leakage | D71/D72/D73 exact 4 KiB event majors, server-generated request roots, database job/attempt/span authority, exact active-D68 deployment identity, persisted Modal `train.policy` call identity, bounded terminal codes, template-route/no-query producers, extension/sensitive-field/cardinality refusal, and sink-failure isolation; D74 separately revalidates v3 into 1..32-event/135168-byte memory-only batches and proves one credential-free loopback attempt with redirect/non-2xx/timeout refusal and no retry/spool/authority mutation; D75 revalidates one batch into five generated-authority metric families plus bounded deterministic failure/slow/healthy completion-trace samples with no network/persistence | authenticated external collector with egress/DNS/TLS proof; other-provider/Desktop continuity; seeded-secret proxy/backend scan; access/audit, availability/failure, retention/deletion/export/residency operations; persistent metrics/traces, dashboards, and synthetic alert delivery |
| JSON/parameter bombs | byte/depth/node/key/string/non-finite/cycle tests; direct job/object tests | load/concurrency/memory exercise |
| SSRF/redirect/rebinding | private-range, allowlist, DNS, redirect, type, timeout/body tests | egress proxy/firewall connection-time proof |
| Prompt/retrieval injection | data delimiters, untrusted-prefix ordering, provider non-invocation, validator gate | live adversarial provider evaluation |
| Native ETL provider output | exact endpoint/version/model, forced supported-subset strict tool, bounded response and local canonical-row validation/provenance tests | credentialed adversarial sandbox through persistence/review/BOM/export plus outage, billing, retention, and recovery evidence |
| Cross-boundary numeric/graph/command confusion | registered 89-case import/patch/EnvSpec/replay/provider/citation/export/hardware corpus plus Rust/Python behavior and random no-panic tests | diverse real external imports, credentialed provider corpus, controlled hardware, and load/fault exercises |
| Cross-tenant object/data access | owner-keyed routes and queries, scoped export/delete tests | production IAM and penetration test |
| Malicious/partial upload or archive | checksum-bound PUT, staged-until-exact HEAD completion, staged download/consent refusal, MIME/name refusal, forced download, exact release archive allowlist/caps | provider IAM/checksum audit and quarantine scanner for any future importer |
| Recorder semantic/model/temp-file substitution | exact five-object streaming checks, private exclusive temp files, native canonical verifier, cleanup-before-persist, report/object/model cross-binding, authority constraints, D45 reference refusal | production object IAM/logging, process sandbox, concurrency/load exercise, and reviewed device attestation |
| Malicious/inconsistent local recorder directory | exact five-file/non-symlink allowlist, strict canonical v1 parser, streaming byte/node/frame/count caps, exact sparse-index/replay/hash checks, bounded no-frame response, authority-nonclaim tests | OS-level race-resistant handles and signed/device-attested evidence only if a future provenance design requires them |
| Recorder upload URL/file substitution | rerun local verifier, sanitized exact plan, five checksum-bound private PUTs, pinned origin, no redirect/proxy, exact signed headers, server HEAD and bounded manifest/receipt readback, then D54 five-object native semantic admission with immutable provenance nonclaims | production object IAM/TLS/access-log proof, orphan reconciliation, race-resistant file handles, process sandbox/load proof, and reviewed device attestation |
| MSP adapter identity substitution or replay | exact read-only command allowlist, checksummed bounded parsing, one-open-port two-pass byte stability, normalized identity plus transcript hashes, raw-UID confinement, permanently false authority flags, and D56's protected strict signed short-lived two-port start/end binding | named-controller custody evidence, host-suspend tests, and controlled D12 lab/field acceptance |
| Custody authorization/key/port replay or substitution | protected D56 implements a hash-pinned purpose-limited public-key bundle, strict domain-separated Ed25519 verification, exact evidence/revision/artifact/model/two-descriptor/D55 identity binding, short expiry, shell-owned pre-observation, post-clean-stop observation, create-new proof, permanent authority nonclaims, and fixture refusal/archive-preservation tests | trust-root rotation/revocation drill; semantic review of retained signature/evidence artifacts; named Kakute H7 V1.5; suspend and EXT-004 proof; later gateway lifecycle only under a new decision |
| Ghost overlay bomb, drift, or provenance promotion | exact v1 size/layout/time/divergence/index bounds in worker/Gateway/Studio; authority flags must remain false; strict negative tests; indexed-seek budget and production-browser interaction; raw replay remains object-backed | load/memory exercise on named mid hardware; one server-selected D54 replay/admitted-twin execution; real P8-014/EXT-008 evidence |
| Worker command exfiltration/DoS | bounded stdin/stdout/stderr/time/process-group tests; generic failures | container sandbox, egress and resource quota proof |
| MuJoCo parity scene/file abuse or evidence drift | 4 MiB/512 KiB bounds, exact source/schema/request-hash/engine identity, contract-marker/radian checks, external include/asset/plugin/file refusal, matched timestep/substeps, required real-engine CI artifact | non-root container/filesystem isolation and reviewed engine-upgrade evidence |
| Provider replay/late result | lease-fenced expiry/reclaim, stale duplicate discard, one-time materialization, retry ceiling, and cancellation authority tests | multi-replica outage/partition drill, dead-letter reconciliation, or callback signature/replay suite |
| Abuse/cost exhaustion | deterministic class/identity/reset tests | shared limiter, cost/concurrency quotas, alert exercise |
| Supply-chain archive poisoning | exact contents, traversal and expanded-size tests; checksum/SBOM/install smoke | repeated post-publication verification and incident rollback drill |

## 15. Deployment acceptance checklist

Before any production/live-provider claim:

- [ ] HTTPS public origin, cookie policy, proxy behavior, Auth.js callbacks, and CSRF
      are exercised against the deployed hostname.
- [ ] Secrets come from the deployment secret manager; startup rejects all dev
      defaults; rotation and revocation are rehearsed without recording values.
- [ ] Database/object/queue identities are least-privilege and network-private.
- [ ] Egress proxy/firewall denies metadata/private/reserved destinations at connect
      time and exact provider hosts are allowlisted.
- [ ] Shared atomic rate, concurrency, and cost quotas work across all replicas;
      provider-spend alerts and a kill switch are exercised.
- [ ] Object policy enforces TLS, encryption, prefix isolation, maximum size,
      lifecycle, and access logging; no uploaded archive is extracted.
- [ ] Provider, worker, proxy, APM, crash, and audit logs pass a seeded-secret scan.
- [ ] Cancellation, retry, timeout, provider outage, queue backlog, and dependency
      failure produce bounded recovery and no double charge or orphan artifact.
- [ ] Backup catalog, deletion receipts, isolated restore suppression, RPO/RTO, and
      incident response pass `OPS-005` evidence.
- [ ] Security tests, CodeQL, dependency audits, SBOM, protected checks, and relevant
      browser/Postgres/worker gates are green on the deployed commit.

## 16. Residual risks and ownership

| Residual risk | Why it remains | Required owner/task |
|---|---|---|
| DNS rebinding between validation and connect | application resolver does not pin the socket destination | operations: egress proxy/firewall and connection logs |
| Single-process rate limiter | no cross-replica atomic state or durable quota | operations: shared rate/cost/concurrency control |
| Shared owner token | not named RBAC; coarse revocation and audit identity | platform/security before delegated operators |
| Uploaded bytes are integrity-checked, not semantically quarantined | exact length/type/checksum does not detect malicious valid-format content; import intentionally absent | security/compute before any archive or active-content importer |
| D51 local recorder inspection is self-consistency, not authenticity | a local actor can coherently rewrite archive bytes and receipt; cross-file checks are unsigned and path inspection is not an OS snapshot | P8 reviewed adapter/device attestation plus signed/retained external evidence before recorded-device, lab, or field claims |
| D52 local recorder control is shell state, not device or session proof | admitted hashes, exact consent, an enumerated path, and reload-stable status identify intended local capture mechanics but not the physical source, operator custody, host suspend, or field conditions | P8 reviewed adapter/device identity, signed/retained D12 evidence, suspend tests, and controlled lab/field acceptance |
| D54 archive admission is self-consistency, not authenticity | native replay of every canonical frame/index byte proves retained archive semantics, but the unsigned source may still be a coherently rewritten local archive and no unique device/session identity exists | P8 reviewed adapter/device attestation, production object operations, suspend tests, and lab/field evidence before recorded-device or field claims |
| D55 stable MSP identity is observation, not attestation | firmware, board, build, and UID are unauthenticated self-reported replies; an emulator or replaying device can present one stable transcript; protected D56 can bracket it but does not make it device cryptography | obtain named D12 controller evidence, host-suspend tests, and controlled lab/field acceptance before any recorded-device or field claim |
| D56 acceptance signature is not a device signature | the acceptance authority signs a reviewed mapping and time-bounded session intent; the FC still does not cryptographically sign identity or telemetry, and fixture keys do not prove a real trust root | semantically reviewed retained acceptance artifacts, deployment trust-root rotation/revocation evidence, named-controller run, host-suspend and EXT-004 proof; device-held attestation or recorded-device promotion requires a later decision/major |
| D57 ghost view is not real telemetry or twin evidence | current output is controlled-synthetic or caller-unverified; compact geometry can prove parsing, seeking and presentation but not the source device, model execution, full render rate, or field conditions | bind one owned D54 object replay and exact admitted twin in a reviewed server-side streaming job, run named-mid-hardware performance, then retain P8-014/EXT-008 field evidence |
| Queue recovery is fixture-proven, not production-operated | no multi-replica partition/backlog/dead-letter/SLO exercise | `OPS-003`, `OPS-004`, `OPS-006`, `OPS-007`, `QA-006`, `QA-009` |
| External logs and secret custody | repository tests cannot inspect proxy/APM/provider/operator systems | operations: seeded-secret scan and rotation drill |
| Live provider integrity/cost | deterministic adapters do not prove outage, billing, cancellation, or retention | `OPS-*`, `EXT-*`, and live sandbox acceptance |
| Process/container isolation | D69 supplies non-root/read-only/capability/resource/private-network contract and ephemeral CI checks, but no managed-sandbox or host-boundary proof | OPS-002: protected digest-addressed image review, retained SBOM/provenance/vulnerability evidence, sandbox install/rollback, host policy and egress verification |
| Incident and disaster recovery | contracts exist; deployed restore/response evidence does not | `OPS-005`, `OPS-008`, `OPS-010` |

These risks block the corresponding live or production maturity claims. They do not
invalidate the deterministic contract, and the deterministic contract does not close
them.

## 17. Change and review rule

Update this document, its negative tests, the relevant system contract, TODO state,
risk register, and changelog together when any of these change: trust boundary,
authentication mode, public route, provider/host, request or response limit, secret
handling, log field, object/archive behavior, worker execution, callback, rate class,
admission authority, or production topology. Record a decision when authority or risk
acceptance changes; never silently weaken a check to preserve compatibility.
