// Shapes of the core's artifacts (bake + report) as consumed by the face.
// These mirror forge-validate's serialized output; the *contract* types are
// codegen'd into contract.gen.ts (XC-01) — these are the artifact envelopes.

export type MaterialClass = "gloss" | "metal" | "satin" | "matte" | "rubber";

export interface ExplodeWindow {
  dir: [number, number, number];
  mag: number;
  t0: number;
  t1: number;
  leader?: string;
}

export interface BakedPart {
  part_index: number;
  node: string;
  material: MaterialClass;
  color: string;
  collision: "auto" | "hull" | "primitive" | "none";
  explode?: ExplodeWindow;
  /** per-part summary (meta side; buffers cross as typed arrays, P1-005) */
  vertices?: number;
  triangles?: number;
  mesh: { positions: Float32Array; normals: Float32Array; indices: Uint32Array };
}

export interface BakeArtifact {
  contractHash: string;
  schemaVersion: string;
  counts: { parts: number; faces: number; vertices: number };
  hud?: Hud;
  baked: {
    parts: BakedPart[];
    node_world: Record<string, number[]>;
  };
}

export interface Hud {
  auwG: number;
  twr?: number;
  hoverThrottle?: number;
  hoverCurrentA?: number;
  enduranceMin?: number;
  maxThrustG?: number;
  assumptions: string[];
}

export interface Diagnostic {
  check: string;
  severity: "error" | "warn";
  message: string;
  hint?: string;
}

export interface Report {
  contractHash: string;
  schemaVersion: string;
  validatorVersion: string;
  target: string;
  verdict: "admitted" | "draft" | "rejected";
  results: Diagnostic[];
  counts: { parts: number; faces: number; vertices: number };
  hud?: Hud;
}
