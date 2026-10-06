/** Small three.js helpers shared by the data stations (station frame, terrace sectors, selection marker). */
import * as THREE from "three";
import type { Collider, WorldEnv } from "../../contract";

/** A station's local frame: +Z faces the trail (same convention as Object3D rotation.y = yaw). */
export interface Frame {
  x: number;
  z: number;
  y: number;
  yaw: number;
  cos: number;
  sin: number;
}

export function stationFrame(env: WorldEnv, id: string): Frame {
  const pose = env.stationPose(id);
  const x = pose.position.x;
  const z = pose.position.z;
  return { x, z, y: env.heightAt(x, z), yaw: pose.yaw, cos: Math.cos(pose.yaw), sin: Math.sin(pose.yaw) };
}

/** Local (lx, lz) → world x. */
export const wx = (f: Frame, lx: number, lz: number) => f.x + lx * f.cos + lz * f.sin;
/** Local (lx, lz) → world z. */
export const wz = (f: Frame, lx: number, lz: number) => f.z - lx * f.sin + lz * f.cos;
/** World (x, z) → local x. */
export const lxOf = (f: Frame, x: number, z: number) => (x - f.x) * f.cos - (z - f.z) * f.sin;
/** World (x, z) → local z. */
export const lzOf = (f: Frame, x: number, z: number) => (x - f.x) * f.sin + (z - f.z) * f.cos;

export function circle(f: Frame, lx: number, lz: number, r: number): Collider {
  return { kind: "circle", x: wx(f, lx, lz), z: wz(f, lx, lz), r };
}

/** Walkable chain of circles from a local point of the plaza to the nearest trail point. */
export function pathToTrail(env: WorldEnv, f: Frame, lx: number, lz: number): Collider[] {
  const fx = wx(f, lx, lz);
  const fz = wz(f, lx, lz);
  const to = env.trail.pointAt(env.trail.nearestT(fx, fz));
  const d = Math.hypot(to.x - fx, to.z - fz);
  const n = Math.max(1, Math.ceil(d / 0.9));
  const out: Collider[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push({ kind: "circle", x: fx + (to.x - fx) * u, z: fz + (to.z - fz) * u, r: 1.25 });
  }
  return out;
}

/**
 * Annular sector prism in the local frame (angle 0 = +Z, growing toward +X), from y0 to y1.
 * Angles a0 < a1 in radians, radii r0 < r1.
 */
export function sectorGeometry(r0: number, r1: number, a0: number, a1: number, y0: number, y1: number) {
  const seg = Math.max(2, Math.ceil(((a1 - a0) * r1) / 0.35));
  const shape = new THREE.Shape();
  // Shape (sx, sy) extrudes along +Z; after rotateX(-π/2): local x = sx, local z = -sy, y = depth.
  for (let i = 0; i <= seg; i++) {
    const a = a0 + ((a1 - a0) * i) / seg;
    const px = Math.sin(a) * r1;
    const pz = Math.cos(a) * r1;
    if (i === 0) shape.moveTo(px, -pz);
    else shape.lineTo(px, -pz);
  }
  for (let i = seg; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / seg;
    shape.lineTo(Math.sin(a) * r0, -Math.cos(a) * r0);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false, curveSegments: 1, steps: 1 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/** Ochre selection diamond that bobs over the chosen terrace / cord (static on reduced motion). */
export function createMarker(env: WorldEnv) {
  const geo = new THREE.OctahedronGeometry(0.13, 0);
  const mesh = new THREE.Mesh(geo, env.toon("#dda63c", { emissive: "#dda63c", emissiveIntensity: 0.35 }));
  mesh.scale.set(1, 1.5, 1);
  mesh.visible = false;
  mesh.name = "qnf-marker";
  let baseY = 0;
  return {
    mesh,
    place(x: number, y: number, z: number) {
      mesh.position.set(x, y, z);
      baseY = y;
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
    update(dt: number, t: number) {
      if (!mesh.visible || env.reducedMotion) return;
      mesh.position.y = baseY + Math.sin(t * 2.4) * 0.06;
      mesh.rotation.y += dt * 1.6;
    },
    dispose() {
      geo.dispose();
      mesh.removeFromParent();
    },
  };
}

/** Disposes every geometry under root (materials are the shared toon cache or disposed by their owner). */
export function disposeGeometries(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  root.removeFromParent();
}
