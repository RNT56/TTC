#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { chromium } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "artifacts", "e2e");
const evidencePath = join(outDir, "qa002-browser-e2e.json");
const failureScreenshotPath = join(outDir, "qa002-browser-e2e-failure.png");
const databaseUrl = process.env.DATABASE_URL?.trim();
const validatorBin = resolve(process.env.FORGE_VALIDATE_BIN ?? join(root, "target", "debug", "forge-validate"));
const runId = `${Date.now()}-${process.pid}`;
const userId = `qa002-browser-${runId}`;
const userEmail = `${userId}@example.test`;
const browserTimeoutMs = 60_000;
const services = [];
const serviceLogs = new Map();
let browser = null;
let page = null;

if (process.env.FORGE_BROWSER_E2E !== "1") {
  throw new Error("refusing browser E2E without FORGE_BROWSER_E2E=1; use only an isolated disposable database");
}
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the isolated browser E2E gate");
}
if (!existsSync(validatorBin)) {
  throw new Error(`forge-validate is required at ${validatorBin}; build it or download the protected CI artifact`);
}

mkdirSync(outDir, { recursive: true });

function run(label, command, args, options = {}) {
  console.log(`browser-e2e: ${label}`);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw new Error(`${label}: could not start ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}: ${command} exited with status ${result.status}`);
}

function rememberLog(name, chunk) {
  const lines = `${serviceLogs.get(name) ?? ""}${String(chunk)}`.split("\n").slice(-80).join("\n");
  serviceLogs.set(name, lines);
}

function startService(name, command, args, options) {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => rememberLog(name, chunk));
  child.stderr.on("data", (chunk) => rememberLog(name, chunk));
  services.push({ name, child });
  return child;
}

async function stopService(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function openPort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
  return address.port;
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no response";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) });
      if (response.status >= 200 && response.status < 500) return response;
      last = `${response.status} ${response.statusText}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
  }
  throw new Error(`timed out waiting for ${url}: ${last}`);
}

async function waitForText(locator, pattern, timeoutMs = browserTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    last = (await locator.textContent().catch(() => null)) ?? "";
    if (pattern.test(last)) return last;
    await delay(100);
  }
  throw new Error(`timed out waiting for ${String(pattern)}; last text was ${JSON.stringify(last)}`);
}

async function waitForOption(select, predicate, timeoutMs = browserTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = [];
  while (Date.now() < deadline) {
    last = await select
      .locator("option")
      .evaluateAll((options) => options.map((option) => ({
        value: option.value,
        text: option.textContent ?? "",
        contractHash: option.getAttribute("data-contract-hash"),
      })))
      .catch(() => []);
    const match = last.find(predicate);
    if (match) return match;
    await delay(100);
  }
  throw new Error(`timed out waiting for select option; last options were ${JSON.stringify(last)}`);
}

async function waitForWasm(urls, timeoutMs = browserTimeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (urls.length > 0) return urls[0];
    await delay(100);
  }
  throw new Error("production Studio did not load a built WASM facade");
}

async function loadAdmittedDemo(activePage) {
  // Let Studio's canonical default finish first so the explicit test selection
  // cannot race its initial async bake/validation and be overwritten later.
  await waitForText(activePage.locator('[data-testid="validator-report"]'), /forge-validate/i);
  await activePage.locator('[data-testid="demo-model"]').selectOption("vx2-mini");
  await waitForText(activePage.locator('[data-testid="validator-report"]'), /ADMITTED/);
}

async function ensureAuthenticated(activePage, email) {
  const identity = activePage.locator('[data-testid="account-identity"]');
  const refresh = activePage.locator('[data-testid="account-refresh"]');
  await refresh.waitFor({ state: "visible", timeout: browserTimeoutMs });
  const pattern = new RegExp(email);
  let last = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    last = (await identity.textContent().catch(() => null)) ?? "";
    if (pattern.test(last)) return;
    await refresh.click();
    try {
      await waitForText(identity, pattern, 5_000);
      return;
    } catch {
      // Studio boot refreshes several independent server panels. Retry the
      // visible, idempotent account action if that initial request loses a
      // transient preview-proxy race.
    }
  }
  throw new Error(`account did not authenticate after explicit refreshes; last text was ${JSON.stringify(last)}`);
}

function databaseIdentity(url) {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: parsed.port || "5432", database: parsed.pathname.replace(/^\//, "") };
}

const evidence = {
  formatVersion: "qa002-browser-e2e.v1",
  runId,
  status: "running",
  database: databaseIdentity(databaseUrl),
  productionBundle: true,
  realWasm: false,
  flows: [],
};

try {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, connectionTimeoutMillis: 5000 });
  const dbProbe = await pool.query(
    `SELECT current_database() AS database,
            to_regclass('public.model_registry') IS NOT NULL AS model_registry,
            (SELECT count(*)::int FROM schema_migrations) AS migration_count`,
  );
  await pool.end();
  assert.equal(dbProbe.rows[0]?.model_registry, true, "migrated model_registry table is required");
  assert.ok(Number(dbProbe.rows[0]?.migration_count) >= 20, "all current migrations must be applied");
  evidence.database.migrationCount = Number(dbProbe.rows[0].migration_count);

  run("build gateway", "pnpm", ["--filter", "@forge/gateway", "build"]);
  run("build production Studio", "pnpm", ["--filter", "@forge/studio", "build"]);

  const [gatewayPort, studioPort] = await Promise.all([openPort(), openPort()]);
  const gatewayOrigin = `http://127.0.0.1:${gatewayPort}`;
  const studioOrigin = `http://127.0.0.1:${studioPort}`;

  const gateway = startService("gateway", "node", ["dist/index.js"], {
    cwd: join(root, "packages", "gateway"),
    env: {
      PORT: String(gatewayPort),
      NODE_ENV: "test",
      FORGE_DEV_AUTH: "1",
      FORGE_VALIDATE_BIN: validatorBin,
      FORGE_CATALOG_DIR: join(root, "catalog"),
      DATABASE_URL: databaseUrl,
    },
  });
  gateway.once("exit", (code, signal) => {
    if (code !== null && code !== 0) rememberLog("gateway", `\nexited ${code} ${signal ?? ""}`);
  });
  await waitForHttp(`${gatewayOrigin}/v1/generate/models`);

  const preview = startService(
    "studio-preview",
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(studioPort), "--strictPort"],
    {
      cwd: join(root, "packages", "studio"),
      env: { FORGE_GATEWAY_PROXY: gatewayOrigin },
    },
  );
  preview.once("exit", (code, signal) => {
    if (code !== null && code !== 0) rememberLog("studio-preview", `\nexited ${code} ${signal ?? ""}`);
  });
  await waitForHttp(`${studioOrigin}/`);

  browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });

  const authHeaders = {
    "x-forge-user-id": userId,
    "x-forge-user-email": userEmail,
    "x-forge-user-name": "QA-002 Browser",
  };
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: authHeaders,
  });
  page = await context.newPage();
  const pageErrors = [];
  const wasmUrls = [];
  const onnxRuntimeUrls = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (/\/forge_wasm_bg-[^/]+\.wasm(?:\?|$)/.test(response.url()) && response.status() === 200) {
      wasmUrls.push(response.url());
    }
    if (/\/(?:ort\.wasm\.bundle\.min-[^/]+\.js|ort-wasm-[^/]+\.wasm)(?:\?|$)/.test(response.url()) && response.status() === 200) {
      onnxRuntimeUrls.push(response.url());
    }
  });

  await page.goto(`${studioOrigin}/`, { waitUntil: "domcontentloaded" });
  await ensureAuthenticated(page, userEmail);
  await loadAdmittedDemo(page);
  const wasmUrl = await waitForWasm(wasmUrls);
  evidence.realWasm = true;
  evidence.wasmAsset = new URL(wasmUrl).pathname;
  evidence.flows.push("authenticate + load production bundle + validate demo in real WASM");

  const pendingReview = page.locator('[data-testid^="review-item-"]').first();
  await pendingReview.waitFor({ state: "visible", timeout: browserTimeoutMs });
  assert.match((await pendingReview.textContent()) ?? "", /component/i);
  const reviewTestId = await pendingReview.getAttribute("data-testid");
  const reviewId = reviewTestId?.replace("review-item-", "");
  assert.ok(reviewId, "pending catalog review ID was not rendered");
  await page.locator(`[data-testid="review-policy-${reviewId}"]`).selectOption("full-geometry-ok");
  await page.locator(`[data-testid="review-note-${reviewId}"]`).fill("QA-002 deterministic catalog acceptance");
  await page.locator(`[data-testid="review-approve-${reviewId}"]`).click();
  await page.locator(`[data-testid="review-item-${reviewId}"]`).waitFor({ state: "detached", timeout: browserTimeoutMs });
  await page.locator('[data-testid="review-status-filter"]').selectOption("approved");
  const approvedReview = page.locator(`[data-testid="review-item-${reviewId}"]`);
  await approvedReview.waitFor({ state: "visible", timeout: browserTimeoutMs });
  assert.match((await approvedReview.textContent()) ?? "", /approved.*full-geometry-ok/is);
  evidence.catalogReviewId = reviewId;
  evidence.flows.push("approve and render a reviewed catalog component in Postgres");

  const generationPrompt =
    "Generate a 5-inch freestyle multirotor using reviewed catalog electronics. Keep it under 800 g, serviceable, and suitable for field repair.";
  await page.locator('[data-testid="generation-prompt"]').fill(generationPrompt);
  await page.locator('[data-testid="generation-provider"]').selectOption("template");
  await page.locator('[data-testid="generation-archetype"]').selectOption("multirotor");
  await page.locator('[data-testid="generation-categories"]').fill("frame, motor, prop, battery, fc, esc");
  await page.locator('[data-testid="generation-run"]').click();
  await waitForText(page.locator('[data-testid="generation-status"]'), /^admitted$/i);
  await waitForText(page.locator('[data-testid="validator-report"]'), /ADMITTED/);
  const modelSelect = page.locator('[data-testid="model-select"]');
  const admittedModel = await waitForOption(modelSelect, (option) => /admitted/i.test(option.text));
  evidence.admittedModelId = admittedModel.value;
  evidence.flows.push("generate admitted model through staged template SSE and persist it");

  await modelSelect.selectOption(admittedModel.value);
  await page.waitForFunction(
    ({ selector, contractHash }) => document.querySelector(selector)?.getAttribute("data-contract-hash") === contractHash,
    { selector: '[data-testid="validator-report"]', contractHash: admittedModel.contractHash },
    { timeout: browserTimeoutMs },
  );
  await page.locator('[data-testid="model-edit-prompt"]').fill("make it blue");
  await page.locator('[data-testid="model-edit-run"]').click();
  await waitForText(page.locator('[data-testid="model-edit-status"]'), /edited in \d+ ms/i);
  await waitForText(page.locator('[data-testid="validator-report"]'), /ADMITTED/);
  evidence.flows.push("edit persisted model through deterministic JSON Patch and revalidate");

  await page.locator('[data-testid="model-save"]').click();
  const draftCandidate = await waitForOption(
    modelSelect,
    (option) => option.value !== admittedModel.value && /admitted/i.test(option.text),
  );
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value === value,
    { selector: '[data-testid="model-select"]', value: draftCandidate.value },
    { timeout: browserTimeoutMs },
  );
  await page.locator('[data-testid="model-edit-prompt"]').fill("make it 10000% longer");
  await page.locator('[data-testid="model-edit-run"]').click();
  await waitForText(page.locator('[data-testid="model-edit-status"]'), /edited in \d+ ms/i);
  await waitForText(page.locator('[data-testid="validator-report"]'), /DRAFT/);
  await waitForOption(modelSelect, (option) => option.value === draftCandidate.value && /draft/i.test(option.text));
  evidence.draftModelId = draftCandidate.value;

  // Reload to restore an admitted local demo while the most recently updated
  // persisted model remains the draft. This lets the enabled share control reach
  // the server and prove that the server, not only the button state, refuses it.
  await page.reload({ waitUntil: "domcontentloaded" });
  await ensureAuthenticated(page, userEmail);
  await loadAdmittedDemo(page);
  await waitForOption(modelSelect, (option) => option.value === draftCandidate.value && /draft/i.test(option.text));
  await page.waitForFunction(
    ({ selector, value }) => document.querySelector(selector)?.value === value,
    { selector: '[data-testid="model-select"]', value: draftCandidate.value },
    { timeout: browserTimeoutMs },
  );
  await page.locator('[data-testid="share-model"]').click();
  await waitForText(page.locator('[data-testid="model-error"]'), /only admitted models can be shared/i);
  evidence.flows.push("persist draft and prove the server refuses draft sharing");

  await modelSelect.selectOption(admittedModel.value);
  await page.waitForFunction(
    ({ selector, contractHash }) => document.querySelector(selector)?.getAttribute("data-contract-hash") === contractHash,
    { selector: '[data-testid="validator-report"]', contractHash: admittedModel.contractHash },
    { timeout: browserTimeoutMs },
  );
  await page.locator('[data-testid="share-model"]').click();
  const shareUrlText = await waitForText(page.locator('[data-testid="share-url"]'), /\?share=/);
  const shareUrl = shareUrlText.trim();
  assert.equal(new URL(shareUrl).origin, studioOrigin);
  evidence.shareId = new URL(shareUrl).searchParams.get("share");

  const anonymous = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const privateModels = await anonymous.request.get(`${studioOrigin}/v1/models`);
  assert.equal(privateModels.status(), 401, "model registry must require authentication");
  const anonymousPage = await anonymous.newPage();
  const anonymousErrors = [];
  anonymousPage.on("pageerror", (error) => anonymousErrors.push(error.message));
  await anonymousPage.goto(shareUrl, { waitUntil: "domcontentloaded" });
  await waitForText(anonymousPage.locator('[data-testid="account-identity"]'), /^not signed in$/i);
  await waitForText(anonymousPage.locator('[data-testid="validator-report"]'), /ADMITTED/);
  assert.deepEqual(anonymousErrors, [], `anonymous share page errors: ${anonymousErrors.join(" | ")}`);
  await anonymous.close();
  evidence.flows.push("open admitted server share in an anonymous browser while private models remain 401");

  const courseName = `QA-002 slalom ${runId}`;
  await page.locator('[data-testid="course-name"]').fill(courseName);
  await page.locator('[data-testid="course-create"]').click();
  const courseMessage = await waitForText(page.locator('[data-testid="platform-message"]'), /course .+ · admitted/i);
  const courseOption = await waitForOption(page.locator('[data-testid="course-select"]'), (option) => option.text.includes(courseName));
  evidence.courseId = courseOption.value;
  assert.match(courseMessage, new RegExp(courseOption.value));
  evidence.flows.push("validate and persist course EnvSpec through the Studio");

  await page.locator('[data-testid="listing-create"]').click();
  const listingMessage = await waitForText(page.locator('[data-testid="platform-message"]'), /listing .+ · (draft|review|listed)/i);
  const listingId = listingMessage.match(/listing ([^ ]+)/i)?.[1] ?? null;
  assert.ok(listingId, "listing ID was not rendered");
  await page.locator(`[data-testid="listing-row-${listingId}"]`).waitFor({ state: "visible", timeout: browserTimeoutMs });
  evidence.listingId = listingId;
  evidence.flows.push("create and render a governed model listing");

  assert.deepEqual(onnxRuntimeUrls, [], "lazy ONNX Runtime assets must not join first paint");
  await page.locator('[data-testid="job-run-train.policy"]').click();
  const policyJob = page.locator('[data-testid="job-row-train.policy"]').first();
  await waitForText(policyJob, /train\.policy · succeeded/i);
  await policyJob.locator('[data-testid="policy-play"]').click();
  await waitForText(page.locator('[data-testid="policy-playback-status"]'), /playing hover-hold · ONNX Runtime Web\/WASM · 1 inference/i);
  await waitForText(page.locator('[data-testid="policy-playback-status"]'), /played hover-hold · ONNX Runtime Web\/WASM · [1-9][0-9]* inferences/i);
  assert.ok(onnxRuntimeUrls.some((url) => /ort\.wasm\.bundle\.min-[^/]+\.js/.test(url)), "lazy ONNX JS chunk was not loaded");
  assert.ok(onnxRuntimeUrls.some((url) => /ort-wasm-[^/]+\.wasm/.test(url)), "same-origin ONNX Runtime WASM was not loaded");
  assert.ok(onnxRuntimeUrls.every((url) => new URL(url).origin === studioOrigin), "ONNX runtime assets must stay same-origin");
  evidence.onnxRuntimeAssets = [...new Set(onnxRuntimeUrls.map((url) => new URL(url).pathname))];
  evidence.flows.push("execute a hash- and lineage-bound ONNX policy in-browser through the Rust estimator/motion boundary");

  await page.locator('[data-testid="job-run-maintenance.estimate-wear"]').click();
  const maintenanceJob = page.locator('[data-testid="job-row-maintenance.estimate-wear"]').first();
  await waitForText(maintenanceJob, /maintenance\.estimate-wear · succeeded/i);
  evidence.flows.push("run fixture job through the browser and render succeeded queue state");
  await waitForText(page.locator('[data-testid="maintenance-dashboard"]'), /fleet dashboard/i);
  assert.match((await page.locator('[data-testid="maintenance-dashboard"]').textContent()) ?? "", /wear/i);
  evidence.flows.push("render the job's Postgres-materialized maintenance record");

  assert.deepEqual(pageErrors, [], `authenticated Studio page errors: ${pageErrors.join(" | ")}`);
  assert.equal(evidence.flows.length, 11);
  evidence.status = "passed";
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`browser-e2e: 11/11 QA-002/P7-008 flows passed -> ${evidencePath}`);
} catch (error) {
  evidence.status = "failed";
  evidence.error = error instanceof Error ? error.stack ?? error.message : String(error);
  evidence.serviceLogs = Object.fromEntries(serviceLogs);
  if (page) {
    await page.screenshot({ path: failureScreenshotPath, fullPage: true }).catch(() => undefined);
  }
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => undefined);
  for (const { child } of services.reverse()) await stopService(child);
}
