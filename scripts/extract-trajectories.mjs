#!/usr/bin/env node
// P0-008 (motion layer) / P1-001 oracle: record the monolith's OWN driver +
// pose + post pipeline over a scripted, deterministic input tape. These tapes
// are what the Rust driver ports must reproduce (golden-number corpus, oracle
// axis). Read-only: the frozen prototype is executed, never modified.
//
//   node scripts/extract-trajectories.mjs   (writes prototype/trajectories/*.json)
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const htmlPath = "prototype/cad-object-studio.html";
const html = readFileSync(htmlPath, "utf8");
const sha = createHash("sha256").update(html).digest("hex");

const start = html.indexOf("function mul(a,b)");
const end = html.indexOf("var statsBase=");
const slice = html.slice(start, end);

const context = vm.createContext({ Math, Array, Float32Array, parseInt, console });
vm.runInContext(slice, context, { filename: "monolith-slice.js" });

// drivers read these globals at call time; pin them deterministic
vm.runInContext(
  `var inp = {mx:0, mz:0, yaw:0, thr:0, asc:0, run:false};
   var BF = [0,0,1]; var keys = {}; var moveTarget = null; var driveOn = true;`,
  context,
);

const DT = 1 / 120;
const STEPS = 600; // 5 s
const RECORD_EVERY = 2; // 300 recorded frames

// Scripted tapes (part of the corpus definition — changing them is a corpus
// version bump). Four 1.25 s phases each.
const SCHEDULES = {
  hrx7: (step) => {
    const phase = Math.floor(step / 150);
    return [
      { mz: 1, mx: 0, yaw: 0, thr: 0, run: false }, // walk forward
      { mz: 1, mx: 0, yaw: 0, thr: 0, run: true }, // run forward
      { mz: 0.5, mx: 0, yaw: 0.5, thr: 0, run: false }, // arc with yaw
      { mz: 0, mx: 0, yaw: 0, thr: 0, run: false }, // settle
    ][phase];
  },
  fpv: (step) => {
    const phase = Math.floor(step / 150);
    return [
      { mz: 0, mx: 0, yaw: 0, thr: 0.75, run: false }, // climb
      { mz: 0.5, mx: 0, yaw: 0, thr: 0.25, run: false }, // pitch forward
      { mz: 0.25, mx: 0.25, yaw: 0.5, thr: 0, run: false }, // banked yaw
      { mz: 0, mx: 0, yaw: 0, thr: -0.25, run: false }, // descend
    ][phase];
  },
};

mkdirSync("prototype/trajectories", { recursive: true });

function equivalentTape(a, b, tol = 1e-12) {
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) <= tol;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => equivalentTape(v, b[i], tol));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    return (
      ak.length === bk.length &&
      ak.every((key, i) => key === bk[i] && equivalentTape(a[key], b[key], tol))
    );
  }
  return Object.is(a, b);
}

const ids = Object.keys(vm.runInContext("MODELS", context));
for (const id of ids) {
  vm.runInContext(
    `nodes={};matCache={};parts=[];faceTotal=0;chains=[];model=MODELS[${JSON.stringify(id)}].build();
     if(model.drv&&model.drv.reset)model.drv.reset();`,
    context,
  );
  const nodeNames = Object.keys(vm.runInContext("nodes", context)).sort();
  const schedule = SCHEDULES[id];
  const frames = [];

  for (let step = 0; step < STEPS; step++) {
    const input = schedule(step);
    vm.runInContext(
      `inp.mz=${input.mz};inp.mx=${input.mx};inp.yaw=${input.yaw};inp.thr=${input.thr};inp.run=${input.run};
       var __t=${((step + 1) * DT).toFixed(10)};
       if(model.drv)model.drv.update(${DT},__t);else model.pose(__t);
       if(model.post)model.post(${DT});`,
      context,
    );
    if ((step + 1) % RECORD_EVERY === 0) {
      const snapshot = vm.runInContext(
        `(function(){var out=[];var names=${JSON.stringify(nodeNames)};
           for(var i=0;i<names.length;i++){var n=nodes[names[i]];
             out.push(n.pos[0],n.pos[1],n.pos[2],n.rot[0],n.rot[1],n.rot[2],n.off[0],n.off[1],n.off[2]);}
           return out;})()`,
        context,
      );
      frames.push(snapshot);
    }
  }

  const tape = {
    source: { file: htmlPath, sha256: sha },
    model: id,
    dt: DT,
    steps: STEPS,
    recordEvery: RECORD_EVERY,
    channels: ["pos.x", "pos.y", "pos.z", "rot.x", "rot.y", "rot.z", "off.x", "off.y", "off.z"],
    nodes: nodeNames,
    schedule: "four 1.25 s phases — see scripts/extract-trajectories.mjs",
    frames,
  };
  const out = `prototype/trajectories/${id}.tape.json`;
  if (existsSync(out)) {
    const existingText = readFileSync(out, "utf8");
    const existing = JSON.parse(existingText);
    if (equivalentTape(existing, tape)) {
      const flat = frames.flat();
      const finite = flat.every((v) => Number.isFinite(v));
      console.log(
        `${out}: unchanged within 1e-12 (${frames.length} frames × ${nodeNames.length} nodes × 9 ch, finite: ${finite})`,
      );
      if (!finite) process.exit(1);
      continue;
    }
  }
  writeFileSync(out, JSON.stringify(tape) + "\n");
  const flat = frames.flat();
  const finite = flat.every((v) => Number.isFinite(v));
  console.log(
    `${out}: ${frames.length} frames × ${nodeNames.length} nodes × 9 ch (${flat.length} samples, finite: ${finite})`,
  );
  if (!finite) process.exit(1);
}
