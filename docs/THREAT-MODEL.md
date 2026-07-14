# ForgedTTC threat model

Owner: repository maintainers and deployment operators
Last reviewed: **2026-07-13**
Applies to: gateway, Auth.js boundary, Postgres, object storage, generation providers,
Python workers, live command adapters, release archives, Studio-facing APIs
Implementation maturity: **contract and deterministic fixture**; production egress,
distributed abuse control, provider operations, restore exercises, and incident drills
remain operations work.

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
- error, log, secret-rotation, and incident boundaries.

Not yet in scope as implemented public surfaces:

- inbound provider callbacks or webhooks; none are currently accepted;
- arbitrary user code or controllers; contracts contain data only;
- general archive import; current object registration refuses archive media/name
  classes and no object ingestion path extracts user archives;
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
| Jobs, credits, quotes, external offers | idempotency, bounded cost, authorization, provider evidence |
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
| Provider/command -> validator | arbitrary contract/artifact/result | validator and license/admission gates | allowlisted result fields, provenance, bounded process, sovereign verdict |
| Import/course/replay -> core | XML/JSON numbers, graph identities, pointers, timestamps | forge-contract/forge-sim boundary | byte cap, finite SI/time, valid graph/pointer/schema, strict order, no-panic corpus |
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
- validator child process: 30-second timeout and 1 MiB output buffer.

Python command adapters accept at most 4 MiB JSON input, 8 MiB stdout, and 256 KiB
stderr; run for 1 second to 8 hours; use temporary files instead of unbounded pipes;
and kill the process group on timeout or overflow. Exit failures never reflect
provider stdout/stderr. Output must be a bounded JSON object.

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
- Rotate a suspected provider key immediately at the provider, then restart/reload
  every consumer and confirm the old value fails. BYO users rotate their own key.
- Rotate `AUTH_SECRET` only with an explicit session-invalidation plan; treat all old
  sessions as revoked unless a reviewed multi-key overlap is implemented.
- Rotate `FORGE_REVIEW_TOKEN` and object credentials by installing the new secret,
  restarting consumers, exercising an authorized request, revoking the old value,
  and recording only time, operator, scope, and outcome.
- Never paste secret values into an incident, changelog, test output, URL, or support
  ticket. The public redactor is defense in depth, not permission to log secrets.

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

The current surface rejects archive MIME/name classes and does not extract uploaded
archives. Future import must use a separate quarantine service with compressed and
expanded quotas, exact allowed formats, entry-count/path/link/device checks, malware
and parser isolation, content sniffing, admission validation, and promotion only after
success. Filename or supplied MIME is not sufficient trust.

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

## 14. Control and negative-test matrix

| Threat | Current deterministic evidence | Live evidence still required |
|---|---|---|
| Host-header/origin/CSRF confusion | pinned-origin config, forwarded-header stripping, unsafe cookie-origin tests, Auth.js CSRF enabled | deployed proxy/TLS/cookie inspection |
| Dev/admin auth bypass | production startup negatives, dev-header refusal, absent/short owner-token failures | named roles and revocation drill |
| Secret persistence/reflection | HTTP BYO header-only rejection/no env fallback/query audit plus ETL header-only body/command/error tests | provider/proxy/APM log inspection and separate BYO/service-key rotation drills |
| JSON/parameter bombs | byte/depth/node/key/string/non-finite/cycle tests; direct job/object tests | load/concurrency/memory exercise |
| SSRF/redirect/rebinding | private-range, allowlist, DNS, redirect, type, timeout/body tests | egress proxy/firewall connection-time proof |
| Prompt/retrieval injection | data delimiters, untrusted-prefix ordering, provider non-invocation, validator gate | live adversarial provider evaluation |
| Native ETL provider output | exact endpoint/version/model, forced supported-subset strict tool, bounded response and local canonical-row validation/provenance tests | credentialed adversarial sandbox through persistence/review/BOM/export plus outage, billing, retention, and recovery evidence |
| Cross-boundary numeric/graph/command confusion | registered 89-case import/patch/EnvSpec/replay/provider/citation/export/hardware corpus plus Rust/Python behavior and random no-panic tests | diverse real external imports, credentialed provider corpus, controlled hardware, and load/fault exercises |
| Cross-tenant object/data access | owner-keyed routes and queries, scoped export/delete tests | production IAM and penetration test |
| Malicious/partial upload or archive | checksum-bound PUT, staged-until-exact HEAD completion, staged download/consent refusal, MIME/name refusal, forced download, exact release archive allowlist/caps | provider IAM/checksum audit and quarantine scanner for any future importer |
| Worker command exfiltration/DoS | bounded stdin/stdout/stderr/time/process-group tests; generic failures | container sandbox, egress and resource quota proof |
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
| Queue recovery is fixture-proven, not production-operated | no multi-replica partition/backlog/dead-letter/SLO exercise | `OPS-003`, `OPS-004`, `OPS-006`, `OPS-007`, `QA-006`, `QA-009` |
| External logs and secret custody | repository tests cannot inspect proxy/APM/provider/operator systems | operations: seeded-secret scan and rotation drill |
| Live provider integrity/cost | deterministic adapters do not prove outage, billing, cancellation, or retention | `OPS-*`, `EXT-*`, and live sandbox acceptance |
| Process/container isolation | process bounds do not provide a full OS sandbox | operations: non-root container, seccomp/sandbox, limits, egress |
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
