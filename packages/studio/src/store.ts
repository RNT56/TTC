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

export interface Perf {
  fps: number;
  frameMs: number;
  drawCalls: number;
  coreMs: number;
}

interface StudioState {
  modelId: string;
  artifact: BakeArtifact | null;
  report: Report | null;
  /** raw contract JSON — sessions and patches need the document itself */
  contractJson: string | null;
  explode: number;
  blueprint: boolean;
  driving: boolean;
  /** drive clock frozen; frame-step still advances one fixed step */
  paused: boolean;
  /** teach-pendant jog mode (P1-013): drag the selected node */
  jogging: boolean;
  throttle: number;
  drive: number;
  selected: PartPick | null;
  perf: Perf;
  setModelId: (id: string) => void;
  setLoaded: (artifact: BakeArtifact, report: Report | null, contractJson: string | null) => void;
  setExplode: (t: number) => void;
  setBlueprint: (on: boolean) => void;
  setDriving: (on: boolean) => void;
  setPaused: (on: boolean) => void;
  setJogging: (on: boolean) => void;
  setThrottle: (v: number) => void;
  setDrive: (v: number) => void;
  setSelected: (p: PartPick | null) => void;
  setPerf: (p: Perf) => void;
}

export const useStudio = create<StudioState>((set) => ({
  modelId: DEMO_MODELS[0].id,
  artifact: null,
  report: null,
  contractJson: null,
  explode: 0,
  blueprint: false,
  driving: false,
  paused: false,
  jogging: false,
  throttle: 0.45,
  drive: 0.8,
  selected: null,
  perf: { fps: 0, frameMs: 0, drawCalls: 0, coreMs: 0 },
  setModelId: (modelId) => set({ modelId }),
  setLoaded: (artifact, report, contractJson) => set({ artifact, report, contractJson }),
  setExplode: (explode) => set({ explode }),
  setBlueprint: (blueprint) => set({ blueprint }),
  setDriving: (driving) => set({ driving }),
  setPaused: (paused) => set({ paused }),
  // jog needs a ticking session — arming it turns drive on
  setJogging: (jogging) => set(jogging ? { jogging, driving: true } : { jogging }),
  setThrottle: (throttle) => set({ throttle }),
  setDrive: (drive) => set({ drive }),
  setSelected: (selected) => set({ selected }),
  setPerf: (perf) => set({ perf }),
}));
