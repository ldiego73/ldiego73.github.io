/**
 * Pure mixing rules of the coast's soundscape (../soundscape.ts): how loud the surf is by the distance to the
 * shore and how it swells with the sets of waves (the same rhythm as the sea's swash, ../../scenery/waves.ts),
 * the wind on the cliffs and headlands, the stereo pan toward the sea, and how often gulls and sea lions call by
 * distance. No Web Audio, no DOM (tested in mix.test.ts).
 */
import { SWASH } from "../../scenery/waves";

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Surf level by the listener's distance inland from the shore (negative at sea) and the time (s). */
export function surf(shoreDist: number, t: number): number {
  const near = 1 - smooth(4, 90, shoreDist);
  // Swells with each set: the swash's period, a little ahead of it (the wave breaks before it runs up).
  const set = 0.7 + 0.3 * Math.sin((Math.PI * 2 * (t + 1.2)) / SWASH.period);
  return clamp01(0.12 + near * 0.88) * set;
}

/** Wind: stronger up on the cliffs and the headland (height above the sea), a little stronger at night. */
export function wind(height: number, night: boolean): number {
  return clamp01(0.25 + smooth(4, 16, height) * 0.6 + (night ? 0.1 : 0));
}

/** Stereo pan (−1 left … 1 right) of a source at (dx, dz) for a listener whose right is (rx, rz). */
export function panFor(dx: number, dz: number, rx: number, rz: number): number {
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return 0;
  return Math.max(-0.85, Math.min(0.85, (dx * rx + dz * rz) / d));
}

/** Loudness of a call heard from `d` units, silent past `far`. */
export const callGain = (d: number, far: number) => (d >= far ? 0 : (1 - d / far) ** 1.6);

/** Seconds to the next call by distance: chatty close, rare far, never past `far`. `r` is a 0..1 draw. */
export function callGap(d: number, far: number, base: number, r: number): number {
  if (d >= far) return Number.POSITIVE_INFINITY;
  return base * (0.6 + r * 0.8) * (1 + (2 * d) / far);
}
