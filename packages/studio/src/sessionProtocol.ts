export interface DriveInput {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  drive: number;
  turn: number;
}

export type FocusVector = [number, number, number];

export type SessionWorkerRequest =
  | { type: "create"; contractJson: string }
  | { type: "step"; dt: number; input: DriveInput }
  | { type: "setJog"; node: string; rx: number; ry: number }
  | { type: "clearJog" }
  | { type: "dispose" };

export type SessionWorkerResponse =
  | { type: "created"; nodeNames: string[]; poseBuffer: SharedArrayBuffer; focus: FocusVector }
  | { type: "stepped"; steps: number; focus: FocusVector; workerMs: number }
  | { type: "error"; message: string };
