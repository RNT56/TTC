// Document/UI state only — loop and geometry state stays out of React
// (BEST-PRACTICES §5; the render loop lives in scene.ts, truth in the core).
import { create } from "zustand";
import type { PartPick } from "./scene";
import type { BakeArtifact, Report } from "./types";

export interface DemoModel {
  id: string;
  label: string;
}

export const DEMO_MODELS: DemoModel[] = [
  { id: "hrx7", label: "HRX-7 Mk II (prototype translation)" },
  { id: "vx2-hornet", label: "VX-2 Hornet (prototype translation)" },
  { id: "vx2-mini", label: "VX-2 Mini (synthetic multirotor)" },
  { id: "qd-mini", label: "QD Mini (generated quadruped)" },
];

interface StudioState {
  modelId: string;
  artifact: BakeArtifact | null;
  report: Report | null;
  /** raw contract JSON — sessions and patches need the document itself */
  contractJson: string | null;
  explode: number;
  blueprint: boolean;
  driving: boolean;
  throttle: number;
  drive: number;
  selected: PartPick | null;
  fps: number;
  setModelId: (id: string) => void;
  setLoaded: (artifact: BakeArtifact, report: Report | null, contractJson: string | null) => void;
  setExplode: (t: number) => void;
  setBlueprint: (on: boolean) => void;
  setDriving: (on: boolean) => void;
  setThrottle: (v: number) => void;
  setDrive: (v: number) => void;
  setSelected: (p: PartPick | null) => void;
  setFps: (v: number) => void;
}

export const useStudio = create<StudioState>((set) => ({
  modelId: DEMO_MODELS[0].id,
  artifact: null,
  report: null,
  contractJson: null,
  explode: 0,
  blueprint: false,
  driving: false,
  throttle: 0.45,
  drive: 0.8,
  selected: null,
  fps: 0,
  setModelId: (modelId) => set({ modelId }),
  setLoaded: (artifact, report, contractJson) => set({ artifact, report, contractJson }),
  setExplode: (explode) => set({ explode }),
  setBlueprint: (blueprint) => set({ blueprint }),
  setDriving: (driving) => set({ driving }),
  setThrottle: (throttle) => set({ throttle }),
  setDrive: (drive) => set({ drive }),
  setSelected: (selected) => set({ selected }),
  setFps: (fps) => set({ fps }),
}));
