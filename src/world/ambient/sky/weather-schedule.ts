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

/**
 * Season bias from calendar.ts `seasonOf()`: rain 0..1 (rainy summer, peaks in February), snow 0..1
 * (dry winter, peaks in July). Omitted = the neutral year-round schedule.
 */
export interface SeasonBias {
  rain: number;
  snow: number;
}
const NEUTRAL: SeasonBias = { rain: 0, snow: 0 };
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** Chance that mist turns into garúa: ~0.95 deep in the rains, ~0.2 in the dry winter. */
export function garuaChance(bias: SeasonBias = NEUTRAL): number {
  return clamp(0.65 + 0.3 * bias.rain - 0.45 * bias.snow, 0.15, 0.95);
}

/** clear → mist → garúa → clear; sometimes the mist just lifts without drizzle. */
export function nextKind(k: WeatherKind, r: number, bias: SeasonBias = NEUTRAL): WeatherKind {
  if (k === "clear") return "mist";
  if (k === "mist") return r < garuaChance(bias) ? "garua" : "clear";
  return "clear";
}

/** Several minutes per state (seconds): long clear spells in the dry season, long rains in the wet one. */
export function durationOf(k: WeatherKind, r: number, bias: SeasonBias = NEUTRAL): number {
  if (k === "clear") return (210 + r * 210) * (1 + 0.8 * bias.snow - 0.45 * bias.rain);
  if (k === "mist") return (140 + r * 120) * (1 - 0.3 * bias.snow);
  return (110 + r * 100) * (1 + 0.5 * bias.rain);
}

/**
 * How heavy the drizzle is (0 fine garúa … 1 a proper "lluvia" shower): only in the rainy season, swelling
 * and easing slowly over time `t` (seconds).
 */
export function heaviness(bias: SeasonBias, t: number): number {
  const swell = 0.5 + 0.5 * Math.sin(t * 0.045) * Math.sin(t * 0.017 + 1.3);
  return clamp(bias.rain * 1.25 - 0.25, 0, 1) * (0.45 + 0.55 * swell);
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

export function createWeatherClock(
  rand: () => number,
  first: WeatherKind = "clear",
  firstFor?: number,
  bias: SeasonBias = NEUTRAL,
): WeatherClock {
  let kind = first;
  let prev = first;
  let left = firstFor ?? durationOf(first, rand(), bias);
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
      kind = nextKind(kind, rand(), bias);
      left = durationOf(kind, rand(), bias);
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
