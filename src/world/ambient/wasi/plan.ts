/**
 * Wasi floor plan: pure numbers and frame math shared by the always-loaded exterior (../wasi.ts) and the
 * lazily loaded interior chunk (./interior.ts). No three.js, no DOM.
 *
 * Local frame (house.ts convention): origin at the house centre on the ground plan, +Z out of the front
 * door toward the trail, +X across the front (the traveler's right when facing the door from outside).
 * WASI.yaw is π/2, so local axes map onto world axes (x_w = X + lz, z_w = Z − lx) and every local box is
 * also an exact world box: walls, partitions and furniture register as plain `box` colliders.
 *
 * Platform (`platform()`): the house stands on a levelled stone plinth whose top is one floor height (the
 * highest terrain under the rooms + FLOOR_LIFT), with a stone terrace along the front and STEPS stone steps
 * down from the terrace to the flagstone walk. The plinth and each step register as raised decks
 * (../../decks.ts), so core stands the traveler on them; nothing under the plinth is walkable (it is grass),
 * so the open plinth and terrace edges act as walls and the house is reached only up the steps.
 *
 *            back wall (lz = −D)                      ← west (world −x)
 *    ┌────────────────┬────────────────┐
 *    │ Estudio        │  Rincón del    │
 *    │ desk · shelf   │  chasqui · buzón│
 *    ├──────┐    (open)    ┌──────────┤   half-height adobe partitions (lz = 0, lx = 0 back half)
 *    │ Sala · khipu   │    Mesa del    │
 *    │ banca          │    viajero     │
 *    └──────── door (lx = 0) ──────────┘   front wall (lz = +D) → flagstone walk → trail (east)
 */
import type { Collider } from "../../contract";
import { WASI } from "../../trailhead";

export type RoomId = "sala" | "estudio" | "buzon" | "mesa";

/** Half sizes of the outer walls (WASI single source). */
export const HW = WASI.halfW;
export const HD = WASI.halfD;
/** Wall thickness. */
export const T = 0.35;
/** Inner faces of the outer walls. */
export const INNER = { x0: -HW + T, x1: HW - T, z0: -HD + T, z1: HD - T } as const;
/** Door gap in the front wall (centred on lx = DOOR.x). */
export const DOOR = { x: 0, w: 1.8, h: 2.3 } as const;
/** Headroom above the (level) floor up to the eaves. */
export const HEADROOM = 2.75;
/** The floor sits this far above the highest terrain sample under the rooms (no grass through the boards). */
export const FLOOR_LIFT = 0.15;
/** Depth of the stone terrace in front of the facade (the plinth runs from the back wall to HD + TERRACE_D). */
export const TERRACE_D = 1.5;
/** Stone steps from the terrace edge down to the walk: count, width (centred on the door), tread depth. */
export const STEPS = 2;
export const STEP_W = 2.4;
export const STEP_D = 0.45;
/** Highest riser the steps may have (core's step-up is MAX_STEP = 0.9; these are comfortable stairs). */
export const MAX_RISE = 0.35;
/** Local z where the steps end and the walk begins. */
export const STEPS_END = HD + TERRACE_D + STEPS * STEP_D;
/** Height of the inner adobe partitions (low, so the dollhouse view reads every room at once). */
export const PARTITION_H = 1.3;
/** Front windows (lx centres) and back windows (over the desk and the chasqui table). */
export const FRONT_WINDOWS = [-3.6, 3.6] as const;
export const BACK_WINDOWS = [-3.0, 3.1] as const;
export const WINDOW = { w: 1.0, y0: 1.05, y1: 2.05 } as const;

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}
const box = (x0: number, z0: number, x1: number, z1: number): Box => ({ x0, z0, x1, z1 });

/** Outer walls as local boxes, the front one split around the door gap. */
export function wallBoxes(): Box[] {
  const dl = DOOR.x - DOOR.w / 2;
  const dr = DOOR.x + DOOR.w / 2;
  return [
    box(-HW, -HD, HW, -HD + T), // back
    box(-HW, -HD, -HW + T, HD), // left
    box(HW - T, -HD, HW, HD), // right
    // Front, a little proud of the facade: the door leaf and the shutters hang on its outer face.
    box(-HW, HD - T, dl, HD + 0.12),
    box(dr, HD - T, HW, HD + 0.12),
  ];
}

/** Low adobe partitions between the rooms (the centre and the door stay open). */
export const PARTITIONS: Box[] = [
  box(INNER.x0, -0.1, -1.5, 0.1),
  box(1.5, -0.1, INNER.x1, 0.1),
  box(-0.1, INNER.z0, 0.1, -1.4),
];
/** Wooden posts at the partition ends (they carry the ceiling beams). */
export const POSTS: ReadonlyArray<readonly [number, number]> = [
  [-1.5, 0],
  [1.5, 0],
  [0, -1.4],
];

export interface Furniture {
  id: string;
  /** Collider footprint (local). */
  box: Box;
}

/**
 * Solid furniture (local footprints). The interior builder places the models on these same boxes, so
 * colliders and meshes cannot drift apart.
 */
export const FURNITURE: Furniture[] = [
  // Sala: banca against the partition, a clay tinaja in the corner.
  { id: "banca", box: box(-4.7, 0.1, -2.3, 0.95) },
  { id: "tinaja", box: box(-5.15, 3.5, -4.55, 4.15) },
  // Mesa del viajero: table and a bench against the right wall.
  { id: "mesa", box: box(2.75, 1.75, 4.25, 2.75) },
  { id: "banco", box: box(4.65, 1.5, INNER.x1, 3.0) },
  // Estudio: desk under the back window (its chair tucked in), bookshelf on the left wall, floor lamp.
  { id: "desk", box: box(-3.95, INNER.z0, -2.05, -2.95) },
  { id: "shelf", box: box(INNER.x0, -3.3, -4.7, -1.0) },
  { id: "lamp", box: box(-0.75, -3.95, -0.35, -3.55) },
  // Rincón del chasqui: little table with the buzón and the pututu, a q'ipi bundle.
  { id: "buzon", box: box(2.4, INNER.z0, 3.8, -3.45) },
  { id: "qipi", box: box(4.5, -1.2, INNER.x1, -0.6) },
];

export interface Room {
  id: RoomId;
  /** Where the interaction is centred (local) and how close the traveler must be. */
  spot: { x: number; z: number };
  r: number;
  /** Rough room rectangle (for labels / tests). */
  area: Box;
}

export const ROOMS: Room[] = [
  { id: "sala", spot: { x: -4.0, z: 2.2 }, r: 1.6, area: box(INNER.x0, 0.1, -0.9, INNER.z1) },
  { id: "mesa", spot: { x: 3.5, z: 2.25 }, r: 1.9, area: box(0.9, 0.1, INNER.x1, INNER.z1) },
  { id: "estudio", spot: { x: -3.0, z: -3.75 }, r: 1.75, area: box(INNER.x0, INNER.z0, -0.1, -0.1) },
  { id: "buzon", spot: { x: 3.1, z: -3.8 }, r: 1.8, area: box(0.1, INNER.z0, INNER.x1, -0.1) },
];

/** Walk from the foot of the steps to the trail's west edge (world [x, z]); it joins the trail south of the arch. */
export const WALK: ReadonlyArray<readonly [number, number]> = [
  [WASI.x + STEPS_END + 0.55, WASI.z],
  [33.4, 106.3],
  [35.5, 105.0],
  [38.0, 103.9],
  [40.4, 103.4],
];
export const WALK_R = 0.95;

/** Radius of the creatures keep-out disc around the house (covers the porch and the garden). */
export const KEEP_OUT_R = Math.hypot(HW, HD) + 1.8;

// ------------------------------------------------------------------------------------------- frame math

const cos = Math.cos(WASI.yaw);
const sin = Math.sin(WASI.yaw);

export function toWorld(lx: number, lz: number): { x: number; z: number } {
  return { x: WASI.x + lx * cos + lz * sin, z: WASI.z - lx * sin + lz * cos };
}

export function toLocal(x: number, z: number): { x: number; z: number } {
  const dx = x - WASI.x;
  const dz = z - WASI.z;
  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/** A local box as a world collider box (exact because the yaw is a multiple of π/2). */
export function worldBox(b: Box): Collider {
  const a = toWorld(b.x0, b.z0);
  const c = toWorld(b.x1, b.z1);
  return {
    kind: "box",
    x0: Math.min(a.x, c.x),
    z0: Math.min(a.z, c.z),
    x1: Math.max(a.x, c.x),
    z1: Math.max(a.z, c.z),
  };
}

/** True when a local point is inside the rooms (between the inner wall faces). */
export function isInsideLocal(lx: number, lz: number): boolean {
  return lx > INNER.x0 + 0.05 && lx < INNER.x1 - 0.05 && lz > INNER.z0 + 0.05 && lz < INNER.z1 + 0.05;
}

/** The room whose interaction spot is nearest to the local point, within its range; null otherwise. */
export function roomAt(lx: number, lz: number): RoomId | null {
  let best: RoomId | null = null;
  let bd = Number.POSITIVE_INFINITY;
  for (const r of ROOMS) {
    const d = Math.hypot(lx - r.spot.x, lz - r.spot.z);
    if (d <= r.r && d < bd) {
      bd = d;
      best = r.id;
    }
  }
  return best;
}

/** Discs every `step` along a polyline (diagonal paths: boxes would leave a staircase edge). */
export function pathCircles(path: ReadonlyArray<readonly [number, number]>, r: number, step = r * 0.6): Collider[] {
  const out: Collider[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = i === 0 ? 0 : 1; k <= n; k++)
      out.push({ kind: "circle", x: ax + ((bx - ax) * k) / n, z: az + ((bz - az) * k) / n, r });
  }
  return out;
}

/**
 * Walkable areas on the terrain: only the flagstone walk. The rooms, the terrace and the steps are raised
 * decks (`platform().decks`), walkable through the deck registry.
 */
export function walkables(): Collider[] {
  return pathCircles(WALK, WALK_R);
}

// ------------------------------------------------------------------------------------------- platform

/** The plinth top (house + front terrace) as a local box. */
export const PLINTH: Box = box(-HW, -HD, HW, HD + TERRACE_D);

export interface Step {
  /** Local footprint (centred on the door, toward +Z). */
  box: Box;
  /** World y of the tread. */
  y: number;
}

export interface Platform {
  /** World y of the floor, the plinth and the terrace. */
  floor: number;
  /** World y of the terrain where the walk meets the last step. */
  foot: number;
  /** Riser height (equal for every step, the last one included). */
  rise: number;
  steps: Step[];
  /** Raised walkable surfaces to register in ../../decks.ts (world shapes). */
  decks: Array<{ shape: Collider; y: number; id: string }>;
}

/**
 * The levelled platform from the terrain (world heightAt): the floor height, the steps' treads (equal risers
 * from the terrace down to the walk) and the decks to register. Pure: tests run it on the real layouts.
 */
export function platform(terrain: (x: number, z: number) => number): Platform {
  let top = Number.NEGATIVE_INFINITY;
  for (let x = INNER.x0; x <= INNER.x1 + 1e-6; x += 0.25)
    for (let z = INNER.z0; z <= INNER.z1 + 1e-6; z += 0.25) {
      const p = toWorld(x, z);
      top = Math.max(top, terrain(p.x, p.z));
    }
  const floor = top + FLOOR_LIFT;
  // The walk starts at the foot of the steps: its highest terrain across the step width.
  let foot = Number.NEGATIVE_INFINITY;
  for (let x = -STEP_W / 2; x <= STEP_W / 2 + 1e-6; x += 0.3) {
    const p = toWorld(DOOR.x + x, STEPS_END + 0.2);
    foot = Math.max(foot, terrain(p.x, p.z));
  }
  const rise = (floor - foot) / (STEPS + 1);
  const steps: Step[] = [];
  for (let k = 1; k <= STEPS; k++) {
    const z0 = HD + TERRACE_D + (k - 1) * STEP_D;
    steps.push({ box: box(DOOR.x - STEP_W / 2, z0, DOOR.x + STEP_W / 2, z0 + STEP_D), y: floor - rise * k });
  }
  return {
    floor,
    foot,
    rise,
    steps,
    decks: [
      { shape: worldBox(PLINTH), y: floor, id: "wasi-plinth" },
      ...steps.map((s, i) => ({ shape: worldBox(s.box), y: s.y, id: `wasi-step-${i + 1}` })),
    ],
  };
}

/** True when a local point is on the plinth top (house + terrace). */
export function onPlinth(lx: number, lz: number): boolean {
  return lx >= PLINTH.x0 && lx <= PLINTH.x1 && lz >= PLINTH.z0 && lz <= PLINTH.z1;
}

/** Every solid collider of the house: walls (door gap left open), partitions, posts, furniture, garden. */
export function colliders(): Collider[] {
  const out: Collider[] = [];
  for (const b of wallBoxes()) out.push(worldBox(b));
  for (const b of PARTITIONS) out.push(worldBox(b));
  for (const [x, z] of POSTS) {
    const p = toWorld(x, z);
    out.push({ kind: "circle", x: p.x, z: p.z, r: 0.14 });
  }
  for (const f of FURNITURE) out.push(worldBox(f.box));
  for (const g of GARDEN) {
    const p = toWorld(g.x, g.z);
    out.push({ kind: "circle", x: p.x, z: p.z, r: g.r });
  }
  return out;
}

/** Garden pieces on the terrace in front of the facade, and a tinaja beside the house (local; r = collider radius). */
export const GARDEN: ReadonlyArray<{ id: "bench" | "pot" | "maceta"; x: number; z: number; r: number }> = [
  { id: "bench", x: 2.3, z: HD + 0.42, r: 0.3 },
  { id: "bench", x: 2.9, z: HD + 0.42, r: 0.3 },
  { id: "pot", x: -2.25, z: HD + 0.5, r: 0.32 },
  { id: "maceta", x: 3.6, z: HD + 0.4, r: 0.22 },
  { id: "pot", x: -HW - 0.45, z: HD - 0.6, r: 0.36 },
];

/** "2016–2019", "2024–hoy" from career.ts YYYY-MM stage dates. */
export function yearsOf(start: string, end: string | undefined, lang: "es" | "en"): string {
  const a = start.slice(0, 4);
  const b = end ? end.slice(0, 4) : lang === "es" ? "hoy" : "present";
  return a === b ? a : `${a}–${b}`;
}

/** Distance from (x, z) to a polyline. */
export function distToPath(path: ReadonlyArray<readonly [number, number]>, x: number, z: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i]!;
    const [bx, bz] = path[i + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const k = l2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (ax + dx * k), z - (az + dz * k)));
  }
  return best;
}

/** Ground cover to clear (world point): under the house, the terrace and the steps, and along the walk. */
export function clearsGround(x: number, z: number): boolean {
  const l = toLocal(x, z);
  if (Math.abs(l.x) < HW + 0.8 && l.z > -HD - 0.8 && l.z < HD + TERRACE_D + 0.8) return true;
  if (Math.abs(l.x) < STEP_W / 2 + 0.6 && l.z > 0 && l.z < STEPS_END + 0.4) return true;
  // Wide margin: a chusquea clump planted 1.5 u off the walk still spreads over it.
  return distToPath(WALK, x, z) < WALK_R + 1.2;
}
