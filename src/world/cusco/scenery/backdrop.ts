/**
 * The apus round Qusqu: a ring of jagged mountains beyond the valley's hills, one vertex-coloured mesh that is
 * never walked on. Grass and rock below, snow above SNOW; the big snowy massif to the south-east stands for
 * Ausangate (the real one is ~100 km away; here it is pulled in so the valley reads as Cusco's).
 * Radii: from just inside the heightfield's edge (so no gap shows) out to the fog.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { HALF } from "../layout";

const SNOW = 92;
const SEGS = 160;
/** Radial profile: [radius, height factor] from the inner lip to the far fall-off. */
const RINGS: ReadonlyArray<readonly [number, number]> = [
  [HALF * 0.86, 0.25],
  [HALF * 1.05, 0.55],
  [HALF * 1.35, 1],
  [HALF * 1.6, 0.8],
  [HALF * 1.95, 0.25],
];

function hash(i: number) {
  let h = Math.imul(i, 2654435761) ^ 0x51ed27;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}
/** Smooth periodic noise around the ring (k = segment index, any real). */
function ringNoise(k: number, period: number) {
  const i = Math.floor(k / period);
  const f = k / period - i;
  const n = SEGS / period;
  const a = hash(((i % n) + n) % n);
  const b = hash((((i + 1) % n) + n) % n);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function buildBackdrop(toon: ToonCache, heightAt: (x: number, z: number) => number) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rock = new THREE.Color("#8b8173");
  const grass = new THREE.Color("#7c9a5c");
  const snow = new THREE.Color("#f4f1ea");
  const c = new THREE.Color();
  for (let i = 0; i <= SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // Peaks: two scales of ring noise, and the Ausangate massif to the south-east (angle ≈ π/4 in x/z).
    const big = ringNoise(i, 16);
    const small = ringNoise(i + 3.5, 5);
    const da = ((a - Math.PI / 4 + Math.PI) % (Math.PI * 2)) - Math.PI;
    const aus = Math.exp(-(da * da) / 0.05);
    const peak = 55 + big * 55 + small * 18 + aus * 70;
    RINGS.forEach(([r, k], j) => {
      const x = ca * r;
      const z = sa * r;
      // The inner lip sits on the heightfield's rim so the two meet without a seam.
      const y =
        j === 0
          ? heightAt(Math.max(-HALF, Math.min(HALF, x)), Math.max(-HALF, Math.min(HALF, z))) - 2
          : peak * k + (j === 1 ? 20 : 0);
      pos.push(x, y, z);
      if (y > SNOW + (1 - k) * 30) c.copy(snow);
      else if (j <= 1) c.copy(grass).lerp(rock, 0.3);
      else c.copy(rock).lerp(grass, 0.25 * (1 - k));
      col.push(c.r, c.g, c.b);
    });
  }
  const R = RINGS.length;
  for (let i = 0; i < SEGS; i++)
    for (let j = 0; j < R - 1; j++) {
      const a = i * R + j;
      const b = a + 1;
      const d = a + R;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // Faceted (flat-shaded) peaks read better in the toon ramp.
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "cusco-apus";
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
