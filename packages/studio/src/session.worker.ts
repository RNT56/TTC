import init, { Session } from "./wasm-pkg/forge_wasm.js";
import type { FocusVector, SessionWorkerRequest, SessionWorkerResponse } from "./sessionProtocol";

type WorkerScope = {
  onmessage: ((event: MessageEvent<SessionWorkerRequest>) => void) | null;
  postMessage(message: SessionWorkerResponse): void;
};

const workerScope = self as unknown as WorkerScope;

let session: Session | null = null;
let poseMirror: Float32Array | null = null;
let ready: Promise<void> | null = null;

function ensureReady(): Promise<void> {
  ready ??= init().then(() => undefined);
  return ready;
}

function focusFrom(handle: Session): FocusVector {
  const focus = handle.focus();
  return [focus[0] ?? 0, focus[1] ?? 0, focus[2] ?? 0];
}

function copyPose(handle: Session): void {
  if (!poseMirror) return;
  const pose = handle.pose_view();
  if (pose.length !== poseMirror.length) {
    throw new Error(`pose buffer length changed from ${poseMirror.length} to ${pose.length}`);
  }
  poseMirror.set(pose);
}

function disposeSession(): void {
  session?.free();
  session = null;
  poseMirror = null;
}

function post(message: SessionWorkerResponse): void {
  workerScope.postMessage(message);
}

async function handleMessage(message: SessionWorkerRequest): Promise<void> {
  switch (message.type) {
    case "create": {
      await ensureReady();
      disposeSession();
      const next = new Session(message.contractJson);
      const nodeNames = next.node_names();
      const poseBuffer = new SharedArrayBuffer(nodeNames.length * 16 * Float32Array.BYTES_PER_ELEMENT);
      session = next;
      poseMirror = new Float32Array(poseBuffer);
      copyPose(next);
      post({ type: "created", nodeNames, poseBuffer, focus: focusFrom(next) });
      return;
    }
    case "step": {
      if (!session) return;
      const start = performance.now();
      const steps = session.step(
        message.dt,
        message.input.throttle,
        message.input.pitch,
        message.input.roll,
        message.input.yaw,
        message.input.drive,
        message.input.turn,
      );
      copyPose(session);
      post({ type: "stepped", steps, focus: focusFrom(session), workerMs: performance.now() - start });
      return;
    }
    case "policySnapshot": {
      if (!session) {
        post({ type: "policySnapshotError", requestId: message.requestId, message: "core session is unavailable" });
        return;
      }
      try {
        const v2 = message.tensorVersion === "2.0.0";
        if (!v2 && message.tensorVersion !== "1.0.0") {
          throw new Error(`unsupported policy tensor ${message.tensorVersion}`);
        }
        post({
          type: "policySnapshot",
          requestId: message.requestId,
          layout: v2 ? session.policy_layout_v2() : session.policy_layout(),
          observations: Array.from(
            v2
              ? session.policy_observations_v2(...message.target)
              : session.policy_observations(...message.target),
          ),
        });
      } catch (error) {
        post({
          type: "policySnapshotError",
          requestId: message.requestId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }
    case "setJog":
      session?.set_jog(message.node, message.rx, message.ry);
      return;
    case "clearJog":
      session?.clear_jog();
      return;
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
