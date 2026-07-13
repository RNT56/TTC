import type { BakeArtifact } from "./types";

export type QualityTier = "high" | "medium" | "low";

export interface PartPick {
  partIndex: number;
  sourcePath: string;
  node: string;
  material: string;
  color: string;
}

export interface CameraPose {
  yaw: number;
  el: number;
  dist: number;
  target: [number, number, number];
  fovDeg?: number;
}

export interface SceneQualityState {
  tier: QualityTier;
  renderer: "webgl" | "schematic-2d";
  advancedEffectsInitialized: boolean;
}

/** Presentation-only scene boundary. Core bake, validation, and simulation stay
 * authoritative regardless of whether the full WebGL or viewer-grade schematic
 * implementation consumes the artifact. */
export interface SceneController {
  onFrame?: (dt: number) => void;
  load(artifact: BakeArtifact): void;
  setPose(names: string[], buffer: Float32Array): void;
  setExplode(t: number): void;
  setBlueprint(on: boolean): void;
  pick(ndcX: number, ndcY: number): PartPick | null;
  setSelected(partIndex: number | null): void;
  setCameraPose(pose: CameraPose): void;
  nudgeCamera(azimuthRad: number, elevationRad: number, zoomFactor?: number): void;
  cameraState(): { position: [number, number, number]; target: [number, number, number] };
  setReducedMotion(reduced: boolean): void;
  setGridVisible(visible: boolean): void;
  setControlsEnabled(enabled: boolean): void;
  setShadowsVisible(visible: boolean): void;
  followFocus(focus: [number, number, number], dt: number): void;
  setTier(tier: QualityTier): void;
  qualityState(): SceneQualityState;
  stats(): { drawCalls: number; triangles: number; frameMs: number };
  resize(width: number, height: number): void;
  start(): void;
  dispose(): void;
}
