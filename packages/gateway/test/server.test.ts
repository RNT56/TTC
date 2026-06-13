import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { GatewayDb } from "../src/db.js";
import {
  ANTHROPIC_MODEL_PINS,
  type AnthropicTransport,
  type GenerationMaterials,
  type GenerationValidator,
  type SynthesisAdapter,
} from "../src/generation.js";
import { buildServer } from "../src/server.js";
import { validatorBin } from "../src/validator.js";

const demoPath = join(process.cwd(), "..", "..", "examples", "vx2-mini.forge.json");
const haveBinary = existsSync(validatorBin());
const generationMaterials: GenerationMaterials = {
  schemaText: '{"title":"ModelSpec","type":"object"}',
  engineDocs: "Engine docs: use validator diagnostics and do not invent component truth.",
  exemplars: [
    {
      id: "vx2-proof",
      name: "VX-2 proof",
      archetype: "multirotor",
      source: "fixture",
      contract: { meta: { id: "vx2-proof", archetype: "multirotor" }, skeleton: [], parts: [] },
    },
  ],
};

test("healthz reports the validator binary", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/healthz" });
  assert.equal(res.statusCode, 200);
  const body = res.json() as { ok: boolean; validatorPresent: boolean };
  assert.equal(body.ok, true);
  await app.close();
});

test("validate rejects a malformed body at the schema boundary", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: "/v1/validate",
    payload: { nope: 1 },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test(
  "validate admits the demo contract through the spawned gatekeeper",
  { skip: !haveBinary && "forge-validate binary not built (run: cargo build -p forge-validate)" },
  async () => {
    const app = buildServer();
    const contract = JSON.parse(readFileSync(demoPath, "utf8")) as unknown;
    const res = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract },
    });
    assert.equal(res.statusCode, 200, res.body);
    const report = res.json() as { verdict: string; counts: { parts: number } };
    assert.equal(report.verdict, "admitted");
    assert.equal(report.counts.parts, 16);
    await app.close();
  },
);

test(
  "validate returns 422 with diagnostics for an invalid document",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: { nope: true } },
    });
    assert.equal(res.statusCode, 422);
    const report = res.json() as { verdict: string; results: { check: string }[] };
    assert.equal(report.verdict, "rejected");
    assert.ok(report.results.some((d) => d.check === "CTR-001"));
    await app.close();
  },
);

test(
  "bake returns buffers and counts",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const contract = JSON.parse(readFileSync(demoPath, "utf8")) as unknown;
    const res = await app.inject({ method: "POST", url: "/v1/bake", payload: { contract } });
    assert.equal(res.statusCode, 200, res.body);
    const artifact = res.json() as { counts: { parts: number; faces: number } };
    assert.equal(artifact.counts.parts, 16);
    assert.ok(artifact.counts.faces > 0);
    await app.close();
  },
);

test(
  "bom returns catalog-backed purchasable rows",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const contract = JSON.parse(
      readFileSync(join(process.cwd(), "..", "..", "examples", "vx2-proof.forge.json"), "utf8"),
    ) as unknown;
    const res = await app.inject({ method: "POST", url: "/v1/bom", payload: { contract } });
    assert.equal(res.statusCode, 200, res.body);
    const rows = res.json() as { componentId?: string; sku?: string }[];
    assert.ok(rows.some((row) => row.componentId === "cmp_motor_emax-eco2-2207-1900kv"));
    assert.ok(rows.some((row) => row.sku === "1501304BK-2PACK"));
    await app.close();
  },
);

test(
  "schema endpoint serves the emitted JSON Schema",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/v1/schema" });
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.includes("ModelSpec") || res.body.includes("skeleton"));
    await app.close();
  },
);

test("generate context retrieves only approved catalog rows", async () => {
  const db: GatewayDb = {
    async query(text, params) {
      assert.match(text, /rq\.status = 'approved'/);
      assert.match(text, /COALESCE\(rq\.export_policy, 'blocked'\) <> 'blocked'/);
      assert.deepEqual(params, [["motor", "prop"], "5 inch quad motor", 2]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "0.7",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db, generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/context",
    payload: {
      prompt: "5 inch quad motor",
      archetype: "multirotor",
      categories: ["prop", "motor", "motor"],
      limit: 2,
      includePrefixText: false,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as {
    mode: string;
    catalogPolicy: string;
    brief: { categories: string[] };
    retrievedComponents: { id: string; exportPolicy: string; priceCount: number }[];
    promptPrefix: { text: string | null; hash: string; schemaHash: string };
    blockedReasons: string[];
  };
  assert.equal(body.mode, "context-only");
  assert.equal(body.catalogPolicy, "approved-review-rows-only");
  assert.deepEqual(body.brief.categories, ["motor", "prop"]);
  assert.equal(body.retrievedComponents[0].id, "cmp_motor_emax-eco2-2207-1900kv");
  assert.equal(body.retrievedComponents[0].exportPolicy, "full-geometry-ok");
  assert.equal(body.retrievedComponents[0].priceCount, 1);
  assert.equal(body.promptPrefix.text, null);
  assert.match(body.promptPrefix.hash, /^[a-f0-9]{64}$/);
  assert.match(body.promptPrefix.schemaHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(body.blockedReasons, []);
  await app.close();
});

test("generate context blocks synthesis when no approved catalog rows match", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "make a rover", 8]);
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const app = buildServer({ db, generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/context",
    payload: { prompt: "make a rover", includePrefixText: false },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { retrievedComponents: unknown[]; blockedReasons: string[] };
  assert.equal(body.retrievedComponents.length, 0);
  assert.ok(body.blockedReasons.some((reason) => reason.includes("no approved catalog")));
  await app.close();
});

test("generate context rejects malformed bodies at the schema boundary", async () => {
  const app = buildServer({ generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/context",
    payload: { prompt: "" },
  });
  assert.equal(res.statusCode, 400);
  await app.close();
});

test("generate blocks before synthesis when approved catalog context is empty", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "make a quad", 8]);
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      throw new Error("synthesis should not run without approved catalog context");
    },
  };
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: { prompt: "make a quad" },
  });
  assert.equal(res.statusCode, 409, res.body);
  const body = res.json() as {
    verdict: string;
    contract: unknown;
    attempts: unknown[];
    blockedReasons: string[];
  };
  assert.equal(body.verdict, "blocked");
  assert.equal(body.contract, null);
  assert.deepEqual(body.attempts, []);
  assert.ok(body.blockedReasons.some((reason) => reason.includes("no approved catalog")));
  await app.close();
});

test("generate repairs validator diagnostics and admits the repaired contract", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [["motor"], "5 inch quad motor", 1]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return { contract: { bad: true }, modelId: "claude-fable-5", promptHash: "p1" };
    },
    async repair(input) {
      assert.equal(input.attempt.phase, "synthesize");
      assert.equal(input.attempt.diagnostics[0]?.check, "CTR-001");
      return { contract: { ok: true }, modelId: "claude-opus-4-8", promptHash: "p1" };
    },
  };
  const validator: GenerationValidator = async (contractJson) => {
    const contract = JSON.parse(contractJson) as { ok?: boolean };
    if (contract.ok) {
      return { exitCode: 0, report: { verdict: "admitted", results: [] }, stderr: "" };
    }
    return {
      exitCode: 1,
      report: {
        verdict: "rejected",
        results: [{ check: "CTR-001", severity: "error", message: "missing ModelSpec fields" }],
      },
      stderr: "",
    };
  };
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: {
      prompt: "5 inch quad motor",
      categories: ["motor"],
      limit: 1,
      maxRepairIterations: 1,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as {
    verdict: string;
    contract: { ok?: boolean };
    attempts: { phase: string; modelId: string; verdict: string; diagnostics: { check?: string }[] }[];
  };
  assert.equal(body.verdict, "admitted");
  assert.deepEqual(body.contract, { ok: true });
  assert.deepEqual(
    body.attempts.map((attempt) => attempt.phase),
    ["synthesize", "repair"],
  );
  assert.equal(body.attempts[0].modelId, "claude-fable-5");
  assert.equal(body.attempts[0].diagnostics[0]?.check, "CTR-001");
  assert.equal(body.attempts[1].modelId, "claude-opus-4-8");
  assert.equal(body.attempts[1].verdict, "admitted");
  await app.close();
});

test("generate persists exhausted repairs as a diagnostic draft", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "rough draft rover", 8]);
      return {
        rows: [
          {
            id: "cmp_rover_waveshare-ugv-rover-pt-pi5-ros2",
            brand: "Waveshare",
            model: "UGV Rover PT PI5 ROS2",
            rev: "1.0.0",
            category: "rover",
            dims: { lengthMm: 265 },
            mass_g: "1800",
            elec: {},
            mech: {},
            confidence: "0.8",
            license_class: "attribution",
            export_policy: "attribution-manifest-required",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "6",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return { contract: { stillBad: true }, modelId: "claude-fable-5", promptHash: "p2" };
    },
  };
  const validator: GenerationValidator = async (_contractJson, asDraft = false) => ({
    exitCode: asDraft ? 0 : 1,
    report: {
      verdict: asDraft ? "draft" : "rejected",
      results: [{ check: "CTR-004", severity: "error", message: "slot unresolved" }],
    },
    stderr: "",
  });
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: { prompt: "rough draft rover", maxRepairIterations: 0 },
  });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { verdict: string; attempts: { phase: string; verdict: string }[] };
  assert.equal(body.verdict, "draft");
  assert.deepEqual(
    body.attempts.map((attempt) => `${attempt.phase}:${attempt.verdict}`),
    ["synthesize:rejected", "draft:draft"],
  );
  await app.close();
});

test("generate records admitted artifacts in the audit table", async () => {
  let insertSeen = false;
  const db: GatewayDb = {
    async query(text, params) {
      if (text.includes("INSERT INTO generated_artifacts")) {
        insertSeen = true;
        assert.equal(params?.[0], "gen-audit");
        assert.equal(params?.[1], "admitted");
        assert.equal(params?.[2], "audit this quad");
        assert.equal(params?.[3], "template");
        assert.deepEqual(params?.[5], ["motor"]);
        assert.equal(params?.[6], 11);
        assert.match(String(params?.[7]), /^[a-f0-9]{64}$/);
        assert.match(String(params?.[8]), /^[a-f0-9]{64}$/);
        assert.equal(params?.[9], "claude-fable-5");
        assert.match(String(params?.[10]), /gen-audit/);
        assert.match(String(params?.[12]), /claude-fable-5/);
        return { rows: [], rowCount: 1 } as never;
      }
      assert.deepEqual(params, [["motor"], "audit this quad", 1]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return {
        contract: { meta: { id: "gen-audit" }, ok: true },
        modelId: "claude-fable-5",
        promptHash: "f".repeat(64),
      };
    },
  };
  const validator: GenerationValidator = async () => ({
    exitCode: 0,
    report: { verdict: "admitted", results: [] },
    stderr: "",
  });
  const app = buildServer({ db, generationMaterials, generationAdapter: adapter, generationValidator: validator });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: {
      prompt: "audit this quad",
      categories: ["motor"],
      limit: 1,
      seed: 11,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(insertSeen, true);
  const body = res.json() as { generatedArtifact?: { artifactId: string; status: string } };
  assert.equal(body.generatedArtifact?.artifactId, "gen-audit");
  assert.equal(body.generatedArtifact?.status, "admitted");
  await app.close();
});

test("generate stream returns SSE-compatible progress events", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "stream a quad", 8]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const adapter: SynthesisAdapter = {
    async synthesize() {
      return { contract: { meta: { id: "stream" }, ok: true }, modelId: "claude-fable-5", promptHash: "s" };
    },
  };
  const validator: GenerationValidator = async () => ({
    exitCode: 0,
    report: { verdict: "admitted", results: [] },
    stderr: "",
  });
  const app = buildServer({
    db,
    generationMaterials,
    generationAdapter: adapter,
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate/stream",
    payload: { prompt: "stream a quad" },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.match(res.headers["content-type"] as string, /text\/event-stream/);
  assert.match(res.body, /event: start/);
  assert.match(res.body, /event: complete/);
  assert.match(res.body, /"verdict":"admitted"/);
  await app.close();
});

test("generate model pins expose the implementation-time Anthropic contract", async () => {
  const app = buildServer({ generationMaterials });
  const res = await app.inject({ method: "GET", url: "/v1/generate/models" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { models: typeof ANTHROPIC_MODEL_PINS };
  assert.equal(body.models.find((pin) => pin.role === "synthesis")?.modelId, "claude-fable-5");
  assert.equal(body.models.find((pin) => pin.role === "repair")?.modelId, "claude-opus-4-8");
  assert.equal(body.models.find((pin) => pin.role === "edit")?.modelId, "claude-sonnet-4-6");
  assert.equal(body.models.find((pin) => pin.role === "etl")?.modelId, "claude-haiku-4-5-20251001");
  assert.equal(body.models.find((pin) => pin.role === "synthesis")?.inputUsdPerMTok, 10);
  assert.equal(body.models.find((pin) => pin.role === "synthesis")?.outputUsdPerMTok, 50);
  assert.deepEqual(body.models, ANTHROPIC_MODEL_PINS);
  await app.close();
});

test("generate can use the Anthropic tool-pass adapter with a per-request key", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [["motor"], "5 inch quad motor", 1]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const calls: Parameters<AnthropicTransport>[0][] = [];
  const transport: AnthropicTransport = async (input) => {
    calls.push(input);
    assert.equal(input.apiKey, "sk-byo-test");
    assert.equal(input.baseUrl, "https://anthropic.test");
    assert.equal(input.request.tool_choice.name, "forge_emit_modelspec");
    assert.equal(input.request.tools[0]?.name, "forge_emit_modelspec");
    assert.equal(input.request.tools[0]?.strict, true);
    if (input.request.model === "claude-fable-5") {
      return {
        model: "claude-fable-5",
        stop_reason: "tool_use",
        content: [
          {
            type: "tool_use",
            name: "forge_emit_modelspec",
            input: { bad: true, meta: { id: "first-pass" } },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 20 },
      };
    }
    assert.equal(input.request.model, "claude-opus-4-8");
    assert.match(input.request.messages[0]?.content ?? "", /CTR-001/);
    return {
      model: "claude-opus-4-8",
      stop_reason: "tool_use",
      content: [
        {
          type: "tool_use",
          name: "forge_emit_modelspec",
          input: { ok: true, meta: { id: "repaired-pass" } },
        },
      ],
      usage: { input_tokens: 120, output_tokens: 30 },
    };
  };
  const validator: GenerationValidator = async (contractJson) => {
    const contract = JSON.parse(contractJson) as { ok?: boolean };
    if (contract.ok) {
      return { exitCode: 0, report: { verdict: "admitted", results: [] }, stderr: "" };
    }
    return {
      exitCode: 1,
      report: {
        verdict: "rejected",
        results: [{ check: "CTR-001", severity: "error", message: "missing fields" }],
      },
      stderr: "",
    };
  };
  const app = buildServer({
    db,
    generationMaterials,
    anthropicTransport: transport,
    anthropicBaseUrl: "https://anthropic.test",
    generationValidator: validator,
    persistGeneratedArtifacts: false,
  });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    headers: { "x-forge-anthropic-key": "sk-byo-test" },
    payload: {
      provider: "anthropic",
      prompt: "5 inch quad motor",
      categories: ["motor"],
      limit: 1,
      maxRepairIterations: 1,
      seed: 7,
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.equal(calls.length, 2);
  const body = res.json() as {
    verdict: string;
    contract: { ok?: boolean; meta?: { provenance?: { modelVersion?: string; seed?: number } } };
    attempts: { phase: string; modelId: string; stopReason?: string; usage?: unknown }[];
  };
  assert.equal(body.verdict, "admitted");
  assert.equal(body.contract.ok, true);
  assert.equal(body.contract.meta?.provenance?.modelVersion, "claude-opus-4-8");
  assert.equal(body.contract.meta?.provenance?.seed, 7);
  assert.deepEqual(
    body.attempts.map((attempt) => `${attempt.phase}:${attempt.modelId}:${attempt.stopReason}`),
    ["synthesize:claude-fable-5:tool_use", "repair:claude-opus-4-8:tool_use"],
  );
  assert.ok(!res.body.includes("sk-byo-test"));
  await app.close();
});

test("generate Anthropic provider fails closed without a key", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [null, "make a quad", 8]);
      return {
        rows: [
          {
            id: "cmp_motor_emax-eco2-2207-1900kv",
            brand: "EMAX",
            model: "ECO II 2207 1900KV",
            rev: "1.0.0",
            category: "motor",
            dims: { diameterMm: 27.9 },
            mass_g: "33.2",
            elec: { kv: 1900 },
            mech: { propShaft: "prop-shaft-M5" },
            confidence: "1",
            license_class: "open",
            export_policy: "full-geometry-ok",
            reviewer: "owner",
            reviewed_at: "2026-06-13T19:00:00.000Z",
            review_note: "owner checked",
            price_count: "1",
            citation_count: "9",
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db, generationMaterials });
  const res = await app.inject({
    method: "POST",
    url: "/v1/generate",
    payload: { provider: "anthropic", prompt: "make a quad" },
  });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /Anthropic generation requires/);
  await app.close();
});

test("review queue lists pending catalog items", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, ["needs_review", 50]);
      return {
        rows: [
          {
            id: 7,
            artifact_id: "cmp_frame_tbs-source-one-v6-5in",
            artifact_kind: "component",
            reason: "retailer-only dimensions require owner verification",
            status: "needs_review",
            confidence: "0.7",
            payload: { id: "cmp_frame_tbs-source-one-v6-5in" },
            created_at: "2026-06-13T18:00:00.000Z",
            reviewed_at: null,
            reviewer: null,
            review_note: null,
            export_policy: null,
            decision_payload: {},
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({ method: "GET", url: "/v1/reviews" });
  assert.equal(res.statusCode, 200, res.body);
  const body = res.json() as { items: { id: number; artifactId: string; confidence: number }[] };
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].artifactId, "cmp_frame_tbs-source-one-v6-5in");
  assert.equal(body.items[0].confidence, 0.7);
  await app.close();
});

test("review queue records an approval decision", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, [7, "approved", "owner", "datasheet checked", "full-geometry-ok"]);
      return {
        rows: [
          {
            id: 7,
            artifact_id: "ref_quad_kakute-h7-source-one-5in",
            artifact_kind: "reference-rig",
            reason: "reference rig owner verification required",
            status: "approved",
            confidence: "0.8",
            payload: { id: "ref_quad_kakute-h7-source-one-5in" },
            created_at: "2026-06-13T18:00:00.000Z",
            reviewed_at: "2026-06-13T18:05:00.000Z",
            reviewer: "owner",
            review_note: "datasheet checked",
            export_policy: "full-geometry-ok",
            decision_payload: { status: "approved" },
          },
        ],
        rowCount: 1,
      } as never;
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({
    method: "PATCH",
    url: "/v1/reviews/7",
    payload: {
      status: "approved",
      reviewer: "owner",
      reviewNote: "datasheet checked",
      exportPolicy: "full-geometry-ok",
    },
  });
  assert.equal(res.statusCode, 200, res.body);
  const item = res.json() as {
    status: string;
    reviewer: string;
    reviewNote: string;
    exportPolicy: string;
  };
  assert.equal(item.status, "approved");
  assert.equal(item.reviewer, "owner");
  assert.equal(item.reviewNote, "datasheet checked");
  assert.equal(item.exportPolicy, "full-geometry-ok");
  await app.close();
});

test("review queue filters closed rows by export policy", async () => {
  const db: GatewayDb = {
    async query(_text, params) {
      assert.deepEqual(params, ["approved", 10, "attribution-manifest-required"]);
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({
    method: "GET",
    url: "/v1/reviews?status=approved&limit=10&exportPolicy=attribution-manifest-required",
  });
  assert.equal(res.statusCode, 200, res.body);
  assert.deepEqual((res.json() as { items: unknown[] }).items, []);
  await app.close();
});

test("review queue can be guarded by an owner token", async () => {
  const db: GatewayDb = {
    async query() {
      return { rows: [], rowCount: 0 } as never;
    },
  };
  const app = buildServer({ db, reviewToken: "secret-token" });
  const denied = await app.inject({ method: "GET", url: "/v1/reviews" });
  assert.equal(denied.statusCode, 401);
  const allowed = await app.inject({
    method: "GET",
    url: "/v1/reviews",
    headers: { authorization: "Bearer secret-token" },
  });
  assert.equal(allowed.statusCode, 200, allowed.body);
  await app.close();
});

test("review queue reports database unavailability cleanly", async () => {
  const db: GatewayDb = {
    async query() {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    },
  };
  const app = buildServer({ db });
  const res = await app.inject({ method: "GET", url: "/v1/reviews" });
  assert.equal(res.statusCode, 503);
  assert.match(res.body, /catalog database unavailable/);
  await app.close();
});

test(
  "asDraft turns a failing contract into an editable draft (D14)",
  { skip: !haveBinary && "forge-validate binary not built" },
  async () => {
    const app = buildServer();
    const hrx7 = JSON.parse(
      readFileSync(join(process.cwd(), "..", "..", "examples", "hrx7.forge.json"), "utf8"),
    ) as unknown;
    // without the flag: rejected, 422
    const rejected = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: hrx7 },
    });
    assert.equal(rejected.statusCode, 422);
    assert.equal((rejected.json() as { verdict: string }).verdict, "rejected");
    // with it: a successful save-as-draft, diagnostics intact
    const draft = await app.inject({
      method: "POST",
      url: "/v1/validate",
      payload: { contract: hrx7, asDraft: true },
    });
    assert.equal(draft.statusCode, 200, draft.body);
    const report = draft.json() as { verdict: string; results: { check: string }[] };
    assert.equal(report.verdict, "draft");
    assert.ok(report.results.some((d) => d.check === "CTR-004"), "diagnostics carried");
    await app.close();
  },
);
