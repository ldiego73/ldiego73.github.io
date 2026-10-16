/**
 * Pure logic of the Antisuyu finale (../kene.ts): the reward panel's title and its stat tiles, the arrival
 * test, and the celebration burst (flower petals and blue morphos rising from the totem's crown). No DOM, no
 * three.js; the ambient feeds it real counts and draws what it returns.
 *
 * Stats are true by construction: every number is a count of something the jungle road actually shows (the
 * trader's wares from src/data/uses.ts, the maloca's posts from the page's world data, the stilt houses'
 * projects, the arcade's games, the passport's jungle stamps). A count that is zero (posts and repos can be
 * missing in an offline build) is dropped and the next one takes its place; never a made-up number.
 */
import type { L, Lang } from "../../../contract";

export interface FinaleCounts {
  /** Wares on the trader's boat (regaton/logic.ts stalls: the /uses page). */
  tools: number;
  /** Bark cloths in the story maloca (maloca/logic.ts cloths: blog + Medium posts). */
  posts: number;
  /** Stilt houses (palafitos/logic.ts projects: case studies + top repos). */
  projects: number;
  /** Games in the arcade (src/games/registry.ts). */
  games: number;
  /** Jungle passport stamps collected / required. */
  stamps: { got: number; total: number };
}

export interface StatTile {
  key: keyof FinaleCounts;
  value: string;
  label: L;
}

const LABELS: Record<keyof FinaleCounts, L> = {
  tools: { es: "herramientas en el bote", en: "tools on the trader's boat" },
  posts: { es: "relatos en la maloca", en: "stories in the maloca" },
  projects: { es: "proyectos en los palafitos", en: "projects on stilts" },
  games: { es: "juegos en el arcade", en: "games in the arcade" },
  stamps: { es: "sellos del Antisuyu", en: "Antisuyu stamps" },
};

/** Four tiles: the first three non-zero counts of tools → posts → projects → games, then the stamps. */
export function statTiles(c: FinaleCounts, max = 4): StatTile[] {
  const out: StatTile[] = [];
  for (const key of ["tools", "posts", "projects", "games"] as const) {
    const n = c[key];
    if (out.length < max - 1 && Number.isFinite(n) && n > 0)
      out.push({ key, value: String(Math.round(n)), label: LABELS[key] });
  }
  if (c.stamps.total > 0) {
    const got = Math.max(0, Math.min(c.stamps.total, Math.round(c.stamps.got)));
    out.push({ key: "stamps", value: `${got}/${c.stamps.total}`, label: LABELS.stamps });
  }
  return out;
}

const TITLE = {
  named: { es: "¡Lo lograste, {name}!", en: "You made it, {name}!" },
  plain: { es: "¡Lo lograste!", en: "You made it!" },
} satisfies Record<string, L>;

/** Panel title with the traveler's name when there is one. */
export function finaleTitle(lang: Lang, name: string): string {
  const n = name.trim();
  return n ? TITLE.named[lang].replace("{name}", n) : TITLE.plain[lang];
}

/** Collected ids among the required ones (the passport's stored stamps plus this visit's events). */
export function countStamps(
  required: ReadonlyArray<string>,
  have: ReadonlySet<string>,
): { got: number; total: number } {
  let got = 0;
  for (const id of required) if (have.has(id)) got++;
  return { got, total: required.length };
}

/** Arrival with hysteresis: in once within `r`, out again only beyond `r + out`. */
export function arrived(wasIn: boolean, d: number, r: number, out = 2): boolean {
  return wasIn ? d < r + out : d < r;
}

// ------------------------------------------------------------------------------------------------ burst

/** Burst timings (s): particles live LIFE, start fading at FADE. */
export const BURST = { petals: 150, morphos: 18, life: 7.5, fade: 5.5 } as const;

export interface Petal {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin rates and the flutter phase. */
  sx: number;
  sy: number;
  ph: number;
  /** Palette index. */
  c: number;
}

export interface Morpho {
  /** Start angle round the crown, outward speed, climb rate, turn rate, phase. */
  a0: number;
  out: number;
  climb: number;
  turn: number;
  ph: number;
}

/** Seeded PRNG (mulberry32). */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Petals thrown up and out from a crown at height `y` above the totem (local x/z = 0), `colors` hues. */
export function spawnPetals(n: number, y: number, colors: number, rand: () => number): Petal[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const sp = 1.2 + rand() * 3.4;
    return {
      x: Math.cos(a) * 0.4,
      y: y + rand() * 0.4,
      z: Math.sin(a) * 0.4,
      vx: Math.cos(a) * sp,
      vy: 3.5 + rand() * 4.5,
      vz: Math.sin(a) * sp,
      sx: (rand() - 0.5) * 9,
      sy: (rand() - 0.5) * 9,
      ph: rand() * Math.PI * 2,
      c: i % Math.max(1, colors),
    };
  });
}

/** Gravity, and the air drag that turns a thrown petal into a slow, fluttering fall. */
const G = 9.8;
const DRAG = 2.6;
/** A falling petal sways sideways at this amplitude (u/s) and rate (rad/s). */
const SWAY = 0.9;
const SWAY_W = 3.2;

/**
 * Steps one petal by dt (age = time since the burst): ballistic with strong drag (terminal fall ≈ G / DRAG),
 * a sideways sway while falling, resting on the ground (`floor(x, z)`, local) once it lands.
 */
export function stepPetal(p: Petal, dt: number, age: number, floor: (x: number, z: number) => number) {
  const f = floor(p.x, p.z);
  if (p.y <= f + 0.02 && p.vy <= 0) {
    p.y = f + 0.02;
    p.vx = p.vy = p.vz = 0;
    return;
  }
  const k = Math.exp(-DRAG * dt);
  p.vx *= k;
  p.vz *= k;
  p.vy = p.vy * k - G * dt * (1 - Math.min(0.6, Math.max(0, -p.vy) * 0.25));
  const sway = p.vy < 0 ? SWAY * Math.sin(age * SWAY_W + p.ph) : 0;
  p.x += (p.vx + sway * Math.cos(p.ph)) * dt;
  p.z += (p.vz + sway * Math.sin(p.ph)) * dt;
  p.y = Math.max(f + 0.02, p.y + p.vy * dt);
}

export function spawnMorphos(n: number, rand: () => number): Morpho[] {
  return Array.from({ length: n }, (_, i) => ({
    a0: (i / n) * Math.PI * 2 + rand() * 0.4,
    out: 0.9 + rand() * 0.8,
    climb: 0.25 + rand() * 0.35,
    turn: (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.5),
    ph: rand() * Math.PI * 2,
  }));
}

/**
 * A morpho `age` s after the burst: it leaves the crown (height y0) on an outward, climbing spiral with a
 * fluttery bob, and faces along its path. Local x/z around the totem, yaw for a +Z-facing model.
 */
export function morphoAt(m: Morpho, age: number, y0: number): { x: number; y: number; z: number; yaw: number } {
  const r = 0.5 + m.out * age;
  const a = m.a0 + m.turn * age;
  const x = Math.sin(a) * r;
  const z = Math.cos(a) * r;
  const y = y0 + m.climb * age + Math.sin(age * 5 + m.ph) * 0.18;
  // Velocity direction: radial (out) plus tangential (r·turn).
  const vx = Math.sin(a) * m.out + Math.cos(a) * r * m.turn;
  const vz = Math.cos(a) * m.out - Math.sin(a) * r * m.turn;
  return { x, y, z, yaw: Math.atan2(vx, vz) };
}

/** Particle scale over the burst: pops in over 0.25 s, holds, shrinks away between FADE and LIFE. */
export function burstScale(age: number): number {
  if (age < 0 || age >= BURST.life) return 0;
  const pop = Math.min(1, age / 0.25);
  const fade = age < BURST.fade ? 1 : 1 - (age - BURST.fade) / (BURST.life - BURST.fade);
  return pop * fade;
}

/** Kené lines glow: a quick rise, a hold while the petals fly, then a slow fade (0 → 1 → 0 over ~4.5 s). */
export function glowAt(age: number): number {
  if (age < 0 || age > 4.5) return 0;
  if (age < 0.35) return age / 0.35;
  if (age < 1.6) return 1;
  return 1 - (age - 1.6) / 2.9;
}
