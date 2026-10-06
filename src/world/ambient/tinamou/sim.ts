/** Pure logic for the perdiz andina ambient (no Three.js): timing, scare radii, flush flight profile. */

/** Active hours (they sleep at night): from just before sunrise to dusk (sunset is 0.75). */
export const isAwake = (time: number) => time > 0.21 && time < 0.8;

/** Explosive-flush radius: ~3 u walking, ~5 u running or riding. Freeze starts further out. */
export const flushRadius = (fast: boolean) => (fast ? 5 : 3);
export const freezeRadius = (fast: boolean) => (fast ? 13 : 9);
/** Frozen birds lose their nerve if the traveler lingers this close for `NERVE` seconds. */
export const NERVE_RADIUS = 6;
export const NERVE = 1.4;

/** Running if the smoothed speed is above the walk/run midpoint (WALK 3.6, RUN 7.4 in index.ts). */
export const RUN_SPEED = 5.5;

/** Exponential moving average of the traveler's ground speed; teleports (big jumps) are ignored. */
export interface SpeedMeter {
  x: number;
  z: number;
  v: number;
  init: boolean;
}
export const newSpeedMeter = (): SpeedMeter => ({ x: 0, z: 0, v: 0, init: false });
export function meterSpeed(m: SpeedMeter, x: number, z: number, dt: number): number {
  if (!m.init || dt <= 0) {
    m.init = true;
    m.x = x;
    m.z = z;
    return m.v;
  }
  const d = Math.hypot(x - m.x, z - m.z);
  m.x = x;
  m.z = z;
  if (d > 5) return m.v; // teleport / respawn
  const k = Math.min(1, dt * 6);
  m.v += (d / dt - m.v) * k;
  return m.v;
}

/** Duration of the burst (near-vertical rise with whirring wings) at the start of the flush. */
export const BURST = 0.38;
/** Horizontal cruising speed of the low glide (u/s). */
export const GLIDE_SPEED = 10;

/** Total flight time for a flight of `dist` units. */
export const flightTime = (dist: number) => BURST + dist / GLIDE_SPEED + 0.25;

/**
 * Horizontal progress 0..1 at time `s` of a flight lasting `T`: almost nothing during the burst, then
 * a steady glide that brakes into the landing.
 */
export function flightProgress(s: number, T: number): number {
  if (s <= 0) return 0;
  if (s >= T) return 1;
  const b = Math.min(BURST, T * 0.3);
  const burstShare = 0.04;
  if (s < b) {
    const u = s / b;
    return burstShare * u * u;
  }
  const u = (s - b) / (T - b);
  // Ease-out at the end (landing flare).
  return burstShare + (1 - burstShare) * (u * (2 - u) * 0.35 + u * 0.65);
}

/** Height above ground along the flight: a sharp rise to `peak`, a long sinking glide, a drop at the end. */
export function flightHeight(s: number, T: number, peak: number): number {
  if (s <= 0 || s >= T) return 0;
  const b = Math.min(BURST, T * 0.3);
  if (s < b) {
    const u = s / b;
    return peak * (1 - (1 - u) * (1 - u));
  }
  const u = (s - b) / (T - b);
  // Glide sinks from peak to ~45% of it, then drops into the grass over the last 15%.
  const glide = peak * (1 - 0.55 * u);
  if (u < 0.85) return glide;
  const k = (u - 0.85) / 0.15;
  return glide * (1 - k * k);
}

/** Wing beat amplitude 0..1 along the flight: full whirr in the burst, stiff glide with short whirr bursts. */
export function whirr(s: number, T: number): number {
  if (s <= 0 || s >= T) return 0;
  const b = Math.min(BURST, T * 0.3);
  if (s < b + 0.25) return 1;
  const u = (s - b) / (T - b);
  if (u > 0.85) return 0.6; // braking flutter before touchdown
  // Two short whirr bursts in the glide.
  const phase = (u * 2.4) % 1;
  return phase < 0.22 ? 1 : 0;
}
