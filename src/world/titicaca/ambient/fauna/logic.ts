/**
 * Pure helpers of the lake's fauna (../aves.ts, ../orilla.ts): the "good look" timer behind the bonus passport
 * stamps (`titicaca:fauna:*`), wandering targets inside a home circle, the grebes' dive cycle, the gulls'
 * flight circles and the frog's surfacing schedule. No DOM, no three.js (tested in logic.test.ts).
 */

export const TAU = Math.PI * 2;
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const damp = (a: number, b: number, rate: number, dt: number) => a + (b - a) * (1 - Math.exp(-rate * dt));
export function wrapAngle(a: number) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
export function turnToward(from: number, to: number, maxStep: number) {
  const d = wrapAngle(to - from);
  return from + Math.max(-maxStep, Math.min(maxStep, d));
}
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Day fraction → daylight (0 night … 1 day), with the shared 0.25 sunrise / 0.75 sunset. */
export const daylight = (time: number) => clamp01((Math.sin((time - 0.25) * TAU) + 0.12) / 0.3);

/**
 * How long an animal has been well seen (close and on screen). Short gaps drain it slowly; `update` returns
 * true once, when the look is long enough (the stamp).
 */
export class LookTimer {
  t = 0;
  done = false;
  constructor(readonly need = 1.5) {}
  update(dt: number, ok: boolean): boolean {
    if (this.done) return false;
    this.t = ok ? this.t + dt : Math.max(0, this.t - dt * 3);
    if (this.t >= this.need) {
      this.done = true;
      return true;
    }
    return false;
  }
}

/** A random point in the home circle that passes `ok` (falls back to the centre). */
export function wanderTarget(
  home: { x: number; z: number; r: number },
  rand: () => number,
  ok: (x: number, z: number) => boolean,
): { x: number; z: number } {
  for (let k = 0; k < 20; k++) {
    const a = rand() * TAU;
    const r = Math.sqrt(rand()) * home.r;
    const x = home.x + Math.cos(a) * r;
    const z = home.z + Math.sin(a) * r;
    if (ok(x, z)) return { x, z };
  }
  return { x: home.x, z: home.z };
}

/**
 * The grebe's dive: `float` on the surface, `down` sinking (0.35 s), `under` out of sight, `up` resurfacing.
 * Returns the next phase and its timer.
 */
export type DivePhase = "float" | "down" | "under" | "up";
export function stepDive(
  phase: DivePhase,
  timer: number,
  dt: number,
  wantDive: boolean,
  rand: () => number,
): { phase: DivePhase; timer: number; surfaced: boolean } {
  let t = timer - dt;
  switch (phase) {
    case "float":
      if (wantDive || t <= 0) return { phase: "down", timer: 0.35, surfaced: false };
      return { phase, timer: t, surfaced: false };
    case "down":
      if (t <= 0) return { phase: "under", timer: 2.5 + rand() * 4, surfaced: false };
      return { phase, timer: t, surfaced: false };
    case "under":
      if (t <= 0) return { phase: "up", timer: 0.35, surfaced: true };
      return { phase, timer: t, surfaced: false };
    case "up":
      if (t <= 0) {
        t = 6 + rand() * 12;
        return { phase: "float", timer: t, surfaced: false };
      }
      return { phase, timer: t, surfaced: false };
  }
}

/** How far below the surface a grebe sits in a dive phase (0 floating). */
export function diveDepth(phase: DivePhase, timer: number): number {
  if (phase === "float") return 0;
  if (phase === "under") return 0.9;
  const k = clamp01(timer / 0.35);
  return phase === "down" ? 0.9 * (1 - k) : 0.9 * k;
}

/** A gull's soaring circle: centre, radius, height, angular speed, phase. */
export interface Soar {
  x: number;
  z: number;
  r: number;
  y: number;
  w: number;
  ph: number;
}
export function soarPose(s: Soar, t: number): { x: number; y: number; z: number; yaw: number; bank: number } {
  const a = s.ph + s.w * t;
  const x = s.x + Math.cos(a) * s.r;
  const z = s.z + Math.sin(a) * s.r;
  const dir = s.w > 0 ? 1 : -1;
  const yaw = Math.atan2(-Math.sin(a) * dir, Math.cos(a) * dir);
  return { x, y: s.y + Math.sin(a * 2 + s.ph) * 1.2, z, yaw, bank: -0.35 * dir };
}

/**
 * The giant frog surfaces for a few seconds now and then (more often with someone close by on the pier).
 * Returns how far out of the water it is (0 hidden … 1 surfaced) at clock `t`.
 */
export function frogSurface(t: number, near: boolean): number {
  const period = near ? 22 : 48;
  const up = 7;
  const u = t % period;
  if (u > up) return 0;
  return clamp01(Math.min(u / 0.8, (up - u) / 0.8));
}
