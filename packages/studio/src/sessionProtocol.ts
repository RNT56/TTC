export interface DriveInput {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  drive: number;
  turn: number;
}

export type FocusVector = [number, number, number];

export interface PolicyObservationSnapshot {
  layout: string[];
  observations: number[];
}

export type SessionWorkerRequest =
  | { type: "create"; contractJson: string }
  | { type: "step"; dt: number; input: DriveInput }
  | { type: "policySnapshot"; requestId: number; target: FocusVector; tensorVersion: string }
  | { type: "setJog"; node: string; rx: number; ry: number }
  | { type: "clearJog" }
  | { type: "dispose" };

export type SessionWorkerResponse =
  | { type: "created"; nodeNames: string[]; poseBuffer: SharedArrayBuffer; focus: FocusVector }
  | { type: "stepped"; steps: number; focus: FocusVector; workerMs: number }
  | ({ type: "policySnapshot"; requestId: number } & PolicyObservationSnapshot)
  | { type: "policySnapshotError"; requestId: number; message: string }
  | { type: "error"; message: string };
