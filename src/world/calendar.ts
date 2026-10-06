/**
 * Real-date calendar for the world (Southern Hemisphere, Cusco): season, special days and the moon.
 * Pure functions plus `worldDate()`, which reads the real date or an override for testing:
 * `?date=2026-06-24` in the URL (any page of the world) or `__kw.setDate()` in dev.
 */

export type Season = "rainy" | "dry";
/** Andean seasons: rainy summer (Dec–Mar, garúa and storms), dry winter (May–Sep, frost and snow up high). */
export interface SeasonInfo {
  season: Season;
  /** 0..1 how deep into the rainy season (peaks in February); 0 in the dry months. */
  rain: number;
  /** 0..1 cold / snow at the summit (peaks in July); 0 in the rainy months. */
  snow: number;
}

export type Festival = "inti-raymi" | null;

export interface MoonInfo {
  /** 0 new → 0.5 full → 1 new (synodic age / 29.53). */
  phase: number;
  /** Lit fraction 0..1. */
  illumination: number;
  /** true while waxing (lit on the right side, seen from the south: mirrored; renderers decide). */
  waxing: boolean;
  name: { es: string; en: string };
}

let override: Date | null = null;

function fromUrl(): Date | null {
  try {
    const v = new URLSearchParams(location.search).get("date");
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
    const d = new Date(`${v}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/** The date the world lives in (override → URL → now). */
export function worldDate(): Date {
  return override ?? fromUrl() ?? new Date();
}

/** Test / dev hook. Pass null to go back to the real date. */
export function setWorldDate(d: Date | null) {
  override = d;
  // Seasonal dressing (snow, Inti Raymi) re-checks on its next frame instead of its polling period.
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("world:date"));
}

const dayOfYear = (d: Date) => {
  const start = Date.UTC(d.getFullYear(), 0, 1);
  return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86_400_000);
};

export function seasonOf(d: Date = worldDate()): SeasonInfo {
  const doy = dayOfYear(d);
  // Smooth bumps: rain centred on ~Feb 10 (doy 41), snow on ~Jul 15 (doy 196); ±~75 days wide.
  const bump = (center: number, width: number) => {
    let dd = Math.abs(doy - center);
    dd = Math.min(dd, 365 - dd);
    return dd >= width ? 0 : 0.5 + 0.5 * Math.cos((dd / width) * Math.PI);
  };
  const rain = bump(41, 80);
  const snow = bump(196, 90);
  return { season: rain >= snow ? "rainy" : "dry", rain, snow };
}

/** Inti Raymi: the June solstice festival, celebrated in Cusco on June 24 (we light it June 20–24). */
export function festivalOf(d: Date = worldDate()): Festival {
  return d.getMonth() === 5 && d.getDate() >= 20 && d.getDate() <= 24 ? "inti-raymi" : null;
}

const SYNODIC = 29.530588853;
/** Reference new moon: 2000-01-06 18:14 UTC. */
const NEW_MOON_REF = Date.UTC(2000, 0, 6, 18, 14);

export function moonOf(d: Date = worldDate()): MoonInfo {
  const days = (d.getTime() - NEW_MOON_REF) / 86_400_000;
  const age = ((days % SYNODIC) + SYNODIC) % SYNODIC;
  const phase = age / SYNODIC;
  const illumination = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
  const waxing = phase < 0.5;
  const names: Array<[number, { es: string; en: string }]> = [
    [0.03, { es: "Luna nueva", en: "New moon" }],
    [0.22, { es: "Luna creciente", en: "Waxing crescent" }],
    [0.28, { es: "Cuarto creciente", en: "First quarter" }],
    [0.47, { es: "Gibosa creciente", en: "Waxing gibbous" }],
    [0.53, { es: "Luna llena", en: "Full moon" }],
    [0.72, { es: "Gibosa menguante", en: "Waning gibbous" }],
    [0.78, { es: "Cuarto menguante", en: "Last quarter" }],
    [0.97, { es: "Luna menguante", en: "Waning crescent" }],
    [1.01, { es: "Luna nueva", en: "New moon" }],
  ];
  const name = (names.find(([max]) => phase < max) ?? names[0])[1];
  return { phase, illumination, waxing, name };
}
