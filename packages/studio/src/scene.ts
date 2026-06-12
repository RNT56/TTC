// The Three.js render layer — a thin consumer of core-baked buffers (D16).
// No geometry math here: positions/normals/indices and node transforms come
// from the core's bake artifact; this file only uploads and draws them.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { materialFor } from "./materials";
import type { BakeArtifact, BakedPart } from "./types";

interface PartHandle {
  mesh: THREE.Mesh;
  base: THREE.Matrix4;
  explode?: BakedPart["explode"];
  nodeRotation: THREE.Matrix4;
}

export class StudioScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private parts: PartHandle[] = [];
  private disposed = false;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.background = new THREE.Color(0x0d0f12);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.001, 50);
    this.camera.position.set(0.35, 0.3, 0.45);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.06, 0);
    this.controls.enableDamping = true;

    // three-point IBL-lite rig: key + cool sky hemisphere + warm ground bounce
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

    const grid = new THREE.GridHelper(1.2, 24, 0x2a2f38, 0x1a1e24);
    grid.position.y = 0;
    this.scene.add(grid);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShadowMaterial({ opacity: 0.35 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  /** Upload the core's bake artifact. Zero geometry computation client-side. */
  load(artifact: BakeArtifact): void {
    for (const handle of this.parts) {
      handle.mesh.geometry.dispose();
      this.scene.remove(handle.mesh);
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

      const mesh = new THREE.Mesh(geometry, materialFor(part.material, part.color));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;

      const world = artifact.baked.node_world[part.node];
      const base = new THREE.Matrix4();
      if (world && world.length === 16) base.fromArray(world);
      mesh.matrix.copy(base);

      const nodeRotation = new THREE.Matrix4().extractRotation(base);
      this.scene.add(mesh);
      this.parts.push({ mesh, base, explode: part.explode, nodeRotation });
    }
  }

  /** Staged explode: per-part windows from the contract, applied to matrices. */
  setExplode(t: number): void {
    const dir = new THREE.Vector3();
    const offset = new THREE.Matrix4();
    for (const handle of this.parts) {
      if (!handle.explode) {
        handle.mesh.matrix.copy(handle.base);
        continue;
      }
      const { dir: d, mag, t0, t1 } = handle.explode;
      const f = Math.min(Math.max((t - t0) / Math.max(t1 - t0, 1e-6), 0), 1);
      dir.set(d[0], d[1], d[2]).applyMatrix4(handle.nodeRotation).normalize();
      offset.makeTranslation(dir.x * mag * f, dir.y * mag * f, dir.z * mag * f);
      handle.mesh.matrix.multiplyMatrices(offset, handle.base);
    }
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    const tick = () => {
      if (this.disposed) return;
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.dispose();
  }
}
