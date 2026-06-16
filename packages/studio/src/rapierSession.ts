import type {
  RapierCreateOptions,
  RapierSceneSummary,
  RapierSmokeResult,
  RapierStepSummary,
  RapierWorkerRequest,
  RapierWorkerResponse,
} from "./rapierProtocol";

const DEFAULT_RAPIER_OPTIONS: RapierCreateOptions = {
  fixedRoots: false,
  includeGround: true,
};

export interface RapierSessionPerf {
  workerMs: number;
  workerSamples: number;
  pending: boolean;
  queuedDtS: number;
}

export function canUseRapierWorker(): boolean {
  return (
    typeof Worker !== "undefined" &&
    typeof SharedArrayBuffer !== "undefined" &&
    (globalThis as typeof globalThis & { crossOriginIsolated?: boolean }).crossOriginIsolated === true
  );
}

export class RapierWorkerSession {
  private disposed = false;
  private pendingStep:
    | {
        resolve: (result: RapierStepSummary) => void;
        reject: (error: Error) => void;
      }
    | null = null;
  private lastWorkerMs = 0;
  private workerAccumMs = 0;
  private workerSamples = 0;
  private queuedDt = 0;

  private constructor(
    private readonly worker: Worker,
    readonly nodeNames: string[],
    readonly scene: RapierSceneSummary,
    private readonly pose: Float32Array,
  ) {
    this.worker.onmessage = (event: MessageEvent<RapierWorkerResponse>) => {
      this.handleResponse(event.data);
    };
    this.worker.onerror = (event) => {
      this.rejectStep(new Error(event.message || "Rapier worker failed"));
    };
  }

  static async create(
    contractJson: string,
    options: Partial<RapierCreateOptions> = {},
  ): Promise<RapierWorkerSession> {
    if (!canUseRapierWorker()) {
      throw new Error("Rapier worker requires cross-origin isolation and SharedArrayBuffer");
    }
    const worker = new Worker(new URL("./rapier.worker.ts", import.meta.url), { type: "module" });
    const createOptions = { ...DEFAULT_RAPIER_OPTIONS, ...options };
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(new Error(message));
      };
      worker.onerror = (event) => fail(event.message || "Rapier worker failed");
      worker.onmessage = (event: MessageEvent<RapierWorkerResponse>) => {
        const message = event.data;
        if (message.type === "created") {
          if (settled) return;
          settled = true;
          resolve(
            new RapierWorkerSession(
              worker,
              message.nodeNames,
              message.scene,
              new Float32Array(message.poseBuffer),
            ),
          );
        } else if (message.type === "error") {
          fail(message.message);
        }
      };
      try {
        worker.postMessage({
          type: "create",
          contractJson,
          fixedRoots: createOptions.fixedRoots,
          includeGround: createOptions.includeGround,
        } satisfies RapierWorkerRequest);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    });
  }

  step(dtS: number): Promise<RapierStepSummary> {
    if (this.disposed) return Promise.reject(new Error("Rapier worker session has been disposed"));
    if (this.pendingStep) return Promise.reject(new Error("Rapier worker step already pending"));
    return new Promise((resolve, reject) => {
      this.dispatchStep(dtS, { resolve, reject });
    });
  }

  advance(dtS: number): void {
    if (this.disposed || dtS <= 0) return;
    if (this.pendingStep) {
      this.queuedDt += dtS;
      return;
    }
    this.dispatchStep(dtS);
  }

  poseView(): Float32Array {
    return this.disposed ? new Float32Array() : this.pose;
  }

  focus(): [number, number, number] {
    const pose = this.poseView();
    return pose.length >= 16 ? [pose[12], pose[13] + 0.12, pose[14]] : [0, 0, 0];
  }

  workerMs(): number {
    return this.lastWorkerMs;
  }

  drainPerf(): RapierSessionPerf {
    const workerMs = this.workerAccumMs;
    const workerSamples = this.workerSamples;
    this.workerAccumMs = 0;
    this.workerSamples = 0;
    return {
      workerMs,
      workerSamples,
      pending: this.pendingStep !== null,
      queuedDtS: this.queuedDt,
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.postMessage({ type: "dispose" } satisfies RapierWorkerRequest);
    this.worker.terminate();
    this.rejectStep(new Error("Rapier worker session disposed"));
  }

  private handleResponse(message: RapierWorkerResponse): void {
    if (message.type === "stepped") {
      this.lastWorkerMs = message.workerMs;
      this.workerAccumMs += message.workerMs;
      this.workerSamples += 1;
      const pending = this.pendingStep;
      this.pendingStep = null;
      pending?.resolve(message.step);
      if (!this.disposed && this.queuedDt > 0) {
        const dt = this.queuedDt;
        this.queuedDt = 0;
        this.dispatchStep(dt);
      }
    } else if (message.type === "error") {
      this.rejectStep(new Error(message.message));
    }
  }

  private dispatchStep(
    dtS: number,
    pending?: {
      resolve: (result: RapierStepSummary) => void;
      reject: (error: Error) => void;
    },
  ): void {
    this.pendingStep = pending ?? { resolve: () => undefined, reject: () => undefined };
    try {
      this.worker.postMessage({ type: "step", dtS } satisfies RapierWorkerRequest);
    } catch (error) {
      this.rejectStep(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private rejectStep(error: Error): void {
    const pending = this.pendingStep;
    this.pendingStep = null;
    pending?.reject(error);
  }
}

export async function rapierWorkerSmoke(
  contractJson: string,
  dtS = 1 / 120,
): Promise<RapierSmokeResult> {
  const session = await RapierWorkerSession.create(contractJson);
  try {
    const step = await session.step(dtS);
    const pose = session.poseView();
    let checksum = 0;
    for (let i = 0; i < pose.length; i += 1) {
      checksum = (checksum + Math.round(pose[i] * 1_000_000) * (i + 1)) | 0;
    }
    return {
      mode: "worker",
      nodeCount: session.nodeNames.length,
      poseFloats: pose.length,
      scene: session.scene,
      step: {
        tS: step.tS,
        substeps: step.substeps,
        bodyCount: step.bodyCount,
        colliderCount: step.colliderCount,
        jointCount: step.jointCount,
      },
      workerMs: session.workerMs(),
      poseChecksum: checksum,
      firstBodyY: pose.length >= 14 ? pose[13] : null,
    };
  } finally {
    session.dispose();
  }
}
