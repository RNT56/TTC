import { useEffect, useRef } from "react";
import { StudioScene } from "./scene";
import { useStudio } from "./store";
import type { BakeArtifact, Report } from "./types";

const panel: React.CSSProperties = {
  position: "absolute",
  background: "rgba(13,15,18,0.85)",
  border: "1px solid #2a2f38",
  borderRadius: 6,
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.5,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<StudioScene | null>(null);
  const { artifact, report, explode, setArtifact, setReport, setExplode } = useStudio();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = new StudioScene(canvas);
    sceneRef.current = scene;
    const onResize = () =>
      scene.resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    onResize();
    window.addEventListener("resize", onResize);
    scene.start();

    void fetch("/demo/vx2-mini.bake.json")
      .then((r) => r.json())
      .then((a: BakeArtifact) => {
        scene.load(a);
        setArtifact(a);
      });
    void fetch("/demo/vx2-mini.report.json")
      .then((r) => r.json())
      .then((r: Report) => setReport(r));

    return () => {
      window.removeEventListener("resize", onResize);
      scene.dispose();
    };
  }, [setArtifact, setReport]);

  useEffect(() => {
    sceneRef.current?.setExplode(explode);
  }, [explode, artifact]);

  const hud = artifact?.hud;
  return (
    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
      <canvas ref={canvasRef} style={{ width: "100%", height: "100%", display: "block" }} />

      <div style={{ ...panel, top: 12, left: 12 }}>
        <div style={{ color: "#8fa3bf", marginBottom: 4 }}>FORGE STUDIO · v0 artifact viewer</div>
        {artifact ? (
          <>
            <div>{artifact.counts.parts} parts · {artifact.counts.faces} faces</div>
            <div style={{ color: "#6b7686" }}>contract {artifact.contractHash.slice(0, 12)}…</div>
          </>
        ) : (
          <div>loading bake…</div>
        )}
        <label style={{ display: "block", marginTop: 8 }}>
          explode
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={explode}
            onChange={(e) => setExplode(Number(e.target.value))}
            style={{ width: 180, display: "block" }}
          />
        </label>
      </div>

      {hud && (
        <div style={{ ...panel, top: 12, right: 12, minWidth: 220 }}>
          <div style={{ color: "#8fa3bf", marginBottom: 4 }}>HUD — derived, never decorative</div>
          <Row k="AUW" v={`${hud.auwG.toFixed(0)} g`} />
          {hud.twr !== undefined && <Row k="TWR" v={hud.twr.toFixed(2)} />}
          {hud.hoverThrottle !== undefined && (
            <Row k="hover" v={`${(hud.hoverThrottle * 100).toFixed(0)} %`} />
          )}
          {hud.hoverCurrentA !== undefined && (
            <Row k="I @ hover" v={`${hud.hoverCurrentA.toFixed(1)} A`} />
          )}
          {hud.enduranceMin !== undefined && (
            <Row k="endurance" v={`${hud.enduranceMin.toFixed(1)} min`} />
          )}
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

      {report && (
        <div style={{ ...panel, bottom: 12, left: 12, maxWidth: 420 }}>
          <div style={{ color: report.verdict === "admitted" ? "#7dd87d" : "#e6a23c" }}>
            forge-validate {report.validatorVersion} · {report.target} → {report.verdict.toUpperCase()}
          </div>
          {report.results.length === 0 ? (
            <div style={{ color: "#6b7686" }}>0 errors · 0 warnings — gatekeeper clean</div>
          ) : (
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {report.results.map((d, i) => (
                <li key={i} style={{ color: d.severity === "error" ? "#e66" : "#e6a23c" }}>
                  {d.check} — {d.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
