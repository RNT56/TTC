# RISK REGISTER

Source: plan §20 (v3.0, binding), extended with watch triggers — the observable
signal that says a mitigation is failing and the risk needs active management. Review
at every phase close; note material changes in the changelog.

| # | Risk | L | I | Mitigation | Watch trigger |
|---|---|---|---|---|---|
| R1 | Sim-to-real gap (especially legged) | High | High | archetype gradient (quads/rovers first); estimator-in-sim (D8); randomization + system ID as product rituals; ladder gating; honest scorecards | ghost divergence stays large after system-ID fit on the reference quad (P8) |
| R2 | LLM emits plausible-but-invalid geometry | High | Med | schema-constrained output; bounded self-repair on machine diagnostics; pattern grounding; draft fallback (D14); Brief-25 as CI | Brief-25 admission < 20/25 or repair iterations trending up |
| R3 | CAD/license entanglement | Med | High | license ledger from day one; export matrix (D10); derived-LOD serving; link-out fallback; legal review before marketplace | any ingested asset found without a ledger entry; takedown request received |
| R4 | Open-core commoditization (fork + clone) | Med | Med | the moat is the data, not the code (D2): catalog + ledger, pattern corpus, provenance graph, community courses/skills | a fork ships a competing catalog of comparable quality |
| R5 | Generation-eval drift (model bumps silently degrade quality) | Med | Med | Brief-25 re-runs on every prompt/schema/pattern/model change with tracked metrics | dashboard regression after any model-version bump |
| R6 | GPU cost creep (photoscan/training/co-design) | Med | Med | burst-only GPUs; permanent caching; Batch API ETL; multi-fidelity ladder; MJX only when CPU saturates (P7-010) | monthly GPU spend exceeding credit revenue two months running |
| R7 | Print/build liability | Low–Med | High | DfM diagnostics framed as checks not guarantees; service/user own outcomes; ToS review gates P8; supervisor disclaimers | any incident report involving a printed structural part |
| R8 | Scope gravity — it wants to be five products | High | High | the loop is the spine; the success ladder (plan §1.3) names the rungs; every phase has exit criteria; platform phases deliberately last | work started on a phase whose predecessor has unmet exit criteria |
| R9 | Two-engine physics divergence | Med | Med | one compiled source of truth; parity suite on every upgrade; training side canonical (D20) | parity suite tolerance failures after an engine/exporter bump |
| R10 | Solo-builder bus factor | High | Med | boring choices everywhere but one — and the one (the Rust core) is the most documentable, testable part; validator-enforced invariants; this documentation system + changelog discipline | sessions ending without changelog entries; docs drifting from code |
| R11 | Browser API churn (WebSerial/WebGPU) | Low | Med | WebGL2 baseline; Chromium floor declared for the full web studio; **FORGE Desktop carries the bridge past the browser (D15)** | a Chromium release breaking WebSerial/SAB behavior |
| R12 | **Rust port costs more than estimated** (solo, TS-native builder) | Med–High | Med | core is math-not-frameworks Rust; harness-as-oracle makes "done" objective; per-crate landing order (contract → motion → geometry → sim → validate); AI pair; sanctioned fallback: ship a lagging crate as TS behind the frozen boundary (with a DECISIONS entry) | a crate not green against its oracle after its scheduled slice of the P1 window |
| R13 | **Cross-target float divergence breaks D17** | Low–Med | Med | no fast-math anywhere in core; golden-number suite in CI on every core change; declared ULP-tolerance degradation per offending platform | any golden-number failure that cannot be traced to an intentional change |
| R14 | **Living docs drift from executable truth** | High | High | evidence-first authority order; dated PROJECT-STATE; stable TODO IDs; reconcile status in every behavior change | CI/test evidence contradicts a checked roadmap/TODO claim |
| R15 | **Fixture breadth is mistaken for product maturity** | High | High | contract/fixture/sandbox/live/field labels; external acceptance gates; no phase close from route/table presence | public or internal claims use fixture counts as live proof |
| R16 | **Toolchain and workflow drift silently break gates** | High | High | pin/version policy; local verify command matching CI; scheduled gate ownership; artifact diagnostics | stable toolchain/action update turns repeated CI/nightly red |
| R17 | **Supply-chain or unprotected-main compromise** | Med | High | protected ruleset; immutable Action pins; dependency/secret/code scanning; SBOM/attestation; least workflow permissions | direct main push, unreviewed workflow change, or unresolved advisory beyond SLA |
| R18 | **Privacy/deletion promise exceeds implementation** | Med | High | explicit consent/retention/deletion ledgers; object tombstones; backup-deletion tests; user export | deletion request cannot be completed across DB, blobs, backups, and derived artifacts |
| R19 | **Provider failure or cost destroys trust/economics** | Med | High | sandbox proof, quotas, idempotency, circuit breakers, cancellation/refunds, per-job cost telemetry | repeated partial artifacts, runaway spend, or unexplained credit loss |

L = likelihood, I = impact.

**Adding a risk:** append a row (next free R-number), set L/I, name a real mitigation
and an observable trigger, and reference it from the changelog entry that introduced
the concern.
