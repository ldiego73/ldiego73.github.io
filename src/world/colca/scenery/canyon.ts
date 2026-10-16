/**
 * The Colca canyon: one swept, vertex-coloured mesh (plus the river ribbon). Every column along x carries the
 * same fixed list of profile "slots" across the canyon (s = distance south of the north rim, ../plan.ts), so
 * neighbouring columns join quad by quad:
 *
 *   lip      a strip just outside each rim, a hair under the plateau (overlaps the ground mesh, which wins)
 *   cliff    a sheer rock lip right under each rim, so from the road the eye drops past it into the canyon
 *   andenes  TERRACES fixed terrace bands on the upper slopes (north and south): a flat tread and a near-vertical
 *            stone riser each. Where a column is not terraced (patches, and the cliff below the Cruz del
 *            Cóndor) the same slots follow the smooth slope instead, so terraced and wild slopes blend.
 *   walls    the steep lower walls, with rock ribs (noise) and strata bands coloured by height, which is what
 *            makes the depth read from the rim
 *   bed      the river bed; the water is a separate ribbon at CANYON.riverY (`isWater` in the layout).
 *
 * Faces are flat (non-indexed): the toon ramp then shades every tread, riser and rib as its own facet. Tread
 * colours are a patchwork of fields (green, yellow-green, gold, fallow brown) by terrace and stretch.
 * ~50k triangles at high quality, one draw call; the river one more.
 */
import * as THREE from "three";
import type { Quality } from "../../engine";
import type { ToonCache } from "../../toon";
import { canyonY, noise, plateauY, smooth, southY } from "../layout";
import { CANYON, rimZ } from "../plan";

/** x range of the sweep (beyond the walkable square: the canyon bends away south there, ../plan.ts rimZ). */
const X0 = -1150;
const X1 = 1150;
/** Terrace bands (s ranges) and how many terraces each holds. */
const NORTH_BAND: [number, number, number] = [CANYON.cliffEnd, CANYON.terraceEnd, 15];
/** Seen from 200–400 u away: fewer, deeper terraces, so they read as steps instead of shimmering hatching. */
const SOUTH_BAND: [number, number, number] = [
  CANYON.south - CANYON.cliffEnd - CANYON.southTerraces,
  CANYON.south - CANYON.cliffEnd,
  12,
];

const FIELDS = ["#7fa552", "#9db45a", "#c9b462", "#a07a50", "#5f9048", "#b7a85a", "#87a04e"].map(
  (c) => new THREE.Color(c),
);
const RISER = new THREE.Color("#a39380");
const RISER_2 = new THREE.Color("#968672");
const SLOPE = new THREE.Color("#9c8a62");
const SLOPE_GREEN = new THREE.Color("#8c9555");
const STRATA = ["#9a6f55", "#86604a", "#a87d5c", "#7b5a48", "#b08a66"].map((c) => new THREE.Color(c));
const BED = new THREE.Color("#7e8f5c");
const PLATEAU = new THREE.Color("#b9a46e");

type Kind = 0 | 1 | 2 | 3 | 4 | 5;
/** Slot kinds: 0 lip, 1 tread, 2 riser, 3 wall, 4 bed, 5 smooth slope. */
const LIP: Kind = 0;
const TREAD: Kind = 1;
const RISE: Kind = 2;
const WALL: Kind = 3;
const BEDK: Kind = 4;

interface Slot {
  s: number;
  /** Kind of the segment from this slot to the next. */
  kind: Kind;
  /** Terrace index (fields) or -1. */
  k: number;
  /** Terraced slots take the smooth height at this s instead (a tread's whole width sits at one level). */
  hold?: number;
}

function hash(a: number, b: number) {
  let h = Math.imul(a, 2654435761) ^ Math.imul(b, 40503) ^ 0x9e37;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

/** The fixed slots across the canyon (same for every column). */
function slots(): Slot[] {
  const out: Slot[] = [{ s: -9, kind: LIP, k: -1 }];
  const band = ([a, b, n]: [number, number, number], south: boolean) => {
    const w = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const s0 = a + k * w;
      const s1 = s0 + w;
      // North: treads step down going out (hold the inner, higher edge); south: up toward the rim.
      if (!south) {
        out.push({ s: s0 + 0.35, kind: TREAD, k, hold: s0 + 0.35 });
        out.push({ s: s1, kind: RISE, k, hold: s0 + 0.35 });
      } else {
        out.push({ s: s0, kind: RISE, k: 100 + k });
        out.push({ s: s0 + 0.35, kind: TREAD, k: 100 + k, hold: s1 });
      }
    }
  };
  // The rock lip under the north rim, then the terraces.
  for (let s = 0; s < NORTH_BAND[0]; s += 4) out.push({ s, kind: WALL, k: -1 });
  band(NORTH_BAND, false);
  for (let s = NORTH_BAND[1] + 5; s < CANYON.river - CANYON.riverHalf - 6; s += 5) out.push({ s, kind: WALL, k: -1 });
  for (let s = CANYON.river - CANYON.riverHalf - 6; s <= CANYON.river + CANYON.riverHalf + 6; s += 3.5)
    out.push({ s, kind: BEDK, k: -1 });
  for (let s = CANYON.river + CANYON.riverHalf + 8; s < SOUTH_BAND[0]; s += 5) out.push({ s, kind: WALL, k: -1 });
  band(SOUTH_BAND, true);
  for (let s = SOUTH_BAND[1]; s < CANYON.south; s += 4) out.push({ s, kind: WALL, k: -1 });
  out.push({ s: CANYON.south, kind: LIP, k: -1 });
  out.push({ s: CANYON.south + 9, kind: LIP, k: -1 });
  return out;
}

/** 0..1: how terraced the slopes are at x (patches; none under the Cruz del Cóndor, a sheer cliff there). */
export function terraced(x: number, south: boolean): number {
  const n = noise(x / 150, south ? 7.3 : 1.1, 0x7e);
  const cruz = 1 - smooth(-560, -430, x) * (1 - smooth(-430, -380, x));
  const far = 1 - smooth(820, 1000, Math.abs(x));
  return smooth(0.3, 0.45, n) * (south ? 1 : cruz) * far;
}

export function buildCanyon(toon: ToonCache, quality: Quality): { group: THREE.Group; dispose(): void } {
  const dx = quality === "high" ? 7 : 10;
  const cols = Math.ceil((X1 - X0) / dx);
  const S = slots();
  const ns = S.length;
  const ys = new Float32Array((cols + 1) * ns);
  const zs = new Float32Array((cols + 1) * ns);
  const xs = new Float32Array(cols + 1);
  const terr = new Float32Array((cols + 1) * 2);
  for (let c = 0; c <= cols; c++) {
    const x = X0 + c * dx;
    xs[c] = x;
    const rz = rimZ(x);
    const top = plateauY(x, rz);
    const southTop = southY(x, rz + CANYON.south);
    // The canyon closes at its far ends (beyond the fog), so no open cut shows.
    const depth = 1 - smooth(980, 1150, Math.abs(x));
    const tn = terraced(x, false);
    const ts = terraced(x, true);
    terr[c * 2] = tn;
    terr[c * 2 + 1] = ts;
    for (let i = 0; i < ns; i++) {
      const sl = S[i] as Slot;
      let y: number;
      // The lips tuck just under the ground mesh where they overlap it (it wins; no z-fighting far away).
      if (sl.s < 0) y = plateauY(x, rz + sl.s) - 0.12;
      else if (sl.s > CANYON.south) y = southY(x, rz + sl.s) - 0.12;
      else {
        const smoothY = canyonY(sl.s, top, southTop);
        const t = sl.k >= 100 ? ts : tn;
        if (sl.hold !== undefined) y = THREE.MathUtils.lerp(smoothY, canyonY(sl.hold, top, southTop), t);
        else y = smoothY;
        if (sl.kind === WALL) {
          // Rock ribs and gullies down the steep walls.
          const rib = (noise(x / 23, sl.s / 17, 0x31) - 0.5) * 16 + (noise(x / 7, sl.s / 9, 0x32) - 0.5) * 4;
          y += rib * smooth(0, 14, Math.min(sl.s - NORTH_BAND[1], SOUTH_BAND[0] - sl.s));
        }
        y = THREE.MathUtils.lerp(top, y, depth);
      }
      ys[c * ns + i] = y;
      zs[c * ns + i] = rz + sl.s;
    }
  }

  // Non-indexed quads (two triangles) per column × segment, coloured by the segment.
  const quads = cols * (ns - 1);
  const pos = new Float32Array(quads * 18);
  const col = new Float32Array(quads * 18);
  const cc = new THREE.Color();
  let o = 0;
  const put = (x: number, y: number, z: number) => {
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    col[o] = cc.r;
    col[o + 1] = cc.g;
    col[o + 2] = cc.b;
    o += 3;
  };
  for (let c = 0; c < cols; c++) {
    const xa = xs[c] as number;
    const xb = xs[c + 1] as number;
    const stretch = Math.floor((xa + 2000) / 52);
    for (let i = 0; i < ns - 1; i++) {
      const sl = S[i] as Slot;
      const ya = ys[c * ns + i] as number;
      const yb = ys[c * ns + i + 1] as number;
      const t = sl.k >= 100 ? (terr[c * 2 + 1] as number) : (terr[c * 2] as number);
      // Colour of this segment.
      if (sl.kind === LIP) cc.copy(PLATEAU).lerp(SLOPE, 0.15);
      else if (sl.kind === TREAD || sl.kind === RISE) {
        // Fields in blocks of four terraces per stretch (a terrace-by-terrace patchwork would turn into
        // shimmering stripes seen along the canyon), each terrace a shade lighter or darker than the next.
        const f = FIELDS[
          Math.floor(hash(stretch, Math.floor((sl.k % 100) / 4) + (sl.k >= 100 ? 50 : 0)) * FIELDS.length)
        ] as THREE.Color;
        if (sl.kind === TREAD)
          cc.copy(SLOPE)
            .lerp(SLOPE_GREEN, noise(xa / 40, sl.s / 30, 0x61))
            .lerp(f, t)
            .multiplyScalar(1 + (sl.k % 2 ? 0.04 : -0.03) * t);
        // Stone walls, tinted toward the field above them so far terraces stay soft.
        else
          cc.copy(SLOPE)
            .lerp(hash(stretch, sl.k + 50) < 0.5 ? RISER : RISER_2, t)
            .lerp(f, 0.35 * t);
      } else if (sl.kind === BEDK) cc.copy(BED).lerp(STRATA[0] as THREE.Color, noise(xa / 30, sl.s, 0x44) * 0.5);
      else {
        // Strata: bands by height, shifted a little along the canyon so they are not ruler-straight.
        const band = Math.floor((ya + noise(xa / 90, 0, 0x45) * 12) / 9);
        cc.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length] as THREE.Color);
        cc.multiplyScalar(0.92 + 0.12 * noise(xa / 15, sl.s / 11, 0x46));
      }
      const za = zs[c * ns + i] as number;
      const zb = zs[c * ns + i + 1] as number;
      const za2 = zs[(c + 1) * ns + i] as number;
      const zb2 = zs[(c + 1) * ns + i + 1] as number;
      const ya2 = ys[(c + 1) * ns + i] as number;
      const yb2 = ys[(c + 1) * ns + i + 1] as number;
      // Quad corners: (xa, i) (xa, i+1) (xb, i+1) (xb, i); counter-clockwise from above / from the inside.
      put(xa, ya, za);
      put(xa, yb, zb);
      put(xb, ya2, za2);
      put(xb, ya2, za2);
      put(xa, yb, zb);
      put(xb, yb2, zb2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mat = toon.vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-canyon";
  mesh.receiveShadow = true;

  // River: a ribbon on the water line, a little wider than the bed's flat, with pale riffles.
  const rv: number[] = [];
  const rc: number[] = [];
  const deep = new THREE.Color("#4f9a9a");
  const foam = new THREE.Color("#cfe6dc");
  for (let c = 0; c < cols; c++) {
    const xa = xs[c] as number;
    const xb = xs[c + 1] as number;
    const across = [-CANYON.riverHalf - 1, -2, 2, CANYON.riverHalf + 1];
    for (let k = 0; k < across.length - 1; k++) {
      const s0 = CANYON.river + (across[k] as number);
      const s1 = CANYON.river + (across[k + 1] as number);
      const riffle = noise(xa / 9, k, 0x71) > 0.72;
      cc.copy(riffle && k !== 1 ? foam : deep).lerp(foam, k === 1 && noise(xa / 14, 3, 0x72) > 0.8 ? 0.5 : 0);
      const y = CANYON.riverY;
      const pa = rimZ(xa);
      const pb = rimZ(xb);
      for (const [x, z] of [
        [xa, pa + s0],
        [xa, pa + s1],
        [xb, pb + s0],
        [xb, pb + s0],
        [xa, pa + s1],
        [xb, pb + s1],
      ] as const) {
        rv.push(x, y, z);
        rc.push(cc.r, cc.g, cc.b);
      }
    }
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute("position", new THREE.Float32BufferAttribute(rv, 3));
  rgeo.setAttribute("color", new THREE.Float32BufferAttribute(rc, 3));
  rgeo.computeVertexNormals();
  const rmat = toon.vertexToon();
  const river = new THREE.Mesh(rgeo, rmat);
  river.name = "colca-river";

  const group = new THREE.Group();
  group.name = "colca-canyon";
  group.add(mesh, river);
  return {
    group,
    dispose() {
      geo.dispose();
      mat.dispose();
      rgeo.dispose();
      rmat.dispose();
    },
  };
}
