#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";
import { chromium, firefox, webkit } from "playwright-core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const studioRoot = join(root, "packages", "studio");
const outDir = join(root, "artifacts", "e2e");
const evidencePath = join(outDir, "qa003-browser-support.json");
const browserTimeoutMs = 60_000;
const requestedEngines = (process.env.FORGE_BROWSER_ENGINES ?? "chromium,firefox,webkit")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const engines = { chromium, firefox, webkit };
const serviceLogs = [];
let preview = null;

if (process.env.FORGE_BROWSER_SUPPORT !== "1") {
  throw new Error("refusing browser-support acceptance without FORGE_BROWSER_SUPPORT=1");
}
if (!existsSync(join(studioRoot, "dist", "index.html"))) {
  throw new Error("production Studio bundle is missing; run pnpm --filter @forge/studio build first");
}
assert.deepEqual(
  [...new Set(requestedEngines)].sort(),
  [...requestedEngines].sort(),
  "browser engine list must not contain duplicates",
);
for (const engine of requestedEngines) {
  assert.ok(engine in engines, `unsupported browser engine '${engine}'`);
}

mkdirSync(outDir, { recursive: true });

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
      if (response.status >= 200 && response.status < 500) return;
      last = `${response.status} ${response.statusText}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await delay(150);
  }
  throw new Error(`timed out waiting for ${url}: ${last}`);
}

async function stopService(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const exited = new Promise((resolveExit) => child.once("exit", resolveExit));
  await Promise.race([exited, delay(3000)]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
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

function shareFragment() {
  const contract = JSON.parse(readFileSync(join(root, "examples", "vx2-mini.forge.json"), "utf8"));
  const part = (color, massG) => ({
    node: "root",
    geom: { kind: "box", w: 0.02, h: 0.02, d: 0.02 },
    material: "metal",
    color,
    collision: "none",
    mass: { valueG: massG },
  });
  contract.slots = [
    {
      id: "payload",
      label: "QA keyboard payload",
      mountNodes: ["root"],
      equippedVariantId: "qa003-default",
      variants: [
        { id: "qa003-default", name: "QA-003 default", parts: [part("#445566", 2)] },
        {
          id: "qa003-keyboard-alternative",
          name: "QA-003 keyboard alternative",
          parts: [part("#667788", 3)],
        },
      ],
    },
  ];
  return `m=${deflateRawSync(Buffer.from(JSON.stringify(contract))).toString("base64url")}`;
}

function contrastRatio(left, right) {
  const luminance = (rgb) => {
    const channels = rgb.map((value) => {
      const normalized = value / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const [bright, dark] = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (bright + 0.05) / (dark + 0.05);
}

function rgb(value) {
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(value);
  if (!match) throw new Error(`expected computed rgb color, received ${value}`);
  return match.slice(1, 4).map(Number);
}

async function inspectPage(page, engine, origin) {
  const pageErrors = [];
  const wasmUrls = [];
  const presentationAssets = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (/\/forge_wasm_bg-[^/]+\.wasm(?:\?|$)/.test(response.url()) && response.status() === 200) {
      wasmUrls.push(response.url());
    }
    if (/\/assets\/(?:scene|three)-[^/]+\.js(?:\?|$)/.test(response.url()) && response.status() === 200) {
      presentationAssets.push(new URL(response.url()).pathname);
    }
  });
  await page.goto(`${origin}/#${shareFragment()}`, {
    waitUntil: "domcontentloaded",
  });
  await waitForText(page.locator('[data-testid="validator-report"]'), /ADMITTED/);
  await waitForText(page.locator('[data-testid="browser-support"]'), /Studio|viewer grade/);
  assert.ok(wasmUrls.length > 0, `${engine}: production WASM was not loaded`);
  assert.deepEqual(pageErrors, [], `${engine}: uncaught page errors`);

  const support = await page.locator('[data-testid="browser-support"]').evaluate((element) => ({
    tier: element.getAttribute("data-tier"),
    surface: element.getAttribute("data-surface"),
    reducedMotion: element.getAttribute("data-reduced-motion"),
    text: element.textContent?.trim() ?? "",
  }));
  assert.equal(support.tier, engine === "chromium" ? "full-studio" : "viewer-grade");
  assert.equal(support.reducedMotion, "false");
  const selectedQuality = await page.getByLabel("quality").inputValue();
  const sceneQuality = await page.evaluate(() => window.__forgeParity.quality());
  assert.equal(
    selectedQuality,
    engine === "chromium" ? "high" : "low",
    `${engine}: initial quality must match the declared browser tier`,
  );
  assert.deepEqual(sceneQuality, {
    tier: engine === "chromium" ? "high" : "low",
    renderer: engine === "chromium" ? "webgl" : "schematic-2d",
    advancedEffectsInitialized: engine === "chromium",
  });
  const quality = { selected: selectedQuality, ...sceneQuality };
  if (engine === "chromium") {
    assert.ok(presentationAssets.some((asset) => /\/scene-/.test(asset)));
    assert.ok(presentationAssets.some((asset) => /\/three-/.test(asset)));
  } else {
    assert.deepEqual(presentationAssets, [], `${engine}: viewer grade must not load WebGL presentation bundles`);
  }
  const renderStats = await page.evaluate(() => window.__forgeParity.stats());
  assert.ok(renderStats.drawCalls > 0, `${engine}: admitted artifact was not presented`);

  const semantics = await page.evaluate(() => {
    const visible = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    const accessibleName = (element) => {
      const aria = element.getAttribute("aria-label")?.trim();
      if (aria) return aria;
      const labelledBy = element.getAttribute("aria-labelledby");
      if (labelledBy) {
        const label = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (label) return label;
      }
      if ("labels" in element && element.labels?.length) {
        const label = Array.from(element.labels)
          .map((item) => item.textContent ?? "")
          .join(" ")
          .trim();
        if (label) return label;
      }
      if (element instanceof HTMLButtonElement || element instanceof HTMLAnchorElement) {
        return (element.textContent ?? element.getAttribute("title") ?? "").trim();
      }
      return element.getAttribute("title")?.trim() ?? "";
    };
    const controls = Array.from(document.querySelectorAll("button,input,select,textarea,a[href]")).filter(visible);
    return {
      lang: document.documentElement.lang,
      title: document.title,
      mainCount: document.querySelectorAll("main").length,
      h1Count: document.querySelectorAll("h1").length,
      unlabeled: controls
        .filter((element) => !accessibleName(element))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute("type"),
          testid: element.getAttribute("data-testid"),
        })),
      canvas: (() => {
        const canvas = document.querySelector('[data-testid="studio-viewer"]');
        return canvas
          ? {
              label: canvas.getAttribute("aria-label"),
              describedBy: canvas.getAttribute("aria-describedby"),
              renderer: canvas.getAttribute("data-renderer"),
              tabIndex: canvas.tabIndex,
            }
          : null;
      })(),
    };
  });
  assert.equal(semantics.lang, "en");
  assert.equal(semantics.title, "ForgedTTC Studio");
  assert.equal(semantics.mainCount, 1);
  assert.equal(semantics.h1Count, 1);
  assert.deepEqual(semantics.unlabeled, [], `${engine}: visible controls must have accessible names`);
  assert.deepEqual(semantics.canvas, {
    label: "Interactive robot assembly viewer",
    describedBy: "viewer-keyboard-help",
    renderer: engine === "chromium" ? "webgl" : "schematic-2d",
    tabIndex: 0,
  });

  const skip = page.locator(".skip-link");
  await skip.focus();
  const skipLink = await page.evaluate(() => {
    const active = document.activeElement;
    return {
      text: active?.textContent?.trim() ?? "",
      outlineStyle: active ? window.getComputedStyle(active).outlineStyle : "",
      outlineWidth: active ? window.getComputedStyle(active).outlineWidth : "",
    };
  });
  assert.deepEqual(skipLink, {
    text: "Skip to Studio controls",
    outlineStyle: "solid",
    outlineWidth: "3px",
  });
  await skip.press("Enter");
  assert.equal(await page.evaluate(() => document.activeElement?.id), "studio-controls");

  const canvas = page.locator('[data-testid="studio-viewer"]');
  const cameraBefore = await page.evaluate(() => window.__forgeParity.camera());
  await canvas.focus();
  await canvas.press("ArrowRight");
  const cameraAfter = await page.evaluate(() => window.__forgeParity.camera());
  assert.notDeepEqual(cameraAfter.position, cameraBefore.position, `${engine}: keyboard orbit did not move the camera`);
  await canvas.press("e");
  assert.equal(await page.locator('input[type="range"]').first().inputValue(), "0.1");
  await canvas.press("b");
  assert.equal(await page.getByLabel("blueprint").isChecked(), true);
  assert.match(await page.locator('[data-testid="viewer-announcement"]').textContent(), /Blueprint on/);

  const configurator = page.locator('[data-testid="variant-configurator"]');
  const configuratorSummary = configurator.locator("summary");
  await configuratorSummary.focus();
  await configuratorSummary.press("Enter");
  const alternative = configurator.locator('[data-testid="variant-payload-qa003-keyboard-alternative"]');
  await alternative.focus();
  await alternative.press("Enter");
  await waitForText(page.locator('[data-testid="validator-report"]'), /ADMITTED/);
  assert.equal(await alternative.getAttribute("aria-pressed"), "true");

  const criticalTargets = await page.evaluate(() => {
    const selectors = [
      '[data-testid="demo-model"]',
      '[data-testid="share-model"]',
      '[data-testid="variant-payload-qa003-keyboard-alternative"]',
      'input[type="range"]',
    ];
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`critical target is missing: ${selector}`);
      const rect = element.getBoundingClientRect();
      return { selector, width: rect.width, height: rect.height };
    });
  });
  for (const target of criticalTargets) {
    assert.ok(
      target.width >= 24 && target.height >= 24,
      `${engine}: ${target.selector} target is ${target.width}x${target.height}, below 24x24 CSS px`,
    );
  }

  const colors = await page.evaluate(() => {
    const secondary = document.querySelector('[data-testid="studio-help"]');
    const button = document.querySelector('[data-testid="share-model"]');
    if (!secondary || !button) throw new Error("contrast fixtures are missing");
    return {
      bodyBackground: window.getComputedStyle(document.body).backgroundColor,
      secondary: window.getComputedStyle(secondary).color,
      buttonBackground: window.getComputedStyle(button).backgroundColor,
      buttonText: window.getComputedStyle(button).color,
    };
  });
  const secondaryContrast = contrastRatio(rgb(colors.secondary), rgb(colors.bodyBackground));
  const controlContrast = contrastRatio(rgb(colors.buttonText), rgb(colors.buttonBackground));
  assert.ok(secondaryContrast >= 4.5, `${engine}: muted text contrast ${secondaryContrast.toFixed(2)} is below AA`);
  assert.ok(controlContrast >= 4.5, `${engine}: control contrast ${controlContrast.toFixed(2)} is below AA`);

  return {
    support,
    quality,
    presentationAssets,
    renderStats,
    wasmUrl: new URL(wasmUrls[0]).pathname,
    semantics,
    skipLink,
    keyboard: {
      orbitChanged: true,
      equippedVariant: "qa003-keyboard-alternative",
      explode: 0.1,
      blueprint: true,
    },
    criticalTargets,
    contrast: {
      muted: Number(secondaryContrast.toFixed(2)),
      control: Number(controlContrast.toFixed(2)),
    },
  };
}

async function inspectChromiumOnly(origin, browser) {
  let responsive;
  const responsiveContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  const responsivePage = await responsiveContext.newPage();
  try {
    await responsivePage.goto(`${origin}/#${shareFragment()}`, { waitUntil: "domcontentloaded" });
    await waitForText(responsivePage.locator('[data-testid="validator-report"]'), /ADMITTED/);
    responsive = await responsivePage.evaluate(() => {
      const root = document.documentElement;
      const controls = document.getElementById("studio-controls");
      const rect = controls?.getBoundingClientRect();
      return {
        layout: document.querySelector('[data-testid="studio-workspace"]')?.getAttribute("data-layout"),
        overflowPx: root.scrollWidth - root.clientWidth,
        controls: rect ? { left: rect.left, right: rect.right, width: rect.width } : null,
        viewportWidth: root.clientWidth,
      };
    });
    assert.equal(responsive.layout, "narrow");
    assert.ok(responsive.overflowPx <= 0, `responsive layout overflows by ${responsive.overflowPx}px`);
    assert.ok(responsive.controls && responsive.controls.left >= 0);
    assert.ok(responsive.controls && responsive.controls.right <= responsive.viewportWidth);
  } finally {
    await responsiveContext.close();
  }

  let reducedMotion;
  const reducedContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  const reducedPage = await reducedContext.newPage();
  try {
    await reducedPage.goto(`${origin}/#${shareFragment()}`, { waitUntil: "domcontentloaded" });
    await waitForText(reducedPage.locator('[data-testid="validator-report"]'), /ADMITTED/);
    reducedMotion = await reducedPage.locator('[data-testid="browser-support"]').evaluate((element) => ({
      attribute: element.getAttribute("data-reduced-motion"),
      text: element.textContent ?? "",
      media: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    }));
    assert.deepEqual(reducedMotion, {
      attribute: "true",
      text: "full Studio · isolated desktop Chromium · reduced motion",
      media: true,
    });
  } finally {
    await reducedContext.close();
  }
  return { responsive, reducedMotion };
}

const studioPackage = JSON.parse(readFileSync(join(studioRoot, "package.json"), "utf8"));
const checkoutRevision = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
const sourceRevision = process.env.FORGE_SOURCE_REVISION ?? checkoutRevision;
assert.match(sourceRevision, /^[0-9a-f]{40}$/, "source revision must be a full Git SHA");
assert.match(checkoutRevision, /^[0-9a-f]{40}$/, "checkout revision must be a full Git SHA");
const evidence = {
  formatVersion: "qa003-browser-support.v1",
  status: "running",
  sourceRevision,
  sourceRevisionKind: process.env.FORGE_SOURCE_REVISION ? "ci-event" : "git-head",
  checkoutRevision,
  worktreeDirty:
    execFileSync("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd: root,
      encoding: "utf8",
    }).trim().length > 0,
  studioVersion: studioPackage.version,
  productionBundle: true,
  shareViewer: true,
  engines: [],
};

try {
  const port = await openPort();
  const origin = `http://127.0.0.1:${port}`;
  preview = spawn(
    "pnpm",
    ["exec", "vite", "preview", "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
    {
      cwd: studioRoot,
      env: { ...process.env, FORGE_GATEWAY_PROXY: "http://127.0.0.1:9" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  preview.stdout.on("data", (chunk) => serviceLogs.push(String(chunk)));
  preview.stderr.on("data", (chunk) => serviceLogs.push(String(chunk)));
  await waitForHttp(`${origin}/`);

  for (const engine of requestedEngines) {
    console.log(`browser-support: ${engine}`);
    const type = engines[engine];
    const browser = await type.launch(
      engine === "chromium"
        ? {
            headless: true,
            args: ["--no-sandbox", "--disable-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
          }
        : { headless: true },
    );
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        reducedMotion: "no-preference",
      });
      const page = await context.newPage();
      const result = await inspectPage(page, engine, origin);
      await context.close();
      if (engine === "chromium") result.chromiumOnly = await inspectChromiumOnly(origin, browser);
      evidence.engines.push({ engine, version: browser.version(), status: "passed", ...result });
    } catch (error) {
      const screenshotPath = join(outDir, `qa003-${engine}-failure.png`);
      const pages = browser.contexts().flatMap((context) => context.pages());
      const page = pages.at(-1);
      if (page) await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);
      evidence.engines.push({
        engine,
        version: browser.version(),
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        screenshot: existsSync(screenshotPath) ? screenshotPath.replace(`${root}/`, "") : null,
      });
      throw error;
    } finally {
      await browser.close();
    }
  }
  evidence.status = "passed";
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`browser-support: ${evidence.engines.length}/${requestedEngines.length} engines passed`);
} catch (error) {
  evidence.status = "failed";
  evidence.error = error instanceof Error ? error.message : String(error);
  evidence.serviceLog = serviceLogs.join("").split("\n").slice(-80);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.error(`browser-support: FAILED — ${evidence.error}`);
  process.exitCode = 1;
} finally {
  await stopService(preview);
}
