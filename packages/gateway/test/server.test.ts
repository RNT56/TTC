import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import type { GatewayDb } from "../src/db.js";
import { buildServer } from "../src/server.js";
import { validatorBin } from "../src/validator.js";

const demoPath = join(process.cwd(), "..", "..", "examples", "vx2-mini.forge.json");
const haveBinary = existsSync(validatorBin());

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
      assert.deepEqual(params, [7, "approved", "owner"]);
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
    payload: { status: "approved", reviewer: "owner" },
  });
  assert.equal(res.statusCode, 200, res.body);
  const item = res.json() as { status: string; reviewer: string };
  assert.equal(item.status, "approved");
  assert.equal(item.reviewer, "owner");
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
