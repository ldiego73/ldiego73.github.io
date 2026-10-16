/**
 * Pure rules of the coast's finale (../finale.ts): the true career numbers of the reward panel (the very same
 * computations as the mountain summit's panel in ../../../hud.ts `summit()`), its title with the traveler's name,
 * the arrival test, the sky's turn to sunset, and the celebration burst (shells and amancae petals thrown up
 * from the golden ring and drifting down on the sea wind). No DOM, no three.js (tested in logic.test.ts).
 */
import { ARTIFACTS, COMPANIES } from "../../../../data/career";
import type { Lang } from "../../../contract";

export interface CareerStats {
  years: number;
  companies: number;
  artifacts: number;
  knots: number;
}

/** Years since the first stage, working companies, cross-company artifacts and knots (as hud.ts summit()). */
export function careerStats(now = new Date()): CareerStats {
  const work = COMPANIES.filter((c) => !c.education);
  const first = Math.min(...COMPANIES.flatMap((c) => c.stages.map((s) => Number(s.start.slice(0, 4)))));
  const years = Math.max(1, now.getFullYear() - first);
  const knots = COMPANIES.reduce((a, c) => a + c.stages.reduce((b, s) => b + s.knots.length, 0), 0);
  return { years, companies: work.length, artifacts: ARTIFACTS.length, knots };
}

export function finaleTitle(lang: Lang, name: string): string {
  const n = name.trim();
  if (lang === "es") return n ? `¡Lo lograste, ${n}!` : "¡Lo lograste!";
  return n ? `You made it, ${n}!` : "You made it!";
}

/** Arrival with hysteresis: in once within `r`, out again only past r + 2. */
export function arrived(inside: boolean, d: number, r: number): boolean {
  return inside ? d < r + 2 : d < r;
}

/** Sky time of the sunset over the sea (sky.ts: 0.75 is the sun on the horizon; this is ~2° above it). */
export const SUNSET = 0.744;

/**
 * The finale's local frame: origin at the road's end, +Z toward where the sun sets into the sea (`sun`: the sky
 * arc's direction at SUNSET, x/z), so from the platform the sun goes down through the ring. Shared by
 * ../finale.ts and the gathering round it (../reunion.ts).
 */
export function finaleFrame(
  end: { x: number; z: number; y: number },
  sun: { x: number; z: number },
): { x: number; z: number; y: number; yaw: number } {
  return { x: end.x, z: end.z, y: end.y, yaw: Math.atan2(sun.x, sun.z) };
}

/** Centre of the platform in the finale frame, its lower tier's half size and the reward prompt's reach. */
export const PLATFORM = { z: 4.2, half: 4.6, prompt: 3.6 } as const;

/** The sky time `k` (0..1) of the way from `from` to the sunset, along the shorter way round the clock. */
export function towardSunset(from: number, k: number): number {
  let d = SUNSET - from;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  const e = k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k);
  return (((from + d * e) % 1) + 1) % 1;
}

export const BURST = { shells: 70, petals: 90, life: 7.5 } as const;

export interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin rates and phase. */
  sx: number;
  sy: number;
  ph: number;
  /** 0 shell (heavier, falls fast), 1 petal (flutters). */
  kind: 0 | 1;
  landed: boolean;
}

/** Seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bits thrown up and out from (0, y0, 0) in every direction. */
export function spawnBurst(y0: number, rand: () => number): Bit[] {
  const out: Bit[] = [];
  for (let i = 0; i < BURST.shells + BURST.petals; i++) {
    const kind: 0 | 1 = i < BURST.shells ? 0 : 1;
    const a = rand() * Math.PI * 2;
    const sp = (kind ? 2.2 : 3.2) + rand() * 2.6;
    out.push({
      x: (rand() - 0.5) * 0.6,
      y: y0 + rand() * 0.5,
      z: (rand() - 0.5) * 0.6,
      vx: Math.cos(a) * sp,
      vy: kind ? 2.6 + rand() * 2.2 : 6 + rand() * 3.5,
      vz: Math.sin(a) * sp,
      sx: (rand() - 0.5) * 9,
      sy: (rand() - 0.5) * 9,
      ph: rand() * Math.PI * 2,
      kind,
      landed: false,
    });
  }
  return out;
}

/** One step: gravity, drag (petals much more, with a flutter and the sea wind inland), settle on `floor`. */
export function stepBit(
  b: Bit,
  dt: number,
  age: number,
  floor: (x: number, z: number) => number,
  wind = { x: 0, z: 0 },
) {
  if (b.landed) return;
  const drag = b.kind ? 1.9 : 0.35;
  const g = b.kind ? 3.2 : 9.8;
  b.vy -= g * dt;
  b.vx += (wind.x - b.vx) * Math.min(1, drag * dt);
  b.vz += (wind.z - b.vz) * Math.min(1, drag * dt);
  if (b.kind && b.vy < -1.6) b.vy = -1.6 + Math.sin(age * 3 + b.ph) * 0.3;
  b.x += b.vx * dt + (b.kind ? Math.sin(age * 4 + b.ph) * 0.6 * dt : 0);
  b.y += b.vy * dt;
  b.z += b.vz * dt;
  const f = floor(b.x, b.z);
  if (b.y <= f) {
    b.y = f;
    b.landed = true;
  }
}

/** Scale of the bits over the burst's life (pop in, linger, shrink away at the end). */
export function burstScale(age: number): number {
  if (age < 0) return 0;
  if (age < 0.25) return age / 0.25;
  if (age > BURST.life - 1.2) return Math.max(0, (BURST.life - age) / 1.2);
  return 1;
}

/** Glow of the golden ring: a bright pulse at the arrival fading over a few seconds. */
export function glowAt(age: number): number {
  if (age < 0) return 0;
  return Math.max(0, 1 - age / 5) * (0.75 + 0.25 * Math.cos(age * 5));
}
