/**
 * Winter snow cap: one overlay mesh draped over the summit area. It samples `heightAt` on the SAME lattice
 * the terrain mesh uses (heightAt is triangle-exact and the diagonals match), so it lies on the ground
 * exactly; a tiny lift + polygonOffset keeps it from z-fighting. The snow line is a uniform: the mesh is
 * built once down to the lowest winter line and the shader fades it in above `uLine` with a ragged, soft
 * toon edge (bare on cliffs, thinner on the trodden trail).
 */
import * as THREE from "three";
import { gradientMap, noOutline } from "../../toon";
import { CAP_FLOOR } from "./line";

const LIFT = 0.05;
const SIZE = 384;

export interface SnowCap {
  mesh: THREE.Mesh;
  setLine(y: number): void;
  dispose(): void;
}

/** Find the terrain lattice size: the grid where heightAt is linear along every edge. */
export function detectCells(
  heightAt: (x: number, z: number) => number,
  cx: number,
  cz: number,
  guesses: number[],
): number {
  let best = guesses[0]!;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const n of guesses) {
    const step = SIZE / n;
    let err = 0;
    for (let k = 0; k < 24; k++) {
      const i = Math.floor((cx + SIZE / 2) / step) + (k % 6) - 3;
      const j = Math.floor((cz + SIZE / 2) / step) + Math.floor(k / 6) - 2;
      const x0 = -SIZE / 2 + i * step;
      const z0 = -SIZE / 2 + j * step;
      // Along an edge of the lattice the sampled height must be the mean of its endpoints.
      const mid = heightAt(x0 + step / 2, z0);
      err += Math.abs(mid - (heightAt(x0, z0) + heightAt(x0 + step, z0)) / 2);
    }
    if (err < bestErr) {
      bestErr = err;
      best = n;
    }
  }
  return best;
}

export function createSnowCap(o: {
  heightAt: (x: number, z: number) => number;
  /** Distance to the trail centerline (thinner snow on the path). */
  trailD: (x: number, z: number) => number;
  halfWidth: number;
  center: { x: number; z: number };
  radius: number;
  quality: "low" | "high";
}): SnowCap {
  const { heightAt, center, radius } = o;
  const n = detectCells(heightAt, center.x + 22, center.z + 9, o.quality === "high" ? [280, 190] : [190, 280]);
  const step = SIZE / n;
  const i0 = Math.max(0, Math.floor((center.x - radius + SIZE / 2) / step));
  const i1 = Math.min(n, Math.ceil((center.x + radius + SIZE / 2) / step));
  const j0 = Math.max(0, Math.floor((center.z - radius + SIZE / 2) / step));
  const j1 = Math.min(n, Math.ceil((center.z + radius + SIZE / 2) / step));
  const W = i1 - i0 + 1;
  const H = j1 - j0 + 1;
  const ys = new Float32Array(W * H);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) ys[j * W + i] = heightAt(-SIZE / 2 + (i0 + i) * step, -SIZE / 2 + (j0 + j) * step);

  const index = new Int32Array(W * H).fill(-1);
  const pos: number[] = [];
  const nor: number[] = [];
  const path: number[] = [];
  const vert = (i: number, j: number) => {
    const k = j * W + i;
    if (index[k]! >= 0) return index[k]!;
    const x = -SIZE / 2 + (i0 + i) * step;
    const z = -SIZE / 2 + (j0 + j) * step;
    const y = ys[k]!;
    const hl = ys[j * W + Math.max(0, i - 1)]!;
    const hr = ys[j * W + Math.min(W - 1, i + 1)]!;
    const hd = ys[Math.max(0, j - 1) * W + i]!;
    const hu = ys[Math.min(H - 1, j + 1) * W + i]!;
    const nx = hl - hr;
    const ny = 2 * step;
    const nz = hd - hu;
    const l = Math.hypot(nx, ny, nz);
    pos.push(x, y + LIFT, z);
    nor.push(nx / l, ny / l, nz / l);
    const d = o.trailD(x, z);
    path.push(d < o.halfWidth + 0.6 ? 1 - Math.max(0, (d - o.halfWidth + 0.4) / 1.0) : 0);
    index[k] = pos.length / 3 - 1;
    return index[k]!;
  };
  const idx: number[] = [];
  const r2 = (radius + step) ** 2;
  for (let j = 0; j < H - 1; j++)
    for (let i = 0; i < W - 1; i++) {
      const x = -SIZE / 2 + (i0 + i + 0.5) * step;
      const z = -SIZE / 2 + (j0 + j + 0.5) * step;
      if ((x - center.x) ** 2 + (z - center.z) ** 2 > r2) continue;
      const top = Math.max(ys[j * W + i]!, ys[(j + 1) * W + i]!, ys[j * W + i + 1]!, ys[(j + 1) * W + i + 1]!);
      if (top < CAP_FLOOR) continue;
      // Same split as the terrain: (a, b, d) and (b, c, d), a = (i, j), b = (i, j+1), c = (i+1, j+1), d = (i+1, j).
      const a = vert(i, j);
      const b = vert(i, j + 1);
      const c = vert(i + 1, j + 1);
      const d = vert(i + 1, j);
      idx.push(a, b, d, b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("aPath", new THREE.Float32BufferAttribute(path, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();

  const mat = new THREE.MeshToonMaterial({
    color: "#e6ecf6",
    gradientMap: gradientMap(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const uLine = { value: Number.POSITIVE_INFINITY };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLine = uLine;
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aPath;\nvarying vec3 vSnowP;\nvarying float vSnowNy;\nvarying float vSnowPath;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSnowP = position;\nvSnowNy = normal.y;\nvSnowPath = aPath;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uLine;
varying vec3 vSnowP;
varying float vSnowNy;
varying float vSnowPath;
float snowHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float snowNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(snowHash(i), snowHash(i + vec2(1, 0)), f.x), mix(snowHash(i + vec2(0, 1)), snowHash(i + vec2(1, 1)), f.x), f.y);
}`,
      )
      .replace(
        "#include <alphamap_fragment>",
        `#include <alphamap_fragment>
{
  vec2 q = vSnowP.xz;
  // Ragged line: big tongues down the gullies plus a fine frayed edge.
  float edge = (snowNoise(q * 0.07) - 0.5) * 7.0 + (snowNoise(q * 0.45) - 0.5) * 1.6;
  float k = smoothstep(uLine - 0.5, uLine + 0.7, vSnowP.y + edge);
  // Cliffs stay bare rock; the trodden path keeps only a thin cover.
  k *= smoothstep(0.42, 0.62, vSnowNy + (snowNoise(q * 0.3) - 0.5) * 0.15);
  k *= 1.0 - 0.6 * vSnowPath * smoothstep(0.35, 0.65, snowNoise(q * 0.9));
  diffuseColor.a *= k;
  if (diffuseColor.a < 0.02) discard;
}`,
      );
  };
  mat.customProgramCacheKey = () => "snow-cap";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "snow-cap";
  mesh.renderOrder = 1;
  mesh.receiveShadow = true;
  mesh.visible = false;
  noOutline(mesh);
  return {
    mesh,
    setLine(y) {
      uLine.value = y;
      mesh.visible = Number.isFinite(y);
    },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
