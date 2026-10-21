/**
 * Pure rules of the dust on the Nazca pampa (../polvo.ts): dust devils (remolinos) that spin up on hot
 * afternoons and wander downwind across the gravel, and the fine dust that streams low over the ground while
 * a gust front passes. No DOM, no three.js (tested in logic.test.ts).
 *
 * A devil is a column of particles on a widening helix: each particle climbs its own turn of the spiral and
 * starts again at the foot, the top leans downwind, and the whole column swells in, holds and dies away over
 * its life. The wind (../../../wind.ts windAt) is passed in as plain numbers, so these stay testable.
 */
import { smooth } from "../../layout";
import { PAMPA } from "../../plan";

/** Sky time window of the devils (0.25 sunrise, 0.5 noon): late morning to late afternoon, when the gravel is hot. */
export const DEVIL_HOURS = { t0: 0.36, t1: 0.68 } as const;
export const devilHours = (t: number) => t > DEVIL_HOURS.t0 && t < DEVIL_HOURS.t1;

/** Is (x, z) out on the pampa (north of the eased band, inside the walkable square)? */
export const onPampa = (z: number) => z < PAMPA.z1 + 5;

export interface Devil {
  x: number;
  z: number;
  age: number;
  life: number;
  /** Column height and foot radius at full strength (world units). */
  h: number;
  r: number;
  /** Spin (rad/s; the sign is the turning sense) and a seed for the wander. */
  spin: number;
  seed: number;
}

/** Strength 0..1 over a devil's life: swells in over 2.5 s, holds, dies away over the last 4 s. */
export function envelope(age: number, life: number): number {
  if (age < 0 || age > life) return 0;
  return smooth(0, 2.5, age) * (1 - smooth(life - 4, life, age));
}

/** A new devil upwind of (fx, fz): it will drift across the traveler's view. `rand` in [0, 1). */
export function spawnDevil(fx: number, fz: number, windX: number, windZ: number, rand: () => number): Devil {
  const l = Math.hypot(windX, windZ) || 1;
  const ux = windX / l;
  const uz = windZ / l;
  // 45–110 u upwind, up to ±70 u across.
  const back = 45 + rand() * 65;
  const side = (rand() * 2 - 1) * 70;
  return {
    x: fx - ux * back - uz * side,
    z: fz - uz * back + ux * side,
    age: 0,
    life: 14 + rand() * 10,
    h: 10 + rand() * 8,
    r: 0.7 + rand() * 0.6,
    spin: (rand() < 0.5 ? -1 : 1) * (4 + rand() * 2.5),
    seed: rand() * 100,
  };
}

/** Wind carry of a devil over the ground (u/s per unit of wind speed) and its own slow wander (u/s). */
export const DEVIL_CARRY = 3.2;
const WANDER = 1.4;

/** Advances a devil by dt: carried by the wind, wandering a little; returns false once its life is over. */
export function stepDevil(d: Devil, dt: number, windX: number, windZ: number): boolean {
  d.age += dt;
  const a = d.seed + d.age * 0.35;
  d.x += (windX * DEVIL_CARRY + Math.sin(a) * WANDER) * dt;
  d.z += (windZ * DEVIL_CARRY + Math.cos(a * 1.3) * WANDER) * dt;
  return d.age < d.life;
}

export interface Mote {
  x: number;
  y: number;
  z: number;
  a: number;
  s: number;
}

/**
 * Particle i of a devil at time t (seconds), relative to the devil's foot: a widening helix, each
 * particle climbing its own turn; the top leans downwind by `lean` (wind × height). Alpha thins at the top and
 * with the envelope; size grows with height.
 */
export function devilMote(
  d: Devil,
  i: number,
  t: number,
  windX: number,
  windZ: number,
  out: Mote = { x: 0, y: 0, z: 0, a: 0, s: 0 },
): Mote {
  const k = envelope(d.age, d.life);
  const h0 = (i * 0.618034) % 1;
  // Climb rate 0.16 of the column per second: a particle goes from the foot to the top in ~6 s.
  const h = (h0 + t * 0.16) % 1;
  const ang = i * 2.399 + t * d.spin * (1.25 - 0.5 * h);
  const r = d.r * (0.5 + 5.5 * h * h) * (0.6 + 0.4 * k);
  const lean = h * h * 6;
  out.x = Math.cos(ang) * r + windX * lean;
  out.z = Math.sin(ang) * r + windZ * lean;
  out.y = h * d.h * (0.35 + 0.65 * k);
  out.a = k * smooth(0, 0.06, h) * (1 - smooth(0.55, 1, h)) * 0.75;
  out.s = 1.1 + h * 3.6;
  return out;
}

/** Wraps v into [c − half, c + half) (the low dust lives in a box that follows the traveler). */
export function wrap(v: number, c: number, half: number): number {
  const w = half * 2;
  return c - half + ((((v - (c - half)) % w) + w) % w);
}

/**
 * How visible the low dust is: only in a gust (`gust` 0..gustAmp, the same front that waves the ichu), by day.
 * 0 in still air, ~0.8 at the crest of a strong front.
 */
export function dustLevel(gust: number, day: number): number {
  return smooth(0.12, 0.6, gust) * 0.8 * day;
}
