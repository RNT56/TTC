export interface RapierSceneSummary {
  bodyCount: number;
  colliderCount: number;
  jointCount: number;
  motorCount: number;
  autoFitPolicy: string;
}

export interface RapierStepSummary {
  tS: number;
  substeps: number;
  bodyCount: number;
  colliderCount: number;
  jointCount: number;
  poses: unknown[];
}

export interface RapierCreateOptions {
  fixedRoots: boolean;
  includeGround: boolean;
}

export type RapierWorkerRequest =
  | ({ type: "create"; contractJson: string } & RapierCreateOptions)
  | { type: "step"; dtS: number }
  | { type: "dispose" };

export type RapierWorkerResponse =
  | {
      type: "created";
      nodeNames: string[];
      scene: RapierSceneSummary;
      poseBuffer: SharedArrayBuffer;
    }
  | { type: "stepped"; step: RapierStepSummary; workerMs: number }
  | { type: "error"; message: string };

export interface RapierSmokeResult {
  mode: "worker";
  nodeCount: number;
  poseFloats: number;
  scene: RapierSceneSummary;
  step: Omit<RapierStepSummary, "poses">;
  workerMs: number;
  poseChecksum: number;
  firstBodyY: number | null;
}
