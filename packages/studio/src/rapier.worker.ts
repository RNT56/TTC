import init, { RapierSession } from "./wasm-pkg/forge_wasm.js";
import type {
  RapierSceneSummary,
  RapierStepSummary,
  RapierWorkerRequest,
  RapierWorkerResponse,
} from "./rapierProtocol";

type WorkerScope = {
  onmessage: ((event: MessageEvent<RapierWorkerRequest>) => void) | null;
  postMessage(message: RapierWorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;

let session: RapierSession | null = null;
let poseMirror: Float32Array | null = null;
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

function copyPose(handle: RapierSession): void {
  if (!poseMirror) return;
  const pose = handle.pose_view();
  if (pose.length !== poseMirror.length) {
    throw new Error(`Rapier pose buffer length changed from ${poseMirror.length} to ${pose.length}`);
  }
  poseMirror.set(pose);
}

function disposeSession(): void {
  session?.free();
  session = null;
  poseMirror = null;
}

function post(message: RapierWorkerResponse): void {
  workerScope.postMessage(message);
}

async function handleMessage(message: RapierWorkerRequest): Promise<void> {
  switch (message.type) {
    case "create": {
      await ensureReady();
      disposeSession();
      const next = new RapierSession(message.contractJson, message.fixedRoots, message.includeGround);
      const nodeNames = next.node_names();
      const poseBuffer = new SharedArrayBuffer(nodeNames.length * 16 * Float32Array.BYTES_PER_ELEMENT);
      session = next;
      poseMirror = new Float32Array(poseBuffer);
      copyPose(next);
      post({
        type: "created",
        nodeNames,
        scene: JSON.parse(next.scene()) as RapierSceneSummary,
        poseBuffer,
      });
      return;
    }
    case "step": {
      if (!session) return;
      const start = performance.now();
      const step = JSON.parse(session.step(message.dtS)) as RapierStepSummary;
      copyPose(session);
      post({ type: "stepped", step, workerMs: performance.now() - start });
      return;
    }
    case "dispose":
      disposeSession();
      return;
  }
}

workerScope.onmessage = (event) => {
  void handleMessage(event.data).catch((error: unknown) => {
    post({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
};
