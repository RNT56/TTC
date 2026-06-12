#!/usr/bin/env node
// P1-015: golden-scene parity gallery — the frozen monolith and the studio
// (Three.js consuming core-baked buffers) render the same models under the
// same canonical cameras; a perceptual diff guards structural parity.
//
// Both renderers are pinned deterministic: the monolith gets auto-rotate off,
// drive off, clock frozen, and its pose layer overridden to the pure rest
// pose (zero animation channels — node BASE rotations still apply, matching
// the studio's static bake exactly); the studio gets the same orbit pose and
// the monolith's vertical FOV (2·atan(0.3443) ≈ 38.0°).
//
// Renderers differ by design (painter-algorithm canvas vs z-buffered PBR), so
// pixel equality is meaningless. The gating metric is structural: Sobel edge
// maps of luminance, binarized at a fixed percentile, compared with 1-px
// dilation tolerance → F1. Wrong model/camera/pose/scale lands far below the
// gate; shading/AA differences barely move it. Plain luminance RMS is also
// reported (informational).
//
//   node scripts/parity-gallery.mjs [--out artifacts/parity] [--serve-only]
//
// Outputs: per-scene monolith/studio/diff PNGs + composite strips + an HTML
// index + metrics.json. Run after `pnpm -r build`.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { PNG } from "pngjs";

const OUT = (() => {
  const i = process.argv.indexOf("--out");
  return i >= 0 ? process.argv[i + 1] : "artifacts/parity";
})();
const VIEW = { width: 960, height: 600 };
const DOWN = { width: 480, height: 300 };
/// the monolith's vertical FOV: FOCAL = (H/2)/0.3443
const FOV_DEG = (2 * Math.atan(0.3443) * 180) / Math.PI;
/// structural gate, tuned on real runs (2026-06-12): all six canonical scenes
/// score 0.95–0.995; any wrong camera/model/pose/chrome configuration we
/// observed scored ≤ 0.40. 0.85 separates the regimes with wide margin.
const EDGE_F1_GATE = 0.85;

/// canonical cameras — three per model, shared by both renderers
const SCENES = [
  { model: "hrx7", studio: "hrx7", ty: 0.88, views: [
    { name: "threequarter", yaw: 0.6, el: 0.18, dist: 4.6 },
    { name: "profile", yaw: Math.PI / 2, el: 0.1, dist: 4.2 },
    { name: "high-rear", yaw: 2.4, el: 0.5, dist: 5.0 },
  ]},
  { model: "fpv", studio: "vx2-hornet", ty: 0.4, views: [
    { name: "threequarter", yaw: 0.6, el: 0.18, dist: 1.3 },
    { name: "profile", yaw: Math.PI / 2, el: 0.1, dist: 1.2 },
    { name: "high-rear", yaw: 2.4, el: 0.5, dist: 1.6 },
  ]},
];

// --- tiny static server for the built studio + a bridged monolith copy -------
// The frozen prototype wraps everything in a strict-mode IIFE, so its state
// is unreachable from page.evaluate. We serve a PATCHED COPY (the artifact on
// disk is never touched — same read-only-execution stance as the extraction
// scripts) with a tiny bridge appended inside the IIFE.
const DIST = resolve("packages/studio/dist");
const MONOLITH_BRIDGE = `
window.__forgeBridge = {
  load: function (id) { loadModel(id); },
  pin: function (v, ty) {
    autoRot = false; driveOn = false; paused = true; animT = 0; etgt = 0; ecur = 0;
    // pure rest pose: zero every animation channel (base rotations still
    // compose inside nm()) — matches the studio's static bake by definition
    model.pose = function () {
      for (var k in nodes) {
        var n = nodes[k];
        n.rot[0] = n.rot[1] = n.rot[2] = 0;
        n.off[0] = n.off[1] = n.off[2] = 0;
        n.exo[0] = n.exo[1] = n.exo[2] = 0;
      }
    };
    model.drv = null; // focus falls back to [0, ty, 0]
    // chrome differs by design between renderers — compare the MODEL:
    // flat-fill the background (the vignette's radial banding edge-detects),
    // and drop grid/marker/blob-shadow/gizmo overlays
    drawBG = function () {
      ctx.fillStyle = "#0d0f12";
      ctx.fillRect(0, 0, W, H);
    };
    model.shadow = function () {};
    drawGrid = function () {};
    drawMarker = function () {};
    drawGizmo = function () {};
    camF[0] = 0; camF[1] = ty; camF[2] = 0;
    yaw = v.yaw; el = v.el; dist = v.dist;
  },
};`;
function bridgedMonolith() {
  const html = readFileSync("prototype/cad-object-studio.html", "utf8");
  const tail = html.lastIndexOf("})();");
  if (tail < 0) throw new Error("monolith IIFE tail not found");
  return html.slice(0, tail) + MONOLITH_BRIDGE + "\n" + html.slice(tail);
}
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".wasm": "application/wasm", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml",
};
function serveDist() {
  const monolithHtml = bridgedMonolith();
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
    if (path === "/__monolith.html") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(monolithHtml);
      return;
    }
    let file = join(DIST, path === "/" ? "index.html" : path);
    if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
    try {
      const body = readFileSync(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

// --- image ops (pure JS, deterministic) --------------------------------------
function downscale(png, w, h) {
  // box filter to a fixed size; output luminance Float64Array
  const out = new Float64Array(w * h);
  const sx = png.width / w;
  const sy = png.height / h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let n = 0;
      const x0 = Math.floor(x * sx), x1 = Math.min(png.width, Math.ceil((x + 1) * sx));
      const y0 = Math.floor(y * sy), y1 = Math.min(png.height, Math.ceil((y + 1) * sy));
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * png.width + xx) * 4;
          sum += 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2];
          n++;
        }
      }
      out[y * w + x] = sum / Math.max(1, n);
    }
  }
  return out;
}

function sobel(lum, w, h) {
  const mag = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1] +
        lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1];
      const gy =
        -lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1] +
        lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1];
      mag[i] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return mag;
}

function binarizeTopPercent(mag, fraction) {
  const sorted = Array.from(mag).sort((a, b) => b - a);
  const k = Math.max(1, Math.floor(sorted.length * fraction));
  const threshold = Math.max(sorted[k - 1], 1e-9);
  return mag.map((v) => (v >= threshold ? 1 : 0));
}

function dilate(bin, w, h) {
  const out = new Float64Array(bin.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let dy = -1; dy <= 1 && !v; dy++) {
        for (let dx = -1; dx <= 1 && !v; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w && bin[yy * w + xx]) v = 1;
        }
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

/// F1 between edge sets with 1-px tolerance (each side matched against the
/// other's dilation).
function edgeF1(a, b, w, h) {
  const da = dilate(a, w, h);
  const db = dilate(b, w, h);
  let aHit = 0, aTot = 0, bHit = 0, bTot = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]) { aTot++; if (db[i]) aHit++; }
    if (b[i]) { bTot++; if (da[i]) bHit++; }
  }
  const precision = bTot ? bHit / bTot : 0; // studio edges found in monolith
  const recall = aTot ? aHit / aTot : 0; // monolith edges found in studio
  return { f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0, precision, recall };
}

function rms(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]);
  return Math.sqrt(s / a.length);
}

/// composite strip: monolith | studio | edge overlay (green both, red
/// monolith-only, blue studio-only)
function composite(mPng, sPng, edgesM, edgesS, w, h) {
  const out = new PNG({ width: w * 3, height: h });
  const scale = (png, ox) => {
    const sx = png.width / w, sy = png.height / h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((Math.floor(y * sy) * png.width) + Math.floor(x * sx)) * 4;
        const di = (y * out.width + x + ox) * 4;
        out.data[di] = png.data[si];
        out.data[di + 1] = png.data[si + 1];
        out.data[di + 2] = png.data[si + 2];
        out.data[di + 3] = 255;
      }
    }
  };
  scale(mPng, 0);
  scale(sPng, w);
  const dm = dilate(edgesM, w, h);
  const ds = dilate(edgesS, w, h);
  for (let i = 0; i < w * h; i++) {
    const y = Math.floor(i / w), x = i % w;
    const di = (y * out.width + x + 2 * w) * 4;
    const both = edgesM[i] && ds[i] ? 1 : edgesS[i] && dm[i] ? 1 : 0;
    out.data[di] = edgesM[i] && !both ? 255 : 16; // red: monolith-only
    out.data[di + 1] = both ? 220 : 16; // green: matched
    out.data[di + 2] = edgesS[i] && !both ? 255 : 24; // blue: studio-only
    out.data[di + 3] = 255;
  }
  return out;
}

// --- captures -----------------------------------------------------------------
async function launchBrowser() {
  const { chromium } = await import("playwright-core");
  // the environment pre-provisions build 1194 under /opt/pw-browsers; fall
  // back to playwright's own resolution elsewhere (CI installs its match)
  const pinned =
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";
  return chromium.launch({
    headless: true,
    ...(existsSync(pinned) ? { executablePath: pinned } : {}),
    args: ["--no-sandbox", "--disable-gpu", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
}

async function captureMonolith(browser, baseUrl, scene, view) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.goto(`${baseUrl}__monolith.html`);
  await page.waitForFunction(() => Boolean(window.__forgeBridge), null, { timeout: 15000 });
  await page.evaluate(
    ([id, v, ty]) => {
      window.__forgeBridge.load(id);
      window.__forgeBridge.pin(v, ty);
      // hide DOM chrome — element screenshots capture the page region,
      // overlays included; we compare renderers, not UI
      for (const el of document.querySelectorAll("#hrx-wrap > *:not(canvas)")) {
        el.style.visibility = "hidden";
      }
    },
    [scene.model, view, scene.ty],
  );
  await page.waitForTimeout(300); // a few frames at the pinned state
  const canvas = page.locator("#hrx-cv");
  const buf = await canvas.screenshot();
  await page.close();
  return PNG.sync.read(buf);
}

async function captureStudio(browser, baseUrl, scene, view) {
  const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
  await page.goto(baseUrl);
  await page.waitForFunction(() => window.__forgeParity?.loaded(), null, { timeout: 30000 });
  await page.evaluate(
    async ([id, v, ty, fov]) => {
      await window.__forgeParity.load(id);
      window.__forgeParity.setGrid(false);
      window.__forgeParity.setShadows(false);
      window.__forgeParity.setCamera({
        yaw: v.yaw,
        el: v.el,
        dist: v.dist,
        target: [0, ty, 0],
        fovDeg: fov,
      });
      // hide DOM chrome (panels overlay the full-window canvas)
      for (const el of document.querySelectorAll("#root > div > *:not(canvas)")) {
        el.style.visibility = "hidden";
      }
    },
    [scene.studio, view, scene.ty, FOV_DEG],
  );
  await page.waitForTimeout(300);
  const canvas = page.locator("canvas");
  const buf = await canvas.screenshot();
  await page.close();
  return PNG.sync.read(buf);
}

// --- main ----------------------------------------------------------------------
mkdirSync(OUT, { recursive: true });
if (!existsSync(join(DIST, "index.html"))) {
  console.error("studio dist missing — run `pnpm -r build` first");
  process.exit(1);
}
// the studio bakes in-browser (P1-005); it only needs the contracts
for (const scene of SCENES) {
  const demo = join(DIST, "demo", `${scene.studio}.forge.json`);
  if (!existsSync(demo)) {
    console.error(`missing ${demo} — run pnpm demo:sync && pnpm -r build`);
    process.exit(1);
  }
}

const server = await serveDist();
const baseUrl = `http://127.0.0.1:${server.address().port}/`;
const browser = await launchBrowser();

const metrics = [];
let failures = 0;
const rows = [];
for (const scene of SCENES) {
  for (const view of scene.views) {
    const id = `${scene.studio}-${view.name}`;
    const mono = await captureMonolith(browser, baseUrl, scene, view);
    const studio = await captureStudio(browser, baseUrl, scene, view);

    const lumM = downscale(mono, DOWN.width, DOWN.height);
    const lumS = downscale(studio, DOWN.width, DOWN.height);
    const edgesM = binarizeTopPercent(sobel(lumM, DOWN.width, DOWN.height), 0.08);
    const edgesS = binarizeTopPercent(sobel(lumS, DOWN.width, DOWN.height), 0.08);
    const { f1, precision, recall } = edgeF1(edgesM, edgesS, DOWN.width, DOWN.height);
    const lumRms = rms(lumM, lumS);

    const strip = composite(mono, studio, edgesM, edgesS, DOWN.width, DOWN.height);
    writeFileSync(join(OUT, `${id}.png`), PNG.sync.write(strip));
    writeFileSync(join(OUT, `${id}.monolith.png`), PNG.sync.write(mono));
    writeFileSync(join(OUT, `${id}.studio.png`), PNG.sync.write(studio));

    const pass = f1 >= EDGE_F1_GATE;
    if (!pass) failures++;
    metrics.push({ id, edgeF1: f1, precision, recall, lumRms, pass });
    rows.push(
      `<tr><td>${id}</td><td>${f1.toFixed(3)}</td><td>${precision.toFixed(3)}</td>` +
        `<td>${recall.toFixed(3)}</td><td>${lumRms.toFixed(1)}</td>` +
        `<td>${pass ? "✅" : "❌"}</td></tr>` +
        `<tr><td colspan="6"><img src="${id}.png" style="width:100%"></td></tr>`,
    );
    console.log(
      `${pass ? "ok  " : "FAIL"} ${id}: edgeF1 ${f1.toFixed(3)} (p ${precision.toFixed(3)} r ${recall.toFixed(3)}) lumRMS ${lumRms.toFixed(1)}`,
    );
  }
}

writeFileSync(join(OUT, "metrics.json"), JSON.stringify({ gate: EDGE_F1_GATE, fovDeg: FOV_DEG, scenes: metrics }, null, 2) + "\n");
writeFileSync(
  join(OUT, "index.html"),
  `<!doctype html><meta charset="utf-8"><title>FORGE parity gallery</title>
<style>body{background:#111;color:#cfd6df;font:13px system-ui}table{width:100%;border-collapse:collapse}td{padding:4px;border-bottom:1px solid #333}</style>
<h1>Golden-scene parity gallery (P1-015)</h1>
<p>monolith | studio | edge overlay (green matched · red monolith-only · blue studio-only) — gate: edge F1 ≥ ${EDGE_F1_GATE}</p>
<table><tr><th>scene</th><th>edgeF1</th><th>precision</th><th>recall</th><th>lumRMS</th><th>pass</th></tr>${rows.join("")}</table>`,
);

await browser.close();
server.close();

console.log(`\ngallery → ${OUT}/index.html`);
if (failures > 0) {
  console.error(`parity-gallery: ${failures} scene(s) below the structural gate`);
  process.exit(1);
}
console.log("parity-gallery: all canonical scenes pass the structural gate (P1-015)");
