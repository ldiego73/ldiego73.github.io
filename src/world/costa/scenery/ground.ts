/**
 * The coast's ground: the layout's heightfield as one vertex-coloured toon mesh, and the road as a separate
 * crisp ribbon on top of it (one more mesh: the road band, its spur paths and the station plazas).
 *
 * Colours by place (a palette after the Peruvian coast, warm sand and ochre desert):
 *  - sea floor and wet sand below the swash line; dry beach sand above it; rock strata on cliffs and islets
 *    (horizontal bands by height); the white guano crust on the guano island's crown;
 *  - the coastal terrace and desert hills in sand-to-ochre noise, with the grey-green of the lomas (the
 *    fog-fed hill meadows of the coast) on seaward slopes;
 *  - the river valleys as a patchwork of fields (greens and a few fallow plots) on the flat floor;
 *  - the Andean foothills far east in darker browns and rust.
 * Two draw calls in all; nothing here moves.
 */
import * as THREE from "three";
import type { ToonCache } from "../../toon";
import { type CostaLayout, noise, ROAD_HALF, smooth } from "../layout";

const C = {
  seabed: "#9d8a62",
  wet: "#c2a26d",
  sand: "#efdcae",
  sandWarm: "#e6cf9c",
  terrace: "#d9bf94",
  desert: "#c9a77a",
  desertDark: "#ab8a66",
  lomas: "#a9ad74",
  lomasDark: "#8e9a62",
  rock: "#9b7d62",
  rockDark: "#7a604c",
  rockLight: "#b39577",
  guano: "#efe9dc",
  field1: "#79a84f",
  field2: "#94bf5c",
  field3: "#5f9147",
  fallow: "#bfa36a",
  riverbank: "#8fae62",
  foothill: "#9c7b62",
  foothillDark: "#7f6150",
  road: "#d2b383",
  roadEdge: "#a88a62",
  plaza: "#d8bc8c",
} as const;

const hash = (a: number, b: number) => {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

export function buildGround(L: CostaLayout, toon: ToonCache) {
  const { n, size, h } = L.grid;
  const b = L.bounds;
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  geo.translate((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const tmp = new THREE.Color();
  const P = Object.fromEntries(Object.entries(C).map(([k, v]) => [k, new THREE.Color(v)])) as Record<
    keyof typeof C,
    THREE.Color
  >;
  const step = size / n;
  const guano = L.islets.find((i) => i.id === "guano");
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    // Read the height by grid position (the plane's vertex order is not the heightfield's).
    const gi = Math.round((x - b.x0) / step);
    const gj = Math.round((z - b.z0) / step);
    const y = h[gj * (n + 1) + gi] as number;
    pos.setY(i, y);
    const sd = L.shoreDist(x, z);
    const slope =
      Math.hypot(L.heightAt(x + 1.5, z) - L.heightAt(x - 1.5, z), L.heightAt(x, z + 1.5) - L.heightAt(x, z - 1.5)) / 3;
    const nz = noise(x / 23, z / 23);
    const green = L.green(x, z);
    if (y < 0.05) {
      c.copy(P.seabed).lerp(P.wet, smooth(-3, 0.05, y));
    } else if (y < 0.42 && slope < 0.5) {
      c.copy(P.wet);
    } else if (slope > 0.62 || (y > 0.4 && slope > 0.48 && sd < 40)) {
      // Rock strata: bands by height, a little noise.
      const band = Math.floor(y / 1.6 + nz * 0.8) % 3;
      c.copy(band === 0 ? P.rock : band === 1 ? P.rockDark : P.rockLight);
    } else if (green > 0.35 && y < 5) {
      const rd = L.riverDist(x, z);
      if (rd < 4) c.copy(P.riverbank);
      else {
        // Field plots, roughly 9 × 7 u, a few fallow.
        const r = hash(Math.floor(x / 9), Math.floor(z / 7));
        c.copy(r < 0.3 ? P.field1 : r < 0.6 ? P.field2 : r < 0.85 ? P.field3 : P.fallow);
      }
      c.lerp(P.terrace, smooth(0.6, 0.35, green));
    } else if (sd < 24 && y < 2.4) {
      c.copy(P.sand).lerp(P.sandWarm, nz);
    } else {
      c.copy(P.terrace).lerp(P.desert, smooth(0.35, 0.75, nz));
      if (y > 9) c.lerp(P.desertDark, smooth(9, 40, y) * 0.7);
      // Lomas: grey-green on the seaward hills where the winter fog settles.
      const lomas = smooth(0.55, 0.7, noise(x / 38 + 4, z / 38)) * smooth(6, 14, y) * (1 - smooth(140, 230, x));
      if (lomas > 0) c.lerp(nz > 0.5 ? P.lomas : P.lomasDark, lomas * 0.85);
      // Foothills: darker earth and rust toward the Andes.
      const foot = smooth(220, 420, x);
      if (foot > 0) c.lerp(tmp.copy(P.foothill).lerp(P.foothillDark, nz), foot);
    }
    if (guano) {
      const r = Math.hypot(x - guano.x, z - guano.z);
      if (r < guano.r * 0.9 && y > 4) c.copy(P.guano).lerp(P.rockLight, smooth(guano.r * 0.55, guano.r * 0.9, r) * 0.6);
    }
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "costa-terrain";
  mesh.receiveShadow = true;

  // ---------------------------------------------------------------- road ribbon, spurs and plazas
  const road = buildRoad(L, toon);
  return {
    mesh,
    road: road.mesh,
    dispose() {
      geo.dispose();
      road.dispose();
    },
  };
}

/** A strip a little above the flattened ground: packed earth with darker shoulders, plus plaza discs. */
function buildRoad(L: CostaLayout, toon: ToonCache) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const mid = new THREE.Color(C.road);
  const edge = new THREE.Color(C.roadEdge);
  const plaza = new THREE.Color(C.plaza);
  const LIFT = 0.07;
  const across = [-1, -0.82, -0.4, 0, 0.4, 0.82, 1];
  const strip = (
    pts: Array<{ x: number; z: number; tx: number; tz: number }>,
    half: number,
    y: (p: { x: number; z: number }) => number,
    lift = LIFT,
  ) => {
    const base = pos.length / 3;
    for (const p of pts) {
      const nx = -p.tz;
      const nz = p.tx;
      for (const a of across) {
        const x = p.x + nx * a * half;
        const z = p.z + nz * a * half;
        pos.push(x, y({ x, z }) + lift, z);
        const e = Math.abs(a) > 0.9 ? edge : Math.abs(a) > 0.6 ? edge.clone().lerp(mid, 0.5) : mid;
        col.push(e.r, e.g, e.b);
      }
    }
    const w = across.length;
    for (let i = 0; i < pts.length - 1; i++)
      for (let k = 0; k < w - 1; k++) {
        const a = base + i * w + k;
        const b2 = a + 1;
        const c2 = a + w;
        const d = c2 + 1;
        idx.push(a, b2, c2, b2, d, c2);
      }
  };
  // The road, every ~1.5 u.
  const N = Math.ceil(L.trail.length / 1.5);
  const pts: Array<{ x: number; z: number; tx: number; tz: number }> = [];
  const v = new THREE.Vector3();
  const tg = new THREE.Vector3();
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    L.trail.pointAt(t, v);
    L.trail.tangentAt(t, tg);
    const l = Math.hypot(tg.x, tg.z) || 1;
    pts.push({ x: v.x, z: v.z, tx: tg.x / l, tz: tg.z / l });
  }
  strip(pts, ROAD_HALF + 0.35, (p) => L.groundAt(p.x, p.z));
  // Spurs to the plazas (off-road stations).
  for (const pl of L.plazas) {
    const q = L.trailQuery(pl.x, pl.z);
    if (q.d < 1) continue;
    const a = L.trail.pointAt(q.t);
    const dx = pl.x - a.x;
    const dz = pl.z - a.z;
    const d = Math.hypot(dx, dz);
    // From just inside the road's edge (slightly lower, so the road wins where they overlap) to the plaza.
    const u0 = Math.min(0.5, (ROAD_HALF - 0.2) / d);
    const m = Math.max(2, Math.ceil((d * (1 - u0)) / 1.5));
    const sp: typeof pts = [];
    for (let i = 0; i <= m; i++) {
      const u = u0 + ((1 - u0) * i) / m;
      sp.push({ x: a.x + dx * u, z: a.z + dz * u, tx: dx / d, tz: dz / d });
    }
    strip(sp, 1.7, (p) => L.heightAt(p.x, p.z), LIFT - 0.025);
  }
  // Plaza discs.
  for (const pl of L.plazas) {
    const base = pos.length / 3;
    pos.push(pl.x, L.heightAt(pl.x, pl.z) + LIFT + 0.01, pl.z);
    col.push(plaza.r, plaza.g, plaza.b);
    const seg = 28;
    for (let k = 0; k <= seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const r = pl.r + 0.4;
      const x = pl.x + Math.cos(a) * r;
      const z = pl.z + Math.sin(a) * r;
      pos.push(x, L.heightAt(x, z) + LIFT + 0.01, z);
      col.push(edge.r, edge.g, edge.b);
      if (k > 0) idx.push(base, base + k + 1, base + k);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Drawn just in front of the ground it lies on (no z-fighting on the flattened band).
  const mat = toon.vertexToon({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "costa-road";
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() {
      geo.dispose();
    },
  };
}
