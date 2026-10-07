/**
 * Ground of the Antisuyu: the terrain mesh (per-face flat toon colors, like the mountain's terrain.ts),
 * the road and plaza surface, and the static bits merged on top of it.
 *
 *  - Terrain: vertices straight from `layout.grid` with the same (a,b,d)/(b,c,d) diagonal as
 *    `layout.heightAt`, so everything placed with heightAt sits exactly on it. Faces deep under the far
 *    canopy carpet are dropped (never visible; roughly halves the terrain's triangles). Faces are colored by what lies
 *    there: leaf litter / moss forest floor, red laterite road band and river banks, mud at the waterline,
 *    a dark river bed, packed earth on plazas, pale sand on the sandbars' shore.
 *  - Road: the grid (≈ 3.75 u at 280 cells) is too coarse for a 5.2 u road, so the road is its own ribbon
 *    (as trail.ts) with a canvas texture of packed red earth (ruts, pebbles, roots) and vertex tints for
 *    muddy patches; plazas and their spurs are discs / quads in the same mesh (one draw). The ribbon stops
 *    where the canopy walkway lifts off the ground (the deck replaces it).
 *  - Extras (one vertex-colored mesh): wooden plank sections across the muddy patches, roots crossing the
 *    road (both ≤ 0.1 u high: `groundAt` is flat there, feet must not sink), and the sandbars (playas).
 */
import * as THREE from "three";
import { mergeColored } from "../../merge-colors";
import { canvasTex, fbm, noise2, rng } from "../../tex";
import type { ToonCache } from "../../toon";
import { CANOPY_T, type SelvaLayout } from "../contract";
import { type Sandbar, underCarpet } from "./placement";

const C = (hex: string) => new THREE.Color(hex);
export const GROUND = {
  floor: [C("#4b5a2b"), C("#55502b"), C("#43602f"), C("#5c4a2a"), C("#4f6232")],
  moss: C("#3b5a27"),
  litter: C("#6a5230"),
  road: C("#b0552f"),
  shoulder: C("#8e5232"),
  plaza: C("#bf7a4b"),
  bank: C("#a9522d"),
  bankDark: C("#8a4426"),
  mud: C("#6c5036"),
  bed: C("#55432f"),
  sand: C("#d9c08c"),
};

/** Packed red earth: laterite with darker ruts, pale pebbles and a few root tangles (repeats along the road). */
function roadTexture() {
  return canvasTex(
    "selva-road",
    256,
    512,
    (ctx, w, h) => {
      const R = rng(41);
      ctx.fillStyle = "#c26a3e";
      ctx.fillRect(0, 0, w, h);
      // Mottled patches of lighter / darker earth.
      for (let i = 0; i < 70; i++) {
        ctx.fillStyle = R() < 0.5 ? "rgb(150 70 40 / 0.35)" : "rgb(222 150 100 / 0.3)";
        ctx.beginPath();
        ctx.ellipse(R() * w, R() * h, 10 + R() * 26, 6 + R() * 16, R() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Two worn ruts (foot and cart tracks) along the road, gently wandering (periodic in the tile).
      for (const x of [w * 0.3, w * 0.7]) {
        ctx.strokeStyle = "rgb(128 56 32 / 0.3)";
        ctx.lineWidth = 18;
        ctx.beginPath();
        for (let y = 0; y <= h; y += 16) ctx.lineTo(x + Math.sin((y / h) * Math.PI * 2 + x) * 3, y);
        ctx.stroke();
      }
      // Pebbles.
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = R() < 0.6 ? "#e2b48a" : "#8c4a2c";
        ctx.fillRect(R() * w, R() * h, 2 + R() * 3, 2 + R() * 2);
      }
      // Leaf litter blown onto the edges.
      for (let i = 0; i < 90; i++) {
        const x = R() < 0.5 ? R() * w * 0.14 : w - R() * w * 0.14;
        ctx.fillStyle = ["#6b5a2c", "#8a6b32", "#4f5e2a"][Math.floor(R() * 3)] as string;
        ctx.beginPath();
        ctx.ellipse(x, R() * h, 3 + R() * 4, 1.5 + R() * 2, R() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    { repeat: true },
  );
}

/** Terrain mesh from the layout grid. */
export function buildTerrain(L: SelvaLayout, toon: ToonCache, bars: Sandbar[]): THREE.Mesh {
  const { n, size, h: H } = L.grid;
  const step = size / n;
  const N1 = n + 1;
  const x0 = L.bounds.x0;
  const z0 = L.bounds.z0;
  const level = L.river.level;
  const hw = L.trail.halfWidth;
  // Smooth vertex normals from the grid.
  const nrm = new Float32Array(N1 * N1 * 3);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * N1 + i;
      const hl = H[j * N1 + Math.max(0, i - 1)] as number;
      const hr = H[j * N1 + Math.min(n, i + 1)] as number;
      const hd = H[Math.max(0, j - 1) * N1 + i] as number;
      const hu = H[Math.min(n, j + 1) * N1 + i] as number;
      const v = new THREE.Vector3(hl - hr, 2 * step, hd - hu).normalize();
      nrm[k * 3] = v.x;
      nrm[k * 3 + 1] = v.y;
      nrm[k * 3 + 2] = v.z;
    }
  // Vertices deep under the far canopy carpet (far.ts): faces made only of them are never seen, so skipped.
  const hidden = new Uint8Array(N1 * N1);
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const x = x0 + i * step;
      const z = z0 + j * step;
      hidden[j * N1 + i] = underCarpet(L.trailQuery(x, z).d, L.riverDist(x, z), 8) ? 1 : 0;
    }
  const faces = n * n * 2;
  const pos = new Float32Array(faces * 9);
  const nor = new Float32Array(faces * 9);
  const col = new Float32Array(faces * 9);
  const out = new THREE.Color();
  const pick = (arr: THREE.Color[], v: number) => arr[Math.abs(Math.floor(v)) % arr.length] as THREE.Color;
  const onBar = (x: number, z: number) => {
    for (const b of bars) {
      const dx = x - b.x;
      const dz = z - b.z;
      const u = dx * Math.cos(b.yaw) + dz * Math.sin(b.yaw);
      const v = -dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
      if ((u / (b.len + 3)) ** 2 + (v / (b.wid + 3)) ** 2 < 1) return true;
    }
    return false;
  };
  const faceColor = (x: number, y: number, z: number, ny: number) => {
    const q = L.trailQuery(x, z);
    // Under the road ribbon and just past it: darker red-brown, so the ribbon's edge is the visible one.
    if (q.d < hw + 0.8) return out.copy(GROUND.shoulder);
    for (const p of L.plazas) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.8) return out.copy(GROUND.plaza);
    const rd = L.riverDist(x, z);
    if (y < level - 0.25) return out.copy(GROUND.bed);
    if (rd < 2.2 && onBar(x, z)) return out.copy(GROUND.sand);
    if (rd < 1.4) return out.copy(GROUND.mud);
    // Red laterite banks (barrancos) where the ground drops to the river.
    if (rd < 7 && ny < 0.93) return out.copy(noise2(x * 0.2, z * 0.2) > 0.1 ? GROUND.bankDark : GROUND.bank);
    if (q.d < hw + 2.6) return out.copy(noise2(x * 0.5, z * 0.5) > -0.2 ? GROUND.litter : GROUND.shoulder);
    const nz = fbm(x * 0.03, z * 0.03, 3);
    if (nz > 0.32) return out.copy(GROUND.moss);
    if (nz < -0.3) return out.copy(GROUND.litter);
    return out.copy(pick(GROUND.floor, (nz + 1) * 3.3 + noise2(x * 0.15, z * 0.15) * 1.2));
  };
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  let f = 0;
  const vx = (k: number) => x0 + (k % N1) * step;
  const vz = (k: number) => z0 + Math.floor(k / N1) * step;
  const tri = (a: number, b: number, c: number) => {
    if (hidden[a] && hidden[b] && hidden[c]) return;
    const ya = H[a] as number;
    const yb = H[b] as number;
    const yc = H[c] as number;
    e1.set(vx(b) - vx(a), yb - ya, vz(b) - vz(a));
    e2.set(vx(c) - vx(a), yc - ya, vz(c) - vz(a));
    const ny = Math.abs(e2.cross(e1).normalize().y);
    faceColor((vx(a) + vx(b) + vx(c)) / 3, (ya + yb + yc) / 3, (vz(a) + vz(b) + vz(c)) / 3, ny);
    for (const v of [a, b, c]) {
      const o = f * 3;
      pos[o] = vx(v);
      pos[o + 1] = H[v] as number;
      pos[o + 2] = vz(v);
      nor[o] = nrm[v * 3] as number;
      nor[o + 1] = nrm[v * 3 + 1] as number;
      nor[o + 2] = nrm[v * 3 + 2] as number;
      col[o] = out.r;
      col[o + 1] = out.g;
      col[o + 2] = out.b;
      f++;
    }
  };
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * N1 + i;
      const b = (j + 1) * N1 + i;
      const c = (j + 1) * N1 + i + 1;
      const d = j * N1 + i + 1;
      tri(a, b, d);
      tri(b, c, d);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos.slice(0, f * 3), 3));
  geo.setAttribute("normal", new THREE.BufferAttribute(nor.slice(0, f * 3), 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col.slice(0, f * 3), 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, toon.vertexToon());
  mesh.name = "selva-terrain";
  mesh.receiveShadow = true;
  return mesh;
}

/** Height of the canopy lift above the ground at road t (0 outside the walkway). */
export function canopyLiftAt(L: SelvaLayout, t: number) {
  const deck = L.canopyDeckAt(t);
  if (deck === null) return 0;
  const p = L.trail.pointAt(t);
  return deck - L.heightAt(p.x, p.z);
}

/** Muddy stretches of the road (t ranges) that get plank sections. Seeded; river-side stretches favored. */
export function mudPatches(L: SelvaLayout, quality: "low" | "high"): Array<[number, number]> {
  const R = rng(57);
  const out: Array<[number, number]> = [];
  const len = L.trail.length;
  const want = quality === "high" ? 11 : 7;
  for (let tries = 0; out.length < want && tries < 400; tries++) {
    const t = 0.06 + R() * 0.9;
    const half = (3.5 + R() * 3) / len;
    if (t + half > CANOPY_T[0] - 0.01 && t - half < CANOPY_T[1] + 0.01) continue;
    if (out.some(([a, b]) => t + half > a - 0.03 && t - half < b + 0.03)) continue;
    // Keep the stations' road frontage dry (their plazas meet the road there).
    let nearPlaza = false;
    const p = L.trail.pointAt(t);
    for (const pl of L.plazas) if (Math.hypot(p.x - pl.x, p.z - pl.z) < pl.r + 14) nearPlaza = true;
    if (nearPlaza) continue;
    out.push([t - half, t + half]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Road ribbon + plaza discs + spurs: one textured toon mesh with vertex tints (mud). */
export function buildRoad(L: SelvaLayout, toon: ToonCache, mud: Array<[number, number]>) {
  const { trail } = L;
  const len = trail.length;
  const STEP = 0.7;
  const steps = Math.ceil(len / STEP);
  const ACROSS = 6;
  const hw = trail.halfWidth - 0.05;
  const pos: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  let vcount = 0;
  let rowStart = -1;
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const mudC = C("#a08876");
  const tint = new THREE.Color();
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    // The deck replaces the road where the walkway leaves the ground.
    if (canopyLiftAt(L, t) > 0.12) {
      rowStart = -1;
      continue;
    }
    trail.pointAt(t, p);
    trail.tangentAt(t, tg);
    const deck = L.canopyDeckAt(t);
    const y = (deck ?? p.y) + 0.07;
    const rx = -tg.z;
    const rz = tg.x;
    let m = 0;
    for (const [a, b] of mud) {
      const e = 3 / len;
      if (t > a - e && t < b + e) m = Math.max(m, Math.min(1, (t - (a - e)) / e, (b + e - t) / e));
    }
    const base = vcount;
    for (let k = 0; k <= ACROSS; k++) {
      const f = k / ACROSS - 0.5;
      pos.push(p.x + rx * f * hw * 2, y, p.z + rz * f * hw * 2);
      uv.push(k / ACROSS, (t * len) / 5.2);
      // Mud darkens the middle more than the edges; a faint noise keeps long stretches from looking printed.
      const n = noise2(t * len * 0.15, k * 0.7) * 0.06;
      tint.setRGB(1 + n, 1 + n, 1 + n).lerp(mudC, m * (0.75 + 0.25 * (1 - Math.abs(f) * 2)));
      col.push(tint.r, tint.g, tint.b);
      vcount++;
    }
    if (rowStart >= 0)
      for (let k = 0; k < ACROSS; k++) {
        const a = rowStart + k;
        const b = rowStart + k + 1;
        const c = base + k;
        const d = base + k + 1;
        idx.push(a, b, c, b, d, c);
      }
    rowStart = base;
  }
  // Plazas: discs of packed earth, spurs to the road.
  for (const pl of L.plazas) {
    const SEG = 28;
    const r = pl.r + 0.7;
    const y = pl.y + 0.075;
    const c0 = vcount;
    pos.push(pl.x, y, pl.z);
    uv.push(pl.x / 5.2, pl.z / 5.2);
    col.push(1.05, 1.02, 1);
    vcount++;
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      const rr = r * (1 + noise2(pl.x + s * 0.7, pl.z) * 0.06);
      const x = pl.x + Math.cos(a) * rr;
      const z = pl.z + Math.sin(a) * rr;
      pos.push(x, y, z);
      uv.push(x / 5.2, z / 5.2);
      col.push(1, 0.97, 0.95);
      vcount++;
    }
    for (let s = 0; s < SEG; s++) idx.push(c0, c0 + 1 + ((s + 1) % SEG), c0 + 1 + s);
    // Spur: from the road ribbon's edge (not its centerline: the world-UV spur would show as a rotated
    // texture patch on the road) to the plaza center.
    const q = L.trailQuery(pl.x, pl.z);
    const rp = trail.pointAt(q.t);
    const dx = pl.x - rp.x;
    const dz = pl.z - rp.z;
    const l = Math.hypot(dx, dz);
    if (l > hw + 0.5) {
      const ux = dx / l;
      const uz = dz / l;
      const sx = rp.x + ux * (hw - 0.2);
      const sz = rp.z + uz * (hw - 0.2);
      const nx = -uz * hw;
      const nz = ux * hw;
      const s0 = vcount;
      for (const [x, z, yy] of [
        [sx - nx, sz - nz, rp.y],
        [sx + nx, sz + nz, rp.y],
        [pl.x - nx, pl.z - nz, pl.y],
        [pl.x + nx, pl.z + nz, pl.y],
      ] as const) {
        pos.push(x, yy + 0.072, z);
        uv.push(x / 5.2, z / 5.2);
        col.push(1, 0.98, 0.96);
        vcount++;
      }
      // Counter-clockwise seen from above (front face up): the material is double-sided, and a back face
      // would be lit as if facing down (dark band).
      idx.push(s0, s0 + 1, s0 + 2, s0 + 1, s0 + 3, s0 + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Normals of a level road point up; fix the few spur/disc triangles wound the other way.
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  geo.computeBoundingSphere();
  const mat = new THREE.MeshToonMaterial({
    map: roadTexture().tex,
    vertexColors: true,
    gradientMap: toon.toon("#fff").gradientMap,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "selva-road";
  mesh.receiveShadow = true;
  return { mesh, material: mat };
}

/** Planks across the muddy patches, roots across the road, and the sandbars: one merged vertex-colored mesh. */
export function buildGroundExtras(
  L: SelvaLayout,
  toon: ToonCache,
  mud: Array<[number, number]>,
  bars: Sandbar[],
  quality: "low" | "high",
): THREE.Mesh | null {
  const { trail } = L;
  const len = trail.length;
  const R = rng(63);
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix?: THREE.Matrix4 }> = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const woods = [C("#a87e55"), C("#96704a"), C("#b48c60"), C("#8a6440")];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const width = trail.halfWidth * 2 - 0.3;
  // Planks: 0.3 u boards with small gaps, laid across the road, slightly askew; two runners under them.
  for (const [a, b] of mud) {
    const n = Math.floor(((b - a) * len) / 0.36);
    for (let i = 0; i <= n; i++) {
      const t = a + ((b - a) * i) / n;
      trail.pointAt(t, p);
      trail.tangentAt(t, tg);
      const yaw = Math.atan2(tg.x, tg.z);
      e.set(0, yaw + (R() - 0.5) * 0.08, (R() - 0.5) * 0.04);
      q.setFromEuler(e);
      const shift = (R() - 0.5) * 0.25;
      p.x += -tg.z * shift;
      p.z += tg.x * shift;
      m.compose(p.setY(p.y + 0.1), q, new THREE.Vector3(width * (0.92 + R() * 0.08), 0.06, 0.3));
      parts.push({ geometry: box, color: woods[Math.floor(R() * woods.length)] as THREE.Color, matrix: m.clone() });
    }
  }
  // Roots: low arcs reaching in from the edges, every ~9 u (fewer on low).
  const every = quality === "high" ? 9 : 15;
  const roots = Math.floor(len / every);
  // A low hump: half a torus squashed flat, so the root arches out of the earth and dives back in.
  const root = new THREE.TorusGeometry(0.5, 0.11, 4, 9, Math.PI);
  root.scale(1, 0.22, 1);
  for (let i = 0; i < roots; i++) {
    const t = (i + R()) / roots;
    if (canopyLiftAt(L, t) > 0.05 || mud.some(([a, b]) => t > a - 0.005 && t < b + 0.005)) continue;
    trail.pointAt(t, p);
    trail.tangentAt(t, tg);
    const side = R() < 0.5 ? -1 : 1;
    const reach = 1 + R() * 1.6;
    const center = trail.halfWidth + 0.4 - reach / 2;
    // Local x across the road (Ry(atan2(tx, tz)) maps +x to the road's right).
    const yaw = Math.atan2(tg.x, tg.z) + (R() - 0.5) * 0.6;
    e.set(0, yaw, 0);
    q.setFromEuler(e);
    const pos = new THREE.Vector3(p.x - tg.z * side * center, p.y + 0.02, p.z + tg.x * side * center);
    m.compose(pos, q, new THREE.Vector3((reach + 0.8) * 0.82, 0.9, 0.7));
    parts.push({ geometry: root, color: C(R() < 0.5 ? "#5b4029" : "#6b4c30"), matrix: m.clone() });
  }
  // Sandbars: low domes just above the water, pale sand with a wet darker rim.
  const level = L.river.level;
  for (const b of bars) {
    const SEG = 24;
    const RINGS = 3;
    const pos: number[] = [];
    const ring = (k: number, s: number) => {
      const f = k / RINGS;
      const a = (s / SEG) * Math.PI * 2;
      const wob = 1 + noise2(b.x * 0.1 + s * 0.6, b.z * 0.1) * 0.12;
      const u = Math.cos(a) * b.len * f * wob;
      const v = Math.sin(a) * b.wid * f * wob;
      return [
        b.x + u * Math.cos(b.yaw) - v * Math.sin(b.yaw),
        level + 0.22 * (1 - f * f) - 0.04,
        b.z + u * Math.sin(b.yaw) + v * Math.cos(b.yaw),
      ];
    };
    for (let k = 0; k < RINGS; k++)
      for (let s = 0; s < SEG; s++) {
        const a = ring(k, s);
        const bb = ring(k, s + 1);
        const c = ring(k + 1, s);
        const d = ring(k + 1, s + 1);
        pos.push(...a, ...bb, ...c, ...bb, ...d, ...c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    parts.push({ geometry: g, color: C("#dcc591") });
  }
  const merged = mergeColored(parts);
  box.dispose();
  root.dispose();
  for (const part of parts) if (part.geometry !== box && part.geometry !== root) part.geometry.dispose();
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, toon.vertexToon());
  mesh.name = "selva-ground-extras";
  mesh.receiveShadow = true;
  return mesh;
}
