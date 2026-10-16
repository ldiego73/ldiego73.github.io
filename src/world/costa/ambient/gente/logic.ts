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
