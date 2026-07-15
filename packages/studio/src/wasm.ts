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
import type {
  DriveInput,
  FocusVector,
  PolicyObservationSnapshot,
  SessionWorkerRequest,
  SessionWorkerResponse,
} from "./sessionProtocol";
import type { BakeArtifact, BakedPart, Report } from "./types";

export type { DriveInput } from "./sessionProtocol";

export type CoreSessionMode = "local" | "worker";

export interface CoreSessionPerf {
  mode: CoreSessionMode;
  /** Main-thread facade cost since the last drain. */
  coreMs: number;
  /** Worker-owned tick cost since the last drain. */
  workerMs: number;
  /** Number of worker step completions included in workerMs. */
  workerSamples: number;
  pending: boolean;
  queuedDtS: number;
}

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

interface CoreSessionDelegate {
  readonly mode: CoreSessionMode;
  readonly nodeNames: string[];
  step(dt: number, input: DriveInput): number;
  poseView(): Float32Array;
  focus(): FocusVector;
  policySnapshot(target: FocusVector): Promise<PolicyObservationSnapshot>;
  setJog(node: string, rx: number, ry: number): void;
  clearJog(): void;
  drainPerf(): CoreSessionPerf;
  dispose(): void;
}

class LocalCoreSession implements CoreSessionDelegate {
  readonly mode = "local";
  private disposed = false;
  private coreAccumMs = 0;
  readonly nodeNames: string[];

  private constructor(private session: Session) {
    this.nodeNames = session.node_names();
  }

  static async create(contractJson: string): Promise<LocalCoreSession> {
    await ensureReady();
    return new LocalCoreSession(new Session(contractJson));
  }

  /** Advance the 120 Hz clock; returns fixed steps executed. */
  step(dt: number, input: DriveInput): number {
    if (this.disposed) return 0;
    const start = performance.now();
    try {
      return this.session.step(
        dt,
        input.throttle,
        input.pitch,
        input.roll,
        input.yaw,
        input.drive,
        input.turn,
      );
    } finally {
      this.coreAccumMs += performance.now() - start;
    }
  }

  /** Zero-copy pose view (16 f32 per node) — read synchronously after
   * `step`, never hold across calls (invalidates on wasm memory growth). */
  poseView(): Float32Array {
    if (this.disposed) return new Float32Array();
    return this.session.pose_view();
  }

  /** Drive-mode camera focus: driver body position at viewing height. */
  focus(): FocusVector {
    if (this.disposed) return [0, 0, 0];
    const f = this.session.focus();
    return [f[0], f[1], f[2]];
  }

  async policySnapshot(target: FocusVector): Promise<PolicyObservationSnapshot> {
    if (this.disposed) throw new Error("core session is disposed");
    return {
      layout: this.session.policy_layout(),
      observations: Array.from(this.session.policy_observations(...target)),
    };
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

  drainPerf(): CoreSessionPerf {
    const coreMs = this.coreAccumMs;
    this.coreAccumMs = 0;
    return {
      mode: this.mode,
      coreMs,
      workerMs: 0,
      workerSamples: 0,
      pending: false,
      queuedDtS: 0,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.session.free();
  }
}

class WorkerCoreSession implements CoreSessionDelegate {
  readonly mode = "worker";
  private disposed = false;
  private stepPending = false;
  private queuedDt = 0;
  private queuedInput: DriveInput | null = null;
  private focusValue: FocusVector;
  private coreAccumMs = 0;
  private workerAccumMs = 0;
  private workerSamples = 0;
  private nextPolicyRequestId = 1;
  private readonly pendingPolicy = new Map<
    number,
    {
      resolve: (snapshot: PolicyObservationSnapshot) => void;
      reject: (error: Error) => void;
      timeout: number;
    }
  >();

  private constructor(
    private readonly worker: Worker,
    readonly nodeNames: string[],
    private readonly pose: Float32Array,
    focus: FocusVector,
  ) {
    this.focusValue = focus;
    this.worker.onmessage = (event: MessageEvent<SessionWorkerResponse>) => {
      this.handleResponse(event.data);
    };
    this.worker.onerror = () => {
      this.stepPending = false;
      this.rejectPendingPolicy("core session worker failed during policy observation");
    };
  }

  static async create(contractJson: string): Promise<WorkerCoreSession> {
    const worker = new Worker(new URL("./session.worker.ts", import.meta.url), { type: "module" });
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(new Error(message));
      };
      worker.onerror = (event) => fail(event.message || "core session worker failed");
      worker.onmessage = (event: MessageEvent<SessionWorkerResponse>) => {
        const message = event.data;
        if (message.type === "created") {
          if (settled) return;
          settled = true;
          resolve(
            new WorkerCoreSession(
              worker,
              message.nodeNames,
              new Float32Array(message.poseBuffer),
              message.focus,
            ),
          );
        } else if (message.type === "error") {
          fail(message.message);
        }
      };
      try {
        worker.postMessage({ type: "create", contractJson } satisfies SessionWorkerRequest);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  }

  step(dt: number, input: DriveInput): number {
    if (this.disposed) return 0;
    this.dispatchStep(dt, input);
    return 0;
  }

  poseView(): Float32Array {
    if (this.disposed) return new Float32Array();
    return this.pose;
  }

  focus(): FocusVector {
    return this.disposed ? [0, 0, 0] : this.focusValue;
  }

  policySnapshot(target: FocusVector): Promise<PolicyObservationSnapshot> {
    if (this.disposed) return Promise.reject(new Error("core session is disposed"));
    const requestId = this.nextPolicyRequestId++;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        const pending = this.pendingPolicy.get(requestId);
        if (!pending) return;
        this.pendingPolicy.delete(requestId);
        pending.reject(new Error("core policy observation timed out after 2 seconds"));
      }, 2_000);
      this.pendingPolicy.set(requestId, { resolve, reject, timeout });
      try {
        this.worker.postMessage({ type: "policySnapshot", requestId, target } satisfies SessionWorkerRequest);
      } catch (error) {
        this.pendingPolicy.delete(requestId);
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  setJog(node: string, rx: number, ry: number): void {
    if (this.disposed) return;
    this.worker.postMessage({ type: "setJog", node, rx, ry } satisfies SessionWorkerRequest);
  }

  clearJog(): void {
    if (this.disposed) return;
    this.worker.postMessage({ type: "clearJog" } satisfies SessionWorkerRequest);
  }

  drainPerf(): CoreSessionPerf {
    const coreMs = this.coreAccumMs;
    const workerMs = this.workerAccumMs;
    const workerSamples = this.workerSamples;
    this.coreAccumMs = 0;
    this.workerAccumMs = 0;
    this.workerSamples = 0;
    return {
      mode: this.mode,
      coreMs,
      workerMs,
      workerSamples,
      pending: this.stepPending,
      queuedDtS: this.queuedDt,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const pending of this.pendingPolicy.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error("core session disposed before policy observation completed"));
    }
    this.pendingPolicy.clear();
    this.worker.postMessage({ type: "dispose" } satisfies SessionWorkerRequest);
    this.worker.terminate();
  }

  private handleResponse(message: SessionWorkerResponse): void {
    if (message.type === "stepped") {
      this.stepPending = false;
      this.focusValue = message.focus;
      this.workerAccumMs += message.workerMs;
      this.workerSamples += 1;
      if (this.queuedInput && this.queuedDt > 0) {
        const dt = this.queuedDt;
        const input = this.queuedInput;
        this.queuedDt = 0;
        this.queuedInput = null;
        this.dispatchStep(dt, input);
      }
    } else if (message.type === "error") {
      this.stepPending = false;
    } else if (message.type === "policySnapshot") {
      const pending = this.pendingPolicy.get(message.requestId);
      if (pending) {
        this.pendingPolicy.delete(message.requestId);
        window.clearTimeout(pending.timeout);
        pending.resolve({ layout: message.layout, observations: message.observations });
      }
    } else if (message.type === "policySnapshotError") {
      const pending = this.pendingPolicy.get(message.requestId);
      if (pending) {
        this.pendingPolicy.delete(message.requestId);
        window.clearTimeout(pending.timeout);
        pending.reject(new Error(message.message));
      }
    }
  }

  private rejectPendingPolicy(message: string): void {
    for (const pending of this.pendingPolicy.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pendingPolicy.clear();
  }

  private dispatchStep(dt: number, input: DriveInput): void {
    if (this.stepPending) {
      this.queuedDt += dt;
      this.queuedInput = input;
      return;
    }
    const start = performance.now();
    this.stepPending = true;
    try {
      this.worker.postMessage({ type: "step", dt, input } satisfies SessionWorkerRequest);
    } finally {
      this.coreAccumMs += performance.now() - start;
    }
  }
}

function canUseWorkerSession(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof SharedArrayBuffer !== "undefined" &&
    (globalThis as typeof globalThis & { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  );
}

/** The `tick` boundary call: fixed-step motion in core, poses out. */
export class CoreSession {
  readonly mode: CoreSessionMode;
  readonly nodeNames: string[];

  private constructor(private readonly delegate: CoreSessionDelegate) {
    this.mode = delegate.mode;
    this.nodeNames = delegate.nodeNames;
  }

  static async create(contractJson: string): Promise<CoreSession> {
    if (canUseWorkerSession()) {
      try {
        return new CoreSession(await WorkerCoreSession.create(contractJson));
      } catch {
        // Viewer-grade fallback: keep the Studio usable when worker isolation
        // or module-WASM loading is unavailable despite feature detection.
      }
    }
    return new CoreSession(await LocalCoreSession.create(contractJson));
  }

  /** Advance the 120 Hz clock; worker mode updates the pose mirror async. */
  step(dt: number, input: DriveInput): number {
    return this.delegate.step(dt, input);
  }

  /** Stable pose view; worker mode reads a SharedArrayBuffer mirror. */
  poseView(): Float32Array {
    return this.delegate.poseView();
  }

  /** Drive-mode camera focus: driver body position at viewing height. */
  focus(): FocusVector {
    return this.delegate.focus();
  }

  /** Estimator-derived, versioned policy tensor snapshot from the Rust core. */
  policySnapshot(target: FocusVector): Promise<PolicyObservationSnapshot> {
    return this.delegate.policySnapshot(target);
  }

  /** Teach-pendant jog (P1-013): euler offset over the pose layers. */
  setJog(node: string, rx: number, ry: number): void {
    this.delegate.setJog(node, rx, ry);
  }

  clearJog(): void {
    this.delegate.clearJog();
  }

  drainPerf(): CoreSessionPerf {
    return this.delegate.drainPerf();
  }

  dispose(): void {
    this.delegate.dispose();
  }
}
