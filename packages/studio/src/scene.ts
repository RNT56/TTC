// The Three.js render layer — a thin consumer of core-baked buffers (D16).
// No geometry math here: buffers and node transforms come from the core's bake;
// pose updates come from the core's tick; this file uploads, composes explode
// offsets, and draws.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { materialFor } from "./materials";
import type { BakeArtifact, BakedPart } from "./types";

export interface PartPick {
  partIndex: number;
  node: string;
  material: string;
  color: string;
}

interface PartHandle {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  node: string;
  partIndex: number;
  material: string;
  color: string;
  explode?: BakedPart["explode"];
  /** current node transform (bake static or live tick pose) */
  nodeWorld: THREE.Matrix4;
  nodeRotation: THREE.Matrix4;
  baseMaterial: THREE.Material;
  leaderLine?: THREE.Line;
}

const BLUEPRINT_BG = new THREE.Color(0x0a1a2f);
const NORMAL_BG = new THREE.Color(0x0d0f12);

export class StudioScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private parts: PartHandle[] = [];
  private raycaster = new THREE.Raycaster();
  private disposed = false;
  private explodeT = 0;
  private blueprint = false;
  private blueprintMat = new THREE.MeshBasicMaterial({ color: 0x10263f });
  private grid: THREE.GridHelper;
  private ground: THREE.Mesh;
  /** last render frame duration, ms (perf overlay, P1-017) */
  lastFrameMs = 0;
  onFrame?: (dt: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = NORMAL_BG;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.001, 50);
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
  }

  /** Upload the core's bake artifact. Zero client-side geometry computation. */
  load(artifact: BakeArtifact): void {
    for (const h of this.parts) {
      h.mesh.geometry.dispose();
      h.edges.geometry.dispose();
      this.scene.remove(h.mesh, h.edges);
      if (h.leaderLine) this.scene.remove(h.leaderLine);
    }
    this.parts = [];

    for (const part of artifact.baked.parts) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(part.mesh.positions), 3),
      );
      geometry.setAttribute(
        "normal",
        new THREE.BufferAttribute(new Float32Array(part.mesh.normals), 3),
      );
      geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(part.mesh.indices), 1));

      const baseMaterial = materialFor(part.material, part.color);
      const mesh = new THREE.Mesh(geometry, baseMaterial);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.userData.partIndex = part.part_index;

      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 25),
        new THREE.LineBasicMaterial({ color: 0x9fd4ff }),
      );
      edges.matrixAutoUpdate = false;
      edges.visible = false;

      const world = artifact.baked.node_world[part.node];
      const nodeWorld = new THREE.Matrix4();
      if (world && world.length === 16) nodeWorld.fromArray(world);

      this.scene.add(mesh, edges);
      this.parts.push({
        mesh,
        edges,
        node: part.node,
        partIndex: part.part_index,
        material: part.material,
        color: part.color,
        explode: part.explode,
        nodeWorld,
        nodeRotation: new THREE.Matrix4().extractRotation(nodeWorld),
        baseMaterial,
      });
    }
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
    for (const h of this.parts) {
      h.mesh.material = this.blueprint ? this.blueprintMat : h.baseMaterial;
      h.edges.visible = this.blueprint;
      h.mesh.castShadow = !this.blueprint;
    }
  }

  private updateMatrices(): void {
    const dir = new THREE.Vector3();
    const offset = new THREE.Matrix4();
    const basePos = new THREE.Vector3();
    const explodedPos = new THREE.Vector3();
    for (const h of this.parts) {
      if (!h.explode || this.explodeT <= 0) {
        h.mesh.matrix.copy(h.nodeWorld);
        h.edges.matrix.copy(h.nodeWorld);
        if (h.leaderLine) h.leaderLine.visible = false;
        continue;
      }
      const { dir: d, mag, t0, t1, leader } = h.explode;
      const f = Math.min(Math.max((this.explodeT - t0) / Math.max(t1 - t0, 1e-6), 0), 1);
      dir.set(d[0], d[1], d[2]).applyMatrix4(h.nodeRotation).normalize();
      offset.makeTranslation(dir.x * mag * f, dir.y * mag * f, dir.z * mag * f);
      h.mesh.matrix.multiplyMatrices(offset, h.nodeWorld);
      h.edges.matrix.copy(h.mesh.matrix);

      // leader lines (P1-011): flagged subassemblies draw base→exploded ties
      if (leader && f > 0.02) {
        basePos.setFromMatrixPosition(h.nodeWorld);
        explodedPos.setFromMatrixPosition(h.mesh.matrix);
        if (!h.leaderLine) {
          const g = new THREE.BufferGeometry().setFromPoints([basePos, explodedPos]);
          h.leaderLine = new THREE.Line(
            g,
            new THREE.LineDashedMaterial({ color: 0x8fa3bf, dashSize: 0.01, gapSize: 0.006 }),
          );
          this.scene.add(h.leaderLine);
        } else {
          h.leaderLine.geometry.setFromPoints([basePos, explodedPos]);
        }
        h.leaderLine.computeLineDistances();
        h.leaderLine.visible = true;
      } else if (h.leaderLine) {
        h.leaderLine.visible = false;
      }
    }
  }

  /** Component-scoped picking (BEH-004 alignment): click → part identity. */
  pick(ndcX: number, ndcY: number): PartPick | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const meshes = this.parts.map((h) => h.mesh);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    if (!hit) {
      this.highlight(null);
      return null;
    }
    const h = this.parts.find((p) => p.mesh === hit.object);
    if (!h) return null;
    this.highlight(h.partIndex);
    return { partIndex: h.partIndex, node: h.node, material: h.material, color: h.color };
  }

  private highlight(partIndex: number | null): void {
    for (const h of this.parts) {
      if (h.partIndex === partIndex && !this.blueprint) {
        const m = (h.baseMaterial as THREE.MeshStandardMaterial).clone();
        m.emissive = new THREE.Color(0x2f5d8a);
        m.emissiveIntensity = 1.0;
        h.mesh.material = m;
      } else if (!this.blueprint) {
        h.mesh.material = h.baseMaterial;
      }
    }
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

  setGridVisible(visible: boolean): void {
    this.grid.visible = visible;
  }

  setShadowsVisible(visible: boolean): void {
    this.renderer.shadowMap.enabled = visible;
    this.ground.visible = visible;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
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
      this.renderer.render(this.scene, this.camera);
      this.lastFrameMs = performance.now() - now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.dispose();
  }
}
