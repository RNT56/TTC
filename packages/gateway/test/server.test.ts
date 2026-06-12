import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
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
