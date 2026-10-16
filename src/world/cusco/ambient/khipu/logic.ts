/**
 * Pure logic of the khipu of the four suyus on the usnu (../khipu.ts): passport progress per page and per
 * road, the knots each pendant cord carries, the Tawantinsuyu finale (when, and its true stats), and the
 * celebration's confetti. No DOM, no three.js (tested in logic.test.ts).
 *
 * Knots follow the Inca decimal convention: a cord reads top → bottom from the highest place value down,
 * with single knots grouped in each position (tens high, units low), so a cord's knots spell the number of
 * stamps that count on its pages. A road whose world is not open yet hangs without knots.
 */
import type { L, Lang } from "../../../contract";
import type { WorldId } from "../../../events";
import type { Gate } from "../../plan";

/** Minimal passport view the khipu needs (lib/passport.ts provides it). */
export interface PassportView {
  /** Required stamp ids per page. */
  required(world: WorldId): ReadonlyArray<string>;
  /** Stamps collected (ids). */
  has(id: string): boolean;
}

export interface PageProgress {
  world: WorldId;
  got: number;
  total: number;
  done: boolean;
}

export function pageProgress(view: PassportView, world: WorldId): PageProgress {
  const req = view.required(world);
  let got = 0;
  for (const id of req) if (view.has(id)) got++;
  return { world, got, total: req.length, done: req.length > 0 && got === req.length };
}

export interface RoadProgress {
  gate: Gate;
  pages: PageProgress[];
  /** Stamps that count on the road's pages (the cord's number). */
  knots: number;
  done: boolean;
}

export function roadProgress(view: PassportView, gate: Gate): RoadProgress {
  const pages = gate.available ? gate.pages.map((w) => pageProgress(view, w)) : [];
  const knots = pages.reduce((n, p) => n + p.got, 0);
  return { gate, pages, knots, done: pages.length > 0 && pages.every((p) => p.done) };
}

/** Every page that exists is complete (the passport's own rule: all required stamps of every page). */
export function allComplete(view: PassportView, pages: ReadonlyArray<WorldId>): boolean {
  return pages.length > 0 && pages.every((w) => pageProgress(view, w).done);
}

/** Knot positions on a pendant cord for n: distance below the cord's top for each single knot. */
export function knotOffsets(n: number, o: { tens: number; units: number; gap: number } = KNOT_LAYOUT): number[] {
  const v = Math.max(0, Math.min(99, Math.floor(n)));
  const out: number[] = [];
  const tens = Math.floor(v / 10);
  const units = v % 10;
  for (let i = 0; i < tens; i++) out.push(o.tens + i * o.gap);
  for (let i = 0; i < units; i++) out.push(o.units + i * o.gap);
  return out;
}
/** Where the tens and units groups start below the cord top, and the spacing within a group. */
export const KNOT_LAYOUT = { tens: 0.22, units: 0.98, gap: 0.075 } as const;

export interface FinaleStats {
  worldsDone: number;
  worlds: number;
  stamps: number;
  stampsTotal: number;
}

const TITLES = {
  named: { es: "¡Lo lograste, {name}!", en: "You made it, {name}!" },
  plain: { es: "¡Lo lograste!", en: "You made it!" },
} satisfies Record<string, L>;

export function finaleTitle(lang: Lang, name: string): string {
  const n = name.trim();
  return n ? TITLES.named[lang].replace("{name}", n) : TITLES.plain[lang];
}

/** The stat tiles (true counts only). */
export function finaleTiles(s: FinaleStats): Array<{ label: L; value: string }> {
  return [
    { label: { es: "mundos completados", en: "worlds completed" }, value: `${s.worldsDone}/${s.worlds}` },
    { label: { es: "sellos del pasaporte", en: "passport stamps" }, value: `${s.stamps}/${s.stampsTotal}` },
  ];
}

/** Once-ever celebration flag (per visitor): the stored value is the first celebration's time. */
export const FINALE_KEY = "ldiego73-cusco-finale-v1";
export function parseFinale(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const v = Number(raw);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** The celebration fires on arrival at the usnu, once ever, and only with every page complete. */
export function shouldCelebrate(o: { complete: boolean; celebratedAt: number | null; nearUsnu: boolean }): boolean {
  return o.complete && o.celebratedAt === null && o.nearUsnu;
}

// ---------------------------------------------------------------- confetti

export interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  landed: boolean;
}

export const CONFETTI = { n: 140, life: 7, gravity: 6.5, drag: 0.6 } as const;

/** Bits leave the khipu's top in a fountain (seeded rand for tests). */
export function spawnConfetti(n: number, y0: number, rand: () => number): Bit[] {
  return Array.from({ length: n }, () => {
    const a = rand() * Math.PI * 2;
    const s = 1.2 + rand() * 3.2;
    return {
      x: (rand() - 0.5) * 0.6,
      y: y0 + rand() * 0.4,
      z: (rand() - 0.5) * 0.6,
      vx: Math.cos(a) * s,
      vy: 5 + rand() * 4,
      vz: Math.sin(a) * s,
      spin: 2 + rand() * 7,
      landed: false,
    };
  });
}

/** Ballistic step with air drag; a bit stops on the floor `floor(x, z)` (relative heights). */
export function stepBit(b: Bit, dt: number, floor: (x: number, z: number) => number): void {
  if (b.landed) return;
  const k = Math.exp(-CONFETTI.drag * dt);
  b.vx *= k;
  b.vz *= k;
  // Paper flutters: terminal fall speed is low.
  b.vy = Math.max(-2.4, b.vy - CONFETTI.gravity * dt);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  const f = floor(b.x, b.z);
  if (b.y <= f + 0.02) {
    b.y = f + 0.02;
    b.landed = true;
  }
}

export function prng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
