import type {
  CameraPose,
  PartPick,
  QualityTier,
  SceneController,
  SceneQualityState,
} from "./sceneController";
import type { BakeArtifact, BakedPart } from "./types";

interface ProjectedPart {
  pick: PartPick;
  x: number;
  y: number;
  radius: number;
  depth: number;
}

/** Dependency-light viewer-grade fallback. It consumes the same core-baked truth
 * as StudioScene, but projects part centers onto Canvas2D so a failing software
 * WebGL stack cannot block validation, configuration, or accessible interaction. */
export class ViewerScene implements SceneController {
  onFrame?: (dt: number) => void;
  private readonly context: CanvasRenderingContext2D | null;
  private artifact: BakeArtifact | null = null;
  private projected: ProjectedPart[] = [];
  private poseMatrices = new Map<string, number[]>();
  private selected: number | null = null;
  private explode = 0;
  private blueprint = false;
  private yaw = 0.7;
  private elevation = 0.55;
  private distance = 1;
  private target: [number, number, number] = [0, 0.1, 0];
  private width = 300;
  private height = 150;
  private gridVisible = true;
  private controlsEnabled = true;
  private disposed = false;
  private lastFrameMs = 0;
  private drawCalls = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.context = canvas.getContext("2d", { alpha: false });
  }

  load(artifact: BakeArtifact): void {
    this.artifact = artifact;
    this.poseMatrices.clear();
    this.render();
  }

  setPose(names: string[], buffer: Float32Array): void {
    names.forEach((name, index) => {
      this.poseMatrices.set(name, Array.from(buffer.subarray(index * 16, index * 16 + 16)));
    });
    this.render();
  }

  setExplode(t: number): void {
    this.explode = Math.max(0, Math.min(1, t));
    this.render();
  }

  setBlueprint(on: boolean): void {
    this.blueprint = on;
    this.render();
  }

  pick(ndcX: number, ndcY: number): PartPick | null {
    const x = ((ndcX + 1) / 2) * this.width;
    const y = ((1 - ndcY) / 2) * this.height;
    const nearest = this.projected
      .map((part) => ({ part, distance: Math.hypot(part.x - x, part.y - y) }))
      .filter(({ part, distance }) => distance <= Math.max(12, part.radius))
      .sort((left, right) => left.distance - right.distance)[0];
    return nearest?.part.pick ?? null;
  }

  setSelected(partIndex: number | null): void {
    this.selected = partIndex;
    this.render();
  }

  setCameraPose(pose: CameraPose): void {
    this.yaw = pose.yaw;
    this.elevation = pose.el;
    this.distance = Math.max(0.08, pose.dist);
    this.target = [...pose.target];
    this.render();
  }

  nudgeCamera(azimuthRad: number, elevationRad: number, zoomFactor = 1): void {
    if (!this.controlsEnabled) return;
    this.yaw += azimuthRad;
    this.elevation = Math.max(-1.45, Math.min(1.45, this.elevation + elevationRad));
    this.distance = Math.max(0.08, Math.min(20, this.distance * zoomFactor));
    this.render();
  }

  cameraState(): { position: [number, number, number]; target: [number, number, number] } {
    const ce = Math.cos(this.elevation);
    return {
      position: [
        this.target[0] + this.distance * ce * Math.sin(this.yaw),
        this.target[1] + this.distance * Math.sin(this.elevation),
        this.target[2] + this.distance * ce * Math.cos(this.yaw),
      ],
      target: [...this.target],
    };
  }

  setReducedMotion(_reduced: boolean): void {}

  setGridVisible(visible: boolean): void {
    this.gridVisible = visible;
    this.render();
  }

  setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
  }

  setShadowsVisible(_visible: boolean): void {}

  followFocus(focus: [number, number, number], dt: number): void {
    const k = Math.min(1, dt * 5);
    this.target = [
      this.target[0] + (focus[0] - this.target[0]) * k,
      this.target[1] + (focus[1] - this.target[1]) * k,
      this.target[2] + (focus[2] - this.target[2]) * k,
    ];
    this.render();
  }

  setTier(_tier: QualityTier): void {
    // The viewer-grade implementation is intentionally fixed to the low tier.
  }

  qualityState(): SceneQualityState {
    return { tier: "low", renderer: "schematic-2d", advancedEffectsInitialized: false };
  }

  stats(): { drawCalls: number; triangles: number; frameMs: number } {
    return {
      drawCalls: this.drawCalls,
      triangles: this.artifact?.counts.faces ?? 0,
      frameMs: this.lastFrameMs,
    };
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(this.width * dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * dpr));
    this.context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  start(): void {
    let last = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      this.onFrame?.(Math.min((now - last) / 1000, 0.1));
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    this.projected = [];
  }

  private partCenter(part: BakedPart): [number, number, number] {
    const positions = part.mesh.positions;
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    for (let index = 0; index + 2 < positions.length; index += 3) {
      minX = Math.min(minX, positions[index] ?? 0);
      minY = Math.min(minY, positions[index + 1] ?? 0);
      minZ = Math.min(minZ, positions[index + 2] ?? 0);
      maxX = Math.max(maxX, positions[index] ?? 0);
      maxY = Math.max(maxY, positions[index + 1] ?? 0);
      maxZ = Math.max(maxZ, positions[index + 2] ?? 0);
    }
    const local: [number, number, number] = Number.isFinite(minX)
      ? [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2]
      : [0, 0, 0];
    const matrix = this.poseMatrices.get(part.node) ?? this.artifact?.baked.node_world[part.node];
    if (!matrix || matrix.length < 16) return local;
    const world: [number, number, number] = [
      (matrix[0] ?? 1) * local[0] + (matrix[4] ?? 0) * local[1] + (matrix[8] ?? 0) * local[2] + (matrix[12] ?? 0),
      (matrix[1] ?? 0) * local[0] + (matrix[5] ?? 1) * local[1] + (matrix[9] ?? 0) * local[2] + (matrix[13] ?? 0),
      (matrix[2] ?? 0) * local[0] + (matrix[6] ?? 0) * local[1] + (matrix[10] ?? 1) * local[2] + (matrix[14] ?? 0),
    ];
    if (part.explode && this.explode > 0) {
      const { dir, mag, t0, t1 } = part.explode;
      const fraction = Math.min(Math.max((this.explode - t0) / Math.max(t1 - t0, 1e-6), 0), 1);
      world[0] += dir[0] * mag * fraction;
      world[1] += dir[1] * mag * fraction;
      world[2] += dir[2] * mag * fraction;
    }
    return world;
  }

  private render(): void {
    const started = performance.now();
    const context = this.context;
    const artifact = this.artifact;
    if (!context) {
      this.drawCalls = 0;
      return;
    }
    const background = this.blueprint ? "#0a1a2f" : "#0d0f12";
    context.fillStyle = background;
    context.fillRect(0, 0, this.width, this.height);
    if (this.gridVisible) {
      context.strokeStyle = this.blueprint ? "#173a5c" : "#20262f";
      context.lineWidth = 1;
      const spacing = 32;
      for (let x = 0; x <= this.width; x += spacing) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, this.height);
        context.stroke();
      }
      for (let y = 0; y <= this.height; y += spacing) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(this.width, y);
        context.stroke();
      }
    }
    if (!artifact) {
      this.drawCalls = 0;
      return;
    }
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const ce = Math.cos(this.elevation);
    const se = Math.sin(this.elevation);
    const scale = (Math.min(this.width, this.height) * 0.42) / Math.max(this.distance, 0.08);
    this.projected = artifact.baked.parts.map((part) => {
      const [worldX, worldY, worldZ] = this.partCenter(part);
      const dx = worldX - this.target[0];
      const dy = worldY - this.target[1];
      const dz = worldZ - this.target[2];
      const rotatedX = cy * dx - sy * dz;
      const yawDepth = sy * dx + cy * dz;
      const rotatedY = ce * dy - se * yawDepth;
      const depth = se * dy + ce * yawDepth;
      const radius = Math.max(4, Math.min(14, Math.sqrt(Math.max(1, part.triangles ?? 1)) * 0.8));
      return {
        pick: {
          partIndex: part.part_index,
          sourcePath: part.source_path,
          node: part.node,
          material: part.material,
          color: part.color,
        },
        x: this.width / 2 + rotatedX * scale,
        y: this.height / 2 - rotatedY * scale,
        radius,
        depth,
      };
    }).sort((left, right) => left.depth - right.depth);
    for (const part of this.projected) {
      context.beginPath();
      context.arc(part.x, part.y, part.radius, 0, Math.PI * 2);
      if (this.blueprint) {
        context.strokeStyle = part.pick.partIndex === this.selected ? "#ffffff" : "#9fd4ff";
        context.lineWidth = part.pick.partIndex === this.selected ? 3 : 1.5;
        context.stroke();
      } else {
        context.fillStyle = part.pick.color;
        context.fill();
        context.strokeStyle = part.pick.partIndex === this.selected ? "#39c8ff" : "#cfd6df";
        context.lineWidth = part.pick.partIndex === this.selected ? 3 : 1;
        context.stroke();
      }
    }
    context.fillStyle = this.blueprint ? "#9fd4ff" : "#8fa3bf";
    context.font = "12px system-ui, sans-serif";
    context.fillText("viewer-grade schematic · core-baked part centers", 12, this.height - 14);
    this.drawCalls = this.projected.length;
    this.lastFrameMs = performance.now() - started;
  }
}
