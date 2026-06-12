#!/usr/bin/env node
// P0-005/006: MECHANICAL translation of the frozen monolith's two models into
// ModelSpec contracts. Mechanical in the literal sense — the monolith's own
// builder code runs in a vm sandbox with its primitive functions and N()/P()
// registry instrumented; every node, part, primitive parameter, pose, color,
// and explode window is captured from the source of truth, not transcribed by
// hand. Byte-equivalence then follows from forge-geometry's prototype-exact
// builders (scripts/compare-counts.mjs).
//
// Semantic translation rules (the only non-captured content, documented here):
// - material classes: the vintage predates the five-class system; mapping is
//   glow > 0 → gloss (emissive accents), pearl shells → satin, all else matte.
// - collision: "none" everywhere — D7 collision compounds are a later layer,
//   authored when these models meet physics (P6); the prototype predates D7.
// - joints: drone spinners (s0..s3) are revolute about Y (their pose() spins
//   rot[1]); biped hips/knees revolute about X (legIK writes rot[0]).
// - naming: the drone's "combat" flavor does not survive translation (§17.2).
//
//   node scripts/translate-monolith.mjs   (writes examples/{hrx7,vx2-hornet}.forge.json)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";

const htmlPath = "prototype/cad-object-studio.html";
const html = readFileSync(htmlPath, "utf8");
const sha = createHash("sha256").update(html).digest("hex").slice(0, 16);

const start = html.indexOf("function mul(a,b)");
const end = html.indexOf("var statsBase=");
const slice = html.slice(start, end);

const context = vm.createContext({ Math, Array, Float32Array, parseInt, console });
vm.runInContext(slice, context, { filename: "monolith-slice.js" });

// instrument primitives (call-time scope lookup makes reassignment effective)
vm.runInContext(
  `
var __nodes = [], __parts = [];
var _taper = taper, _box = box, _cbox = cbox, _cyl = cyl, _lathe = lathe, _N = N, _P = P;
taper = function(wB,dB,wT,dT,h){ var m=_taper(wB,dB,wT,dT,h); m.__geom={kind:'taper',w0:wB,d0:dB,w1:wT,d1:dT,h:h}; return m; };
box   = function(w,h,d){ var m=_box(w,h,d); m.__geom={kind:'box',w:w,h:h,d:d}; return m; };
cbox  = function(w,h,d,c){ var m=_cbox(w,h,d,c); m.__geom={kind:'cbox',w:w,h:h,d:d,ch:c}; return m; };
cyl   = function(rB,rT,h,n){ var m=_cyl(rB,rT,h,n); m.__geom={kind:'cyl',r0:rB,r1:rT,h:h,n:n}; return m; };
lathe = function(prof,n){ var m=_lathe(prof,n); m.__geom={kind:'lathe',profile:prof,n:n}; return m; };
N = function(name,parent,pos,rot){ __nodes.push({name:name,parent:parent,pos:pos,rot:rot||null}); return _N(name,parent,pos,rot); };
P = function(node,mesh,o){
  __parts.push({node:node, geom:mesh.__geom,
    p:o.p||null, r:o.r||null, s:o.s||null,
    c:o.c, glow:o.glow||0,
    ex:o.ex||null, em:o.em||0, t0:o.t0, t1:o.t1, ld:!!o.ld});
  return _P(node,mesh,o);
};
`,
  context,
);

// palette roles for material mapping (captured from the monolith's constants)
const PALETTE = vm.runInContext(
  "({SHELL:SHELL,SHELL2:SHELL2,GRA:GRA,DARK:DARK,BLK:BLK,GAP:GAP,ACC:ACC,AMB:AMB})",
  context,
);
const SATIN = new Set([PALETTE.SHELL, PALETTE.SHELL2]);

function materialFor(part) {
  if (part.glow > 0) return "gloss";
  if (SATIN.has(part.c)) return "satin";
  return "matte";
}

function near(v, def) {
  return Math.abs(v - def) < 1e-12;
}

function poseFor(part) {
  const p = part.p ?? [0, 0, 0];
  const r = part.r ?? [0, 0, 0];
  const s = part.s ?? [1, 1, 1];
  const identity =
    p.every((v) => near(v, 0)) && r.every((v) => near(v, 0)) && s.every((v) => near(v, 1));
  if (identity) return undefined;
  return { p, r, s };
}

const MODEL_META = {
  hrx7: {
    id: "hrx7",
    name: "HRX-7 Mk II — Production Humanoid Platform",
    archetype: "biped",
    out: "examples/hrx7.forge.json",
    joint: (n) =>
      /^(hp|kn)-?1?$/.test(n.name) || /^(hp|kn)(-1|1)$/.test(n.name)
        ? { type: "revolute", axis: [1, 0, 0] }
        : undefined,
  },
  fpv: {
    id: "vx2-hornet",
    // the prototype's "combat" naming flavor does not survive translation (§17.2)
    name: "VX-2 Hornet — FPV Quadcopter",
    archetype: "multirotor",
    out: "examples/vx2-hornet.forge.json",
    joint: (n) =>
      /^s[0-3]$/.test(n.name) ? { type: "revolute", axis: [0, 1, 0] } : undefined,
  },
};

const ids = Object.keys(vm.runInContext("MODELS", context));
for (const id of ids) {
  vm.runInContext(
    `__nodes=[];__parts=[];nodes={};matCache={};parts=[];faceTotal=0;chains=[];model=MODELS[${JSON.stringify(id)}].build();`,
    context,
  );
  const capturedNodes = vm.runInContext("__nodes", context);
  const capturedParts = vm.runInContext("__parts", context);
  const capturedChains = vm.runInContext("chains", context);
  const model = vm.runInContext("({name:model.name,kind:model.kind,pen:model.pen})", context);
  const meta = MODEL_META[id];

  const spec = {
    meta: {
      id: meta.id,
      name: meta.name,
      version: "1.0.0",
      archetype: meta.archetype,
      provenance: { kind: "human" },
      license: "CC-BY-NC",
    },
    skeleton: capturedNodes.map((n) => {
      const node = { name: n.name, parent: n.parent, pos: n.pos };
      if (n.rot && n.rot.some((v) => !near(v, 0))) node.rot = n.rot;
      const joint = meta.joint(n);
      if (joint) node.joint = joint;
      return node;
    }),
    parts: capturedParts.map((p) => {
      const part = {
        node: p.node,
        geom: p.geom,
        material: materialFor(p),
        color: p.c,
        collision: "none",
      };
      const pose = poseFor(p);
      if (pose) part.pose = pose;
      if (p.em > 0) {
        part.explode = { dir: p.ex, mag: p.em, t0: p.t0, t1: p.t1 };
        if (p.ld) part.explode.leader = p.node;
      }
      return part;
    }),
    chains: capturedChains.map((c, i) => ({
      id: c[0],
      stage: i,
      nodes: [c[0]],
      dir: c[1],
      mag: c[2],
      t0: c[3],
      t1: c[4],
    })),
    driver: {
      archetype: meta.archetype,
      params:
        meta.archetype === "multirotor"
          ? { tiltMaxRad: 0.4, yawRate: 2.4, mixer: "x4", pen: model.pen }
          : { pen: model.pen, source: "prototype gait (port lands with the biped driver)" },
    },
  };

  writeFileSync(meta.out, JSON.stringify(spec, null, 2) + "\n");
  console.log(
    `${meta.out}: ${spec.skeleton.length} nodes · ${spec.parts.length} parts · ${spec.chains.length} chains (from ${htmlPath} @ ${sha}…)`,
  );
}
