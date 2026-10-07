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
