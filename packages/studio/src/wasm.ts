// The core WASM facade (D16/D17): the SAME bits the CLI and CI run, compiled
// for the browser. Local-first validation and baking — no server round-trip.
import init, {
  bake as wasmBake,
  patch as wasmPatch,
  validate as wasmValidate,
  Session,
} from "./wasm-pkg/forge_wasm.js";
import type { BakeArtifact, Report } from "./types";

let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

export async function coreValidate(contractJson: string): Promise<Report> {
  await ensureReady();
  return JSON.parse(wasmValidate(contractJson)) as Report;
}

export async function coreBake(contractJson: string): Promise<BakeArtifact> {
  await ensureReady();
  return JSON.parse(wasmBake(contractJson)) as BakeArtifact;
}

export async function corePatch(contractJson: string, patchJson: string): Promise<string> {
  await ensureReady();
  return wasmPatch(contractJson, patchJson);
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
  private constructor(
    private session: Session,
    readonly nodeNames: string[],
  ) {}

  static async create(contractJson: string): Promise<CoreSession> {
    await ensureReady();
    const session = new Session(contractJson);
    return new CoreSession(session, session.node_names());
  }

  step(dt: number, input: DriveInput): Float32Array {
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

  dispose(): void {
    this.session.free();
  }
}
