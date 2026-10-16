/**
 * Pure rules of the caballito de totora ride (../caballito.ts): steering with inertia from the camera-relative
 * stick (the jungle canoe's feel: turn toward the stick, paddle with the part of it that points ahead), the
 * surf's shove toward the beach on a breaking crest, the water it may move on (deep enough, within the bay
 * between the two beaches), which landing it is close to, and when the ride earns its stamp. No DOM, no
 * three.js (tested in logic.test.ts).
 */

export interface Boat {
  x: number;
  z: number;
  yaw: number;
  vx: number;
  vz: number;
}

export interface Intent {
  x: number;
  z: number;
  running: boolean;
}

export interface Water {
  /** True where the boat may float (deep enough, inside the ride area). */
  ok(x: number, z: number): boolean;
  /** Unit direction toward the nearest beach (the surf pushes that way), or null far from the surf. */
  shore(x: number, z: number): { x: number; z: number } | null;
  /** Breaker crest strength 0..1 under the boat now. */
  crest(x: number, z: number): number;
}

export const CRUISE = 3.4;
export const SPRINT = 5.2;
export const TURN_RATE = 1.7;
/** Shoreward push of a breaking crest (u/s at crest 1). */
export const SURF_PUSH = 2.4;

const clampDt = (dt: number) => Math.max(0, Math.min(0.05, dt));

/** One step of the boat. Never leaves the water: a blocked move slides along it or stops. */
export function stepBoat(w: Water, b: Boat, it: Intent, dt: number): Boat {
  dt = clampDt(dt);
  const hx = Math.sin(b.yaw);
  const hz = Math.cos(b.yaw);
  const mag = Math.min(1, Math.hypot(it.x, it.z));
  const dot = it.x * hx + it.z * hz;
  const cross = it.x * hz - it.z * hx;
  const angle = mag > 1e-4 ? Math.atan2(cross, dot) : 0;
  const along = mag * Math.max(0, Math.cos(angle));
  const turn = mag * Math.max(-1, Math.min(1, angle / 0.6));
  const yaw = b.yaw + turn * TURN_RATE * dt;
  const thrust = along * (it.running ? SPRINT : CRUISE);
  const k = 1 - Math.exp(-dt * 1.2);
  let vx = b.vx + (Math.sin(yaw) * thrust - b.vx) * k;
  let vz = b.vz + (Math.cos(yaw) * thrust - b.vz) * k;
  // The surf: a breaking crest carries the boat toward the beach.
  const sh = w.shore(b.x, b.z);
  if (sh) {
    const c = w.crest(b.x, b.z);
    vx += sh.x * c * SURF_PUSH * dt * 2;
    vz += sh.z * c * SURF_PUSH * dt * 2;
  }
  let x = b.x + vx * dt;
  let z = b.z + vz * dt;
  if (!w.ok(x, z)) {
    if (w.ok(x, b.z)) {
      z = b.z;
      vz *= -0.2;
    } else if (w.ok(b.x, z)) {
      x = b.x;
      vx *= -0.2;
    } else {
      x = b.x;
      z = b.z;
      vx *= -0.3;
      vz *= -0.3;
    }
  }
  return { x, z, yaw, vx, vz };
}

export interface Landing {
  /** Where the traveler steps off (dry sand). */
  x: number;
  z: number;
  /** Where the boat floats while docking (just off the sand), facing the beach. */
  bx: number;
  bz: number;
}

/** The landing the boat can dock at now (close and slow enough), else null. */
export function dockingEnd(b: Boat, landings: readonly Landing[], range = 7, maxSpeed = 3.6): number | null {
  const speed = Math.hypot(b.vx, b.vz);
  if (speed > maxSpeed) return null;
  let best: number | null = null;
  let bd = range;
  landings.forEach((l, i) => {
    const d = Math.hypot(b.x - l.bx, b.z - l.bz);
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

/** Only crossing to the other beach earns the ride stamp. */
export const earnsStamp = (boarded: number, landed: number) => boarded !== landed;

/**
 * While the traveler walks, the boat may "come round" to the landing they are heading for: when they are near a
 * landing the boat is not at and the boat is far from them (out of sight), it moves there.
 */
export function idleLanding(o: { at: number; d0: number; d1: number; dBoat: number }): number {
  if (o.dBoat < 70) return o.at;
  if (o.at !== 0 && o.d0 < 30) return 0;
  if (o.at !== 1 && o.d1 < 30) return 1;
  return o.at;
}
