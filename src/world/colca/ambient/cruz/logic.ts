/**
 * Pure logic of the Kuntisuyu finale at the Cruz del Cóndor (../cruz.ts): the reward panel's title and stat
 * tiles, the arrival test and the celebration's feathers and confetti. No DOM, no three.js (tested in
 * logic.test.ts).
 *
 * Stats are true by construction: ../../content.ts finaleStats counts what the road shows from
 * src/data/career.ts (the geoglyphs' artifacts, the knots in the colcas, the stages, the employers).
 */
import type { L, Lang } from "../../../contract";
import type { FinaleStats } from "../../content";

export interface StatTile {
  key: keyof FinaleStats;
  value: string;
  label: L;
}

const LABELS: Record<keyof FinaleStats, L> = {
  artifacts: { es: "artefactos en la pampa", en: "artifacts on the pampa" },
  knots: { es: "logros en las colcas", en: "achievements in the colcas" },
  stages: { es: "etapas de carrera", en: "career stages" },
  companies: { es: "empresas", en: "companies" },
};

/** The four tiles, in the order the road shows them (zeros are dropped: never a made-up number). */
export function statTiles(s: FinaleStats): StatTile[] {
  return (["artifacts", "knots", "stages", "companies"] as const)
    .filter((k) => Number.isFinite(s[k]) && s[k] > 0)
    .map((key) => ({ key, value: String(Math.round(s[key])), label: LABELS[key] }));
}

const TITLE = {
  named: { es: "¡Lo lograste, {name}!", en: "You made it, {name}!" },
  plain: { es: "¡Lo lograste!", en: "You made it!" },
} satisfies Record<string, L>;

export function finaleTitle(lang: Lang, name: string): string {
  const n = name.trim();
  return n ? TITLE.named[lang].replace("{name}", n) : TITLE.plain[lang];
}

/** Arrival with hysteresis: in once within `r`, out again only beyond `r + out`. */
export function arrived(wasIn: boolean, d: number, r: number, out = 2): boolean {
  return wasIn ? d < r + out : d < r;
}

export interface Bit {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Spin speeds and phase. */
  sx: number;
  sy: number;
  ph: number;
  /** 0 = condor feather (dark, slow, flutters), 1 = confetti (dye, quick). */
  kind: 0 | 1;
  /** Index into the colour list. */
  c: number;
  landed: boolean;
}

export const BURST = { bits: 140, life: 9 } as const;

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

/** Feathers and confetti bursting up and out from the top of the cross (local origin at its foot). */
export function spawnBits(n: number, topY: number, colors: number, rand: () => number): Bit[] {
  return Array.from({ length: n }, (_, i) => {
    const a = rand() * Math.PI * 2;
    const sp = 2 + rand() * 4.5;
    const kind = (i % 3 === 0 ? 0 : 1) as 0 | 1;
    return {
      x: (rand() - 0.5) * 0.4,
      y: topY,
      z: (rand() - 0.5) * 0.4,
      vx: Math.cos(a) * sp,
      vy: 5 + rand() * 6,
      vz: Math.sin(a) * sp,
      sx: (rand() - 0.5) * 8,
      sy: (rand() - 0.5) * 8,
      ph: rand() * Math.PI * 2,
      kind,
      c: Math.floor(rand() * colors),
      landed: false,
    };
  });
}

/** One physics step: gravity, air drag (feathers drift and flutter), resting on the floor. */
export function stepBit(b: Bit, dt: number, age: number, floor: (x: number, z: number) => number): void {
  if (b.landed) return;
  const drag = b.kind === 0 ? 2.2 : 1.1;
  const g = b.kind === 0 ? 3.2 : 7;
  b.vy -= g * dt;
  b.vx -= b.vx * drag * dt;
  b.vz -= b.vz * drag * dt;
  // Terminal fall speed (feathers sway down slowly).
  const term = b.kind === 0 ? -1.1 : -2.6;
  if (b.vy < term) b.vy = term;
  const sway = b.kind === 0 ? Math.sin(age * 3 + b.ph) * 0.9 : 0;
  b.x += (b.vx + sway) * dt;
  b.z += b.vz * dt;
  b.y += b.vy * dt;
  const f = floor(b.x, b.z);
  if (b.y <= f) {
    b.y = f;
    b.landed = true;
  }
}

/** Scale of the bits over the burst's life (pop in, fade out at the end). */
export function bitScale(age: number): number {
  if (age < 0.15) return age / 0.15;
  if (age > BURST.life - 1.5) return Math.max(0, (BURST.life - age) / 1.5);
  return 1;
}
