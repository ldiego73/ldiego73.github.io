/**
 * Pure data for the story maloca (blog): which posts hang as painted bark cloths (llanchama) on the walls,
 * newest first, at most MAX_CLOTHS, and the paint of each (site posts vs Medium posts), plus where the cloths
 * hang around the wall. No DOM, no three.js; posts come from the page's world data (src/world/data.ts).
 */
import type { WorldPost } from "../../../data";

export const MAX_CLOTHS = 10;

/** Paint of a cloth: site posts in achiote red, Medium posts in huito indigo-black. */
export const PAINT = { site: "#b8432f", medium: "#2b3550" } as const;

export interface Cloth {
  post: WorldPost;
  paint: string;
  /** Stable seed for the painted pattern. */
  seed: number;
}

const time = (iso: string) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Newest first, capped; posts without a title are skipped. */
export function cloths(posts: ReadonlyArray<WorldPost>, max = MAX_CLOTHS): Cloth[] {
  return posts
    .filter((p) => p.title?.trim())
    .slice()
    .sort((a, b) => time(b.date) - time(a.date))
    .slice(0, max)
    .map((post) => ({ post, paint: PAINT[post.source === "medium" ? "medium" : "site"], seed: hash(post.title) }));
}

/**
 * Wall angles (radians, local frame: 0 = +Z toward the door/trail, growing toward +X) for n cloths around the
 * round wall, leaving the door sector (±DOOR) free and spreading them evenly over the rest.
 */
export const DOOR = 0.5;
export function clothAngles(n: number): number[] {
  if (n <= 0) return [];
  const span = Math.PI * 2 - DOOR * 2;
  const step = span / n;
  return Array.from({ length: n }, (_, i) => DOOR + step * (i + 0.5));
}

/**
 * Floor plan of the maloca interior (local units around the maloca centre, angle 0 = the door): the bench ring
 * and the house posts stay inside BENCH_R, the wall's colliders outside WALL_R, and between them a clear aisle
 * the traveler can walk all the way round, past every cloth (maloca.ts registers exactly these colliders;
 * logic.test.ts checks the aisle stays clear for the traveler's body).
 */
export const WALL_R = 5.0;
/** Wall colliders: a ring of pegs just outside the bark wall (its inner face at WALL_R − 0.06). */
export const WALL_PEG = { r: WALL_R + 0.15, size: 0.25 } as const;
export const WALL_PEGS = 64;
/** Benches: on a ring of BENCH_R, BENCH_SLOTS slots, the ones facing the door left out. */
export const BENCH_R = 2.5;
export const BENCH_SLOTS = 8;
/** Bench colliders: pegs along each seat (offsets along the seat, radius). */
export const BENCH_PEG = { along: [-0.45, 0, 0.45], size: 0.28 } as const;
/** House posts (four, on the diagonals) and the fire pit. */
export const POST_R = 2.0;
export const POST_SIZE = 0.3;
export const POSTS_AT = [Math.PI / 4, (3 * Math.PI) / 4, (5 * Math.PI) / 4, (7 * Math.PI) / 4] as const;
export const FIRE_R = 0.8;
/** The aisle's centre line (cloth spots stand on it) and the reach of a cloth's "E" spot. */
export const AISLE_R = 3.85;
export const SPOT_R = 0.95;
/** The traveler's body radius in the runtimes (selva/index.ts BODY_R), mirrored for the tests. */
export const BODY_R = 0.42;

/** Bench angles: the slots whose centre is more than ~26° from the door. */
export function benchAngles(): number[] {
  const out: number[] = [];
  for (let i = 0; i < BENCH_SLOTS; i++) {
    const a = ((i + 0.5) / BENCH_SLOTS) * Math.PI * 2;
    if (Math.min(a, Math.PI * 2 - a) >= 0.45) out.push(a);
  }
  return out;
}

/** A post title short enough for the prompt pill (phones): whole words, an ellipsis when cut. */
export function promptTitle(title: string, max = 38): string {
  const t = title.trim().replace(/\s+/g, " ");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** Point on a ring around the maloca centre (angle 0 = +Z, the door; growing toward +X). */
export const ringPoint = (a: number, r: number): [number, number] => [Math.sin(a) * r, Math.cos(a) * r];

/**
 * Every interior collider (circles relative to the maloca centre): the wall pegs (not across the door, half
 * angle `doorHalf`), the bench pegs, the house posts and the fire pit.
 */
export function interiorColliders(doorHalf: number): Array<{ x: number; z: number; r: number }> {
  const out: Array<{ x: number; z: number; r: number }> = [];
  const push = (a: number, r: number, size: number) => {
    const [x, z] = ringPoint(a, r);
    out.push({ x, z, r: size });
  };
  for (let i = 0; i < WALL_PEGS; i++) {
    const a = ((i + 0.5) / WALL_PEGS) * Math.PI * 2;
    if (Math.min(a, Math.PI * 2 - a) >= doorHalf + 0.05) push(a, WALL_PEG.r, WALL_PEG.size);
  }
  for (const a of benchAngles()) for (const k of BENCH_PEG.along) push(a + k / BENCH_R, BENCH_R, BENCH_PEG.size);
  for (const a of POSTS_AT) push(a, POST_R, POST_SIZE);
  out.push({ x: 0, z: 0, r: FIRE_R });
  return out;
}
