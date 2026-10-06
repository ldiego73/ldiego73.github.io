/**
 * Deterministic placement of the vegetation (pure: depends only on the layout, runs under bun test).
 *
 * Rules shared by every species: inside the island rim, off the stone trail band (+ a per-species pad),
 * off plazas and their connector spurs, off the river / stream, above the river level, not on andén
 * risers. Trees additionally keep a wide berth around the tambo plazas (views stay open) and the trail.
 *
 * Altitude (trail climbs y ≈ 5 → 75): chusquea and aliso on the lower slopes, unca (cloud forest) on the
 * lower–mid mountain, queñua from mid slopes up into the puna, few trees near the summit; the pisonay are
 * three landmark trees flanking the lower tambos. Ichu thickens toward the puna; the short green ichu
 * dominates the valley; flowers line the trail edges.
 */
import { HALF_WIDTH, type Layout, RIVER_LEVEL, rimRadius, terraceMask } from "../layout";
import { rng } from "../tex";

export type FloraLayout = Pick<Layout, "heightAt" | "trailQuery" | "plazas" | "streamDist" | "isGrass" | "trail">;

export interface Inst {
  x: number;
  y: number;
  z: number;
  /** Yaw. */
  rot: number;
  /** Uniform scale and extra vertical stretch. */
  s: number;
  sy: number;
  /** Small tilt (radians) for ground cover on slopes. */
  tilt: number;
  /** Tint index (species-specific palette). */
  tint: number;
}

export interface FloraPlan {
  ichuTall: Inst[];
  ichuShort: Inst[];
  ichuDry: Inst[];
  lupine: Inst[];
  yellow: Inst[];
  quenua: Inst[];
  aliso: Inst[];
  unca: Inst[];
  pisonay: Inst[];
  chusquea: Inst[];
}

export type TreeKind = "quenua" | "aliso" | "unca" | "pisonay" | "chusquea";

/** Instance budgets per quality. */
export const COUNTS = {
  high: {
    ichuTall: 1900,
    ichuShort: 1300,
    ichuDry: 900,
    lupine: 160,
    yellow: 200,
    quenua: 70,
    aliso: 52,
    unca: 40,
    chusquea: 56,
  },
  low: {
    ichuTall: 900,
    ichuShort: 600,
    ichuDry: 360,
    lupine: 90,
    yellow: 110,
    quenua: 44,
    aliso: 30,
    unca: 24,
    chusquea: 30,
  },
} as const;

/** Trunk/crown radius used for spacing and trail clearance (crown overhang + camera room). */
export const TREE_R: Record<TreeKind, { trunk: number; crown: number; pad: number; space: number }> = {
  quenua: { trunk: 0.4, crown: 1.6, pad: 2.6, space: 2.6 },
  aliso: { trunk: 0.3, crown: 1.7, pad: 9, space: 3.4 },
  unca: { trunk: 0.4, crown: 2.6, pad: 8, space: 4.2 },
  pisonay: { trunk: 0.75, crown: 4.5, pad: 3.5, space: 8 },
  chusquea: { trunk: 0.5, crown: 1.6, pad: 2.2, space: 2.4 },
};

const distSeg = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const u = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * u, z - az - dz * u);
};

export function slopeAt(L: FloraLayout, x: number, z: number) {
  const e = 1;
  return Math.hypot(L.heightAt(x + e, z) - L.heightAt(x - e, z), L.heightAt(x, z + e) - L.heightAt(x, z - e)) / (2 * e);
}

/** Common clearance: rim, trail band + pad, plazas + spurs (+ plazaPad), stream, river level. */
export function clearOf(L: FloraLayout, x: number, z: number, pad: number, plazaPad = pad, trailD?: number): boolean {
  if (Math.hypot(x, z) > rimRadius(Math.atan2(z, x)) - 4) return false;
  if ((trailD ?? L.trailQuery(x, z).d) < HALF_WIDTH + pad) return false;
  for (const p of L.plazas) {
    if (Math.hypot(x - p.x, z - p.z) < p.r + plazaPad) return false;
    if (distSeg(x, z, p.tx, p.tz, p.x, p.z) < p.spur + pad) return false;
  }
  if (L.streamDist(x, z) < 2.8 + pad * 0.5) return false;
  return L.heightAt(x, z) >= RIVER_LEVEL + 0.6;
}

/** Ground steps sharply here (andén riser / plaza cut): nothing should float or sink. */
function onRiser(L: FloraLayout, x: number, z: number, r: number) {
  const y = L.heightAt(x, z);
  return (
    Math.abs(L.heightAt(x + r, z) - y) > 0.45 * r + 0.25 ||
    Math.abs(L.heightAt(x - r, z) - y) > 0.45 * r + 0.25 ||
    Math.abs(L.heightAt(x, z + r) - y) > 0.45 * r + 0.25 ||
    Math.abs(L.heightAt(x, z - r) - y) > 0.45 * r + 0.25
  );
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
/** Bell-ish band: 1 inside [a, b], fading over `f` units outside. */
const band = (y: number, a: number, b: number, f: number) => smooth(a - f, a, y) * (1 - smooth(b, b + f, y));

interface Ctx {
  L: FloraLayout;
  avoid: Array<[number, number, number]>;
}

function groundCover(
  c: Ctx,
  seed: number,
  count: number,
  want: (y: number, d: number) => number,
  o: { pad: number; slope: number; terrace: number; s: [number, number]; sy: [number, number]; tints: number },
  near?: (R: () => number) => [number, number] | null,
): Inst[] {
  const R = rng(seed);
  const out: Inst[] = [];
  for (let tries = 0; out.length < count && tries < count * 30; tries++) {
    let x: number;
    let z: number;
    const p = near?.(R);
    if (p) [x, z] = p;
    else {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 168;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (Math.hypot(x, z) > rimRadius(Math.atan2(z, x)) - 4) continue;
    const y = c.L.heightAt(x, z);
    // Cheap altitude test first; the trail query (the costly one) only for survivors.
    const wy = want(y, 0);
    if (R() > wy) continue;
    const d = c.L.trailQuery(x, z).d;
    if (R() > want(y, d) / Math.max(wy, 1e-6)) continue;
    if (!clearOf(c.L, x, z, o.pad, o.pad + 0.4, d) || slopeAt(c.L, x, z) > o.slope) continue;
    if (terraceMask(x, z, y) > 0.6 && R() > o.terrace) continue;
    if (onRiser(c.L, x, z, 0.5)) continue;
    let hit = false;
    for (const [ax, az, ar] of c.avoid)
      if ((ax - x) ** 2 + (az - z) ** 2 < ar * ar) {
        hit = true;
        break;
      }
    if (hit) continue;
    const s = o.s[0] + R() * (o.s[1] - o.s[0]);
    out.push({
      x,
      y: y - 0.05,
      z,
      rot: R() * Math.PI * 2,
      s,
      sy: o.sy[0] + R() * (o.sy[1] - o.sy[0]),
      tilt: (R() - 0.5) * 0.22,
      tint: Math.floor(R() * o.tints),
    });
  }
  return out;
}

function trees(
  c: Ctx,
  kind: TreeKind,
  seed: number,
  count: number,
  want: (y: number) => number,
  o: { groves: number; spread: number; slope: number; s: [number, number]; near: [number, number]; onTerrace: number },
  placed: Inst[][],
): Inst[] {
  const R = rng(seed);
  const T = TREE_R[kind];
  const ok = (x: number, z: number) => {
    if (!c.L.isGrass(x, z)) return false;
    if (!clearOf(c.L, x, z, T.pad + T.crown * 0.3, T.pad + T.crown + 6)) return false;
    if (slopeAt(c.L, x, z) > o.slope) return false;
    const y = c.L.heightAt(x, z);
    // Andenes cover most mid slopes: a few trees stand on the treads (as at Machu Picchu), never by a riser.
    const terr = terraceMask(x, z, y) > 0.45;
    if (terr && R() > o.onTerrace) return false;
    if (onRiser(c.L, x, z, terr ? 1.4 : Math.max(0.6, T.trunk * 1.5))) return false;
    for (const [ax, az, ar] of c.avoid) if ((ax - x) ** 2 + (az - z) ** 2 < (ar + T.trunk) ** 2) return false;
    return true;
  };
  // Grove centers in the species' altitude band.
  const groves: Array<[number, number]> = [];
  for (let tries = 0; groves.length < o.groves && tries < 4000; tries++) {
    let x: number;
    let z: number;
    if (R() < 0.8) {
      // Mostly in sight of the climb: a band beside the trail (but never on it).
      const t = R();
      const p = c.L.trail.pointAt(t);
      const tg = c.L.trail.tangentAt(t);
      const side = R() < 0.5 ? -1 : 1;
      const off = o.near[0] + R() * (o.near[1] - o.near[0]);
      x = p.x - tg.z * side * off;
      z = p.z + tg.x * side * off;
    } else {
      const a = R() * Math.PI * 2;
      const r = Math.sqrt(R()) * 160;
      x = Math.cos(a) * r;
      z = Math.sin(a) * r;
    }
    if (groves.some(([gx, gz]) => (gx - x) ** 2 + (gz - z) ** 2 < o.spread * o.spread * 3)) continue;
    if (R() > want(c.L.heightAt(x, z)) || !ok(x, z)) continue;
    groves.push([x, z]);
  }
  const out: Inst[] = [];
  if (!groves.length) return out;
  const all = placed.flat();
  for (let tries = 0; out.length < count && tries < count * 60; tries++) {
    const [gx, gz] = groves[Math.floor(R() * groves.length)] as [number, number];
    const a = R() * Math.PI * 2;
    const r = Math.sqrt(R()) * o.spread;
    const x = gx + Math.cos(a) * r;
    const z = gz + Math.sin(a) * r;
    if (!ok(x, z)) continue;
    const y = c.L.heightAt(x, z);
    if (R() > want(y) * 1.2) continue;
    let near = false;
    for (const t of out) if ((t.x - x) ** 2 + (t.z - z) ** 2 < T.space * T.space) near = true;
    for (const t of all) if ((t.x - x) ** 2 + (t.z - z) ** 2 < T.space * T.space * 0.8) near = true;
    if (near) continue;
    out.push({
      x,
      y: y - 0.12,
      z,
      rot: R() * Math.PI * 2,
      s: o.s[0] + R() * (o.s[1] - o.s[0]),
      sy: 0.92 + R() * 0.16,
      tilt: 0,
      tint: Math.floor(R() * 4),
    });
  }
  return out;
}

/**
 * A few trees right by the path (trunk just outside the clearance pad): bamboo arching over the edge of
 * the lower trail, queñua higher up. They put perches within the birds' flush distance of the walker.
 */
function edgeTrees(
  c: Ctx,
  kind: TreeKind,
  seed: number,
  count: number,
  want: (y: number) => number,
  s: [number, number],
  placed: Inst[][],
): Inst[] {
  const R = rng(seed);
  const T = TREE_R[kind];
  const lo = HALF_WIDTH + T.pad + 0.15;
  const out: Inst[] = [];
  const all = placed.flat();
  for (let tries = 0; out.length < count && tries < count * 80; tries++) {
    const p = sampleTrailEdge(c.L, R, lo, lo + 1.4, 1);
    if (!p) continue;
    const [x, z] = p;
    const y = c.L.heightAt(x, z);
    if (R() > want(y)) continue;
    if (!clearOf(c.L, x, z, T.pad, 6) || slopeAt(c.L, x, z) > 0.8 || onRiser(c.L, x, z, 0.8)) continue;
    let near = false;
    for (const t of out) if ((t.x - x) ** 2 + (t.z - z) ** 2 < 14 * 14) near = true;
    for (const t of all) if ((t.x - x) ** 2 + (t.z - z) ** 2 < T.space * T.space) near = true;
    for (const [ax, az, ar] of c.avoid) if ((ax - x) ** 2 + (az - z) ** 2 < (ar + T.trunk) ** 2) near = true;
    if (near) continue;
    out.push({
      x,
      y: y - 0.12,
      z,
      rot: R() * Math.PI * 2,
      s: s[0] + R() * (s[1] - s[0]),
      sy: 1,
      tilt: 0,
      tint: Math.floor(R() * 4),
    });
  }
  return out;
}

/** Plaza ids that get a pisonay landmark (lower, warm valley tambos). */
export const PISONAY_AT = ["avances", "hundred", "belcorp"];

function pisonays(c: Ctx): Inst[] {
  const out: Inst[] = [];
  const T = TREE_R.pisonay;
  for (const id of PISONAY_AT) {
    const p = c.L.plazas.find((q) => q.id === id);
    if (!p) continue;
    // Behind the tambo and off to one side: frames the plaza without standing between it and the trail.
    const away = Math.atan2(p.z - p.tz, p.x - p.tx);
    let best: Inst | null = null;
    let bestScore = Infinity;
    for (const side of [1, -1])
      for (const ang of [1.0, 1.25, 0.8, 1.5, 0.6, 1.8])
        for (const dist of [p.r + 4.5, p.r + 6, p.r + 7.5]) {
          const a = away + side * ang;
          const x = p.x + Math.cos(a) * dist;
          const z = p.z + Math.sin(a) * dist;
          if (!clearOf(c.L, x, z, T.pad, 3.6) || slopeAt(c.L, x, z) > 0.8 || onRiser(c.L, x, z, 0.9)) continue;
          // Prefer level with the plaza (a tree towering on the cut above it, or sunk below, looks off).
          const score = Math.abs(c.L.heightAt(x, z) - p.y) + Math.abs(ang - 1) * 1.5 + (dist - p.r) * 0.2;
          if (score >= bestScore) continue;
          bestScore = score;
          best = {
            x,
            y: c.L.heightAt(x, z) - 0.15,
            z,
            rot: a + Math.PI,
            s: 0.95,
            sy: 1,
            tilt: 0,
            tint: 0,
          };
        }
    if (best) out.push(best);
  }
  return out;
}

/** Phones (quality.ts deviceProfile): fewer ichu tufts and trees on top of the "low" budget. */
export const PHONE_DENSITY = { cover: 0.7, trees: 0.8 } as const;

/**
 * Full vegetation plan. `avoid` = extra [x, z, r] discs to keep clear (e.g. big rocks). `density` scales the
 * ichu (cover) and tree budgets; trail-edge flowers and path-side perch trees are kept (they are what a
 * walker sees up close). Same layout + quality + density → same plan.
 */
export function planFlora(
  L: FloraLayout,
  quality: "low" | "high",
  avoid: Array<[number, number, number]> = [],
  density: { cover: number; trees: number } = { cover: 1, trees: 1 },
): FloraPlan {
  const B = COUNTS[quality];
  const cv = (n: number) => Math.round(n * density.cover);
  const tr = (n: number) => Math.round(n * density.trees);
  const N = {
    ...B,
    ichuTall: cv(B.ichuTall),
    ichuShort: cv(B.ichuShort),
    ichuDry: cv(B.ichuDry),
    quenua: tr(B.quenua),
    aliso: tr(B.aliso),
    unca: tr(B.unca),
    chusquea: tr(B.chusquea),
  };
  const c: Ctx = { L, avoid: [...avoid] };
  // Trees first (ground cover avoids their trunks).
  const pisonay = pisonays(c);
  const chusquea = trees(
    c,
    "chusquea",
    401,
    N.chusquea,
    (y) => band(y, 2, 26, 6),
    { groves: 14, spread: 7, slope: 0.7, s: [0.85, 1.2], near: [6, 26], onTerrace: 0.15 },
    [pisonay],
  );
  const aliso = trees(
    c,
    "aliso",
    409,
    N.aliso,
    (y) => band(y, 1.5, 32, 8),
    { groves: 11, spread: 10, slope: 0.7, s: [0.8, 1.2], near: [14, 40], onTerrace: 0.45 },
    [pisonay, chusquea],
  );
  const unca = trees(
    c,
    "unca",
    419,
    N.unca,
    (y) => band(y, 14, 42, 6),
    { groves: 10, spread: 9, slope: 0.65, s: [0.85, 1.15], near: [12, 34], onTerrace: 0.5 },
    [pisonay, chusquea, aliso],
  );
  const quenua = trees(
    c,
    "quenua",
    421,
    N.quenua,
    // Polylepis is the highest-growing tree in the world: groves reach up toward the summit.
    (y) => band(y, 22, 72, 8) * (1 - smooth(72, 80, y) * 0.7),
    { groves: 16, spread: 8, slope: 0.75, s: [0.8, 1.25], near: [6, 30], onTerrace: 0.35 },
    [pisonay, chusquea, aliso, unca],
  );
  // Path-side trees (bird perches within reach of the walker), appended to their species.
  chusquea.push(
    ...edgeTrees(
      c,
      "chusquea",
      431,
      quality === "high" ? 14 : 8,
      (y) => band(y, 2, 30, 6),
      [0.8, 1.05],
      [pisonay, chusquea, aliso, unca, quenua],
    ),
  );
  quenua.push(
    ...edgeTrees(
      c,
      "quenua",
      433,
      quality === "high" ? 20 : 11,
      (y) => band(y, 20, 76, 6),
      [0.8, 1.05],
      [pisonay, chusquea, aliso, unca, quenua],
    ),
  );
  for (const [list, k] of [
    [pisonay, "pisonay"],
    [chusquea, "chusquea"],
    [aliso, "aliso"],
    [unca, "unca"],
    [quenua, "quenua"],
  ] as const)
    for (const t of list) c.avoid.push([t.x, t.z, TREE_R[k].trunk * t.s + 0.25]);

  const ichuTall = groundCover(c, 501, N.ichuTall, (y, d) => (smooth(6, 40, y) * 0.8 + 0.2) * (d > 16 ? 0.7 : 1), {
    pad: 0.8,
    slope: 0.95,
    terrace: 0.2,
    s: [0.65, 1.15],
    sy: [0.85, 1.2],
    tints: 4,
  });
  const ichuShort = groundCover(c, 503, N.ichuShort, (y, d) => (1 - smooth(20, 46, y) * 0.75) * (d > 18 ? 0.75 : 1), {
    pad: 0.8,
    slope: 0.95,
    terrace: 0.35,
    s: [0.8, 1.35],
    sy: [0.85, 1.2],
    tints: 3,
  });
  const ichuDry = groundCover(c, 507, N.ichuDry, (y) => smooth(30, 58, y) * 0.9 + 0.1, {
    pad: 0.8,
    slope: 1.0,
    terrace: 0.1,
    s: [0.8, 1.35],
    sy: [0.8, 1.15],
    tints: 3,
  });
  // Flowers: clustered along the trail edges (just behind the curb stones), sparse elsewhere.
  const trailEdge = (lo: number, hi: number, tMax: number) => {
    const pts: Array<[number, number]> = [];
    return (R: () => number): [number, number] | null => {
      if (R() < 0.12) return null;
      // Cluster: reuse a previous seed point most of the time.
      if (pts.length > 4 && R() < 0.55) {
        const [px, pz] = pts[Math.floor(R() * pts.length)] as [number, number];
        return [px + (R() - 0.5) * 1.6, pz + (R() - 0.5) * 1.6];
      }
      const p = sampleTrailEdge(L, R, lo, hi, tMax);
      if (p) pts.push(p);
      return p;
    };
  };
  const lupine = groundCover(
    c,
    601,
    N.lupine,
    (y) => band(y, 3, 52, 8),
    { pad: 1.1, slope: 0.8, terrace: 0.5, s: [0.8, 1.25], sy: [0.9, 1.2], tints: 3 },
    trailEdge(HALF_WIDTH + 1.2, HALF_WIDTH + 4.5, 0.9),
  );
  const yellow = groundCover(
    c,
    607,
    N.yellow,
    (y) => band(y, 1, 66, 6),
    { pad: 1.0, slope: 0.85, terrace: 0.5, s: [0.85, 1.3], sy: [0.9, 1.1], tints: 3 },
    trailEdge(HALF_WIDTH + 1.1, HALF_WIDTH + 4, 1),
  );
  return { ichuTall, ichuShort, ichuDry, lupine, yellow, quenua, aliso, unca, pisonay, chusquea };
}

/** Points along the trail, `lo..hi` from the centerline, on a random side, for trail t ≤ tMax. */
function sampleTrailEdge(
  L: FloraLayout,
  R: () => number,
  lo: number,
  hi: number,
  tMax: number,
): [number, number] | null {
  for (let k = 0; k < 6; k++) {
    const t = 0.01 + R() * (tMax - 0.01);
    const p = L.trail.pointAt(t);
    const tg = L.trail.tangentAt(t);
    const side = R() < 0.5 ? -1 : 1;
    const off = lo + R() * (hi - lo);
    const x = p.x - tg.z * side * off;
    const z = p.z + tg.x * side * off;
    const d = L.trailQuery(x, z).d;
    if (d >= lo && d <= hi) return [x, z];
  }
  return null;
}
