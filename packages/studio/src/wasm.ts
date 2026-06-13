// The core WASM facade (D16/D17): the SAME bits the CLI and CI run, compiled
// for the browser. Local-first validation and baking — no server round-trip.
//
// P1-005 boundary discipline: geometry never round-trips through JSON. The
// `Bake` handle ships meta as JSON once and exposes mesh buffers as typed-
// array views over wasm linear memory; we copy each buffer ONCE into the JS
// heap (`.slice()`) because views invalidate when wasm memory grows — that
// single copy is the floor for data that must outlive the call.
import init, {
  Bake,
  patch as wasmPatch,
  validate as wasmValidate,
  Session,
} from "./wasm-pkg/forge_wasm.js";
import type { BakeArtifact, BakedPart, Report } from "./types";

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

export async function coreValidate(contractJson: string): Promise<Report> {
  await ensureReady();
  return JSON.parse(wasmValidate(contractJson)) as Report;
}

interface BakeMeta extends Omit<BakeArtifact, "baked"> {
  baked: Omit<BakeArtifact["baked"], "parts"> & { parts: Omit<BakedPart, "mesh">[] };
}

function artifactFrom(handle: Bake): BakeArtifact {
  const meta = JSON.parse(handle.meta()) as BakeMeta;
  const parts: BakedPart[] = meta.baked.parts.map((p, i) => ({
    ...p,
    mesh: {
      positions: handle.positions(i).slice(),
      normals: handle.normals(i).slice(),
      indices: handle.indices(i).slice(),
    },
  }));
  return { ...meta, baked: { ...meta.baked, parts } };
}

export async function coreBake(contractJson: string): Promise<BakeArtifact> {
  await ensureReady();
  const handle = new Bake(contractJson);
  try {
    return artifactFrom(handle);
  } finally {
    handle.free();
  }
}

export async function corePatch(contractJson: string, patchJson: string): Promise<string> {
  await ensureReady();
  return wasmPatch(contractJson, patchJson);
}

/** Long-lived bake handle: patch → re-bake in place (configurator loop). */
export class CoreBake {
  private disposed = false;

  private constructor(private handle: Bake) {}

  static async create(contractJson: string): Promise<CoreBake> {
    await ensureReady();
    return new CoreBake(new Bake(contractJson));
  }

  artifact(): BakeArtifact {
    if (this.disposed) throw new Error("bake handle has been disposed");
    return artifactFrom(this.handle);
  }

  /** Apply a JSON-Patch and re-bake; returns the fresh artifact. */
  patch(patchJson: string): BakeArtifact {
    if (this.disposed) throw new Error("bake handle has been disposed");
    this.handle.patch(patchJson);
    return artifactFrom(this.handle);
  }

  contract(): string {
    if (this.disposed) throw new Error("bake handle has been disposed");
    return this.handle.contract();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.handle.free();
  }
}

export interface DriveInput {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  drive: number;
  turn: number;
}

/** The `tick` boundary call: fixed-step motion in core, poses out. */
export class CoreSession {
  private disposed = false;

  private constructor(
    private session: Session,
    readonly nodeNames: string[],
  ) {}

  static async create(contractJson: string): Promise<CoreSession> {
    await ensureReady();
    const session = new Session(contractJson);
    return new CoreSession(session, session.node_names());
  }

  /** Advance the 120 Hz clock; returns fixed steps executed. */
  step(dt: number, input: DriveInput): number {
    if (this.disposed) return 0;
    return this.session.step(
      dt,
      input.throttle,
      input.pitch,
      input.roll,
      input.yaw,
      input.drive,
      input.turn,
    );
  }

  /** Zero-copy pose view (16 f32 per node) — read synchronously after
   * `step`, never hold across calls (invalidates on wasm memory growth). */
  poseView(): Float32Array {
    if (this.disposed) return new Float32Array();
    return this.session.pose_view();
  }

  /** Drive-mode camera focus: driver body position at viewing height. */
  focus(): [number, number, number] {
    if (this.disposed) return [0, 0, 0];
    const f = this.session.focus();
    return [f[0], f[1], f[2]];
  }

  /** Teach-pendant jog (P1-013): euler offset over the pose layers. */
  setJog(node: string, rx: number, ry: number): void {
    if (this.disposed) return;
    this.session.set_jog(node, rx, ry);
  }

  clearJog(): void {
    if (this.disposed) return;
    this.session.clear_jog();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.free();
  }
}
