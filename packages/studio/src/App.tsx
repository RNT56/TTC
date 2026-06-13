import { useCallback, useEffect, useRef, useState } from "react";
import { StudioScene } from "./scene";
import { DEMO_MODELS, useStudio } from "./store";
import type { MaterialClass, Report } from "./types";
import {
  decideReview,
  generateContract,
  listGenerationModels,
  type AnthropicModelPin,
  type GenerationArchetype,
  type GenerationAttempt,
  type GenerationProvider,
  type GenerationResponse,
  listReviews,
  type ReviewExportPolicy,
  type ReviewQueueItem,
  type ReviewStatus,
} from "./gateway";
import { decodeShareFragment, encodeShareFragment } from "./share";
import { CoreBake, CoreSession, coreValidate } from "./wasm";

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(13,15,18,0.88)",
  border: "1px solid #2a2f38",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.5,
};

const DT = 1 / 120;
/** configurator palette (P1-014) — patch-applied through the live handle */
const SWATCHES = [
  "#d8dde3",
  "#8fa3bf",
  "#39c8ff",
  "#e6a23c",
  "#7dd87d",
  "#1d222c",
  "#6e4a3a",
  "#3a4a6e",
];
const MATERIAL_CLASSES: MaterialClass[] = ["gloss", "metal", "satin", "matte", "rubber"];
const REVIEW_EXPORT_POLICIES: ReviewExportPolicy[] = [
  "full-geometry-ok",
  "attribution-manifest-required",
  "envelope-link-out",
  "envelope-only",
  "bom-only",
  "assembly-policy-derived",
];
const GENERATION_ARCHETYPES: GenerationArchetype[] = [
  "multirotor",
  "quadruped",
  "rover",
  "arm",
  "biped",
  "fixedwing",
];
const ANTHROPIC_KEY_STORAGE_KEY = "forge.studio.anthropicKey";

function readSessionValue(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const sessionRef = useRef<CoreSession | null>(null);
  /** long-lived bake handle — the patch → re-bake loop (P1-005/P1-014) */
  const bakeRef = useRef<CoreBake | null>(null);
  const stepOnceRef = useRef(false);
  const jogDrag = useRef<{ node: string; rx: number; ry: number } | null>(null);
  const jogTotals = useRef(new Map<string, { rx: number; ry: number }>());
  const s = useStudio();
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>("needs_review");
  const [reviews, setReviews] = useState<ReviewQueueItem[]>([]);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});
  const [reviewExportPolicies, setReviewExportPolicies] = useState<Record<number, ReviewExportPolicy>>({});
  const [generationProvider, setGenerationProvider] = useState<GenerationProvider>("template");
  const [generationPrompt, setGenerationPrompt] = useState(
    "5 inch freestyle quad with a long-range battery option, under 650 g",
  );
  const [generationArchetype, setGenerationArchetype] = useState<GenerationArchetype | "">("multirotor");
  const [generationCategories, setGenerationCategories] = useState("motor, prop, battery, frame");
  const [generationLimit, setGenerationLimit] = useState(8);
  const [generationMaxRepairs, setGenerationMaxRepairs] = useState(3);
  const [generationSeed, setGenerationSeed] = useState(0);
  const [anthropicKey, setAnthropicKey] = useState(() => readSessionValue(ANTHROPIC_KEY_STORAGE_KEY));
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationResult, setGenerationResult] = useState<GenerationResponse | null>(null);
  const [generationLoadMessage, setGenerationLoadMessage] = useState<string | null>(null);
  const [generationModels, setGenerationModels] = useState<AnthropicModelPin[]>([]);
  const [generationModelsError, setGenerationModelsError] = useState<string | null>(null);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );

  const refreshReviews = useCallback(async (status: ReviewStatus) => {
    setReviewBusy(true);
    setReviewError(null);
    try {
      setReviews(await listReviews(status));
    } catch (error) {
      setReviews([]);
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewBusy(false);
    }
  }, []);

  const setReviewFilter = useCallback((status: ReviewStatus) => {
    setReviewStatus(status);
    void refreshReviews(status);
  }, [refreshReviews]);

  const recordDecision = useCallback(async (id: number, decision: "approved" | "rejected") => {
    setReviewBusy(true);
    setReviewError(null);
    try {
      const current = reviews.find((candidate) => candidate.id === id);
      const note = reviewNotes[id]?.trim();
      const exportPolicy =
        decision === "rejected"
          ? "blocked"
          : reviewExportPolicies[id] ?? defaultReviewExportPolicy(current);
      const item = await decideReview(id, decision, {
        reviewer: "owner",
        reviewNote: note || undefined,
        exportPolicy,
      });
      setReviews((current) =>
        reviewStatus === "needs_review"
          ? current.filter((candidate) => candidate.id !== id)
          : current.map((candidate) => (candidate.id === id ? item : candidate)),
      );
      setReviewNotes((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setReviewExportPolicies((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setReviewBusy(false);
    }
  }, [reviewExportPolicies, reviewNotes, reviewStatus, reviews]);

  /** Load a contract end to end: bake handle + scene + session + report. */
  const loadContract = useCallback(async (contract: string, reportOverride?: Report | null) => {
    const handle = await CoreBake.create(contract);
    bakeRef.current?.dispose();
    bakeRef.current = handle;
    const artifact = handle.artifact();
    sceneRef.current?.load(artifact);
    sessionRef.current?.dispose();
    sessionRef.current = null;
    jogTotals.current.clear();
    try {
      sessionRef.current = await CoreSession.create(contract);
    } catch {
      sessionRef.current = null; // archetypes without a v0 driver stay static
    }
    const report = reportOverride?.verdict === "draft" ? reportOverride : await coreValidate(contract);
    useStudio.getState().setLoaded(artifact, report, contract);
    useStudio.getState().setSelected(null);
  }, []);

  const loadDemo = useCallback(
    async (id: string) => {
      // fetch only the CONTRACT; bake + validate happen in-browser through
      // the wasm core — the same bits CI runs (D17), no payload duplication
      const contract = await fetch(`/demo/${id}.forge.json`).then((r) => r.text());
      await loadContract(contract);
    },
    [loadContract],
  );

  const runGenerate = useCallback(async () => {
    const prompt = generationPrompt.trim();
    if (!prompt) {
      setGenerationError("prompt is required");
      return;
    }
    if (generationProvider === "anthropic" && !anthropicKey.trim()) {
      setGenerationError("Anthropic provider requires a BYO key");
      return;
    }
    setGenerationBusy(true);
    setGenerationError(null);
    setGenerationLoadMessage(null);
    try {
      const categories = parseCategories(generationCategories);
      const result = await generateContract(
        {
          prompt,
          provider: generationProvider,
          ...(generationArchetype ? { archetype: generationArchetype } : {}),
          ...(categories.length > 0 ? { categories } : {}),
          limit: boundedInt(generationLimit, 1, 20),
          maxRepairIterations: boundedInt(generationMaxRepairs, 0, 3),
          seed: boundedInt(generationSeed, 0, Number.MAX_SAFE_INTEGER),
        },
        { anthropicApiKey: generationProvider === "anthropic" ? anthropicKey : undefined },
      );
      setGenerationResult(result);
      if ((result.verdict === "admitted" || result.verdict === "draft") && result.contract !== null) {
        try {
          await loadContract(JSON.stringify(result.contract), result.report);
          setGenerationLoadMessage(
            result.verdict === "draft" ? "draft loaded into scene" : "contract loaded into scene",
          );
        } catch (error) {
          setGenerationLoadMessage(
            `load failed · ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      setGenerationError(error instanceof Error ? error.message : String(error));
    } finally {
      setGenerationBusy(false);
    }
  }, [
    anthropicKey,
    generationArchetype,
    generationCategories,
    generationLimit,
    generationMaxRepairs,
    generationPrompt,
    generationProvider,
    generationSeed,
    loadContract,
  ]);

  /** Configurator (P1-014): JSON-Patch the live handle, re-bake in place —
   * explode, camera, drive state and selection all survive the rebuild. */
  const applyPatch = useCallback(async (ops: { op: string; path: string; value: unknown }[]) => {
    const handle = bakeRef.current;
    const scene = sceneRef.current;
    if (!handle || !scene) return;
    const st = useStudio.getState();
    const selected = st.selected;
    const before = st.artifact?.hud;
    const artifact = handle.patch(JSON.stringify(ops));
    // consequence diff (D5): show what the change DID to the derived numbers
    const after = artifact.hud;
    if (before && after) {
      const deltas: string[] = [];
      const d = (k: string, a?: number, b?: number, unit = "", digits = 1) => {
        if (a !== undefined && b !== undefined && Math.abs(b - a) > 1e-9) {
          deltas.push(`${k} ${a.toFixed(digits)} → ${b.toFixed(digits)}${unit}`);
        }
      };
      d("AUW", before.auwG, after.auwG, " g", 0);
      d("TWR", before.twr, after.twr);
      d("hover", before.hoverThrottle && before.hoverThrottle * 100,
        after.hoverThrottle && after.hoverThrottle * 100, " %", 0);
      st.setLastDiff(deltas.length ? deltas.join(" · ") : null);
    }
    const contract = handle.contract();
    scene.load(artifact);
    // the validator is sovereign: every patched document is re-judged
    const report = await coreValidate(contract);
    st.setLoaded(artifact, report, contract);
    // session follows the patched contract; jog offsets re-apply
    sessionRef.current?.dispose();
    try {
      sessionRef.current = await CoreSession.create(contract);
      for (const [node, j] of jogTotals.current) {
        sessionRef.current.setJog(node, j.rx, j.ry);
      }
    } catch {
      sessionRef.current = null;
    }
    if (selected) {
      const part = artifact.baked.parts[selected.partIndex];
      if (part) {
        scene.setSelected(selected.partIndex);
        st.setSelected({
          partIndex: selected.partIndex,
          node: part.node,
          material: part.material,
          color: part.color,
        });
      }
    }
  }, []);

  // boot
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new StudioScene(canvas);
    sceneRef.current = scene;
    const onResize = () =>
      scene.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);

    // the core tick drives poses when Drive is on (truth in core, D16)
    let fpsAccum = 0;
    let fpsCount = 0;
    let coreAccum = 0;
    let slowFor = 0; // XC-22 auto-degrader: sustained-slow timer
    scene.onFrame = (dt) => {
      const st = useStudio.getState();
      fpsAccum += dt;
      fpsCount += 1;
      if (st.driving && sessionRef.current) {
        const stepDt = st.paused ? (stepOnceRef.current ? DT : 0) : dt;
        stepOnceRef.current = false;
        // gamepad (P1-013 input): left stick = strafe/forward, right stick =
        // yaw/throttle; deadzone 0.08; sliders stay the fallback
        let sticks = {
          throttle: st.throttle,
          pitch: 0,
          roll: 0,
          yaw: 0,
          drive: st.drive,
          turn: 0,
        };
        const pad = navigator.getGamepads?.()[0];
        if (pad) {
          const dz = (v: number) => (Math.abs(v) > 0.08 ? v : 0);
          const [lx, ly, rx, ry] = [dz(pad.axes[0] ?? 0), dz(pad.axes[1] ?? 0), dz(pad.axes[2] ?? 0), dz(pad.axes[3] ?? 0)];
          if (lx || ly || rx || ry) {
            sticks = {
              throttle: -ry,
              pitch: -ly,
              roll: lx,
              yaw: rx,
              drive: -ly,
              turn: rx,
            };
          }
        }
        const t0 = performance.now();
        if (stepDt > 0) {
          sessionRef.current.step(stepDt, sticks);
        }
        // zero-copy view, consumed synchronously (P1-005)
        scene.setPose(sessionRef.current.nodeNames, sessionRef.current.poseView());
        coreAccum += performance.now() - t0;
        // follow camera (P1-013): orbit target eases toward the driver
        if (!st.paused) scene.followFocus(sessionRef.current.focus(), dt);
      }
      if (fpsAccum >= 0.5) {
        const stats = scene.stats();
        const fps = Math.round(fpsCount / fpsAccum);
        st.setPerf({
          fps,
          frameMs: stats.frameMs,
          drawCalls: stats.drawCalls,
          coreMs: coreAccum / fpsCount,
        });
        // XC-22 degradation ladder: only ever steps DOWN; raising is manual
        slowFor = fps < 45 ? slowFor + fpsAccum : 0;
        if (slowFor > 3 && st.tier !== "low") {
          const next = st.tier === "high" ? "medium" : "low";
          st.setTier(next);
          scene.setTier(next);
          slowFor = 0;
        }
        fpsAccum = 0;
        fpsCount = 0;
        coreAccum = 0;
      }
    };
    scene.start();
    void (async () => {
      // a share link carries the whole contract in the fragment (re-judged
      // locally on arrival — never trusted)
      const shared = await decodeShareFragment(window.location.hash);
      if (shared) {
        try {
          await loadContract(shared);
          return;
        } catch {
          /* malformed share → fall through to the demo */
        }
      }
      await loadDemo(useStudio.getState().modelId);
    })();

    // parity-gallery / automation hook (P1-015): deterministic captures
    (window as unknown as Record<string, unknown>).__forgeParity = {
      load: (id: string) => loadDemo(id),
      setCamera: (p: {
        yaw: number;
        el: number;
        dist: number;
        target: [number, number, number];
        fovDeg?: number;
      }) => scene.setCameraPose(p),
      setGrid: (visible: boolean) => scene.setGridVisible(visible),
      setShadows: (visible: boolean) => scene.setShadowsVisible(visible),
      setBlueprint: (on: boolean) => scene.setBlueprint(on),
      setExplode: (t: number) => scene.setExplode(t),
      select: (partIndex: number | null) => scene.setSelected(partIndex),
      setTier: (t: "high" | "medium" | "low") => scene.setTier(t),
      stats: () => scene.stats(),
      loaded: () => Boolean(useStudio.getState().artifact),
    };

    return () => {
      window.removeEventListener("resize", onResize);
      sessionRef.current?.dispose();
      sessionRef.current = null;
      bakeRef.current?.dispose();
      bakeRef.current = null;
      scene.dispose();
      sceneRef.current = null;
    };
  }, [loadDemo]);

  // drag & drop a .forge.json → in-browser validate + bake (same bits as CI, D17)
  useEffect(() => {
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      const text = await file.text();
      const report = await coreValidate(text);
      if (report.verdict === "admitted") {
        await loadContract(text);
      } else {
        const st = useStudio.getState();
        if (st.artifact) st.setLoaded(st.artifact, report, st.contractJson);
      }
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDrag);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDrag);
    };
  }, [loadContract]);

  useEffect(() => {
    sceneRef.current?.setExplode(s.explode);
  }, [s.explode, s.artifact]);
  useEffect(() => {
    sceneRef.current?.setBlueprint(s.blueprint);
  }, [s.blueprint]);

  useEffect(() => {
    void refreshReviews("needs_review");
  }, [refreshReviews]);

  useEffect(() => {
    try {
      if (anthropicKey) {
        window.sessionStorage.setItem(ANTHROPIC_KEY_STORAGE_KEY, anthropicKey);
      } else {
        window.sessionStorage.removeItem(ANTHROPIC_KEY_STORAGE_KEY);
      }
    } catch {
      /* storage can be blocked; local state still works for the session */
    }
  }, [anthropicKey]);

  useEffect(() => {
    let alive = true;
    void listGenerationModels()
      .then((models) => {
        if (!alive) return;
        setGenerationModels(models);
        setGenerationModelsError(null);
      })
      .catch((error) => {
        if (!alive) return;
        setGenerationModels([]);
        setGenerationModelsError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (jogDrag.current) return; // a jog drag ate this gesture
    const rect = e.currentTarget.getBoundingClientRect();
    const pick = sceneRef.current?.pick(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    s.setSelected(pick ?? null);
  };

  // teach-pendant jog (P1-013): drag the selected node, X→yaw, Y→pitch
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useStudio.getState();
    if (!st.jogging || !st.selected || !sessionRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sceneRef.current?.setControlsEnabled(false);
    const node = st.selected.node;
    const j = jogTotals.current.get(node) ?? { rx: 0, ry: 0 };
    jogDrag.current = { node, ...j };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = jogDrag.current;
    if (!drag || !sessionRef.current) return;
    drag.ry += e.movementX * 0.008;
    drag.rx += e.movementY * 0.008;
    jogTotals.current.set(drag.node, { rx: drag.rx, ry: drag.ry });
    sessionRef.current.setJog(drag.node, drag.rx, drag.ry);
  };
  const onPointerUp = () => {
    if (!jogDrag.current) return;
    // let the click handler see the drag before clearing it
    setTimeout(() => {
      jogDrag.current = null;
    }, 0);
    sceneRef.current?.setControlsEnabled(true);
  };

  const clearJog = () => {
    jogTotals.current.clear();
    sessionRef.current?.clearJog();
  };

  const share = async () => {
    const st = useStudio.getState();
    const contract = st.contractJson;
    if (!contract || st.report?.verdict !== "admitted") return;
    const fragment = await encodeShareFragment(contract);
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
    window.history.replaceState(null, "", `#${fragment}`);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* clipboard needs a user gesture/permission; the hash is set anyway */
    }
  };

  const hud = s.artifact?.hud;
  const isMultirotor = hud?.twr !== undefined;
  const narrow = viewportWidth < 760;
  const generationStatus = generationBusy
    ? "running"
    : generationError
      ? "error"
      : generationResult?.verdict ?? "idle";
  const synthesisPin = generationModels.find((model) => model.role === "synthesis");
  const repairPin = generationModels.find((model) => model.role === "repair");
  const shareDisabled = !s.contractJson || s.report?.verdict !== "admitted";
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ width: "100%", height: "100%", display: "block" }}
      />

      <div
        style={{
          ...panel,
          top: 12,
          left: 12,
          width: 360,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: narrow ? "42vh" : "calc(100vh - 24px)",
          overflow: "auto",
        }}
      >
        <div style={{ color: "#8fa3bf", marginBottom: 6 }}>ForgedTTC STUDIO</div>
        <select
          value={s.modelId}
          onChange={(e) => {
            s.setModelId(e.target.value);
            void loadDemo(e.target.value);
          }}
          style={{ width: "100%", background: "#16181c", color: "#cfd6df", border: "1px solid #2a2f38" }}
        >
          {DEMO_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
        <div style={{ color: "#6b7686", marginTop: 4 }}>
          {s.artifact
            ? `${s.artifact.counts.parts} parts · ${s.artifact.counts.faces} faces`
            : "loading…"}
        </div>
        <div style={{ color: "#6b7686" }}>drop a .forge.json to validate in-browser</div>
        <button
          onClick={() => void share()}
          disabled={shareDisabled}
          title={shareDisabled ? "only admitted contracts can be shared" : "copy share URL"}
          style={{ ...btn, marginTop: 6, opacity: shareDisabled ? 0.55 : 1 }}
        >
          share — contract in the URL
        </button>

        <label style={{ display: "block", marginTop: 8 }}>
          explode
          <input
            type="range" min={0} max={1} step={0.001} value={s.explode}
            onChange={(e) => s.setExplode(Number(e.target.value))}
            style={{ width: "100%", display: "block" }}
          />
        </label>
        <label style={{ display: "block", marginTop: 6, color: "#6b7686" }}>
          quality{" "}
          <select
            value={s.tier}
            onChange={(e) => {
              const t = e.target.value as "high" | "medium" | "low";
              s.setTier(t);
              sceneRef.current?.setTier(t);
            }}
            style={{ background: "#16181c", color: "#cfd6df", border: "1px solid #2a2f38" }}
          >
            <option value="high">high (AO)</option>
            <option value="medium">medium (AO ½res)</option>
            <option value="low">low (AO off)</option>
          </select>
        </label>
        <label style={{ display: "inline-flex", gap: 6, marginTop: 6 }}>
          <input type="checkbox" checked={s.blueprint} onChange={(e) => s.setBlueprint(e.target.checked)} />
          blueprint
        </label>
        <label style={{ display: "inline-flex", gap: 6, marginLeft: 12 }}>
          <input type="checkbox" checked={s.driving} onChange={(e) => s.setDriving(e.target.checked)} />
          drive (core tick)
        </label>
        {s.driving && (
          <>
            <label style={{ display: "block", marginTop: 6 }}>
              {isMultirotor ? "throttle" : "drive"}
              <input
                type="range" min={0} max={1} step={0.01}
                value={isMultirotor ? s.throttle : s.drive}
                onChange={(e) =>
                  isMultirotor ? s.setThrottle(Number(e.target.value)) : s.setDrive(Number(e.target.value))
                }
                style={{ width: "100%", display: "block" }}
              />
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 6, alignItems: "center" }}>
              <label style={{ display: "inline-flex", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={s.paused}
                  onChange={(e) => s.setPaused(e.target.checked)}
                />
                pause
              </label>
              {s.paused && (
                <button onClick={() => (stepOnceRef.current = true)} style={btn}>
                  step ⏯ 1/120 s
                </button>
              )}
              <label style={{ display: "inline-flex", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={s.jogging}
                  onChange={(e) => s.setJogging(e.target.checked)}
                />
                jog
              </label>
              {s.jogging && (
                <button onClick={clearJog} style={btn}>
                  zero
                </button>
              )}
            </div>
            {s.jogging && (
              <div style={{ color: "#6b7686", marginTop: 4 }}>
                {s.selected ? `drag to jog ${s.selected.node}` : "select a part to jog its node"}
              </div>
            )}
          </>
        )}

        <div data-testid="generation-panel" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8fa3bf", flex: 1 }}>generation</span>
            <GenerationStatusBadge status={generationStatus} />
            <button
              data-testid="generation-run"
              onClick={() => void runGenerate()}
              disabled={generationBusy || !generationPrompt.trim()}
              style={{ ...btn, opacity: generationBusy || !generationPrompt.trim() ? 0.55 : 1 }}
            >
              generate
            </button>
          </div>
          <textarea
            data-testid="generation-prompt"
            value={generationPrompt}
            onChange={(event) => setGenerationPrompt(event.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="brief"
            style={textareaStyle}
          />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
            <label style={fieldLabel}>
              provider
              <select
                data-testid="generation-provider"
                value={generationProvider}
                onChange={(event) => setGenerationProvider(event.target.value as GenerationProvider)}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="template">template</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </label>
            <label style={fieldLabel}>
              archetype
              <select
                data-testid="generation-archetype"
                value={generationArchetype}
                onChange={(event) => setGenerationArchetype(event.target.value as GenerationArchetype | "")}
                style={{ ...selectStyle, width: "100%" }}
              >
                <option value="">auto</option>
                {GENERATION_ARCHETYPES.map((archetype) => (
                  <option key={archetype} value={archetype}>
                    {archetype}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ ...fieldLabel, gridColumn: "1 / -1" }}>
              categories
              <input
                data-testid="generation-categories"
                value={generationCategories}
                onChange={(event) => setGenerationCategories(event.target.value)}
                placeholder="motor, prop, battery"
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              limit
              <input
                data-testid="generation-limit"
                type="number"
                min={1}
                max={20}
                value={generationLimit}
                onChange={(event) => setGenerationLimit(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              repairs
              <input
                data-testid="generation-repairs"
                type="number"
                min={0}
                max={3}
                value={generationMaxRepairs}
                onChange={(event) => setGenerationMaxRepairs(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            <label style={fieldLabel}>
              seed
              <input
                data-testid="generation-seed"
                type="number"
                min={0}
                value={generationSeed}
                onChange={(event) => setGenerationSeed(Number(event.target.value))}
                style={inputStyle}
              />
            </label>
            {generationProvider === "anthropic" && (
              <label style={fieldLabel}>
                BYO key
                <input
                  data-testid="generation-anthropic-key"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={anthropicKey}
                  onChange={(event) => setAnthropicKey(event.target.value)}
                  placeholder="sk-ant-..."
                  style={inputStyle}
                />
              </label>
            )}
          </div>
          <div style={{ color: "#6b7686", marginTop: 5, wordBreak: "break-word" }}>
            {generationProvider === "anthropic"
              ? generationModelsError
                ? `models unavailable · ${generationModelsError}`
                : synthesisPin && repairPin
                  ? `synth ${synthesisPin.modelId} · repair ${repairPin.modelId}`
                  : "models loading…"
              : "template provider · approved catalog context still required"}
          </div>
          {generationError && (
            <div style={{ color: "#e66", marginTop: 5, wordBreak: "break-word" }}>
              gateway · {generationError}
            </div>
          )}
          {generationLoadMessage && (
            <div
              style={{
                color: generationLoadMessage.startsWith("load failed") ? "#e6a23c" : "#7dd87d",
                marginTop: 5,
                wordBreak: "break-word",
              }}
            >
              {generationLoadMessage}
            </div>
          )}
          {generationResult && (
            <div style={{ marginTop: 6 }}>
              <div style={{ color: "#6b7686" }}>
                {generationResult.context.retrievedComponents.length} approved rows · prefix{" "}
                {generationResult.context.promptPrefix.hash.slice(0, 8)}
              </div>
              {generationResult.blockedReasons.length > 0 && (
                <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                  {generationResult.blockedReasons.map((reason) => (
                    <li key={reason} style={{ color: "#e6a23c" }}>
                      {reason}
                    </li>
                  ))}
                </ul>
              )}
              <GenerationAttemptList attempts={generationResult.attempts} />
            </div>
          )}
        </div>

        <div data-testid="review-panel" style={{ borderTop: "1px solid #2a2f38", marginTop: 10, paddingTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#8fa3bf", flex: 1 }}>catalog review</span>
            <select
              data-testid="review-status-filter"
              value={reviewStatus}
              onChange={(e) => setReviewFilter(e.target.value as ReviewStatus)}
              style={selectStyle}
            >
              <option value="needs_review">pending</option>
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
            <button onClick={() => void refreshReviews(reviewStatus)} disabled={reviewBusy} style={btn}>
              refresh
            </button>
          </div>
          <div
            style={{
              marginTop: 6,
              maxHeight: 220,
              overflow: "auto",
              scrollbarWidth: "thin",
            }}
          >
            {reviewError ? (
              <div style={{ color: "#e6a23c" }}>gateway · {reviewError}</div>
            ) : reviewBusy && reviews.length === 0 ? (
              <div style={{ color: "#6b7686" }}>loading…</div>
            ) : reviews.length === 0 ? (
              <div style={{ color: "#6b7686" }}>0 rows</div>
            ) : (
              reviews.map((item) => (
                <ReviewItem
                  key={item.id}
                  item={item}
                  busy={reviewBusy}
                  reviewNote={reviewNotes[item.id] ?? ""}
                  exportPolicy={reviewExportPolicies[item.id] ?? defaultReviewExportPolicy(item)}
                  onNoteChange={(value) =>
                    setReviewNotes((current) => ({ ...current, [item.id]: value }))
                  }
                  onExportPolicyChange={(value) =>
                    setReviewExportPolicies((current) => ({ ...current, [item.id]: value }))
                  }
                  onApprove={() => void recordDecision(item.id, "approved")}
                  onReject={() => void recordDecision(item.id, "rejected")}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {hud && (
        <div
          style={{
            ...panel,
            ...(narrow
              ? { top: "calc(42vh + 24px)", left: 12, right: 12 }
              : { top: 12, right: 12, minWidth: 220 }),
          }}
        >
          <div style={{ color: "#8fa3bf", marginBottom: 4 }}>HUD — derived, never decorative</div>
          <Row k="AUW" v={`${hud.auwG.toFixed(0)} g`} />
          {hud.twr !== undefined && <Row k="TWR" v={hud.twr.toFixed(2)} />}
          {hud.hoverThrottle !== undefined && (
            <Row k="hover" v={`${(hud.hoverThrottle * 100).toFixed(0)} %`} />
          )}
          {hud.hoverCurrentA !== undefined && <Row k="I @ hover" v={`${hud.hoverCurrentA.toFixed(1)} A`} />}
          {hud.enduranceMin !== undefined && <Row k="endurance" v={`${hud.enduranceMin.toFixed(1)} min`} />}
          <details style={{ marginTop: 6, color: "#6b7686" }}>
            <summary>assumptions ({hud.assumptions.length})</summary>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {hud.assumptions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </details>
        </div>
      )}

      {s.selected && (
        <div style={{ ...panel, top: 220, right: 12, minWidth: 200 }}>
          <div style={{ color: "#8fa3bf" }}>selection</div>
          <Row k="part" v={`#${s.selected.partIndex}`} />
          <Row k="node" v={s.selected.node} />
          <Row k="material" v={s.selected.material} />
          <Row k="color" v={s.selected.color} />
          {s.lastDiff && (
            <div style={{ color: "#e6a23c", marginTop: 4 }}>Δ {s.lastDiff}</div>
          )}
          {/* configurator (P1-014): patch → re-bake in place via the handle */}
          <div style={{ color: "#8fa3bf", marginTop: 8 }}>configure (patch + re-bake)</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {SWATCHES.map((c) => (
              <button
                key={c}
                title={c}
                onClick={() =>
                  void applyPatch([
                    { op: "replace", path: `/parts/${s.selected!.partIndex}/color`, value: c },
                  ])
                }
                style={{
                  width: 18,
                  height: 18,
                  background: c,
                  border: c === s.selected!.color ? "2px solid #fff" : "1px solid #2a2f38",
                  cursor: "pointer",
                }}
              />
            ))}
          </div>
          <select
            value={s.selected.material}
            onChange={(e) =>
              void applyPatch([
                { op: "replace", path: `/parts/${s.selected!.partIndex}/material`, value: e.target.value },
              ])
            }
            style={{
              width: "100%",
              marginTop: 6,
              background: "#16181c",
              color: "#cfd6df",
              border: "1px solid #2a2f38",
            }}
          >
            {MATERIAL_CLASSES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {s.report && (
        <div
          style={{
            ...panel,
            bottom: 12,
            left: narrow ? 12 : 388,
            right: narrow ? 12 : undefined,
            maxWidth: narrow ? undefined : 460,
            maxHeight: 200,
            overflow: "auto",
          }}
        >
          <div style={{ color: s.report.verdict === "admitted" ? "#7dd87d" : "#e6a23c" }}>
            forge-validate {s.report.validatorVersion} · {s.report.target} → {s.report.verdict.toUpperCase()}
          </div>
          {s.report.results.length === 0 ? (
            <div style={{ color: "#6b7686" }}>0 errors · 0 warnings — gatekeeper clean</div>
          ) : (
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {[...s.report.results]
                .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "error" ? -1 : 1))
                .slice(0, 8)
                .map((d, i) => (
                  <li key={i} style={{ color: d.severity === "error" ? "#e66" : "#e6a23c" }}>
                    {d.check} — {d.message}
                  </li>
                ))}
              {s.report.results.length > 8 && (
                <li style={{ color: "#6b7686" }}>… +{s.report.results.length - 8} more</li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* perf overlay (P1-017): budgets are binding — render ≤ 6 ms · core
          tick ≤ 1.5 ms · ≤ 40 draw calls/model (architecture §7) */}
      <div
        style={{
          ...panel,
          bottom: 12,
          right: 12,
          color: "#6b7686",
          textAlign: "right",
          display: narrow ? "none" : undefined,
        }}
      >
        <div>{s.perf.fps} fps</div>
        <div>render {s.perf.frameMs.toFixed(1)} ms · core {s.perf.coreMs.toFixed(2)} ms</div>
        <div>{s.perf.drawCalls} draw calls</div>
      </div>
    </div>
  );
}

const btn: React.CSSProperties = {
  background: "#16181c",
  color: "#cfd6df",
  border: "1px solid #2a2f38",
  borderRadius: 4,
  fontSize: 11,
  cursor: "pointer",
};

const dangerBtn: React.CSSProperties = {
  ...btn,
  color: "#f0b0a8",
};

const selectStyle: React.CSSProperties = {
  background: "#16181c",
  color: "#cfd6df",
  border: "1px solid #2a2f38",
  borderRadius: 4,
  fontSize: 11,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  background: "#16181c",
  color: "#cfd6df",
  border: "1px solid #2a2f38",
  borderRadius: 4,
  fontSize: 11,
};

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  display: "block",
  marginTop: 6,
  resize: "vertical",
  minHeight: 58,
};

const fieldLabel: React.CSSProperties = {
  display: "block",
  color: "#6b7686",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: "#6b7686" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}

type GenerationStatus = GenerationResponse["verdict"] | "idle" | "running" | "error";

function GenerationStatusBadge({ status }: { status: GenerationStatus }) {
  return (
    <span
      data-testid="generation-status"
      style={{
        color: verdictColor(status),
        border: `1px solid ${verdictColor(status)}`,
        borderRadius: 4,
        padding: "0 5px",
        fontSize: 10,
        lineHeight: "16px",
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function GenerationAttemptList({ attempts }: { attempts: GenerationAttempt[] }) {
  if (attempts.length === 0) {
    return <div style={{ color: "#6b7686", marginTop: 4 }}>0 attempts</div>;
  }
  return (
    <div style={{ marginTop: 5, maxHeight: 170, overflow: "auto", scrollbarWidth: "thin" }}>
      {attempts.map((attempt) => {
        const usage = formatUsage(attempt.usage);
        return (
          <details
            key={`${attempt.index}-${attempt.contractHash}`}
            open={attempt.index === attempts.length - 1 || attempt.diagnostics.length > 0}
            style={{ borderTop: "1px solid #242a33", padding: "5px 0" }}
          >
            <summary style={{ color: verdictColor(attempt.verdict), cursor: "pointer" }}>
              #{attempt.index + 1} {attempt.phase} · {attempt.verdict}
            </summary>
            <div style={{ color: "#6b7686", wordBreak: "break-word" }}>
              {attempt.modelId} · {attempt.contractHash.slice(0, 10)}
              {attempt.stopReason ? ` · ${attempt.stopReason}` : ""}
            </div>
            {usage && <div style={{ color: "#6b7686" }}>{usage}</div>}
            {attempt.diagnostics.length === 0 ? (
              <div style={{ color: "#6b7686" }}>0 diagnostics</div>
            ) : (
              <ul style={{ margin: "3px 0 0 16px", padding: 0 }}>
                {attempt.diagnostics.slice(0, 4).map((diagnostic, index) => (
                  <li
                    key={`${diagnostic.check ?? "diagnostic"}-${index}`}
                    style={{ color: diagnostic.severity === "error" ? "#e66" : "#e6a23c" }}
                  >
                    {diagnostic.check ?? "diagnostic"} — {diagnostic.message ?? diagnostic.severity ?? "reported"}
                  </li>
                ))}
                {attempt.diagnostics.length > 4 && (
                  <li style={{ color: "#6b7686" }}>… +{attempt.diagnostics.length - 4} more</li>
                )}
              </ul>
            )}
          </details>
        );
      })}
    </div>
  );
}

function verdictColor(verdict: string): string {
  switch (verdict) {
    case "admitted":
      return "#7dd87d";
    case "draft":
    case "blocked":
      return "#e6a23c";
    case "rejected":
    case "error":
      return "#e66";
    case "running":
      return "#39c8ff";
    default:
      return "#6b7686";
  }
}

function formatUsage(usage: unknown): string | null {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const record = usage as Record<string, unknown>;
  const input = record.input_tokens;
  const output = record.output_tokens;
  if (typeof input === "number" && typeof output === "number") {
    return `${input} in · ${output} out tokens`;
  }
  const parts = Object.entries(record)
    .filter((entry): entry is [string, string | number] =>
      typeof entry[1] === "string" || typeof entry[1] === "number",
    )
    .slice(0, 3)
    .map(([key, value]) => `${key} ${value}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function parseCategories(value: string): string[] {
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))].sort();
}

function boundedInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

function ReviewItem({
  item,
  busy,
  reviewNote,
  exportPolicy,
  onNoteChange,
  onExportPolicyChange,
  onApprove,
  onReject,
}: {
  item: ReviewQueueItem;
  busy: boolean;
  reviewNote: string;
  exportPolicy: ReviewExportPolicy;
  onNoteChange: (value: string) => void;
  onExportPolicyChange: (value: ReviewExportPolicy) => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const label = reviewLabel(item);
  return (
    <div data-testid={`review-item-${item.id}`} style={{ borderTop: "1px solid #242a33", padding: "7px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span style={{ color: "#cfd6df", wordBreak: "break-word" }}>{label}</span>
        <span style={{ color: item.confidence < 0.8 ? "#e6a23c" : "#7dd87d" }}>
          {Math.round(item.confidence * 100)}%
        </span>
      </div>
      <div style={{ color: "#6b7686", wordBreak: "break-word" }}>
        {item.artifactKind} · {item.reason}
      </div>
      <div style={{ color: "#6b7686", wordBreak: "break-word" }}>{item.artifactId}</div>
      {item.status === "needs_review" ? (
        <>
          <select
            data-testid={`review-policy-${item.id}`}
            value={exportPolicy}
            onChange={(event) => onExportPolicyChange(event.target.value as ReviewExportPolicy)}
            style={{ ...selectStyle, width: "100%", marginTop: 5 }}
          >
            {REVIEW_EXPORT_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {policy}
              </option>
            ))}
          </select>
          <textarea
            data-testid={`review-note-${item.id}`}
            value={reviewNote}
            onChange={(event) => onNoteChange(event.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="review note"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginTop: 5,
              resize: "vertical",
              background: "#16181c",
              color: "#cfd6df",
              border: "1px solid #2a2f38",
              borderRadius: 4,
              fontSize: 11,
            }}
          />
          <div style={{ display: "flex", gap: 6, marginTop: 5 }}>
            <button data-testid={`review-approve-${item.id}`} onClick={onApprove} disabled={busy} style={btn}>
              approve
            </button>
            <button data-testid={`review-reject-${item.id}`} onClick={onReject} disabled={busy} style={dangerBtn}>
              reject
            </button>
          </div>
        </>
      ) : (
        <div style={{ color: "#6b7686", marginTop: 5 }}>
          {item.status}
          {item.reviewer ? ` · ${item.reviewer}` : ""}
          {item.exportPolicy ? ` · ${item.exportPolicy}` : ""}
          {item.reviewNote ? <div style={{ wordBreak: "break-word" }}>{item.reviewNote}</div> : null}
        </div>
      )}
    </div>
  );
}

function defaultReviewExportPolicy(item?: ReviewQueueItem): ReviewExportPolicy {
  if (item?.payload && typeof item.payload === "object") {
    const payload = item.payload as { license?: { exportPolicy?: unknown } };
    const policy = payload.license?.exportPolicy;
    if (typeof policy === "string" && REVIEW_EXPORT_POLICIES.includes(policy as ReviewExportPolicy)) {
      return policy as ReviewExportPolicy;
    }
  }
  return item?.artifactKind === "reference-rig" ? "assembly-policy-derived" : "envelope-link-out";
}

function reviewLabel(item: ReviewQueueItem): string {
  if (item.payload && typeof item.payload === "object") {
    const payload = item.payload as {
      brand?: unknown;
      model?: unknown;
      name?: unknown;
      id?: unknown;
    };
    if (typeof payload.name === "string") return payload.name;
    if (typeof payload.brand === "string" && typeof payload.model === "string") {
      return `${payload.brand} ${payload.model}`;
    }
    if (typeof payload.id === "string") return payload.id;
  }
  return item.artifactId;
}
