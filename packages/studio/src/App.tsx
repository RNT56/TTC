import { useCallback, useEffect, useRef } from "react";
import { StudioScene } from "./scene";
import { DEMO_MODELS, useStudio } from "./store";
import type { BakeArtifact, Report } from "./types";
import { coreBake, CoreSession, coreValidate } from "./wasm";

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(13,15,18,0.88)",
  border: "1px solid #2a2f38",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.5,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const sessionRef = useRef<CoreSession | null>(null);
  const s = useStudio();

  const loadModel = useCallback(
    async (artifact: BakeArtifact, report: Report | null, contractJson: string | null) => {
      sceneRef.current?.load(artifact);
      sessionRef.current?.dispose();
      sessionRef.current = null;
      if (contractJson) {
        try {
          sessionRef.current = await CoreSession.create(contractJson);
        } catch {
          sessionRef.current = null; // archetypes without a v0 driver stay static
        }
      }
      useStudio.getState().setLoaded(artifact, report, contractJson);
    },
    [],
  );

  const loadDemo = useCallback(
    async (id: string) => {
      const [artifact, report, contract] = await Promise.all([
        fetch(`/demo/${id}.bake.json`).then((r) => r.json() as Promise<BakeArtifact>),
        fetch(`/demo/${id}.report.json`).then((r) => r.json() as Promise<Report>),
        fetch(`/demo/${id}.forge.json`).then((r) => r.text()),
      ]);
      await loadModel(artifact, report, contract);
    },
    [loadModel],
  );

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
    scene.onFrame = (dt) => {
      const st = useStudio.getState();
      fpsAccum += dt;
      fpsCount += 1;
      if (fpsAccum >= 0.5) {
        st.setFps(Math.round(fpsCount / fpsAccum));
        fpsAccum = 0;
        fpsCount = 0;
      }
      if (st.driving && sessionRef.current) {
        const buf = sessionRef.current.step(dt, {
          throttle: st.throttle,
          pitch: 0,
          roll: 0,
          yaw: 0,
          drive: st.drive,
          turn: 0,
        });
        scene.setPose(sessionRef.current.nodeNames, buf);
      }
    };
    scene.start();
    void loadDemo(useStudio.getState().modelId);

    return () => {
      window.removeEventListener("resize", onResize);
      sessionRef.current?.dispose();
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
        const artifact = await coreBake(text);
        await loadModel(artifact, report, text);
      } else {
        useStudio.getState().setLoaded(
          useStudio.getState().artifact ?? ({} as BakeArtifact),
          report,
          null,
        );
      }
    };
    const onDrag = (e: DragEvent) => e.preventDefault();
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragover", onDrag);
    return () => {
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragover", onDrag);
    };
  }, [loadModel]);

  useEffect(() => {
    sceneRef.current?.setExplode(s.explode);
  }, [s.explode, s.artifact]);
  useEffect(() => {
    sceneRef.current?.setBlueprint(s.blueprint);
  }, [s.blueprint]);

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pick = sceneRef.current?.pick(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    s.setSelected(pick ?? null);
  };

  const hud = s.artifact?.hud;
  const isMultirotor = hud?.twr !== undefined;
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
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
        <div style={{ ...panel, top: 220, right: 12, minWidth: 180 }}>
          <div style={{ color: "#8fa3bf" }}>selection</div>
          <Row k="part" v={`#${s.selected.partIndex}`} />
          <Row k="node" v={s.selected.node} />
          <Row k="material" v={s.selected.material} />
          <Row k="color" v={s.selected.color} />
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

      <div style={{ ...panel, bottom: 12, right: 12, color: "#6b7686" }}>{s.fps} fps</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: "#6b7686" }}>{k}</span>
      <span>{v}</span>
    </div>
  );
}
