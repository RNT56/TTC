// The five-class material system → PBR (plan §7.2). Rendering is presentation,
// not truth — the numbers below are the binding mapping table.
import * as THREE from "three";
import type { MaterialClass } from "./types";

const PBR: Record<MaterialClass, { metalness: number; roughness: number; clearcoat?: boolean; sheen?: boolean }> = {
  gloss: { metalness: 0.05, roughness: 0.12, clearcoat: true },
  metal: { metalness: 0.95, roughness: 0.35 },
  satin: { metalness: 0.1, roughness: 0.45 },
  matte: { metalness: 0.0, roughness: 0.85 },
  rubber: { metalness: 0.0, roughness: 0.95, sheen: true },
};

const cache = new Map<string, THREE.Material>();

export function materialFor(cls: MaterialClass, color: string): THREE.Material {
  const key = `${cls}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const p = PBR[cls];
  const mat = p.clearcoat || p.sheen
    ? new THREE.MeshPhysicalMaterial({
        color,
        metalness: p.metalness,
        roughness: p.roughness,
        clearcoat: p.clearcoat ? 0.6 : 0,
        sheen: p.sheen ? 0.5 : 0,
      })
    : new THREE.MeshStandardMaterial({ color, metalness: p.metalness, roughness: p.roughness });
  cache.set(key, mat);
  return mat;
}

const classCache = new Map<MaterialClass, THREE.Material>();

/** One material per class for BatchedMesh (P1-008): white albedo, per-part
 * color comes from the batch's per-instance color. */
export function classMaterialFor(cls: MaterialClass): THREE.Material {
  const hit = classCache.get(cls);
  if (hit) return hit;
  const p = PBR[cls];
  const mat = p.clearcoat || p.sheen
    ? new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: p.metalness,
        roughness: p.roughness,
        clearcoat: p.clearcoat ? 0.6 : 0,
        sheen: p.sheen ? 0.5 : 0,
      })
    : new THREE.MeshStandardMaterial({
        color: 0xffffff,
        metalness: p.metalness,
        roughness: p.roughness,
      });
  classCache.set(cls, mat);
  return mat;
}
