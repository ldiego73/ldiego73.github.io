/**
 * Pure rules of the coast's people (../gente.ts): when they are out (by day), the next point of a walker on the
 * road (keeping to the right-hand lane in their direction of travel), and the children's run up and down the
 * beach face with the waves. No DOM, no three.js (tested in logic.test.ts).
 */

/** Out by day: from a little after sunrise (0.25) to a little before dusk (0.75). */
export const isDay = (time: number) => time > 0.27 && time < 0.73;

/**
 * The point a walker heads for, from the road point (px, pz) a little ahead and the road's tangent (gx, gz):
 * 1.2 u to the right of the centre line in their direction of travel (right of a facing f is (−fz, fx)).
 */
export function laneTarget(
  px: number,
  pz: number,
  gx: number,
  gz: number,
  dir: 1 | -1,
  out: { x: number; z: number },
): { x: number; z: number } {
  const fx = gx * dir;
  const fz = gz * dir;
  const l = Math.hypot(fx, fz) || 1;
  out.x = px - (fz / l) * 1.2;
  out.z = pz + (fx / l) * 1.2;
  return out;
}

/**
 * A child's run with the waves, from their spot on the beach: `out` is metres toward the sea (positive) and
 * `along` sideways along the shore. A cycle of ~6 s: run down after the backwash, linger, flee back up as the
 * wave comes in. With reduced motion they only stroll along the shore.
 */
export function shoreRun(u: number, reducedMotion: boolean): { out: number; along: number } {
  const along = Math.sin(u * 0.21) * 6;
  if (reducedMotion) return { out: 0, along };
  const c = (u % 6) / 6;
  const out = c < 0.35 ? (c / 0.35) * 4.5 : c < 0.55 ? 4.5 : 4.5 * (1 - (c - 0.55) / 0.45);
  return { out, along };
}

/**
 * Travellers of the whole road: they walk it end to end in both directions, but the road is long (≈ 760 u), so
 * whoever drifts beyond KEEP of the player (measured along the road) is moved, out of sight, to a spot SPAWN
 * away on either side of the player, mostly walking toward them. That keeps a steady trickle of people
 * coming and going wherever the traveler is. Distances are in world units along the road.
 */
export const TRAVEL = { keep: 135, spawnMin: 85, spawnMax: 125, t0: 0.03, t1: 0.985 } as const;

/** True when a traveller at road t is too far (along the road) from the player at t `pt`. */
export function strayed(t: number, pt: number, len: number): boolean {
  return Math.abs(t - pt) * len > TRAVEL.keep;
}

/**
 * Candidate respawns (best first) for a traveller, given the player's road t and two random numbers: one per
 * side of the player (ahead first when `r1 < 0.5`), each SPAWN away, inside the road's ends; walking toward the
 * player when `r2 < 0.65`, else away (overtaking or being overtaken by the traveler). Empty if neither fits.
 */
export function respawns(pt: number, len: number, r1: number, r2: number): Array<{ t: number; dir: 1 | -1 }> {
  const d = (TRAVEL.spawnMin + (TRAVEL.spawnMax - TRAVEL.spawnMin) * ((r1 * 7.31) % 1)) / len;
  const sides: Array<1 | -1> = r1 < 0.5 ? [1, -1] : [-1, 1];
  const out: Array<{ t: number; dir: 1 | -1 }> = [];
  for (const side of sides) {
    const t = pt + side * d;
    if (t < TRAVEL.t0 || t > TRAVEL.t1) continue;
    const toward = (side === 1 ? -1 : 1) as 1 | -1;
    out.push({ t, dir: r2 < 0.65 ? toward : (-toward as 1 | -1) });
  }
  return out;
}
