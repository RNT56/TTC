// The Three.js render layer — a thin consumer of core-baked buffers (D16).
// No geometry math here: buffers and node transforms come from the core's bake;
// pose updates come from the core's tick; this file uploads, composes explode
// offsets, and draws.
//
// P1-008: parts are batched into ONE BatchedMesh per material class (≤ 5
// batches per model — hrx7 draws in ~8 calls instead of ~130), per-instance
// color + matrix. P1-010: blueprint line work is a full-screen normal/depth
// edge pass over the flat render (no per-part edge objects). P1-012: the
// selection outline is an inverted-hull ghost of the picked part's geometry.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { N8AOPass } from "n8ao";
import { classMaterialFor } from "./materials";
import type { BakeArtifact, BakedPart, MaterialClass } from "./types";

/** XC-22 quality ladder (P1-016): what each tier turns on. */
export type QualityTier = "high" | "medium" | "low";

export interface PartPick {
  partIndex: number;
  sourcePath: string;
  node: string;
  material: string;
  color: string;
}

interface PartHandle {
  batch: THREE.BatchedMesh;
  instanceId: number;
  node: string;
  partIndex: number;
  sourcePath: string;
  material: string;
  color: string;
  explode?: BakedPart["explode"];
  /** current node transform (bake static or live tick pose) */
  nodeWorld: THREE.Matrix4;
  nodeRotation: THREE.Matrix4;
  /** retained for the outline ghost (the batch owns the GPU copy) */
  geometry: THREE.BufferGeometry;
  /** final composed matrix (explode × pose), what the batch draws */
  finalMatrix: THREE.Matrix4;
}

const BLUEPRINT_BG = new THREE.Color(0x0a1a2f);
const NORMAL_BG = new THREE.Color(0x0d0f12);

/** Full-screen edge overlay (P1-010): Sobel-ish discontinuity detection over
 * a view-normal + depth target, drawn as transparent line work. */
const EDGE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const EDGE_FRAG = /* glsl */ `
  uniform sampler2D tNormal;
  uniform sampler2D tDepth;
  uniform vec2 resolution;
  uniform float cameraNear;
  uniform float cameraFar;
  uniform vec3 lineColor;
  varying vec2 vUv;

  float viewZ(vec2 uv) {
    float d = texture2D(tDepth, uv).x;
    return (cameraNear * cameraFar) / ((cameraFar - cameraNear) * d - cameraFar);
  }

  void main() {
    vec2 px = 1.0 / resolution;
    vec3 n0 = texture2D(tNormal, vUv).xyz;
    vec3 nx = texture2D(tNormal, vUv + vec2(px.x, 0.0)).xyz;
    vec3 ny = texture2D(tNormal, vUv + vec2(0.0, px.y)).xyz;
    float nEdge = length(n0 - nx) + length(n0 - ny);

    float z0 = viewZ(vUv);
    float zx = viewZ(vUv + vec2(px.x, 0.0));
    float zy = viewZ(vUv + vec2(0.0, px.y));
    // depth discontinuity relative to distance (silhouettes at any range)
    float dEdge = (abs(z0 - zx) + abs(z0 - zy)) / max(abs(z0), 1e-4);

    float edge = max(step(0.45, nEdge), step(0.02, dEdge));
    if (edge < 0.5) discard;
    gl_FragColor = vec4(lineColor, 0.9);
  }
`;

export class StudioScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private parts: PartHandle[] = [];
  private batches: THREE.BatchedMesh[] = [];
  private raycaster = new THREE.Raycaster();
  private disposed = false;
  private explodeT = 0;
  private blueprint = false;
  private blueprintMat = new THREE.MeshBasicMaterial({ color: 0x10263f });
  private grid: THREE.GridHelper;
  private ground: THREE.Mesh;
  private leaders!: THREE.LineSegments;
  private selected: number | null = null;
  private outline: THREE.Mesh;
  private outlineMaterial!: THREE.ShaderMaterial;
  // blueprint post pass
  private normalTarget: THREE.WebGLRenderTarget | null = null;
  private normalOverride = new THREE.MeshNormalMaterial();
  private edgeQuad: THREE.Mesh;
  private edgeMaterial: THREE.ShaderMaterial;
  private edgeScene = new THREE.Scene();
  private edgeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  // AO + quality tiers (P1-016 / XC-22)
  private composer: EffectComposer;
  private aoPass: N8AOPass;
  private tier: QualityTier = "high";
  /** last render frame duration, ms (perf overlay, P1-017) */
  lastFrameMs = 0;
  onFrame?: (dt: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = NORMAL_BG;

    // near plane 0.01 (was 0.001): the models live at 0.4–5 m — this buys
    // 10× depth precision, the z-buffer half of "shimmer gone"
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 50);
    this.camera.position.set(0.45, 0.35, 0.55);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.1, 0);
    this.controls.enableDamping = true;

    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(0.6, 1.2, 0.4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 0.01;
    key.shadow.camera.far = 5;
    const hemi = new THREE.HemisphereLight(0x6b86b8, 0x4a3c2e, 0.9);
    const bounce = new THREE.DirectionalLight(0xffe2c4, 0.5);
    bounce.position.set(-0.4, -0.2, -0.5);
    this.scene.add(key, hemi, bounce);

    this.grid = new THREE.GridHelper(1.6, 32, 0x2a2f38, 0x1a1e24);
    this.scene.add(this.grid);

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3, 3),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // ALL leader lines live in one LineSegments (P1-011 under the P1-008
    // draw-call budget): pairs rebuilt whenever explode/pose changes
    this.leaders = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0x8fa3bf, dashSize: 0.01, gapSize: 0.006 }),
    );
    this.leaders.frustumCulled = false;
    this.leaders.visible = false;
    this.scene.add(this.leaders);

    // info accounting is per-frame (multiple passes in blueprint mode)
    this.renderer.info.autoReset = false;

    // selection outline: inverted hull — the picked part's geometry, back
    // faces only, inflated along the normal in the vertex stage; the inflate
    // distance scales with camera range so the rim stays ~2 px
    this.outlineMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        inflate: { value: 0.002 },
        color: { value: new THREE.Color(0x39c8ff) },
      },
      vertexShader: /* glsl */ `
        uniform float inflate;
        void main() {
          vec3 p = position + normalize(normal) * inflate;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 color;
        void main() { gl_FragColor = vec4(color, 1.0); }
      `,
    });
    this.outline = new THREE.Mesh(new THREE.BufferGeometry(), this.outlineMaterial);
    this.outline.matrixAutoUpdate = false;
    this.outline.visible = false;
    this.scene.add(this.outline);

    this.edgeMaterial = new THREE.ShaderMaterial({
      vertexShader: EDGE_VERT,
      fragmentShader: EDGE_FRAG,
      uniforms: {
        tNormal: { value: null },
        tDepth: { value: null },
        resolution: { value: new THREE.Vector2(1, 1) },
        cameraNear: { value: this.camera.near },
        cameraFar: { value: this.camera.far },
        lineColor: { value: new THREE.Color(0x9fd4ff) },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.edgeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.edgeMaterial);
    this.edgeScene.add(this.edgeQuad);

    // shaded pipeline: render → N8AO → output (blueprint keeps its own path)
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.aoPass = new N8AOPass(this.scene, this.camera);
    this.aoPass.configuration.gammaCorrection = false; // OutputPass owns color space
    this.aoPass.configuration.aoRadius = 0.08; // model scale is 0.4–2 m
    this.aoPass.configuration.distanceFalloff = 0.4;
    this.composer.addPass(this.aoPass);
    this.composer.addPass(new OutputPass());
  }

  /** XC-22 ladder: AO quality → shadows → pixel ratio. */
  setTier(tier: QualityTier): void {
    this.tier = tier;
    const dpr = window.devicePixelRatio || 1;
    if (tier === "high") {
      this.aoPass.enabled = true;
      this.aoPass.configuration.halfRes = false;
      this.renderer.setPixelRatio(Math.min(dpr, 2));
    } else if (tier === "medium") {
      this.aoPass.enabled = true;
      this.aoPass.configuration.halfRes = true;
      this.renderer.setPixelRatio(Math.min(dpr, 1.5));
    } else {
      this.aoPass.enabled = false;
      this.renderer.setPixelRatio(1);
    }
    // pixel ratio changes the drawing-buffer size
    const size = this.renderer.getSize(new THREE.Vector2());
    this.resize(size.x, size.y);
  }

  getTier(): QualityTier {
    return this.tier;
  }

  /** Upload the core's bake artifact. Zero client-side geometry computation. */
  load(artifact: BakeArtifact): void {
    for (const h of this.parts) {
      h.geometry.dispose();
    }
    for (const b of this.batches) {
      this.scene.remove(b);
      b.dispose();
    }
    this.parts = [];
    this.batches = [];
    this.selected = null;
    this.outline.visible = false;
    this.leaders.visible = false;

    // group parts by material class → one BatchedMesh per class (P1-008)
    const byClass = new Map<MaterialClass, BakedPart[]>();
    for (const part of artifact.baked.parts) {
      const list = byClass.get(part.material) ?? [];
      list.push(part);
      byClass.set(part.material, list);
    }

    for (const [cls, list] of byClass) {
      let maxVerts = 0;
      let maxIndices = 0;
      for (const p of list) {
        maxVerts += p.mesh.positions.length / 3;
        maxIndices += p.mesh.indices.length;
      }
      const batch = new THREE.BatchedMesh(list.length, maxVerts, maxIndices, classMaterialFor(cls));
      batch.castShadow = true;
      batch.receiveShadow = true;
      batch.userData.blueprintHidden = false;
      this.scene.add(batch);
      this.batches.push(batch);

      const color = new THREE.Color();
      for (const part of list) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(part.mesh.positions, 3));
        geometry.setAttribute("normal", new THREE.BufferAttribute(part.mesh.normals, 3));
        geometry.setIndex(new THREE.BufferAttribute(part.mesh.indices, 1));

        const geometryId = batch.addGeometry(geometry);
        const instanceId = batch.addInstance(geometryId);
        batch.setColorAt(instanceId, color.set(part.color));

        const world = artifact.baked.node_world[part.node];
        const nodeWorld = new THREE.Matrix4();
        if (world && world.length === 16) nodeWorld.fromArray(world);

        const handle: PartHandle = {
          batch,
          instanceId,
          node: part.node,
          partIndex: part.part_index,
          sourcePath: part.source_path,
          material: part.material,
          color: part.color,
          explode: part.explode,
          nodeWorld,
          nodeRotation: new THREE.Matrix4().extractRotation(nodeWorld),
          geometry,
          finalMatrix: new THREE.Matrix4().copy(nodeWorld),
        };
        this.parts.push(handle);
      }
    }
    this.parts.sort((a, b) => a.partIndex - b.partIndex);
    this.applyBlueprint();
    this.updateMatrices();
  }

  /** Live pose from the core tick: 16 f32 per node in `names` order. */
  setPose(names: string[], buffer: Float32Array): void {
    const byName = new Map<string, number>();
    names.forEach((n, i) => byName.set(n, i));
    for (const h of this.parts) {
      const i = byName.get(h.node);
      if (i === undefined) continue;
      h.nodeWorld.fromArray(buffer, i * 16);
      h.nodeRotation.extractRotation(h.nodeWorld);
    }
    this.updateMatrices();
  }

  /** Staged explode (windows from the contract), composed over the pose. */
  setExplode(t: number): void {
    this.explodeT = t;
    this.updateMatrices();
  }

  setBlueprint(on: boolean): void {
    this.blueprint = on;
    this.applyBlueprint();
  }

  private applyBlueprint(): void {
    this.scene.background = this.blueprint ? BLUEPRINT_BG : NORMAL_BG;
    for (const b of this.batches) {
      if (this.blueprint) {
        b.userData.shadedMaterial = b.material;
        b.material = this.blueprintMat;
        b.castShadow = false;
      } else if (b.userData.shadedMaterial) {
        b.material = b.userData.shadedMaterial as THREE.Material;
        b.castShadow = true;
      }
    }
  }

  private updateMatrices(): void {
    const dir = new THREE.Vector3();
    const offset = new THREE.Matrix4();
    const leaderPoints: THREE.Vector3[] = [];
    for (const h of this.parts) {
      if (!h.explode || this.explodeT <= 0) {
        h.finalMatrix.copy(h.nodeWorld);
        h.batch.setMatrixAt(h.instanceId, h.finalMatrix);
        continue;
      }
      const { dir: d, mag, t0, t1, leader } = h.explode;
      const f = Math.min(Math.max((this.explodeT - t0) / Math.max(t1 - t0, 1e-6), 0), 1);
      dir.set(d[0], d[1], d[2]).applyMatrix4(h.nodeRotation).normalize();
      offset.makeTranslation(dir.x * mag * f, dir.y * mag * f, dir.z * mag * f);
      h.finalMatrix.multiplyMatrices(offset, h.nodeWorld);
      h.batch.setMatrixAt(h.instanceId, h.finalMatrix);

      // leader lines (P1-011): flagged subassemblies draw base→exploded ties
      if (leader && f > 0.02) {
        leaderPoints.push(
          new THREE.Vector3().setFromMatrixPosition(h.nodeWorld),
          new THREE.Vector3().setFromMatrixPosition(h.finalMatrix),
        );
      }
    }
    if (leaderPoints.length > 0) {
      this.leaders.geometry.setFromPoints(leaderPoints);
      this.leaders.computeLineDistances();
      this.leaders.visible = true;
    } else {
      this.leaders.visible = false;
    }
    this.syncOutline();
  }

  /** Component-scoped picking (BEH-004 alignment): click → part identity. */
  pick(ndcX: number, ndcY: number): PartPick | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = this.raycaster.intersectObjects(this.batches, false)[0] as
      | (THREE.Intersection & { batchId?: number })
      | undefined;
    if (!hit || hit.batchId === undefined) {
      this.setSelected(null);
      return null;
    }
    const h = this.parts.find((p) => p.batch === hit.object && p.instanceId === hit.batchId);
    if (!h) return null;
    this.setSelected(h.partIndex);
    return {
      partIndex: h.partIndex,
      sourcePath: h.sourcePath,
      node: h.node,
      material: h.material,
      color: h.color,
    };
  }

  /** Outline the part (inverted hull, P1-012); null clears. */
  setSelected(partIndex: number | null): void {
    this.selected = partIndex;
    this.syncOutline();
  }

  private syncOutline(): void {
    const h = this.selected === null ? null : this.parts.find((p) => p.partIndex === this.selected);
    if (!h || this.blueprint) {
      this.outline.visible = false;
      return;
    }
    this.outline.geometry = h.geometry;
    this.outline.matrix.copy(h.finalMatrix);
    // keep the rim ~2 px regardless of range
    const pos = new THREE.Vector3().setFromMatrixPosition(h.finalMatrix);
    const dist = pos.distanceTo(this.camera.position);
    this.outlineMaterial.uniforms.inflate.value = dist * 0.002;
    this.outline.visible = true;
  }

  /** Pin the camera exactly — parity gallery & tests (P1-015). Same orbit
   * convention as the monolith: eye = target + dist·(cos el·sin yaw, sin el,
   * cos el·cos yaw), Y-up. Disables damping so the pose holds. */
  setCameraPose(p: {
    yaw: number;
    el: number;
    dist: number;
    target: [number, number, number];
    fovDeg?: number;
  }): void {
    const ce = Math.cos(p.el);
    this.controls.target.set(p.target[0], p.target[1], p.target[2]);
    this.camera.position.set(
      p.target[0] + p.dist * ce * Math.sin(p.yaw),
      p.target[1] + p.dist * Math.sin(p.el),
      p.target[2] + p.dist * ce * Math.cos(p.yaw),
    );
    if (p.fovDeg) {
      this.camera.fov = p.fovDeg;
      this.camera.updateProjectionMatrix();
    }
    this.controls.enableDamping = false;
    this.controls.update();
  }

  /** Keyboard-accessible orbit/zoom. Values are relative deltas around the
   * current orbit target so the canvas never needs presentation-only camera
   * truth outside this render layer. */
  nudgeCamera(azimuthRad: number, elevationRad: number, zoomFactor = 1): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += azimuthRad;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - elevationRad, 0.08, Math.PI - 0.08);
    spherical.radius = THREE.MathUtils.clamp(spherical.radius * zoomFactor, 0.08, 20);
    this.camera.position.copy(this.controls.target).add(new THREE.Vector3().setFromSpherical(spherical));
    this.controls.update();
  }

  cameraState(): { position: [number, number, number]; target: [number, number, number] } {
    return {
      position: [this.camera.position.x, this.camera.position.y, this.camera.position.z],
      target: [this.controls.target.x, this.controls.target.y, this.controls.target.z],
    };
  }

  setReducedMotion(reduced: boolean): void {
    this.controls.enableDamping = !reduced;
    this.controls.update();
  }

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  /** Disable orbit while a jog drag owns the pointer (P1-013). */
  setControlsEnabled(enabled: boolean): void {
    this.controls.enabled = enabled;
  }

  setShadowsVisible(visible: boolean): void {
    this.renderer.shadowMap.enabled = visible;
    this.ground.visible = visible;
  }

  /** Follow camera (drive mode): ease the orbit target toward the driver's
   * focus — the monolith's smoothing, ck = min(1, dt·5). The eye moves with
   * the target so orbit offset is preserved. */
  followFocus(focus: [number, number, number], dt: number): void {
    const k = Math.min(1, dt * 5);
    const t = this.controls.target;
    const dx = (focus[0] - t.x) * k;
    const dy = (focus[1] - t.y) * k;
    const dz = (focus[2] - t.z) * k;
    t.x += dx;
    t.y += dy;
    t.z += dz;
    this.camera.position.x += dx;
    this.camera.position.y += dy;
    this.camera.position.z += dz;
    this.controls.update();
  }

  /** Render-side numbers for the perf overlay (P1-017). */
  stats(): { drawCalls: number; triangles: number; frameMs: number } {
    return {
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
      frameMs: this.lastFrameMs,
    };
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(buf.x, buf.y);
    this.aoPass.setSize(buf.x, buf.y);
    this.normalTarget?.dispose();
    this.normalTarget = null; // lazily rebuilt at the new size
  }

  private ensureNormalTarget(): THREE.WebGLRenderTarget {
    if (!this.normalTarget) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const depthTexture = new THREE.DepthTexture(size.x, size.y);
      this.normalTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthTexture });
      this.edgeMaterial.uniforms.resolution.value.set(size.x, size.y);
    }
    return this.normalTarget;
  }

  private renderFrame(): void {
    this.renderer.info.reset();
    if (!this.blueprint) {
      if (this.aoPass.enabled) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      return;
    }
    // blueprint (P1-010): flat fill on screen, then a normal/depth edge pass
    this.renderer.render(this.scene, this.camera);

    const target = this.ensureNormalTarget();
    const gridWas = this.grid.visible;
    const groundWas = this.ground.visible;
    this.grid.visible = false;
    this.ground.visible = false;
    const bg = this.scene.background;
    this.scene.background = null;
    this.scene.overrideMaterial = this.normalOverride;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    this.grid.visible = gridWas;
    this.ground.visible = groundWas;

    this.edgeMaterial.uniforms.tNormal.value = target.texture;
    this.edgeMaterial.uniforms.tDepth.value = target.depthTexture;
    this.edgeMaterial.uniforms.cameraNear.value = this.camera.near;
    this.edgeMaterial.uniforms.cameraFar.value = this.camera.far;
    this.renderer.autoClear = false;
    this.renderer.render(this.edgeScene, this.edgeCamera);
    this.renderer.autoClear = true;
  }

  start(): void {
    let last = performance.now();
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      this.onFrame?.(Math.min(dt, 0.1));
      this.controls.update();
      this.renderFrame();
      this.lastFrameMs = performance.now() - now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    this.normalTarget?.dispose();
    this.renderer.dispose();
  }
}
