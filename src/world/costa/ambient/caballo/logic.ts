/**
 * Pure rules of the coast's Paso horse (../caballo.ts): where it waits and where a rider must get off. No DOM,
 * no three.js (tested in logic.test.ts against the real coast layout).
 *
 * Why the extra stops: ambients answer E and show prompts in glob (alphabetical) order, so the horse's
 * "E · Bajar" would hide the punku's "Volver a Qusqu", a huaca's "Leer" or a market stall. Every station plaza
 * (with a margin) is therefore a stop: riding into one leaves the horse at the roadside and the traveler walks
 * the last metres, so the station's own prompts are the only ones there.
 */

export interface Circle {
  x: number;
  z: number;
  r: number;
}

/** Margin round each station plaza where the rider gets off (beyond its prompts' reach). */
export const PLAZA_MARGIN = 1.5;

/** Stop circles: every station plaza grown by PLAZA_MARGIN. */
export function rideStops(plazas: ReadonlyArray<Circle>, margin = PLAZA_MARGIN): Circle[] {
  return plazas.map((p) => ({ x: p.x, z: p.z, r: p.r + margin }));
}

export function inside(zones: ReadonlyArray<Circle>, x: number, z: number): boolean {
  for (const c of zones) if ((x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true;
  return false;
}

/** Road t a little past the spawn where the horse waits, and how far seaward of the road centre. */
export const HOME_T = 0.027;
export const HOME_OFF = 6.6;
export const HOME_R = 2.2;

/**
 * The little patch the horse waits on (handed to ../../../ambient/mount/logic.ts `mountHome` as its "plaza"):
 * on the open coastal strip seaward of the road (left of the northward walk; the desert inland is not
 * walkable), a few steps past the spawn, so it is in view on arrival and a step off the road.
 */
export function homePatch(p: { x: number; z: number }, tangent: { x: number; z: number }): Circle {
  const l = Math.hypot(tangent.x, tangent.z) || 1;
  // Left of a facing f is (fz, −fx): seaward (west) of the northward road.
  return { x: p.x + (tangent.z / l) * HOME_OFF, z: p.z - (tangent.x / l) * HOME_OFF, r: HOME_R };
}
