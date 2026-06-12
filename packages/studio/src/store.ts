// Document/UI state only — loop and geometry state stays out of React
// (BEST-PRACTICES §5; the render loop lives in scene.ts, truth in the core).
import { create } from "zustand";
import type { BakeArtifact, Report } from "./types";

interface StudioState {
  artifact: BakeArtifact | null;
  report: Report | null;
  explode: number;
  setArtifact: (a: BakeArtifact) => void;
  setReport: (r: Report) => void;
  setExplode: (t: number) => void;
}

export const useStudio = create<StudioState>((set) => ({
  artifact: null,
  report: null,
  explode: 0,
  setArtifact: (artifact) => set({ artifact }),
  setReport: (report) => set({ report }),
  setExplode: (explode) => set({ explode }),
}));
