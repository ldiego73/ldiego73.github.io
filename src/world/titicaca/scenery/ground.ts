/**
 * Ground of the Collasuyu: the terrain mesh (per-face flat toon colours over smooth grid normals, like the other
 * worlds) and the road surface.
 *
 *  - Terrain: vertices straight from `layout.grid` with the same (a,b,d)/(b,c,d) diagonal as `heightAt`, so
 *    everything placed with heightAt sits on it. Faces wholly under the lake are skipped (the opaque water
 *    hides them); those dipping under it are a second mesh kept off the ink pass, like the water. Faces are
 *    coloured by what lies there: wet and dry sand at the waterline, the green bofedal
 *    meadows by the shore, ochre and gold puna grass, the chacras' crops (./fields.ts), bare rock on steep
 *    slopes and the browner high ground.
 *  - Road: the ≈ 3.8 u grid is too coarse for a 5.2 u road, so the road, the plazas and the spurs up to them
 *    are one ribbon mesh with a canvas texture of packed earth and set flagstones (the Qhapaq Ñan by the lake).
 */
import * as THREE from "three";
import { canvasTex, noise2, rng } from "../../tex";
import { noOutline, type ToonCache } from "../../toon";
import type { TiticacaLayout } from "../layout";
import { CROPS, parcelAt } from "./fields";

const C = (hex: string) => new THREE.Color(hex);
const G = {
  wet: C("#b9a67a"),
  sand: C("#dccb98"),
  bofedal: [C("#7fa651"), C("#8fb35a"), C("#6f9a4a")],
  puna: [C("#c8b06c"), C("#bda563"), C("#d2bb78"), C("#b39c5e")],
  punaGreen: C("#a9aa62"),
  rock: C("#9a8f7c"),
  rockDark: C("#7f7666"),
  high: [C("#a8916c"), C("#9c8a6a"), C("#b49c72")],
  shoulder: C("#a48a5e"),
  crops: CROPS.map((c) => C(c)),
};

/** Packed ochre earth with set flagstones down the middle and kerb stones (repeats along the road). */
function roadTexture() {
  return canvasTex(
    "titicaca-road",
    256,
    512,
    (ctx, w, h) => {
      const R = rng(83);
      ctx.fillStyle = "#c9ad7c";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = R() < 0.5 ? "rgb(160 130 90 / 0.35)" : "rgb(232 212 168 / 0.35)";
        ctx.beginPath();
        ctx.ellipse(R() * w, R() * h, 10 + R() * 24, 6 + R() * 14, R() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // Flagstones: irregular rounded slabs in a loose central band.
      for (let y = 6; y < h; y += 26 + R() * 10) {
        let x = w * 0.2 + R() * 10;
        while (x < w * 0.8) {
          const sw = 22 + R() * 26;
          const sh = 16 + R() * 10;
          const g = 150 + Math.floor(R() * 40);
          ctx.fillStyle = `rgb(${g} ${g - 6} ${g - 16})`;
          ctx.strokeStyle = "rgb(110 92 70 / 0.8)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.roundRect(x, y + (R() - 0.5) * 6, sw, sh, 6);
          ctx.fill();
          ctx.stroke();
          x += sw + 4 + R() * 6;
        }
      }
      // Kerb stones along both edges.
      for (const x0 of [0, w - 18]) {
        for (let y = 0; y < h; y += 20 + R() * 8) {
          ctx.fillStyle = R() < 0.5 ? "#a39a8a" : "#8f877b";
          ctx.fillRect(x0 + R() * 3, y, 15, 16 + R() * 4);
        }
      }
      // Tufts of grass creeping in from the edges.
      for (let i = 0; i < 70; i++) {
        const x = R() < 0.5 ? 18 + R() * 20 : w - 38 + R() * 20;
        ctx.fillStyle = R() < 0.5 ? "#b49a58" : "#8f9a52";
        ctx.fillRect(x, R() * h, 2, 5 + R() * 5);
      }
    },
    { repeat: true },
  );
}

/** Terrain meshes from the layout grid: the dry faces (inked) and those dipping under the lake (not inked). */
export function buildTerrain(L: TiticacaLayout, toon: ToonCache): { dry: THREE.Mesh; wet: THREE.Mesh } {
  const { n, size, h: H } = L.grid;
  const step = size / n;
  const N1 = n + 1;
  const x0 = L.bounds.x0;
  const z0 = L.bounds.z0;
  const hw = L.trail.halfWidth;
  const nrm = new Float32Array(N1 * N1 * 3);
  const v = new THREE.Vector3();
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const k = j * N1 + i;
      const hl = H[j * N1 + Math.max(0, i - 1)] as number;
      const hr = H[j * N1 + Math.min(n, i + 1)] as number;
      const hd = H[Math.max(0, j - 1) * N1 + i] as number;
      const hu = H[Math.min(n, j + 1) * N1 + i] as number;
      v.set(hl - hr, 2 * step, hd - hu).normalize();
      nrm[k * 3] = v.x;
      nrm[k * 3 + 1] = v.y;
      nrm[k * 3 + 2] = v.z;
    }
  const faces = n * n * 2;
  // Two buffers: dry faces (inked) and wet faces dipping under the lake (colour only, see buildTerrain's doc).
  const bufs = [0, 1].map(() => ({
    pos: new Float32Array(faces * 9),
    nor: new Float32Array(faces * 9),
    col: new Float32Array(faces * 9),
    f: 0,
  }));
  const out = new THREE.Color();
  const pick = (arr: THREE.Color[], f: number) => arr[Math.abs(Math.floor(f)) % arr.length] as THREE.Color;
  const onPath = (x: number, z: number) => {
    if (L.trailQuery(x, z).d < hw + 0.9) return true;
    for (const p of L.plazas) if (Math.hypot(x - p.x, z - p.z) < p.r + 0.9) return true;
    return false;
  };
  const faceColor = (x: number, y: number, z: number, ny: number) => {
    const land = L.landField(x, z);
    if (y < L.level + 0.02) return out.copy(G.wet);
    if (onPath(x, z)) return out.copy(G.shoulder);
    if (land < 2.2 || y < L.level + 0.25) return out.copy(noise2(x * 0.3, z * 0.3) > 0 ? G.sand : G.wet);
    if (ny < 0.74) return out.copy(noise2(x * 0.2, z * 0.2) > 0 ? G.rock : G.rockDark);
    const crop = parcelAt(x, z);
    if (crop >= 0 && ny > 0.9) return out.copy(G.crops[crop] as THREE.Color);
    const nz = noise2(x * 0.035, z * 0.035);
    if (y > 24) return out.copy(pick(G.high, (nz + 1) * 2.4 + noise2(x * 0.2, z * 0.2)));
    // Bofedales: green wet meadows in a band along the shore and in hollows.
    if (land < 14 + nz * 6) return out.copy(pick(G.bofedal, (nz + 1) * 3 + noise2(x * 0.25, z * 0.25) * 1.5));
    if (nz > 0.35) return out.copy(G.punaGreen);
    return out.copy(pick(G.puna, (nz + 1) * 3.1 + noise2(x * 0.18, z * 0.18) * 1.3));
  };
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  const vx = (k: number) => x0 + (k % N1) * step;
  const vz = (k: number) => z0 + Math.floor(k / N1) * step;
  const deep = L.level - 0.005;
  const wetBelow = L.level - 0.03;
  const tri = (a: number, b: number, c: number) => {
    const ya = H[a] as number;
    const yb = H[b] as number;
    const yc = H[c] as number;
    // Under the opaque lake: never seen.
    if (ya < deep && yb < deep && yc < deep) return;
    const buf = bufs[Math.min(ya, yb, yc) < wetBelow ? 1 : 0] as (typeof bufs)[number];
    e1.set(vx(b) - vx(a), yb - ya, vz(b) - vz(a));
    e2.set(vx(c) - vx(a), yc - ya, vz(c) - vz(a));
    const ny = Math.abs(e2.cross(e1).normalize().y);
    faceColor((vx(a) + vx(b) + vx(c)) / 3, (ya + yb + yc) / 3, (vz(a) + vz(b) + vz(c)) / 3, ny);
    for (const k of [a, b, c]) {
      const o = buf.f * 3;
      buf.pos[o] = vx(k);
      buf.pos[o + 1] = H[k] as number;
      buf.pos[o + 2] = vz(k);
      buf.nor[o] = nrm[k * 3] as number;
      buf.nor[o + 1] = nrm[k * 3 + 1] as number;
      buf.nor[o + 2] = nrm[k * 3 + 2] as number;
      buf.col[o] = out.r;
      buf.col[o + 1] = out.g;
      buf.col[o + 2] = out.b;
      buf.f++;
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
  const mat = toon.vertexToon();
  const meshes = bufs.map((buf, i) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(buf.pos.slice(0, buf.f * 3), 3));
    geo.setAttribute("normal", new THREE.BufferAttribute(buf.nor.slice(0, buf.f * 3), 3));
    geo.setAttribute("color", new THREE.BufferAttribute(buf.col.slice(0, buf.f * 3), 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = i ? "titicaca-terrain:wet" : "titicaca-terrain";
    mesh.receiveShadow = true;
    return mesh;
  });
  const dry = meshes[0] as THREE.Mesh;
  const wet = meshes[1] as THREE.Mesh;
  // The water is off the ink pass (./water.ts), so the ink would see through it: the faces dipping under the lake
  // stay off it too, and the dry terrain's edge draws the shore line.
  noOutline(wet);
  return { dry, wet };
}

/** Road ribbon + plaza discs + spurs: one textured toon mesh with vertex tints. */
export function buildRoad(L: TiticacaLayout, toon: ToonCache) {
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
  const tint = new THREE.Color();
  const lift = 0.07;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    trail.pointAt(t, p);
    trail.tangentAt(t, tg);
    const rx = -tg.z;
    const rz = tg.x;
    const base = vcount;
    for (let k = 0; k <= ACROSS; k++) {
      const f = k / ACROSS - 0.5;
      const x = p.x + rx * f * hw * 2;
      const z = p.z + rz * f * hw * 2;
      pos.push(x, Math.max(p.y, L.heightAt(x, z)) + lift, z);
      uv.push(k / ACROSS, (t * len) / 5.2);
      const n = noise2(t * len * 0.12, k * 0.7) * 0.07;
      tint.setRGB(1 + n, 1 + n, 1 + n);
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
  // Land plazas: discs of packed earth that follow the flattened ground.
  for (const pl of L.plazas) {
    if (pl.y < L.level + 0.55 && L.landField(pl.x, pl.z) < 0) continue;
    const SEG = 30;
    const RINGS = 3;
    const r = pl.r + 0.7;
    const c0 = vcount;
    pos.push(pl.x, L.heightAt(pl.x, pl.z) + lift, pl.z);
    uv.push(pl.x / 5.2, pl.z / 5.2);
    col.push(1.04, 1.02, 1);
    vcount++;
    for (let ring = 1; ring <= RINGS; ring++)
      for (let s = 0; s < SEG; s++) {
        const a = (s / SEG) * Math.PI * 2;
        const rr = (r * ring) / RINGS;
        const wob = ring === RINGS ? 1 + noise2(pl.x + s * 0.7, pl.z) * 0.06 : 1;
        const x = pl.x + Math.cos(a) * rr * wob;
        const z = pl.z + Math.sin(a) * rr * wob;
        pos.push(x, L.heightAt(x, z) + lift, z);
        uv.push(x / 5.2, z / 5.2);
        col.push(1, 0.98, 0.95);
        vcount++;
      }
    for (let s = 0; s < SEG; s++) idx.push(c0, c0 + 1 + ((s + 1) % SEG), c0 + 1 + s);
    for (let ring = 1; ring < RINGS; ring++) {
      const r0 = c0 + 1 + (ring - 1) * SEG;
      const r1 = c0 + 1 + ring * SEG;
      for (let s = 0; s < SEG; s++) {
        const s1 = (s + 1) % SEG;
        idx.push(r0 + s, r0 + s1, r1 + s, r0 + s1, r1 + s1, r1 + s);
      }
    }
  }
  // Spurs: ribbons from the road's edge to each land plaza, following the ground.
  for (const sp of L.spurs) {
    const dx = sp.b[0] - sp.a[0];
    const dz = sp.b[1] - sp.a[1];
    const l = Math.hypot(dx, dz);
    const ux = dx / l;
    const uz = dz / l;
    const n = Math.ceil(l / 0.8);
    let prev = -1;
    for (let i = 0; i <= n; i++) {
      const s = i / n;
      const cx = sp.a[0] + dx * s;
      const cz = sp.a[1] + dz * s;
      const b0 = vcount;
      for (const side of [-1, 1]) {
        const x = cx - uz * side * sp.half;
        const z = cz + ux * side * sp.half;
        pos.push(x, L.heightAt(x, z) + lift + 0.005, z);
        uv.push((side + 1) / 2, (s * l) / 5.2);
        col.push(0.98, 0.96, 0.94);
        vcount++;
      }
      if (prev >= 0) idx.push(prev, prev + 1, b0, prev + 1, b0 + 1, b0);
      prev = b0;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // The road follows a gentle ground: light it as if level (no dark bands from wound triangles).
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
  mesh.name = "titicaca-road";
  mesh.receiveShadow = true;
  return { mesh, material: mat };
}
