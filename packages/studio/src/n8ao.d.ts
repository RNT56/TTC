// n8ao ships no TypeScript declarations — the surface we consume (P1-016).
declare module "n8ao" {
  import type { Camera, Scene } from "three";
  import { Pass } from "three/addons/postprocessing/Pass.js";
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width?: number, height?: number);
    configuration: {
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
      aoSamples: number;
      denoiseSamples: number;
      denoiseRadius: number;
      gammaCorrection: boolean;
    };
    setSize(width: number, height: number): void;
  }
}
