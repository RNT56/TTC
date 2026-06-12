import { useCallback, useEffect, useRef } from "react";
import { StudioScene } from "./scene";
import { DEMO_MODELS, useStudio } from "./store";
import type { MaterialClass } from "./types";
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

  /** Load a contract end to end: bake handle + scene + session + report. */
  const loadContract = useCallback(async (contract: string) => {
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
    const report = await coreValidate(contract);
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

  /** Configurator (P1-014): JSON-Patch the live handle, re-bake in place —
   * explode, camera, drive state and selection all survive the rebuild. */
  const applyPatch = useCallback(async (ops: { op: string; path: string; value: unknown }[]) => {
    const handle = bakeRef.current;
    const scene = sceneRef.current;
    if (!handle || !scene) return;
    const st = useStudio.getState();
    const selected = st.selected;
    const artifact = handle.patch(JSON.stringify(ops));
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
    scene.onFrame = (dt) => {
      const st = useStudio.getState();
      fpsAccum += dt;
      fpsCount += 1;
      if (st.driving && sessionRef.current) {
        const stepDt = st.paused ? (stepOnceRef.current ? DT : 0) : dt;
        stepOnceRef.current = false;
        const t0 = performance.now();
        if (stepDt > 0) {
          sessionRef.current.step(stepDt, {
            throttle: st.throttle,
            pitch: 0,
            roll: 0,
            yaw: 0,
            drive: st.drive,
            turn: 0,
          });
        }
        // zero-copy view, consumed synchronously (P1-005)
        scene.setPose(sessionRef.current.nodeNames, sessionRef.current.poseView());
        coreAccum += performance.now() - t0;
        // follow camera (P1-013): orbit target eases toward the driver
        if (!st.paused) scene.followFocus(sessionRef.current.focus(), dt);
      }
      if (fpsAccum >= 0.5) {
        const stats = scene.stats();
        st.setPerf({
          fps: Math.round(fpsCount / fpsAccum),
          frameMs: stats.frameMs,
          drawCalls: stats.drawCalls,
          coreMs: coreAccum / fpsCount,
        });
        fpsAccum = 0;
        fpsCount = 0;
        coreAccum = 0;
      }
    };
    scene.start();
    void loadDemo(useStudio.getState().modelId);

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
      stats: () => scene.stats(),
      loaded: () => Boolean(useStudio.getState().artifact),
    };

    return () => {
      window.removeEventListener("resize", onResize);
      sessionRef.current?.dispose();
      bakeRef.current?.dispose();
      scene.dispose();
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

  const hud = s.artifact?.hud;
  const isMultirotor = hud?.twr !== undefined;
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

      <div style={{ ...panel, top: 12, left: 12, minWidth: 230 }}>
        <div style={{ color: "#8fa3bf", marginBottom: 6 }}>FORGE STUDIO</div>
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

        <label style={{ display: "block", marginTop: 8 }}>
          explode
          <input
            type="range" min={0} max={1} step={0.001} value={s.explode}
            onChange={(e) => s.setExplode(Number(e.target.value))}
            style={{ width: "100%", display: "block" }}
          />
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
      </div>

      {hud && (
        <div style={{ ...panel, top: 12, right: 12, minWidth: 220 }}>
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
        <div style={{ ...panel, bottom: 12, left: 12, maxWidth: 460 }}>
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
      <div style={{ ...panel, bottom: 12, right: 12, color: "#6b7686", textAlign: "right" }}>
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

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
      <span style={{ color: "#6b7686" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
