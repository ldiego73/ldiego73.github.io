/**
 * Pure weather logic (no three / DOM): the slow random schedule clear → mist → garúa → clear, smooth
 * crossfades between states, and the dawn-mist bump. Tested in weather-schedule.test.ts.
 */
export type WeatherKind = "clear" | "mist" | "garua";

export interface WeatherLevels {
  /** Fog amount for the sky (0..1). */
  fog: number;
  /** Cloud cover (0..1). */
  cover: number;
  /** Drizzle amount (0..1). */
  rain: number;
}

export const LEVELS: Record<WeatherKind, Readonly<WeatherLevels>> = {
  clear: { fog: 0, cover: 0, rain: 0 },
  mist: { fog: 0.72, cover: 0.4, rain: 0 },
  garua: { fog: 0.4, cover: 0.85, rain: 1 },
};

/** Crossfade length (seconds). */
export const FADE = 30;

/** clear → mist → garúa → clear; sometimes the mist just lifts without drizzle. */
export function nextKind(k: WeatherKind, r: number): WeatherKind {
  if (k === "clear") return "mist";
  if (k === "mist") return r < 0.65 ? "garua" : "clear";
  return "clear";
}

/** Several minutes per state (seconds). */
export function durationOf(k: WeatherKind, r: number): number {
  if (k === "clear") return 210 + r * 210;
  if (k === "mist") return 140 + r * 120;
  return 110 + r * 100;
}

/** Extra morning mist around sunrise (time 0.25), 0..0.4. */
export function dawnMist(time: number): number {
  const d = (time - 0.255) / 0.04;
  return 0.4 * Math.exp(-d * d);
}

const smooth = (k: number) => k * k * (3 - 2 * k);

export interface WeatherClock {
  readonly kind: WeatherKind;
  readonly prev: WeatherKind;
  /** Seconds left in the current state. */
  readonly left: number;
  /** 0 → 1 crossfade from prev to kind. */
  readonly fade: number;
  /** Advance; returns true when the state changed this step. */
  step(dt: number): boolean;
  /** Blended levels (prev → kind), written into `out`. */
  levels(out: WeatherLevels): WeatherLevels;
}

export function createWeatherClock(rand: () => number, first: WeatherKind = "clear", firstFor?: number): WeatherClock {
  let kind = first;
  let prev = first;
  let left = firstFor ?? durationOf(first, rand());
  let fade = 1;
  return {
    get kind() {
      return kind;
    },
    get prev() {
      return prev;
    },
    get left() {
      return left;
    },
    get fade() {
      return fade;
    },
    step(dt) {
      if (fade < 1) fade = Math.min(1, fade + dt / FADE);
      left -= dt;
      if (left > 0) return false;
      prev = kind;
      kind = nextKind(kind, rand());
      left = durationOf(kind, rand());
      fade = 0;
      return true;
    },
    levels(out) {
      const a = LEVELS[prev];
      const b = LEVELS[kind];
      const k = smooth(fade);
      out.fog = a.fog + (b.fog - a.fog) * k;
      out.cover = a.cover + (b.cover - a.cover) * k;
      out.rain = a.rain + (b.rain - a.rain) * k;
      return out;
    },
  };
}

/** Deterministic PRNG for tests and seeded schedules. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
