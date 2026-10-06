/**
 * Procedural low-poly vegetation of the Machu Picchu cloud forest → puna, one merged vertex-colored
 * geometry per species (local origin at the foot, +Y up). Sizes are in world units (avatar ≈ 1.7):
 *  - ichu (Jarava ichu) tufts ≈ 0.6–1.3 tall in three looks: tall golden with seed stalks, short green-gold, dry pale
 *  - tarwi silvestre (wild lupine) ≈ 0.7 with blue-violet flower spikes; yellow daisy clusters (Bidens andicola) ≈ 0.35
 *  - queñua (Polylepis): twisted multi-stem, red peeling bark, small grey-green clumps ≈ 3.6
 *  - aliso (Alnus acuminata): straight silver trunk, tall conical crown ≈ 7.5
 *  - unca (Myrcianthes) cloud-forest tree: mossy crooked trunk, umbrella crown, bromeliads, orchids, hanging moss ≈ 6
 *  - pisonay (Erythrina falcata): massive spreading tree crowned with red flowers ≈ 7.5 tall, ≈ 9 wide
 *  - chusquea bamboo: fountain of arching culms with leaf sprays ≈ 3.2
 * Each tree also returns local perch points (crown tops, limbs) and flower points (for hummingbirds).
 */
import * as THREE from "three";
import { rng } from "../tex";
import { arcPath, blob, GeoBuilder, leafShade, tube } from "./geom";

export type V3 = [number, number, number];
export interface FloraModel {
  geo: THREE.BufferGeometry;
  /** Local points where a small bird can sit (on top of a clump or limb). */
  perches: V3[];
  /** Local points of flowers / epiphytes (hummingbird visits). */
  flowers: V3[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const GOLDEN = 2.39996;

// ---------------------------------------------------------------- grasses

interface TuftSpec {
  seed: number;
  blades: number;
  len: [number, number];
  r: number;
  lean: [number, number];
  bend: [number, number];
  base: string;
  tip: string;
  stalks: number;
  segs: number;
}

function tuft(b: GeoBuilder, s: TuftSpec) {
  const R = rng(s.seed);
  const cb = new THREE.Color(s.base);
  const ct = new THREE.Color(s.tip);
  const tmp = new THREE.Color();
  for (let i = 0; i < s.blades; i++) {
    const a = i * GOLDEN + R() * 0.5;
    // Outer blades are shorter and lean further out: a fountain, dense at the crown.
    const outer = (i % 3) / 2;
    const len = s.len[0] + (s.len[1] - s.len[0]) * (1 - outer * 0.6) * (0.75 + R() * 0.25);
    const lean = s.lean[0] + (s.lean[1] - s.lean[0]) * (outer * 0.7 + R() * 0.3);
    const bend = s.bend[0] + (s.bend[1] - s.bend[0]) * R();
    const off = 0.03 + R() * 0.07;
    const base = V(Math.cos(a) * off, 0, Math.sin(a) * off);
    const pts = arcPath(base, a, len, lean, bend, s.segs);
    const radii = pts.map((_, k) => s.r * (1 - (k / s.segs) * 0.8));
    const g = tube(pts, radii, 3, {
      tip: true,
      color: (t) => tmp.copy(cb).lerp(ct, t ** 0.8),
      flex: (t) => t * t * len * 0.11,
    });
    b.add(g);
  }
  // Feathery seed heads: thin straight stalks topped by a pale spindle.
  for (let i = 0; i < s.stalks; i++) {
    const a = R() * Math.PI * 2;
    const len = s.len[1] * (1.1 + R() * 0.18);
    const lean = 0.08 + R() * 0.22;
    const pts = arcPath(V(0, 0, 0), a, len, lean, 0.12, 2);
    b.add(
      tube(pts, [0.022, 0.016, 0.01], 3, {
        tip: true,
        color: (t) => tmp.copy(cb).lerp(ct, t),
        flex: (t) => t * t * len * 0.13,
      }),
    );
    const top = pts[pts.length - 1] as THREE.Vector3;
    const prev = pts[pts.length - 2] as THREE.Vector3;
    const head = new THREE.OctahedronGeometry(0.05, 0);
    head.scale(1, 3.6, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), top.clone().sub(prev).normalize());
    head.applyQuaternion(q);
    head.translate(top.x, top.y + 0.1, top.z);
    b.add(head, { color: "#f1e2b0", flex: len * 0.13 });
  }
}

export type IchuKind = "tall" | "short" | "dry";

/** Ichu tuft geometry. `lite` (quality low) uses fewer, simpler blades. */
export function ichuModel(kind: IchuKind, lite: boolean): THREE.BufferGeometry {
  const b = new GeoBuilder();
  const k = lite ? 0.65 : 1;
  if (kind === "tall")
    tuft(b, {
      seed: 11,
      blades: Math.round(12 * k),
      len: [0.75, 1.2],
      r: 0.07,
      lean: [0.08, 0.6],
      bend: [0.15, 0.55],
      base: "#a98443",
      tip: "#efd38c",
      stalks: lite ? 1 : 3,
      segs: 2,
    });
  else if (kind === "short")
    tuft(b, {
      seed: 23,
      blades: Math.round(12 * k),
      len: [0.36, 0.62],
      r: 0.065,
      lean: [0.2, 0.95],
      bend: [0.3, 0.8],
      base: "#6c8a42",
      tip: "#cdc46e",
      stalks: 0,
      segs: 2,
    });
  else
    tuft(b, {
      seed: 37,
      blades: Math.round(10 * k),
      len: [0.55, 0.95],
      r: 0.066,
      lean: [0.15, 0.75],
      bend: [0.45, 1.35],
      base: "#9a8760",
      tip: "#ece2c6",
      stalks: lite ? 0 : 1,
      segs: 2,
    });
  return b.build({ flex: true });
}

// ---------------------------------------------------------------- flowers

/** Tarwi silvestre (wild Andean lupine): palmate leaves + 3 blue-violet flower spikes. */
export function lupineModel(lite: boolean): FloraModel {
  const b = new GeoBuilder();
  const R = rng(51);
  const flowers: V3[] = [];
  const leaf = new THREE.Color("#4f7f45");
  // Palmate leaves: 6 slim leaflets radiating flat, at three heights.
  for (let l = 0; l < 2; l++) {
    const a0 = l * 2.1 + R();
    const y = 0.14 + l * 0.08;
    const cx = Math.cos(a0) * 0.12;
    const cz = Math.sin(a0) * 0.12;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + a0;
      const g = new THREE.OctahedronGeometry(1, 0);
      g.scale(0.085, 0.014, 0.026);
      g.translate(0.085, 0, 0);
      g.rotateZ(-0.25);
      g.rotateY(-a);
      g.translate(cx, y, cz);
      b.add(g, { color: k % 2 ? leaf : "#5d8f4f", flex: y * 0.25 });
    }
    b.add(tube([V(0, 0, 0), V(cx, y, cz)], [0.012, 0.01], 3, { tip: true }), { color: "#5d8f4f", flex: 0 });
  }
  // Flower spikes: whorls of pea flowers, violet at the base → pale buds at the top.
  const deep = new THREE.Color("#4636a8");
  const mid = new THREE.Color("#6f62d8");
  const bud = new THREE.Color("#d9d2ff");
  const ban = new THREE.Color("#f4f0ff");
  const tmp = new THREE.Color();
  const spikes = lite ? 2 : 3;
  for (let s = 0; s < spikes; s++) {
    const a = s * 2.2 + R() * 0.6;
    const base = V(Math.cos(a) * 0.07, 0, Math.sin(a) * 0.07);
    const top = 0.62 + R() * 0.18 - s * 0.06;
    const stem = arcPath(base, a, 0.32, 0.12, -0.1, 1);
    b.add(tube(stem, [0.016, 0.014], 3, { tip: false }), { color: "#4e7a3f", flex: (p) => p.y * 0.12 });
    const from = stem[1] as THREE.Vector3;
    const rings = lite ? 4 : 6;
    const pts: THREE.Vector3[] = [];
    const radii: number[] = [];
    const h = top - from.y;
    for (let k = 0; k <= rings; k++) {
      const t = k / rings;
      pts.push(V(from.x + Math.cos(a) * 0.04 * t, from.y + h * t, from.z + Math.sin(a) * 0.04 * t));
      radii.push(0.075 * (1 - t) ** 0.6 * (k % 2 ? 0.72 : 1.1) + 0.006);
    }
    b.add(
      tube(pts, radii, 5, {
        tip: true,
        color: (t, u) => {
          if (t < 0.6 && (u * 5 + t * 9) % 2 < 0.45) return tmp.copy(ban);
          return t < 0.5 ? tmp.copy(deep).lerp(mid, t * 2) : tmp.copy(mid).lerp(bud, (t - 0.5) * 2);
        },
        flex: (t) => (from.y + h * t) * 0.12,
      }),
    );
    flowers.push([from.x, from.y + h * 0.55, from.z]);
  }
  return { geo: b.build({ flex: true }), perches: [], flowers };
}

/** Yellow daisy cluster (Bidens andicola): low leafy cushion with flower heads on short stems. */
export function yellowFlowerModel(lite: boolean): FloraModel {
  const b = new GeoBuilder();
  const R = rng(63);
  const flowers: V3[] = [];
  for (let k = 0; k < 2; k++) {
    const g = blob(0.17 + k * 0.04, 0.55, 7 + k, 0);
    g.translate((k - 0.5) * 0.14, 0.07, (R() - 0.5) * 0.1);
    b.add(g, { color: leafShade("#3d6236", "#4f7d42", "#6f9a55"), flex: 0.01 });
  }
  const heads = lite ? 4 : 7;
  const yel = new THREE.Color("#f6c62e");
  const ora = new THREE.Color("#d9771b");
  const tmp = new THREE.Color();
  for (let i = 0; i < heads; i++) {
    const a = i * GOLDEN;
    const r = 0.06 + R() * 0.16;
    const h = 0.2 + R() * 0.16;
    const base = V(Math.cos(a) * r * 0.5, 0.05, Math.sin(a) * r * 0.5);
    const stem = arcPath(base, a, h, 0.25 + R() * 0.3, 0.1, 1);
    b.add(tube(stem, [0.012, 0.008], 3, { tip: false }), { color: "#4f7d42", flex: (p) => p.y * 0.12 });
    const top = stem[1] as THREE.Vector3;
    const head = new THREE.CylinderGeometry(0.062, 0.03, 0.03, 7, 1);
    head.rotateX((R() - 0.5) * 0.5);
    head.translate(top.x, top.y + 0.012, top.z);
    b.add(head, {
      color: (p) => tmp.copy(yel).lerp(ora, 1 - Math.min(1, Math.hypot(p.x - top.x, p.z - top.z) / 0.03)),
      flex: top.y * 0.12,
    });
    flowers.push([top.x, top.y + 0.02, top.z]);
  }
  return { geo: b.build({ flex: true }), perches: [], flowers };
}

// ---------------------------------------------------------------- trees
// Tree builders take `lite` (phones, see quality.ts deviceProfile): crown clumps at icosahedron detail 0,
// about half the triangles of a tree for the same silhouette.

/** Crown clump that remembers where a bird can stand on it. */
function clump(
  b: GeoBuilder,
  perches: V3[] | null,
  x: number,
  y: number,
  z: number,
  r: number,
  sy: number,
  seed: number,
  shade: ReturnType<typeof leafShade>,
  detail = 1,
) {
  const g = blob(r, sy, seed, detail);
  g.translate(x, y, z);
  b.add(g, { color: shade });
  // On the outer, upper shoulder of the clump (facing away from the trunk), just proud of the leaves.
  if (perches) {
    const a = Math.atan2(z, x) || seed;
    perches.push([x + Math.cos(a) * r * 0.42, y + r * sy * 0.97 + 0.03, z + Math.sin(a) * r * 0.42]);
  }
}

/** Bark color: base tone with lighter peeling strips / moss by (height s, angle u). */
function bark(base: string, light: string, dark: string, freq = 1) {
  const cb = new THREE.Color(base);
  const cl = new THREE.Color(light);
  const cd = new THREE.Color(dark);
  const out = new THREE.Color();
  return (s: number, u: number) => {
    const n = Math.sin(u * 6.283 * 2 + s * 11 * freq) * Math.cos(u * 6.283 * 3 - s * 7 * freq);
    if (n > 0.45) return out.copy(cl);
    if (n < -0.55) return out.copy(cd);
    return out.copy(cb);
  };
}

/** Queñua / Polylepis: 3 twisting stems with red, papery peeling bark; small dense grey-green clumps. */
export function quenuaModel(lite = false): FloraModel {
  const d = lite ? 0 : 1;
  const b = new GeoBuilder();
  const R = rng(101);
  const perches: V3[] = [];
  const shade = leafShade("#3a5539", "#516f48", "#7a9862");
  const barkC = bark("#a24f2c", "#d38a5c", "#6e3420", 1.3);
  const tips: THREE.Vector3[] = [];
  for (let s = 0; s < 3; s++) {
    const a = (s / 3) * Math.PI * 2 + R() * 0.6;
    const pts: THREE.Vector3[] = [];
    const h = 2.1 + R() * 0.6;
    const out = 0.5 + R() * 0.5;
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      // Gnarled: a lean outward plus a twisting wobble.
      const tw = Math.sin(t * 4.5 + s * 2) * 0.16;
      const rr = 0.08 + out * t ** 1.3;
      pts.push(V(Math.cos(a + tw * 2) * rr, h * t, Math.sin(a + tw * 2) * rr));
    }
    const radii = pts.map((_, k) => 0.21 - k * 0.026);
    b.add(tube(pts, radii, 6, { tip: false, color: barkC }));
    const top = pts[5] as THREE.Vector3;
    tips.push(top);
    // Two side branches from the upper half.
    for (let k = 0; k < 2; k++) {
      const from = (pts[3 + k] as THREE.Vector3).clone();
      const ba = a + (k ? 0.9 : -0.9) + R() * 0.3;
      const bp = arcPath(from, ba, 0.8 + R() * 0.5, 0.75 + R() * 0.3, -0.35, 3);
      b.add(tube(bp, [0.09, 0.07, 0.055, 0.04], 5, { tip: false, color: barkC }));
      tips.push(bp[3] as THREE.Vector3);
    }
  }
  tips.forEach((p, i) => {
    const r = 0.5 + R() * 0.32;
    clump(b, perches, p.x, p.y + 0.25, p.z, r, 0.66, 3 + i, shade, d);
  });
  clump(b, perches, 0, 3.5, 0, 0.75, 0.62, 41, shade, d);
  return { geo: b.build(), perches, flowers: [] };
}

/** Aliso / Alnus acuminata: straight silver-grey trunk with lenticel bands, tall conical-oval crown. */
export function alisoModel(lite = false): FloraModel {
  const d = lite ? 0 : 1;
  const b = new GeoBuilder();
  const R = rng(131);
  const perches: V3[] = [];
  const shade = leafShade("#3d6e37", "#56903f", "#86b864");
  const cb = new THREE.Color("#a7a397");
  const cd = new THREE.Color("#77736a");
  const tmp = new THREE.Color();
  const trunk = [0, 1.2, 2.4, 3.8, 5.4, 7.0].map((y, k) => V(Math.sin(k * 1.3) * 0.05, y, Math.cos(k * 1.1) * 0.05));
  b.add(
    tube(trunk, [0.24, 0.2, 0.17, 0.13, 0.09, 0.05], 6, {
      tip: true,
      color: (s, u) => (Math.sin(s * 70 + u * 3) > 0.7 ? tmp.copy(cd) : tmp.copy(cb).lerp(cd, s * 0.4)),
    }),
  );
  // A couple of low branches showing under the crown.
  for (let k = 0; k < 3; k++) {
    const a = k * 2.3 + R();
    const bp = arcPath(V(0, 2.2 + k * 0.5, 0), a, 1.1, 1.05, -0.2, 2);
    b.add(tube(bp, [0.07, 0.05, 0.03], 5, { tip: true, color: () => tmp.copy(cb) }));
  }
  const tiers: Array<[number, number]> = [
    [2.9, 1.45],
    [3.8, 1.6],
    [4.7, 1.45],
    [5.6, 1.2],
    [6.4, 0.95],
    [7.1, 0.68],
    [7.7, 0.42],
  ];
  tiers.forEach(([y, r], i) => {
    const lobes = r > 1.1 ? 2 : 1;
    for (let l = 0; l < lobes; l++) {
      const a = l * ((Math.PI * 2) / lobes) + i * 1.1 + R() * 0.4;
      const off = lobes > 1 ? r * 0.42 : 0;
      clump(
        b,
        i < 5 && l === 0 ? perches : null,
        Math.cos(a) * off,
        y + (R() - 0.5) * 0.2,
        Math.sin(a) * off,
        r * (lobes > 1 ? 0.78 : 1),
        0.7,
        i * 7 + l,
        shade,
        d,
      );
    }
  });
  return { geo: b.build(), perches, flowers: [] };
}

/** Unca / cloud-forest Myrcianthes: mossy crooked trunk, spreading limbs with epiphytes, umbrella crown. */
export function uncaModel(lite = false): FloraModel {
  const d = lite ? 0 : 1;
  const b = new GeoBuilder();
  const R = rng(151);
  const perches: V3[] = [];
  const flowers: V3[] = [];
  const shade = leafShade("#28472c", "#3b6538", "#5f8c4a");
  const mossy = bark("#5d4330", "#7e9a3e", "#a9b98a", 0.8);
  const trunk: THREE.Vector3[] = [];
  for (let k = 0; k <= 5; k++) {
    const t = k / 5;
    trunk.push(V(Math.sin(t * 3.2) * 0.35, 3.4 * t, Math.cos(t * 2.6 + 1) * 0.25 - 0.25));
  }
  b.add(tube(trunk, [0.32, 0.27, 0.23, 0.2, 0.17, 0.14], 7, { tip: false, color: mossy }));
  const top = trunk[5] as THREE.Vector3;
  const bromBase = new THREE.Color("#4c8a3a");
  const bromTip = new THREE.Color("#d2382d");
  const tmp = new THREE.Color();
  const limbs = 4;
  for (let l = 0; l < limbs; l++) {
    const a = (l / limbs) * Math.PI * 2 + R() * 0.5;
    const from = (trunk[3 + (l % 3)] as THREE.Vector3).clone();
    const len = 1.9 + R() * 0.5;
    const lp = arcPath(from, a, len, 1.2 + R() * 0.2, -0.45, 3);
    b.add(tube(lp, [0.14, 0.11, 0.08, 0.06], 6, { tip: false, color: mossy }));
    const end = lp[3] as THREE.Vector3;
    clump(b, perches, end.x, end.y + 0.45, end.z, 0.95 + R() * 0.3, 0.55, 60 + l, shade, d);
    // Perch on the bare limb (good visible spot for the gallito).
    const mid = lp[2] as THREE.Vector3;
    perches.push([mid.x, mid.y + 0.1, mid.z]);
    // Bromeliad rosette on top of the limb, near the trunk.
    const bp = (lp[1] as THREE.Vector3).clone().add(V(0, 0.1, 0));
    for (let k = 0; k < 7; k++) {
      const ka = k * GOLDEN;
      const pts = arcPath(bp, ka, 0.24 + R() * 0.08, 0.5 + R() * 0.4, 0.5, 2);
      b.add(tube(pts, [0.035, 0.025, 0.01], 3, { tip: true, color: (t) => tmp.copy(bromBase).lerp(bromTip, t * t) }));
    }
    flowers.push([bp.x, bp.y + 0.18, bp.z]);
    // Hanging moss beards under the limb.
    for (let k = 0; k < 2; k++) {
      const hp = (lp[2 + k] as THREE.Vector3).clone();
      const g = new THREE.ConeGeometry(0.06, 0.5 + R() * 0.35, 4, 1, true);
      g.rotateX(Math.PI);
      g.translate(hp.x, hp.y - 0.3, hp.z);
      b.add(g, { color: "#b5c29b" });
    }
    // Orchid spray (wiñay wayna: magenta / orange) on alternate limbs.
    if (l % 2 === 0) {
      const op = (lp[2] as THREE.Vector3).clone();
      for (let k = 0; k < 5; k++) {
        const g = new THREE.OctahedronGeometry(0.05, 0);
        g.translate(op.x + (R() - 0.5) * 0.18, op.y + 0.12 + R() * 0.14, op.z + (R() - 0.5) * 0.18);
        b.add(g, { color: k % 2 ? "#e2408f" : "#f08a3c" });
      }
      flowers.push([op.x, op.y + 0.2, op.z]);
    }
  }
  clump(b, perches, top.x, top.y + 0.75, top.z, 1.25, 0.55, 81, shade, d);
  clump(b, null, top.x + 0.6, top.y + 0.35, top.z - 0.7, 0.9, 0.55, 82, shade, d);
  return { geo: b.build(), perches, flowers };
}

/** Pisonay / Erythrina falcata: buttressed trunk, spreading limbs, broad crown studded with red flowers. */
export function pisonayModel(lite = false): FloraModel {
  const d = lite ? 0 : 1;
  const b = new GeoBuilder();
  const R = rng(171);
  const perches: V3[] = [];
  const flowers: V3[] = [];
  const shade = leafShade("#335a2f", "#4b7c3c", "#76a557");
  const barkC = bark("#7a6250", "#9b8470", "#59463a", 0.9);
  b.add(
    tube([V(0, 0, 0), V(0.05, 0.8, 0), V(0.1, 1.7, 0.05), V(0.05, 2.4, 0.1)], [0.68, 0.5, 0.44, 0.4], 8, {
      tip: false,
      color: barkC,
    }),
  );
  const red = new THREE.Color("#d8322a");
  const hot = new THREE.Color("#ff7340");
  const tmp = new THREE.Color();
  const ends: THREE.Vector3[] = [];
  for (let l = 0; l < 5; l++) {
    const a = (l / 5) * Math.PI * 2 + R() * 0.4;
    const lp = arcPath(V(0.05, 2.1 + R() * 0.3, 0.1), a, 3.2 + R() * 0.6, 0.85 + R() * 0.2, -0.3, 3);
    b.add(tube(lp, [0.3, 0.22, 0.15, 0.1], 6, { tip: false, color: barkC }));
    ends.push(lp[3] as THREE.Vector3);
    const mid = lp[2] as THREE.Vector3;
    perches.push([mid.x, mid.y + 0.16, mid.z]);
  }
  const blobs: Array<[THREE.Vector3, number]> = [];
  for (const e of ends) blobs.push([V(e.x, e.y + 0.75, e.z), 1.55 + R() * 0.3]);
  for (let k = 0; k < 4; k++) {
    const a = k * 1.6 + R();
    blobs.push([V(Math.cos(a) * 1.4, 5.9 + R() * 0.4, Math.sin(a) * 1.4), 1.5 + R() * 0.3]);
  }
  blobs.forEach(([p, r], i) => {
    clump(b, i < 5 ? perches : null, p.x, p.y, p.z, r, 0.52, 90 + i, shade, d);
  });
  // Flower racemes: upright red cones over the top and the rim of the crown.
  const n = 46;
  for (let k = 0; k < n; k++) {
    const [c, r] = blobs[k % blobs.length] as [THREE.Vector3, number];
    const a = R() * Math.PI * 2;
    const el = 0.35 + R() * 0.9;
    const x = c.x + Math.cos(a) * Math.cos(el) * r * 0.95;
    const z = c.z + Math.sin(a) * Math.cos(el) * r * 0.95;
    const y = c.y + Math.sin(el) * r * 0.52 * 0.95;
    const g = new THREE.ConeGeometry(0.075, 0.3, 5, 1, true);
    g.translate(0, 0.15, 0);
    g.rotateZ(Math.cos(a) * -0.35);
    g.rotateX(Math.sin(a) * 0.35);
    g.translate(x, y, z);
    b.add(g, { color: (p) => tmp.copy(red).lerp(hot, Math.min(1, Math.max(0, (p.y - y) / 0.3))) });
    if (el < 0.75 && flowers.length < 14) flowers.push([x * 1.08, y + 0.12, z * 1.08]);
  }
  return { geo: b.build(), perches, flowers };
}

/** Chusquea bamboo clump: a fountain of slim arching culms with leaf sprays at the nodes. */
export function chusqueaModel(lite: boolean): FloraModel {
  const b = new GeoBuilder();
  const R = rng(191);
  const perches: V3[] = [];
  const culmB = new THREE.Color("#8b9f45");
  const culmT = new THREE.Color("#6a8f3a");
  const leafC = new THREE.Color("#4f8a3a");
  const leafL = new THREE.Color("#79a94f");
  const tmp = new THREE.Color();
  const culms = lite ? 9 : 14;
  for (let c = 0; c < culms; c++) {
    const a = c * GOLDEN + R() * 0.3;
    const len = 2.4 + R() * 1.3;
    const lean = 0.1 + R() * 0.35;
    const bend = 0.5 + R() * 0.7;
    const base = V(Math.cos(a) * 0.12 * R(), 0, Math.sin(a) * 0.12 * R());
    const pts = arcPath(base, a, len, lean, bend, 4);
    b.add(
      tube(
        pts,
        pts.map((_, k) => 0.04 - k * 0.007),
        3,
        { tip: true, color: (t) => tmp.copy(culmB).lerp(culmT, t) },
      ),
    );
    // Leaf sprays at three nodes.
    for (const nk of [2, 3, 4]) {
      const p = pts[nk] as THREE.Vector3;
      for (let l = 0; l < 3; l++) {
        const la = a + (l - 1) * 0.9 + R() * 0.3;
        const lp = arcPath(p, la, 0.32 + R() * 0.12, 1.25, 0.35, 1);
        b.add(tube(lp, [0.035, 0.01], 3, { tip: true, color: () => (l === 1 ? tmp.copy(leafL) : tmp.copy(leafC)) }));
      }
    }
    if (c % 4 === 0) {
      const p = pts[2] as THREE.Vector3;
      perches.push([p.x, p.y + 0.05, p.z]);
    }
  }
  return { geo: b.build(), perches, flowers: [] };
}

/** Per-instance tints (multiplied over the vertex colors). */
export const TINTS = {
  ichuTall: ["#ffffff", "#fff3dc", "#f6e6c4", "#fffaf0"],
  ichuValley: "#d3e3a6",
  ichuShort: ["#ffffff", "#eef5d8", "#fff2cf"],
  ichuDry: ["#ffffff", "#f4efe4", "#e9e2d2"],
  tree: ["#ffffff", "#f1f4ea", "#fff6ea", "#e8eee0"],
};
