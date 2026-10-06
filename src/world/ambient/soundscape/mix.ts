/**
 * Pure mixing rules for the world soundscape (no Web Audio here, unit tested).
 * Levels are linear gains for the layers in ./layers.ts (each layer's chain is voiced to sit near 0..1).
 */

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp01((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};

/** 0 at the trailhead altitude, 1 at the summit altitude. */
export function altitude01(y: number, y0: number, y1: number): number {
  if (!(y1 > y0)) return 0;
  return clamp01((y - y0) / (y1 - y0));
}

/** Wind: a breath in the valley, a steady blow up high, strongest at the summit. */
export function windLevel(alt: number, summitDist: number): number {
  const summit = 1 - smooth(10, 35, summitDist);
  return 0.18 + 0.5 * alt ** 1.4 + 0.3 * summit;
}

/** Gentle inverse-square-ish falloff: 1 at the source, 0.5 at `half`, 0 beyond `max`. */
export function falloff(d: number, half: number, max: number): number {
  if (d >= max) return 0;
  const g = 1 / (1 + (d / half) ** 2);
  return g * (1 - smooth(max * 0.7, max, d));
}

/** Water level from the nearest river/stream sample and the waterfall base. */
export function waterLevel(riverDist: number | null, fallDist: number): { level: number; river: number; fall: number } {
  const river = riverDist === null ? 0 : 0.75 * falloff(riverDist, 4, 24);
  const fall = falloff(fallDist, 7, 45);
  return { level: Math.min(1, Math.max(river, fall) + 0.25 * Math.min(river, fall)), river, fall };
}

/** Distance between footfalls for a horizontal speed (walk about 2 steps/s, run about 3). */
export function strideFor(speed: number, riding: boolean): number {
  const s = 1.2 + 0.17 * Math.max(0, speed);
  return riding ? s * 1.35 : s;
}

export type Surface = "stone" | "grass" | "wood" | "water";

export function surfaceAt(inside: boolean, water: boolean, grass: boolean): Surface {
  if (inside) return "wood";
  if (water) return "water";
  return grass ? "grass" : "stone";
}

/** Seconds until the next bird call. Sparser up high, in rain and on low quality. */
export function birdGap(r: number, alt: number, raining: boolean, low: boolean): number {
  let g = 1.4 + r * 3.6;
  g *= 1 + 1.5 * alt;
  if (raining) g *= 2.5;
  if (low) g *= 1.8;
  return g;
}

export interface Chirp {
  /** Seconds from the call start. */
  at: number;
  f0: number;
  f1: number;
  dur: number;
  vel: number;
}

/** A small songbird phrase: 2..5 quick sweeps around one species pitch. */
export function birdCall(rand: () => number): Chirp[] {
  const base = 2400 + rand() * 2200;
  const n = 2 + Math.floor(rand() * 4);
  const kind = Math.floor(rand() * 3); // 0 rising, 1 falling, 2 trill
  const out: Chirp[] = [];
  let at = 0;
  for (let i = 0; i < n; i++) {
    const f = base * (1 + (rand() - 0.5) * 0.12);
    const dur = kind === 2 ? 0.035 : 0.06 + rand() * 0.05;
    const [f0, f1] = kind === 0 ? [f * 0.8, f * 1.25] : kind === 1 ? [f * 1.3, f * 0.85] : [f, f * 1.08];
    out.push({ at, f0, f1, dur, vel: 0.7 + rand() * 0.3 });
    at += dur + (kind === 2 ? 0.02 : 0.05 + rand() * 0.08);
  }
  return out;
}

/** A cricket chirp: 3..4 pulses at one pitch. */
export function cricketChirp(rand: () => number, pitch: number): Chirp[] {
  const n = 3 + Math.floor(rand() * 2);
  const out: Chirp[] = [];
  for (let i = 0; i < n; i++) out.push({ at: i * 0.045, f0: pitch, f1: pitch, dur: 0.028, vel: 0.8 });
  return out;
}

/** Reads a `world:weather` detail defensively: true while it is a drizzle ("garua"). */
export function isGarua(detail: unknown): boolean {
  if (!detail || typeof detail !== "object") return false;
  const d = detail as { kind?: unknown; active?: unknown; on?: unknown };
  if (d.active === false || d.on === false) return false;
  return d.kind === "garua";
}

export interface MixInput {
  alt: number;
  summitDist: number;
  water: number;
  night: boolean;
  raining: boolean;
  inside: boolean;
  /** A content panel / passport is open. */
  modal: boolean;
  /** An arcade game is open (its music takes over). */
  game: boolean;
}

export interface MixOut {
  master: number;
  wind: number;
  water: number;
  rain: number;
  /** Multiplier for scheduled birds (day) and crickets/owl (night). */
  day: number;
  night: number;
}

/** Target levels for every layer from the traveler's situation. */
export function mixTargets(m: MixInput): MixOut {
  const out = m.inside ? 0.22 : 1; // walls muffle the outdoors
  return {
    master: m.game ? 0 : m.modal ? 0.6 : 1,
    wind: windLevel(m.alt, m.summitDist) * out * (m.raining ? 0.8 : 1),
    water: m.water * out,
    rain: m.raining ? (m.inside ? 0.3 : 0.85) : 0,
    day: m.night ? 0 : out * (m.raining ? 0.5 : 1),
    night: m.night ? out : 0,
  };
}

/** Stereo position of a source at (dx, dz) from the listener for a camera whose right vector is (rx, rz). */
export function panFor(dx: number, dz: number, rx: number, rz: number): number {
  const len = Math.hypot(dx, dz);
  const rl = Math.hypot(rx, rz);
  if (len < 1e-3 || rl < 1e-3) return 0;
  return Math.max(-0.85, Math.min(0.85, ((dx * rx + dz * rz) / (len * rl)) * 0.85));
}
