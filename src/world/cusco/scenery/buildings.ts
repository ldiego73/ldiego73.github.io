/**
 * Stone architecture of Haukaypata, baked with ./masonry.ts into three vertex-coloured meshes:
 *
 *   plaza    the flagstone paving, the usnu (three dressed tiers, a stair on the south face), the front walls
 *            round the plaza with their trapezoidal doorways and niches, the two kallanka halls (north and
 *            west) under gabled ichu thatch, the kancha walls and houses on the south side, and the
 *            Qorikancha facade on the east (andesite ashlar, a gold band, a double-jamb doorway and the gold
 *            disc of Inti above it, a thatched temple roof behind).
 *   streets  the five streets: flagstones and the walls on both sides (niches, a doorway each side), and in
 *            the Antisuyu street the twelve-angled stone (Hatun Rumiyoc) set in polygonal masonry.
 *   far      Sacsayhuamán: three zigzag terrace walls of huge limestone blocks on the hill to the north.
 *
 * Coordinates come from ../plan.ts (the plaza, setback lines, streets, the usnu, the Qorikancha); the ground
 * from the layout (heightAt) where walls leave the flat core. Draw calls: three (plus the ink pass).
 */
import type * as THREE from "three";
import type { CuscoLayout } from "../layout";
import { SACSAY } from "../layout";
import {
  GATES,
  type Gate,
  HATUN_RUMIYOC,
  PLAZA,
  QORIKANCHA,
  ROAD_HALF,
  ROAD_LEN,
  SETBACK,
  USNU,
  WALL_OFF,
} from "../plan";
import { Masonry, type Opening, type Rand } from "./masonry";

const STONE = ["#a39d90", "#958f83", "#ada79a", "#8c867b", "#9b9488"] as const;
const ANDESITE = ["#6f6c67", "#7a7671", "#66635f", "#827e77"] as const;
const LIMESTONE = ["#b8b0a0", "#aba291", "#c1b9a8", "#a0978a"] as const;
const PAVE = ["#bbb4a5", "#b3ac9d", "#c1baab", "#ada697", "#b8ae9a"] as const;
const THATCH = "#b48a4c";
const THATCH_2 = "#cfa765";
const THATCH_DARK = "#8f6a37";
const ADOBE = "#b98a5e";
const GOLD = "#e8b631";
const GOLD_DARK = "#c48d1f";
const SHADE = "#2f2a25";

export function rng(seed: number): Rand {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Trapezoidal doorways / niches evenly along a wall of length len (centres), skipping `skip` ranges. */
function evenly(len: number, n: number, make: (s: number) => Opening): Opening[] {
  const out: Opening[] = [];
  for (let i = 0; i < n; i++) out.push(make(((i + 0.5) / n) * len));
  return out;
}
const door = (s: number, h = 2.5): Opening => ({ s, bottom: 1.45, top: 1.05, sill: 0, h, kind: "door" });
const niche = (s: number, sill = 0.9): Opening => ({ s, bottom: 0.62, top: 0.46, sill, h: 0.95, kind: "niche" });
const window_ = (s: number, sill = 1.9): Opening => ({ s, bottom: 0.5, top: 0.38, sill, h: 0.7, kind: "window" });

/** Gabled ichu roof along a → b (the hall's front line), depth d behind it (away from the front normal). */
function gableRoof(
  m: Masonry,
  rand: Rand,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  d: number,
  y: number,
  h: number,
) {
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const nx = -uz;
  const nz = ux;
  const over = 0.8;
  // Prism frame: local x across the hall (−n), extruded along +u.
  const yaw = Math.atan2(ux, uz);
  const cx = (ax + bx) / 2 - nx * (d / 2);
  const cz = (az + bz) / 2 - nz * (d / 2);
  const ox = cx - ux * (len / 2 + over);
  const oz = cz - uz * (len / 2 + over);
  const half = d / 2 + over;
  m.color(THATCH).prism(
    [
      [-half, -0.25],
      [half, -0.25],
      [0, h],
    ],
    ox,
    y,
    oz,
    yaw,
    0,
    len + over * 2,
    true,
  );
  // A lighter upper layer and the ridge.
  m.color(THATCH_2).prism(
    [
      [-half * 0.55, h * 0.45],
      [half * 0.55, h * 0.45],
      [0, h + 0.18],
    ],
    ox + ux * 0.25,
    y,
    oz + uz * 0.25,
    yaw,
    0,
    len + over * 2 - 0.5,
    true,
  );
  m.color(THATCH_DARK).box(cx, y + h - 0.05, cz, 0.5, 0.32, len + over * 2 - 0.2, yaw);
  // Fringe tufts under the eaves on both long sides.
  for (const side of [-1, 1])
    for (let s = -len / 2 - over + 0.2; s < len / 2 + over - 0.1; s += 0.55 + rand() * 0.25) {
      const x = cx + ux * s + nx * side * half * 0.98;
      const z = cz + uz * s + nz * side * half * 0.98;
      m.color(rand() < 0.5 ? THATCH : THATCH_DARK).box(
        x,
        y - 0.45,
        z,
        0.32,
        0.4 + rand() * 0.15,
        0.08,
        Math.atan2(-uz, ux),
      );
    }
}

/**
 * Kallanka: a long hall whose front wall runs a → b (front normal toward the plaza), depth d, wall height h,
 * doorways along the front, gabled thatch. Stone gable ends.
 */
function hall(m: Masonry, rand: Rand, a: [number, number], b: [number, number], d: number, h: number, doors: number) {
  const [ax, az] = a;
  const [bx, bz] = b;
  const len = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / len;
  const uz = (bz - az) / len;
  const nx = -uz;
  const nz = ux;
  const t = 1.0;
  // Wall centrelines: the front face sits on a → b.
  const f = (x: number, z: number): [number, number] => [x - nx * (t / 2), z - nz * (t / 2)];
  const [fax, faz] = f(ax, az);
  const [fbx, fbz] = f(bx, bz);
  const bk = (x: number, z: number): [number, number] => [x - nx * (d - t / 2), z - nz * (d - t / 2)];
  const [kax, kaz] = bk(ax, az);
  const [kbx, kbz] = bk(bx, bz);
  const wall = { y0: 0, h, t, colors: STONE, shade: SHADE } as const;
  const openings: Opening[] = [];
  for (let i = 0; i < doors; i++) {
    const s = ((i + 0.5) / doors) * len;
    openings.push(door(s, 2.6));
    if (i < doors - 1) {
      const s2 = ((i + 1) / doors) * len;
      openings.push(niche(s2 - 1.1), niche(s2 + 1.1));
    }
  }
  m.ashlarWall(rand, { ...wall, x0: fax, z0: faz, x1: fbx, z1: fbz, openings });
  m.ashlarWall(rand, {
    ...wall,
    x0: kbx,
    z0: kbz,
    x1: kax,
    z1: kaz,
    openings: evenly(len, Math.round(len / 6), (s) => window_(s)),
  });
  m.ashlarWall(rand, {
    ...wall,
    x0: kax + ux * (t / 2),
    z0: kaz + uz * (t / 2),
    x1: fax + ux * (t / 2),
    z1: faz + uz * (t / 2),
  });
  m.ashlarWall(rand, {
    ...wall,
    x0: fbx - ux * (t / 2),
    z0: fbz - uz * (t / 2),
    x1: kbx - ux * (t / 2),
    z1: kbz - uz * (t / 2),
  });
  // Gable ends in adobe over the stone (Inca halls often finished their gables in adobe).
  for (const [ex, ez] of [
    [(fax + kax) / 2 + ux * (t / 2), (faz + kaz) / 2 + uz * (t / 2)],
    [(fbx + kbx) / 2 - ux * (t / 2), (fbz + kbz) / 2 - uz * (t / 2)],
  ] as const) {
    m.color(ADOBE).prism(
      [
        [-(d / 2), 0],
        [d / 2, 0],
        [0, d * 0.42],
      ],
      ex - ux * (t / 2),
      h,
      ez - uz * (t / 2),
      Math.atan2(ux, uz),
      0,
      t,
      true,
    );
  }
  gableRoof(m, rand, ax, az, bx, bz, d, h, d * 0.48);
}

/** Small kancha house: four walls, one doorway toward the front normal, hipped thatch. */
function house(m: Masonry, rand: Rand, cx: number, cz: number, w: number, d: number, yaw: number, h = 2.6) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const P = (lx: number, lz: number): [number, number] => [cx + lx * c + lz * s, cz - lx * s + lz * c];
  const t = 0.8;
  const hw = w / 2 - t / 2;
  const hd = d / 2 - t / 2;
  const wall = { y0: 0, h, t, colors: STONE, shade: SHADE, minLen: 0.45, maxLen: 1 } as const;
  const [fa, fb, ba, bb] = [P(-hw, hd), P(hw, hd), P(-hw, -hd), P(hw, -hd)];
  m.ashlarWall(rand, { ...wall, x0: fa[0], z0: fa[1], x1: fb[0], z1: fb[1], openings: [door(w / 2 - t / 2, 2)] });
  m.ashlarWall(rand, { ...wall, x0: bb[0], z0: bb[1], x1: ba[0], z1: ba[1] });
  m.ashlarWall(rand, { ...wall, x0: ba[0], z0: ba[1], x1: fa[0], z1: fa[1] });
  m.ashlarWall(rand, { ...wall, x0: fb[0], z0: fb[1], x1: bb[0], z1: bb[1] });
  m.color(THATCH).box(cx, h, cz, w + 1, 2.1, d + 1, yaw, { top: 0.12 });
  m.color(THATCH_DARK).box(cx, h + 1.9, cz, 0.5, 0.35, 0.5, yaw);
}

/** Square tier of the usnu: four battered ashlar walls and a top of fitted slabs. */
function usnuTier(m: Masonry, rand: Rand, half: number, y0: number, top: number) {
  const h = top - y0;
  const t = 0.9;
  const c = half - t / 2;
  const wall = { y0, h, t, courses: 2, colors: STONE, minLen: 0.7, maxLen: 1.5, batter: 0.03 } as const;
  // Counter-clockwise from the south-west corner, each wall's front facing out.
  m.ashlarWall(rand, { ...wall, x0: USNU.x - half, z0: USNU.z + c, x1: USNU.x + half, z1: USNU.z + c });
  m.ashlarWall(rand, { ...wall, x0: USNU.x + c, z0: USNU.z + half, x1: USNU.x + c, z1: USNU.z - half });
  m.ashlarWall(rand, { ...wall, x0: USNU.x + half, z0: USNU.z - c, x1: USNU.x - half, z1: USNU.z - c });
  m.ashlarWall(rand, { ...wall, x0: USNU.x - c, z0: USNU.z - half, x1: USNU.x - c, z1: USNU.z + half });
  m.color("#b4ad9f").box(USNU.x, y0, USNU.z, (half - t) * 2 + 0.02, h - 0.02, (half - t) * 2 + 0.02);
}

function usnu(m: Masonry, rand: Rand) {
  let y0 = 0;
  for (const t of USNU.tiers) {
    usnuTier(m, rand, t.half, y0, t.top);
    y0 = t.top;
  }
  // Carved stair on the south face: one block per step half-way between the tiers.
  const tiers = USNU.tiers;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i] as (typeof tiers)[number];
    const below = i === 0 ? 0 : (tiers[i - 1] as (typeof tiers)[number]).top;
    const mid = (below + t.top) / 2;
    m.color("#bdb6a8", 0.06, rand).box(USNU.x, below, USNU.z + t.half + 0.32, 2.4, mid - below, 0.64);
  }
  // A gold-capped seat stone at the top's south edge (the usnu was where the Inca presided).
  const top = tiers[tiers.length - 1] as (typeof tiers)[number];
  m.color(GOLD_DARK).box(USNU.x - 1.6, top.top, USNU.z + top.half - 0.5, 0.5, 0.18, 0.5);
  m.color(GOLD_DARK).box(USNU.x + 1.6, top.top, USNU.z + top.half - 0.5, 0.5, 0.18, 0.5);
}

/** Flagstone paving: rows of irregular slabs over a rectangle (axis-aligned), skipping a hole. */
function paveRect(
  m: Masonry,
  rand: Rand,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  skip?: (x: number, z: number) => boolean,
) {
  for (let z = z0; z < z1 - 0.2; ) {
    const row = 1.5 + rand() * 0.7;
    const rz = Math.min(row, z1 - z);
    for (let x = x0 + (rand() - 0.5) * 0.6; x < x1 - 0.2; ) {
      const len = 1.5 + rand() * 1.4;
      const l = Math.min(len, x1 - x);
      const cx = x + l / 2;
      const cz = z + rz / 2;
      if (l > 0.25 && !skip?.(cx, cz))
        m.color(PAVE[Math.floor(rand() * PAVE.length)] ?? PAVE[0], 0.05, rand).box(
          cx,
          -0.02,
          cz,
          l - 0.06,
          0.06 + rand() * 0.015,
          rz - 0.06,
          (rand() - 0.5) * 0.03,
          { top: 0.97 },
        );
      x += len;
    }
    z += row;
  }
}

/** Flagstones along a street (oriented rows), from s0 to s1 along it, fading to sparse stones past `solid`. */
function paveStreet(
  m: Masonry,
  rand: Rand,
  g: Gate,
  s0: number,
  s1: number,
  solid: number,
  half: number,
  ground: (x: number, z: number) => number,
) {
  const [dx, dz] = g.dir;
  const nx = -dz;
  const nz = dx;
  const yaw = Math.atan2(-dz, dx);
  for (let s = s0; s < s1; ) {
    const row = 1.2 + rand() * 0.6;
    const sparse = s > solid ? Math.min(0.85, (s - solid) / 10) : 0;
    for (let w = -half + (rand() - 0.5) * 0.4; w < half - 0.2; ) {
      const l = Math.min(1.1 + rand() * 1.0, half - w);
      if (l > 0.25 && rand() >= sparse) {
        const x = g.mouth[0] + dx * (s + row / 2) + nx * (w + l / 2);
        const z = g.mouth[1] + dz * (s + row / 2) + nz * (w + l / 2);
        m.color(PAVE[Math.floor(rand() * PAVE.length)] ?? PAVE[0], 0.05, rand).box(
          x,
          ground(x, z) - 0.02,
          z,
          row - 0.06,
          0.07,
          l - 0.06,
          yaw + (rand() - 0.5) * 0.04,
          { top: 0.97 },
        );
      }
      w += l + 0.02;
    }
    s += row;
  }
}

/** The twelve-angled stone and its polygonal neighbours, set in the hole left in a street wall. */
function hatunRumiyoc(m: Masonry, rand: Rand, g: Gate, s: number, faceOff: number, y0: number, w: number, h: number) {
  // Wall frame: the left wall runs outward (u = dir), its front (the street side) is +n.
  const [dx, dz] = g.dir;
  const yaw = Math.atan2(-dz, dx);
  const side = HATUN_RUMIYOC.side;
  const nx = -dz * side;
  const nz = dx * side;
  // Origin at the hole's lower-left (seen from the street), on the wall's centreline (face is +t/2 out).
  const ox = g.mouth[0] + dx * (s - w / 2) + nx * faceOff;
  const oz = g.mouth[1] + dz * (s - w / 2) + nz * faceOff;
  const hw = w / 2;
  // A rectangle whose four corners are each stepped twice: 12 vertices, 12 angles (convex enough for a fan).
  const k = 0.22;
  const stone: Array<[number, number]> = [
    [0.18, 0.05],
    [w - 0.32, 0],
    [w - 0.12, k * 0.9],
    [w - 0.02, 0.5],
    [w, h - 0.6],
    [w - 0.16, h - 0.28],
    [w - 0.45, h - 0.04],
    [0.55, h],
    [0.2, h - 0.2],
    [0.02, h - 0.7],
    [0, 0.42],
    [0.06, 0.16],
  ];
  // Prism frame = the wall's: local x along the street (yaw), local +z (its front) toward the street. The
  // wall's face is 0.5 out from its centreline; the big stone stands a little proud of it.
  void hw;
  m.color("#8a8f80").prism(stone, ox, y0, oz, yaw, -0.45, 1.12);
  // Corner fillers: small fitted stones in the pockets the stepped corners leave.
  const fillers: Array<Array<[number, number]>> = [
    [
      [0, 0],
      [0.18, 0.05],
      [0.06, 0.16],
      [0, 0.42],
    ],
    [
      [w - 0.32, 0],
      [w, 0],
      [w - 0.02, 0.5],
      [w - 0.12, k * 0.9],
    ],
    [
      [w, h - 0.6],
      [w, h],
      [w - 0.45, h - 0.04],
      [w - 0.16, h - 0.28],
    ],
    [
      [0, h - 0.7],
      [0.02, h - 0.7],
      [0.2, h - 0.2],
      [0.55, h],
      [0, h],
    ],
  ];
  for (const f of fillers) m.color("#8d887c", 0.08, rand).prism(f, ox, y0, oz, yaw, -0.45, 0.98);
}

export interface BuiltArchitecture {
  plaza: THREE.BufferGeometry;
  streets: THREE.BufferGeometry;
  far: THREE.BufferGeometry;
}

/** Start s of a street's side walls (where they meet the setback line of the buildings round the plaza). */
export const wallStart = (g: Gate) => (g.dir[0] === 0 ? SETBACK : SETBACK / Math.SQRT1_2 - WALL_OFF);

export function buildArchitecture(layout: CuscoLayout): BuiltArchitecture {
  const rand = rng(0xc05c0);
  const ground = layout.heightAt;
  const P = new Masonry();

  // ------------------------------------------------------------ paving + usnu
  paveRect(P, rand, PLAZA.x0, PLAZA.z0, PLAZA.x1, PLAZA.z1, (x, z) => {
    const t0 = USNU.tiers[0].half + 0.75;
    return Math.abs(x - USNU.x) < t0 && Math.abs(z - USNU.z) < t0;
  });
  usnu(P, rand);

  // ------------------------------------------------------------ the plaza's frame
  // Setback face lines (the buildings' front faces) and where each meets the street walls.
  const N = PLAZA.z0 - SETBACK;
  const S = PLAZA.z1 + SETBACK;
  const W = PLAZA.x0 - SETBACK;
  const E = PLAZA.x1 + SETBACK;
  // Exact corner points: street side wall at its start, on the face lines.
  const corner = (g: Gate, side: -1 | 1): [number, number] => {
    const s0 = wallStart(g);
    const nx = -g.dir[1] * side;
    const nz = g.dir[0] * side;
    return [g.mouth[0] + g.dir[0] * s0 + nx * WALL_OFF, g.mouth[1] + g.dir[1] * s0 + nz * WALL_OFF];
  };
  const [NWg, NEg, SEg, SWg, Sg] = [GATES[1], GATES[2], GATES[3], GATES[4], GATES[0]] as Gate[];
  const nwN = corner(NWg as Gate, 1); // on the north face
  const nwW = corner(NWg as Gate, -1); // on the west face
  const neN = corner(NEg as Gate, -1);
  const neE = corner(NEg as Gate, 1);
  const seE = corner(SEg as Gate, -1);
  const seS = corner(SEg as Gate, 1);
  const swS = corner(SWg as Gate, -1);
  const swW = corner(SWg as Gate, 1);

  // North: one long kallanka across the whole side.
  hall(P, rand, [nwN[0], N], [neN[0], N], 11, 4.2, 6);
  // West: a second kallanka, front facing east (its line runs south → north).
  hall(P, rand, [W, swW[1]], [W, nwW[1]], 10, 4, 5);

  // East: the Qorikancha in the middle, kancha walls either side.
  const qz0 = QORIKANCHA.z - QORIKANCHA.halfLen;
  const qz1 = QORIKANCHA.z + QORIKANCHA.halfLen;
  const kanchaWall = { y0: 0, h: 3.4, t: 1, colors: STONE, shade: SHADE } as const;
  P.ashlarWall(rand, {
    ...kanchaWall,
    x0: E + 0.5,
    z0: neE[1],
    x1: E + 0.5,
    z1: qz0,
    openings: [niche(1.6), niche(3.4)],
  });
  P.ashlarWall(rand, {
    ...kanchaWall,
    x0: E + 0.5,
    z0: qz1,
    x1: E + 0.5,
    z1: seE[1],
    openings: [niche(1.8), niche(3.6)],
  });
  qorikancha(P, rand, E);
  // Houses behind the east kancha walls.
  house(P, rand, E + 6, (neE[1] + qz0) / 2 - 1, 6, 5, -Math.PI / 2);
  house(P, rand, E + 6, (qz1 + seE[1]) / 2 + 1, 6, 5, -Math.PI / 2);

  // South: kancha walls with niches either side of the Qhapaq Ñan street, houses behind.
  const sx = WALL_OFF;
  P.ashlarWall(rand, {
    ...kanchaWall,
    x0: seS[0],
    z0: S + 0.5,
    x1: (Sg as Gate).mouth[0] + sx,
    z1: S + 0.5,
    openings: [...evenly(Math.abs(seS[0] - sx), 5, (s) => niche(s)), door(Math.abs(seS[0] - sx) * 0.5, 2.3)].filter(
      (o, _i, a) => !(o.kind === "niche" && a.some((p) => p.kind === "door" && Math.abs(p.s - o.s) < 1.6)),
    ),
  });
  P.ashlarWall(rand, {
    ...kanchaWall,
    x0: (Sg as Gate).mouth[0] - sx,
    z0: S + 0.5,
    x1: swS[0],
    z1: S + 0.5,
    openings: [...evenly(Math.abs(swS[0] + sx), 5, (s) => niche(s)), door(Math.abs(swS[0] + sx) * 0.55, 2.3)].filter(
      (o, _i, a) => !(o.kind === "niche" && a.some((p) => p.kind === "door" && Math.abs(p.s - o.s) < 1.6)),
    ),
  });
  house(P, rand, 15, S + 6.5, 7, 6, Math.PI);
  house(P, rand, -16, S + 6.5, 7, 6, Math.PI);
  house(P, rand, 25, S + 5.5, 4, 4, Math.PI, 2.3);
  house(P, rand, -25, S + 5.5, 4, 4, Math.PI, 2.3);

  // ------------------------------------------------------------ streets
  const T = new Masonry();
  for (const g of GATES) {
    const s0 = wallStart(g);
    const s1 = ROAD_LEN - 1.0;
    const len = s1 - s0;
    for (const side of [-1, 1] as const) {
      const nx = -g.dir[1] * side;
      const nz = g.dir[0] * side;
      const c = WALL_OFF + 0.5;
      const a: [number, number] = [g.mouth[0] + g.dir[0] * s0 + nx * c, g.mouth[1] + g.dir[1] * s0 + nz * c];
      const b: [number, number] = [g.mouth[0] + g.dir[0] * s1 + nx * c, g.mouth[1] + g.dir[1] * s1 + nz * c];
      const openings: Opening[] = [
        niche(len * 0.2),
        niche(len * 0.27),
        door(len * (side < 0 ? 0.5 : 0.62), 2.3),
        niche(len * 0.83),
      ];
      const isHatun = g.id === "antisuyu" && side === HATUN_RUMIYOC.side;
      const stoneW = 2.7;
      const stoneH = 2.0;
      const stoneSill = 0.42;
      if (isHatun) {
        openings.length = 0;
        openings.push(niche(len * 0.15), door(len * 0.78, 2.3), {
          s: HATUN_RUMIYOC.s - s0,
          bottom: stoneW,
          top: stoneW,
          sill: stoneSill,
          h: stoneH,
          kind: "hole",
        });
      }
      // Left walls run outward, right walls inward, so each wall's front faces the street.
      const [p0, p1] = side === -1 ? [a, b] : [b, a];
      const flip = side === 1;
      T.ashlarWall(rand, {
        x0: p0[0],
        z0: p0[1],
        x1: p1[0],
        z1: p1[1],
        y0: 0,
        h: 3.3,
        t: 1,
        colors: STONE,
        shade: SHADE,
        ground,
        openings: flip ? openings.map((o) => ({ ...o, s: len - o.s })) : openings,
      });
      if (isHatun) hatunRumiyoc(T, rand, g, HATUN_RUMIYOC.s, c, stoneSill, stoneW, stoneH);
    }
    paveStreet(T, rand, g, -1, ROAD_LEN + 16, ROAD_LEN + 2, ROAD_HALF + 0.4, ground);
  }

  // ------------------------------------------------------------ Sacsayhuamán
  const F = new Masonry();
  for (let k = 0; k < 3; k++) {
    // Zigzag lines along the hill's south face, each terrace higher and further back.
    const zBase = SACSAY.z + 36 - k * 7;
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= 12; i++) {
      const x = SACSAY.x - 42 + k * 4 + i * ((84 - k * 8) / 12);
      pts.push([x, zBase + (i % 2 ? -3.2 : 0)]);
    }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, z0] = pts[i] as [number, number];
      const [x1, z1] = pts[i + 1] as [number, number];
      // Walls run west → east so their fronts face south (toward the plaza).
      const g0 = Math.min(ground(x0, z0), ground(x1, z1));
      F.ashlarWall(rand, {
        x0,
        z0,
        x1,
        z1,
        y0: g0 - 0.6,
        h: 4.6 - k * 0.6,
        t: 2.2,
        courses: 3,
        minLen: 1.2,
        maxLen: 3.4,
        batter: 0.12,
        colors: LIMESTONE,
        jitter: 0.14,
        ground,
      });
    }
  }

  return { plaza: P.build(), streets: T.build(), far: F.build() };
}

/** Qorikancha facade on the east face line E (front facing west), its gold band, doorway and sun disc. */
function qorikancha(m: Masonry, rand: Rand, E: number) {
  const q = QORIKANCHA;
  const x = E + q.thick / 2;
  const z0 = q.z + q.halfLen;
  const z1 = q.z - q.halfLen;
  const len = q.halfLen * 2;
  // Main doorway: double jamb (an outer, wider trapezoid recess around the opening).
  const mainDoor: Opening = { s: len / 2, bottom: 2.3, top: 1.65, sill: 0, h: 3.6, kind: "door" };
  const openings: Opening[] = [mainDoor, ...[3, 7, len - 7, len - 3].map((s) => niche(s, 1.0))];
  // Runs north → south so its front faces west, onto the plaza.
  m.ashlarWall(rand, {
    x0: x,
    z0: z1,
    x1: x,
    z1: z0,
    y0: 0,
    h: q.height - 0.45,
    t: q.thick,
    courses: 12,
    minLen: 0.7,
    maxLen: 1.6,
    batter: 0.01,
    colors: ANDESITE,
    jitter: 0.08,
    shade: "#1d1a17",
    openings,
  });
  // The outer jamb of the double-jambed doorway: a stepped frame proud of the wall.
  const front = E - 0.02;
  for (const side of [-1, 1]) {
    for (let c = 0; c < 6; c++) {
      const yb = c * 0.66;
      const f = (yb + 0.33) / 4.2;
      const inner = 2.3 / 2 + 0.35 - 0.32 * f;
      m.color(ANDESITE[c % ANDESITE.length] ?? "#6f6c67", 0.06, rand).box(
        front - 0.18,
        yb,
        q.z + side * (inner + 0.3),
        0.4,
        0.63,
        0.58,
        0,
      );
    }
  }
  m.color("#6a6762").box(front - 0.18, 3.96, q.z, 0.4, 0.5, 3.4);
  // Gold band (the temple's wall of gold sheets) in the course under the cornice.
  m.color(GOLD).box(x, q.height - 0.45, q.z, q.thick, 0.42, len, 0);
  m.color("#5f5c58").box(x, q.height - 0.03, q.z, q.thick + 0.2, 0.3, len + 0.2);
  // Sun disc of Inti above the doorway: a gold disc with a face ring and rays (extruded toward the plaza).
  const discY = q.height + 1.9;
  const cz = q.z;
  const ring: Array<[number, number]> = [];
  const R = 1.55;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ring.push([Math.cos(a) * R, Math.sin(a) * R]);
  }
  // Prism frame: local x along the wall (here −z, so the face looks at −x), front toward −x.
  const pyaw = -Math.PI / 2;
  m.color(GOLD).prism(ring, x - 0.5, discY, cz, pyaw, 0.3, 0.32);
  const inner: Array<[number, number]> = ring.map(([u, v]) => [u * 0.62, v * 0.62]);
  m.color(GOLD_DARK).prism(inner, x - 0.5, discY, cz, pyaw, 0.62, 0.08);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const w = i % 2 ? 0.16 : 0.24;
    const r1 = R + (i % 2 ? 0.55 : 0.95);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const ray: Array<[number, number]> = [
      [ca * R + sa * w, sa * R - ca * w],
      [ca * r1, sa * r1],
      [ca * R - sa * w, sa * R + ca * w],
    ];
    m.color(i % 2 ? GOLD_DARK : GOLD).prism(ray, x - 0.5, discY, cz, pyaw, 0.32, 0.22);
  }
  // Eyes and mouth of the face on the disc.
  for (const [u, v, w, h] of [
    [-0.32, 0.22, 0.2, 0.12],
    [0.32, 0.22, 0.2, 0.12],
    [0, -0.35, 0.46, 0.1],
  ] as const) {
    m.color("#8a5a12").box(x - 0.5 - 0.72, discY + v - h / 2, cz - u, 0.06, h, w);
  }
  // A raised stone panel behind the disc (it is mounted on the facade's attic).
  m.color("#5f5c58").box(x, q.height + 0.25, cz, q.thick * 0.8, 3.4, 4.6, 0, { top: 0.85 });
  // The temple's thatched roof behind the facade.
  m.color(THATCH).box(x + 7.5, q.height - 0.6, q.z, 14, 4.2, len - 1, 0, { top: 0.2 });
  m.color(THATCH_DARK).box(x + 7.5, q.height + 3.4, q.z, 2.6, 0.4, len * 0.2);
}
