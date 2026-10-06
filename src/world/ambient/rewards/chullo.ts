/**
 * Golden-thread chullo (world reward for unlocking arcade achievements). Re-dresses the traveler's cap
 * without touching avatar.ts: finds the chullo material on the "traveler" group (the cap crown is the
 * only textured cone under the head), swaps every mesh that shares it to a gold-woven material, and
 * gilds the pompom. `restore()` puts the originals back.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { DYE } from "../../palette";

const GOLD = "#f2c14e";
const GOLD_DEEP = "#b8862b";

function goldTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 64;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  // Same layout as the traveler's chullo (so it reads as "the same cap, rewoven"), gold threads on top.
  ctx.fillStyle = DYE.red;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = GOLD;
  ctx.fillRect(0, h * 0.62, w, 6);
  ctx.fillRect(0, h * 0.3, w, 3);
  ctx.fillRect(0, h * 0.08, w, 2);
  ctx.fillStyle = GOLD_DEEP;
  for (let x = 0; x < w; x += 12) {
    ctx.beginPath();
    ctx.moveTo(x, h * 0.62 + 12);
    ctx.lineTo(x + 6, h * 0.62 + 20);
    ctx.lineTo(x + 12, h * 0.62 + 12);
    ctx.fill();
  }
  ctx.fillStyle = DYE.indigo;
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.fillStyle = GOLD;
  for (let x = 4; x < w; x += 16) {
    // Small woven diamonds instead of squares.
    ctx.beginPath();
    ctx.moveTo(x + 3, h * 0.38);
    ctx.lineTo(x + 7, h * 0.38 + 4);
    ctx.lineTo(x + 3, h * 0.38 + 8);
    ctx.lineTo(x - 1, h * 0.38 + 4);
    ctx.fill();
  }
  for (let x = 2; x < w; x += 8) ctx.fillRect(x, h * 0.9, 3, 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  tex.anisotropy = 4;
  return tex;
}

interface Swap {
  mesh: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
}

export interface GoldenChullo {
  /** Tries to dress the traveler; returns true once applied (call again until it is). */
  apply(traveler: THREE.Object3D): boolean;
  readonly applied: boolean;
  restore(): void;
  dispose(): void;
}

export function createGoldenChullo(env: WorldEnv): GoldenChullo {
  let tex: THREE.CanvasTexture | null = null;
  let capMat: THREE.MeshToonMaterial | null = null;
  const swaps: Swap[] = [];
  let applied = false;

  const isCrown = (m: THREE.Mesh) => {
    const g = m.geometry as THREE.BufferGeometry & { parameters?: { radius?: number } };
    const mat = m.material as THREE.MeshToonMaterial;
    return g.type === "ConeGeometry" && Math.abs((g.parameters?.radius ?? 0) - 0.13) < 1e-3 && !!mat?.map;
  };
  const isPompom = (m: THREE.Mesh) => {
    const g = m.geometry as THREE.BufferGeometry & { parameters?: { radius?: number } };
    return g.type === "IcosahedronGeometry" && Math.abs((g.parameters?.radius ?? 0) - 0.07) < 1e-3;
  };

  return {
    get applied() {
      return applied;
    },
    apply(traveler) {
      if (applied) return true;
      let crown: THREE.Mesh | null = null;
      traveler.traverse((o) => {
        if (!crown && (o as THREE.Mesh).isMesh && isCrown(o as THREE.Mesh)) crown = o as THREE.Mesh;
      });
      if (!crown) return false;
      const original = (crown as THREE.Mesh).material as THREE.MeshToonMaterial;
      tex = goldTexture();
      capMat = original.clone();
      capMat.map = tex;
      // A faint warm self-glow so the gold threads still read at dusk.
      capMat.emissive = new THREE.Color("#3a2606");
      capMat.emissiveIntensity = 1;
      capMat.needsUpdate = true;
      const pompomMat = env.toon(GOLD, { emissive: "#7a5410", emissiveIntensity: 0.6 });
      traveler.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (m.material === original) {
          swaps.push({ mesh: m, material: m.material });
          m.material = capMat as THREE.MeshToonMaterial;
        } else if (isPompom(m)) {
          swaps.push({ mesh: m, material: m.material });
          m.material = pompomMat;
        }
      });
      applied = true;
      return true;
    },
    restore() {
      for (const s of swaps) s.mesh.material = s.material;
      swaps.length = 0;
      applied = false;
      capMat?.dispose();
      tex?.dispose();
      capMat = null;
      tex = null;
    },
    dispose() {
      this.restore();
    },
  };
}
