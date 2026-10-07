/**
 * Deterministic placement of the Antisuyu forest (pure: depends only on the layout, runs under bun test).
 *
 * Layers, all seeded (mulberry32, no Math.random):
 *  - emergent ceibas: landmarks behind the station plazas, a few along the road, and the walkway ceibas that
 *    hold the canopy platforms (trunks right beside the deck, outside the road band);
 *  - canopy trees (broadleaf "moena", tiered "shihuahuaco") filling the forest out to ~80 u from the road;
 *  - river pioneers: cecropia (cetico) and aguaje palms along both banks, huasaí clusters, shapaja palms;
 *  - understory walls by the road: shrubs, heliconias, bananas/platanillo, ferns, and liana curtains hung
 *    from the nearest canopy trees;
 *  - reeds (caña brava) at the waterline, victoria regia pads in two calm stretches, and sandbars (playas) on
 *    the inside of river bends.
 * Every land plant stands where `layout.isGround` holds and `Clearance` allows it; water things stay out of
 * the canoe lane, the dock corridors and the landings. Near-road sight lines: nothing taller than
 * CLEAR.lowMax within CLEAR.roadLow of the centerline. Trunks near the road / plazas become colliders.
 */
import { CANOPY_T } from "../contract";
import { CLEAR, type Clearance, type ClearLayout, createClearance, distSeg } from "./clearance";
import { CEIBA_TRUNK, canopyPlatforms } from "./platforms";

export interface Inst {
  x: number;
  y: number;
  z: number;
  /** Yaw. */
  rot: number;
  /** Uniform scale and extra vertical stretch. */
  s: number;
  sy: number;
  /** Small tilt (radians). */
  tilt: number;
  /** Tint index (per-species palette). */
  tint: number;
}

export const SPECIES = [
  "ceiba",
  "broadleaf",
  "tiered",
  "cecropia",
  "aguaje",
  "huasai",
  "shapaja",
  "banana",
  "heliconia",
  "shrub",
  "fern",
  "liana",
  "reed",
  "lily",
] as const;
export type Species = (typeof SPECIES)[number];

export interface Sandbar {
  x: number;
  z: number;
  /** Direction of the river there (radians, atan2(dz, dx)). */
  yaw: number;
  /** Half length along the river and half width across it. */
  len: number;
  wid: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface SceneryPlan {
  inst: Record<Species, Inst[]>;
  sandbars: Sandbar[];
  /** Trunk circles near the road and the plazas (registered with layout.addCollider by scenery.ts). */
  colliders: Circle[];
  /** The canopy-walkway ceibas (also in inst.ceiba): platform centers at deck height `y`. */
  platforms: Array<{ x: number; z: number; y: number; t: number; r: number }>;
}

/** Trunk radius at scale 1 (colliders, spacing) and nominal height (sight-line rule). */
export const SPEC: Record<Species, { trunk: number; h: number }> = {
  ceiba: { trunk: CEIBA_TRUNK, h: 26 },
  broadleaf: { trunk: 0.45, h: 13 },
  tiered: { trunk: 0.55, h: 17 },
  cecropia: { trunk: 0.25, h: 11 },
  aguaje: { trunk: 0.35, h: 12 },
  huasai: { trunk: 0.3, h: 10 },
  shapaja: { trunk: 0.45, h: 8 },
  banana: { trunk: 0.18, h: 3.6 },
  heliconia: { trunk: 0, h: 2.2 },
  shrub: { trunk: 0, h: 1.9 },
  fern: { trunk: 0, h: 0.9 },
  liana: { trunk: 0, h: 9 },
  reed: { trunk: 0, h: 3.4 },
  lily: { trunk: 0, h: 0.1 },
};

/** Instance budgets (high); "low" scales by LOW, phones further by PHONE. */
export const COUNTS: Record<Exclude<Species, "ceiba" | "lily" | "liana">, number> = {
  broadleaf: 700,
  tiered: 200,
  cecropia: 240,
  aguaje: 170,
  huasai: 260,
  shapaja: 110,
  banana: 200,
  heliconia: 650,
  shrub: 2300,
  fern: 1500,
  reed: 560,
};
export const LOW = { trees: 0.6, under: 0.55 } as const;

/**
 * Where the far canopy carpet (far.ts) stands: farther than `road` from the road centerline AND farther
 * than `river` beyond the river bank. Plants well inside it would be hidden under it, so none are placed there.
 */
export const CARPET = { road: 40, river: 11 } as const;
/** True when (d, rd) lies at least `margin` inside the carpet. */
export const underCarpet = (d: number, rd: number, margin: number) =>
  d > CARPET.road + margin && rd > CARPET.river + margin;
export const PHONE = { trees: 0.8, under: 0.7 } as const;

/** Seeded PRNG (mulberry32), same as tex.ts rng, kept here so this module stays Three-free. */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uniform spatial hash of discs (x, z, r): `hit` when a new disc overlaps one already placed. */
class DiscHash {
  private cells = new Map<number, number[]>();
  constructor(private cell: number) {}
  private key(i: number, j: number) {
    return (i + 4096) * 8192 + (j + 4096);
  }
  add(x: number, z: number, r: number) {
    const k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
    let b = this.cells.get(k);
    if (!b) {
      b = [];
      this.cells.set(k, b);
    }
    b.push(x, z, r);
  }
  /** Any stored disc closer than (its r + r) * k. */
  hit(x: number, z: number, r: number, k = 1) {
    const ci = Math.floor(x / this.cell);
    const cj = Math.floor(z / this.cell);
    const reach = Math.ceil((r + 8) / this.cell);
    for (let i = ci - reach; i <= ci + reach; i++)
      for (let j = cj - reach; j <= cj + reach; j++) {
        const b = this.cells.get(this.key(i, j));
        if (!b) continue;
        for (let n = 0; n < b.length; n += 3) {
          const d = ((b[n + 2] as number) + r) * k;
          if (((b[n] as number) - x) ** 2 + ((b[n + 1] as number) - z) ** 2 < d * d) return true;
        }
      }
    return false;
  }
}

interface Ctx {
  L: ClearLayout;
  C: Clearance;
  /** Trunks and crowns of trees/palms (spacing radius). */
  trunks: DiscHash;
  /** Understory footprints. */
  under: DiscHash;
  len: number;
}

/** A point `off` from the road (side ±1) at t, extended straight past both ends of the road. */
function roadPoint(L: ClearLayout, t: number, side: number, off: number): [number, number] {
  const tc = Math.min(1, Math.max(0, t));
  const p = L.trail.pointAt(tc);
  const tg = L.trail.tangentAt(tc);
  const ext = (t - tc) * L.trail.length;
  const x = p.x + tg.x * ext - tg.z * side * off;
  const z = p.z + tg.z * ext + tg.x * side * off;
  return [x, z];
}

/** A point `off` beyond the river bank (negative = into the water) on side ±1, at river fraction u. */
function riverPoint(L: ClearLayout, u: number, side: number, off: number): [number, number] {
  const pts = L.river.pts;
  const k = Math.min(pts.length - 1.001, Math.max(0, u * (pts.length - 1)));
  const i = Math.floor(k);
  const f = k - i;
  const [ax, az] = pts[i] as [number, number];
  const [bx, bz] = pts[i + 1] as [number, number];
  const w = (L.river.halfWidth[i] as number) * (1 - f) + (L.river.halfWidth[i + 1] as number) * f;
  const dx = bx - ax;
  const dz = bz - az;
  const l = Math.hypot(dx, dz) || 1;
  const nx = -dz / l;
  const nz = dx / l;
  return [ax + dx * f + nx * side * (w + off), az + dz * f + nz * side * (w + off)];
}

interface Sampler {
  /** Share of the candidates drawn by this sampler (the rest by the next ones). */
  share: number;
  mode: "road" | "river";
  /** Offset range: from the road centerline (road) or beyond the bank (river). */
  lo: number;
  hi: number;
  /** Bias toward `lo` (1 = uniform). */
  pow?: number;
}

interface Opts {
  seed: number;
  count: number;
  space: number;
  s: [number, number];
  sy?: [number, number];
  tints: number;
  layer: "trunk" | "under";
  samplers: Sampler[];
  /** Extra acceptance (0..1) from road distance d and river distance rd. */
  want?: (d: number, rd: number) => number;
  tilt?: number;
}

function scatter(c: Ctx, sp: Species, o: Opts, onPlace?: (i: Inst, d: number) => void): Inst[] {
  const R = rng(o.seed);
  const out: Inst[] = [];
  const spec = SPEC[sp];
  const kind = o.layer === "trunk" ? "tree" : "under";
  const tall = spec.h;
  for (let tries = 0; out.length < o.count && tries < o.count * 25; tries++) {
    let pick = R();
    let smp = o.samplers[0] as Sampler;
    for (const s of o.samplers) {
      smp = s;
      if (pick < s.share) break;
      pick -= s.share;
    }
    const side = R() < 0.5 ? -1 : 1;
    const off = smp.lo + (smp.hi - smp.lo) * R() ** (smp.pow ?? 1);
    const [x, z] =
      smp.mode === "road" ? roadPoint(c.L, -0.08 + R() * 1.16, side, off) : riverPoint(c.L, R(), side, off);
    const sc = o.s[0] + R() * (o.s[1] - o.s[0]);
    const r = o.space * sc * 0.5;
    if ((o.layer === "trunk" ? c.trunks : c.under).hit(x, z, r)) continue;
    if (o.layer === "under" && c.trunks.hit(x, z, 0.2, 0.35)) continue;
    if (!c.L.isGround(x, z) || c.C.blocked(x, z, kind)) continue;
    const q = c.L.trailQuery(x, z);
    // Sight lines: tall plants keep back from the road; near it only low ones (scaled down to fit).
    let s = sc;
    if (q.d < CLEAR.roadLow && tall * s > CLEAR.lowMax) {
      if (tall * o.s[0] > CLEAR.lowMax * 1.6) continue;
      s = CLEAR.lowMax / tall;
    }
    const rd = c.L.riverDist(x, z);
    // Hidden under the far canopy carpet (tall emergents may stand a little deeper and poke out).
    if (underCarpet(q.d, rd, o.layer === "under" ? 1 : tall > 15 ? 12 : 4)) continue;
    if (o.want && R() > o.want(q.d, rd)) continue;
    (o.layer === "trunk" ? c.trunks : c.under).add(x, z, r);
    const inst: Inst = {
      x,
      y: c.L.heightAt(x, z) - 0.08,
      z,
      rot: R() * Math.PI * 2,
      s,
      sy: o.sy ? o.sy[0] + R() * (o.sy[1] - o.sy[0]) : 1,
      tilt: (R() - 0.5) * (o.tilt ?? 0),
      tint: Math.floor(R() * o.tints),
    };
    out.push(inst);
    onPlace?.(inst, q.d);
  }
  return out;
}

/** Emergent ceibas: behind each station plaza, along the road every ~70 u, and the walkway trees. */
function ceibas(c: Ctx, plan: SceneryPlan, phone: boolean) {
  const out: Inst[] = [];
  const R = rng(17);
  // Ceiba crowns spread ~10 u: keep them off the dock corridors (boats, piers, stilt houses go there).
  const overDock = (x: number, z: number) =>
    c.C.docks.some(([ax, az, bx, bz]) => distSeg(x, z, ax, az, bx, bz) < CLEAR.dock + 9);
  const add = (x: number, z: number, s: number, rot: number, check: boolean) => {
    if (check && (!c.L.isGround(x, z) || c.C.blocked(x, z, "tree") || overDock(x, z) || c.trunks.hit(x, z, 7 * s)))
      return false;
    c.trunks.add(x, z, 7 * s);
    out.push({ x, y: c.L.heightAt(x, z) - 0.15, z, rot, s, sy: 1, tilt: 0, tint: out.length % 3 });
    return true;
  };
  // Canopy walkway: three ceibas hugging the deck where it is highest (platforms around their trunks).
  // Positions come from ./platforms.ts (one source for trees, planks, decks and the dosel stamp).
  for (const pf of canopyPlatforms(c.L)) {
    add(pf.x, pf.z, pf.s, R() * Math.PI * 2, false);
    plan.platforms.push({ x: pf.x, z: pf.z, y: pf.y, t: pf.t, r: pf.trunk + 2.2 });
  }
  // Landmarks behind the plazas (away from the road), just past the tree clearance.
  for (const pl of c.L.plazas) {
    if (pl.id === "puerto") continue;
    const t = c.L.trailQuery(pl.x, pl.z).t;
    const p = c.L.trail.pointAt(t);
    const away = Math.atan2(pl.z - p.z, pl.x - p.x);
    for (const da of [0.9, -0.9, 1.4, -1.4, 0.5, -0.5, 2, -2, 2.6, -2.6]) {
      const a = away + da;
      const dist = pl.r + CLEAR.plazaTree + 5 + R() * 3;
      if (add(pl.x + Math.cos(a) * dist, pl.z + Math.sin(a) * dist, 0.9 + R() * 0.25, R() * 6.28, true)) break;
    }
  }
  // Along the road, alternating sides, on both banks of the river too.
  const every = phone ? 95 : 70;
  const n = Math.floor(c.len / every);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5 + (R() - 0.5) * 0.5) / n;
    const side = i % 2 ? 1 : -1;
    for (let k = 0; k < 6; k++) {
      const off = side < 0 && R() < 0.4 ? 50 + R() * 25 : 15 + R() * 22;
      const [x, z] = roadPoint(c.L, t + (R() - 0.5) * 0.02, side, off);
      if (add(x, z, 0.85 + R() * 0.35, R() * 6.28, true)) break;
    }
  }
  return out;
}

/** Sandbars on the inside of the river's bends (both ends of the river excluded: they run into the forest). */
function sandbars(c: Ctx): Sandbar[] {
  const pts = c.L.river.pts;
  const out: Sandbar[] = [];
  const turn: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 6)] as [number, number];
    const b = pts[i] as [number, number];
    const d = pts[Math.min(pts.length - 1, i + 6)] as [number, number];
    const h1 = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const h2 = Math.atan2(d[1] - b[1], d[0] - b[0]);
    let dh = h2 - h1;
    if (dh > Math.PI) dh -= Math.PI * 2;
    if (dh < -Math.PI) dh += Math.PI * 2;
    turn.push(dh);
  }
  for (let i = 8; i < pts.length - 8; i++) {
    const k = turn[i] as number;
    // Local extreme of curvature, sharp enough to be a real bend.
    if (
      Math.abs(k) < 0.08 ||
      Math.abs(k) < Math.abs(turn[i - 1] as number) ||
      Math.abs(k) < Math.abs(turn[i + 1] as number)
    )
      continue;
    // Inside of the bend: the side the river turns toward (left normal for a left turn).
    const side = k > 0 ? 1 : -1;
    const [x, z] = riverPoint(c.L, i / (pts.length - 1), side, -2.6);
    const [bx, bz] = pts[i] as [number, number];
    const [nx, nz] = pts[i + 1] as [number, number];
    const yaw = Math.atan2(nz - bz, nx - bx);
    const bar: Sandbar = { x, z, yaw, len: 9 + Math.abs(k) * 30, wid: 3.2 };
    // Keep clear of docks, landings and the canoe lane (sampled along the bar's axis).
    let ok = true;
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      const px = x + Math.cos(yaw) * bar.len * f;
      const pz = z + Math.sin(yaw) * bar.len * f;
      if (c.C.blocked(px, pz, "water") || c.L.trailQuery(px, pz).d < 8) ok = false;
    }
    if (ok) out.push(bar);
  }
  return out;
}

/** Victoria regia: two calm stretches of shallows (a real cocha would need a backwater in layout.ts). */
export const LILY_PATCHES: Array<{ u: number; side: 1 | -1; n: number }> = [
  { u: 0.52, side: 1, n: 26 },
  { u: 0.71, side: -1, n: 30 },
];

function lilies(c: Ctx, low: boolean): Inst[] {
  const R = rng(71);
  const out: Inst[] = [];
  const pts = c.L.river.pts;
  const level = c.L.river.level;
  const hash = new DiscHash(4);
  for (const patch of LILY_PATCHES) {
    const n = Math.round(patch.n * (low ? 0.6 : 1));
    let placed = 0;
    for (let tries = 0; placed < n && tries < n * 40; tries++) {
      const u = patch.u + (R() - 0.5) * (24 / pts.length);
      const off = -1.2 - R() * 4.5;
      const [x, z] = riverPoint(c.L, u, patch.side, off);
      const s = 0.7 + R() * 0.6;
      if (hash.hit(x, z, s * 0.95)) continue;
      if (!c.L.isWater(x, z) || c.C.blocked(x, z, "water")) continue;
      hash.add(x, z, s * 0.95);
      out.push({ x, y: level + 0.03, z, rot: R() * 6.28, s, sy: 1, tilt: 0, tint: R() < 0.22 ? 1 : 0 });
      placed++;
    }
  }
  return out;
}

/** Reeds at the waterline: in the shallows and up the bank, on both shores. */
function reeds(c: Ctx, count: number): Inst[] {
  const R = rng(83);
  const out: Inst[] = [];
  const level = c.L.river.level;
  for (let tries = 0; out.length < count && tries < count * 25; tries++) {
    const side = R() < 0.5 ? -1 : 1;
    const u = R();
    // Along the waterline, wherever the bank profile puts it (it differs between the two shores).
    const [x, z] = riverPoint(c.L, u, side, -1 + R() * 6);
    const s = 0.75 + R() * 0.5;
    if (c.under.hit(x, z, 0.7 * s)) continue;
    const y = c.L.heightAt(x, z);
    if (y < level - 0.7 || y > level + 1.6) continue;
    if (c.C.blocked(x, z, "water") || c.C.blocked(x, z, "under")) continue;
    const q = c.L.trailQuery(x, z);
    if (q.d < c.L.trail.halfWidth + 3) continue;
    c.under.add(x, z, 0.7 * s);
    out.push({ x, y: y - 0.05, z, rot: R() * 6.28, s, sy: 0.85 + R() * 0.3, tilt: (R() - 0.5) * 0.15, tint: 0 });
  }
  return out;
}

/**
 * The whole plan. Same layout + quality + phone → same plan. `phone` (detectDevice) thins on top of "low".
 */
export function planScenery(L: ClearLayout, quality: "low" | "high", phone = false): SceneryPlan {
  const low = quality === "low";
  const kt = (low ? LOW.trees : 1) * (phone ? PHONE.trees : 1);
  const ku = (low ? LOW.under : 1) * (phone ? PHONE.under : 1);
  const C = createClearance(L);
  const c: Ctx = { L, C, trunks: new DiscHash(8), under: new DiscHash(4), len: L.trail.length };
  const plan: SceneryPlan = {
    inst: Object.fromEntries(SPECIES.map((s) => [s, []])) as unknown as Record<Species, Inst[]>,
    sandbars: [],
    colliders: [],
    platforms: [],
  };
  const I = plan.inst;
  I.ceiba = ceibas(c, plan, phone);
  const N = (k: keyof typeof COUNTS) => Math.round(COUNTS[k] * (SPEC[k].trunk > 0 ? kt : ku));
  const nearRoad: Inst[] = [];
  const near = (i: Inst, d: number) => {
    if (d < 15) nearRoad.push(i);
  };
  // Trees first, river pioneers before the canopy so the banks get their species.
  I.aguaje = scatter(c, "aguaje", {
    seed: 101,
    count: N("aguaje"),
    space: 5,
    s: [0.8, 1.2],
    sy: [0.85, 1.25],
    tints: 3,
    layer: "trunk",
    samplers: [{ share: 1, mode: "river", lo: 1.5, hi: 26, pow: 1.5 }],
  });
  I.cecropia = scatter(c, "cecropia", {
    seed: 103,
    count: N("cecropia"),
    space: 5,
    s: [0.8, 1.2],
    sy: [0.9, 1.2],
    tints: 3,
    layer: "trunk",
    samplers: [
      { share: 0.6, mode: "river", lo: 1.5, hi: 20, pow: 1.3 },
      { share: 0.4, mode: "road", lo: 6.5, hi: 16 },
    ],
  });
  I.tiered = scatter(
    c,
    "tiered",
    {
      seed: 109,
      count: N("tiered"),
      space: 7,
      s: [0.85, 1.2],
      sy: [0.9, 1.15],
      tints: 3,
      layer: "trunk",
      samplers: [{ share: 1, mode: "road", lo: 9, hi: 66, pow: 1.2 }],
    },
    near,
  );
  I.shapaja = scatter(c, "shapaja", {
    seed: 113,
    count: N("shapaja"),
    space: 5,
    s: [0.8, 1.2],
    sy: [0.85, 1.2],
    tints: 3,
    layer: "trunk",
    samplers: [{ share: 1, mode: "road", lo: 6.5, hi: 45, pow: 1.4 }],
  });
  I.broadleaf = scatter(
    c,
    "broadleaf",
    {
      seed: 107,
      count: N("broadleaf"),
      space: 5.4,
      s: [0.8, 1.25],
      sy: [0.85, 1.2],
      tints: 4,
      layer: "trunk",
      samplers: [{ share: 1, mode: "road", lo: 7, hi: 62, pow: 1.3 }],
    },
    near,
  );
  I.huasai = scatter(c, "huasai", {
    seed: 127,
    count: N("huasai"),
    space: 3.4,
    s: [0.8, 1.2],
    sy: [0.85, 1.2],
    tints: 3,
    layer: "trunk",
    samplers: [
      { share: 0.6, mode: "road", lo: 6, hi: 40, pow: 1.5 },
      { share: 0.4, mode: "river", lo: 1.5, hi: 16 },
    ],
  });
  I.banana = scatter(c, "banana", {
    seed: 131,
    count: N("banana"),
    space: 3,
    s: [0.8, 1.15],
    tints: 3,
    layer: "trunk",
    samplers: [{ share: 1, mode: "road", lo: 5.6, hi: 18, pow: 1.3 }],
  });
  // Understory.
  I.heliconia = scatter(c, "heliconia", {
    seed: 201,
    count: N("heliconia"),
    space: 1.8,
    s: [0.75, 1.15],
    sy: [0.85, 1.15],
    tints: 3,
    layer: "under",
    samplers: [{ share: 1, mode: "road", lo: 4.4, hi: 15, pow: 1.4 }],
  });
  I.shrub = scatter(c, "shrub", {
    seed: 203,
    count: N("shrub"),
    space: 2.3,
    s: [0.7, 1.3],
    sy: [0.8, 1.2],
    tints: 4,
    layer: "under",
    samplers: [
      { share: 0.7, mode: "road", lo: 4.2, hi: 30, pow: 1.7 },
      { share: 0.3, mode: "river", lo: 1.5, hi: 14 },
    ],
  });
  I.fern = scatter(c, "fern", {
    seed: 207,
    count: N("fern"),
    space: 1.15,
    s: [0.75, 1.3],
    sy: [0.85, 1.2],
    tints: 3,
    layer: "under",
    tilt: 0.2,
    samplers: [{ share: 1, mode: "road", lo: 3.9, hi: 26, pow: 1.6 }],
  });
  // Liana curtains hang under the crowns of canopy trees beside the road, on the road-facing side.
  {
    const R = rng(211);
    const out: Inst[] = [];
    const max = Math.round(260 * ku);
    for (const tree of nearRoad) {
      if (out.length >= max) break;
      if (R() < 0.15) continue;
      const q = L.trailQuery(tree.x, tree.z);
      const p = L.trail.pointAt(q.t);
      const dx = (p.x - tree.x) / (q.d || 1);
      const dz = (p.z - tree.z) / (q.d || 1);
      // 1.4–2.6 u toward the road, never into the sight-line band by the road.
      const pull = Math.min(1.4 + R() * 1.2, q.d - CLEAR.roadLow - 0.3);
      if (pull < 0.6) continue;
      const x = tree.x + dx * pull;
      const z = tree.z + dz * pull;
      if (L.trailQuery(x, z).d < CLEAR.roadLow + 0.2 || C.blocked(x, z, "under")) continue;
      out.push({
        x,
        y: L.heightAt(x, z),
        z,
        rot: Math.atan2(dx, dz) + (R() - 0.5) * 0.6,
        s: 0.85 + R() * 0.3,
        sy: tree.s * tree.sy,
        tilt: 0,
        tint: Math.floor(R() * 3),
      });
    }
    I.liana = out;
  }
  I.reed = reeds(c, N("reed"));
  I.lily = lilies(c, low);
  plan.sandbars = sandbars(c);

  // Colliders: trunks a traveler could reach (near the road, the plazas or the canopy walkway).
  const hw = L.trail.halfWidth;
  for (const sp of ["ceiba", "broadleaf", "tiered", "cecropia", "aguaje", "huasai", "shapaja", "banana"] as const) {
    for (const i of I[sp]) {
      const r = SPEC[sp].trunk * i.s;
      const q = L.trailQuery(i.x, i.z);
      const nearPlaza = L.plazas.some((p) => Math.hypot(i.x - p.x, i.z - p.z) < p.r + CLEAR.plazaTree + 8);
      const reach = sp === "ceiba" ? 40 : 12;
      if ((q.d < reach || nearPlaza) && q.d - r > hw) plan.colliders.push({ x: i.x, z: i.z, r });
    }
  }
  return plan;
}

/** Deck-corridor test used by the tests: inside the canopy walkway's t range and road band. */
export function inCanopyCorridor(L: ClearLayout, x: number, z: number, pad: number) {
  const q = L.trailQuery(x, z);
  return q.t > CANOPY_T[0] && q.t < CANOPY_T[1] && q.d < L.trail.halfWidth + pad;
}
