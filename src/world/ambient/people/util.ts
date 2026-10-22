/**
 * Small pure helpers shared by the people behaviours (npc.ts, the feria, dancers, kids, terraces, the
 * storytellers, the summit camp, the arcade players and the Antisuyu community): frame-rate independent
 * damping for values and angles, and the seeded random every site uses to place and dress its people.
 * DOM-free and Three-free so they stay unit-testable (util.test.ts).
 */

/** Exponential approach of `cur` toward `target` at `rate` per second (same result at any frame rate). */
export const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

/** `damp` for angles in radians: always turns the short way round (the difference is wrapped to ±π). */
export const angleDamp = (cur: number, target: number, rate: number, dt: number) => {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * (1 - Math.exp(-rate * dt));
};

/**
 * Seeded random in [0, 1) (xorshift32, five decimal digits). The sequence is part of every site's layout and
 * outfits, so changing it reshuffles the people: keep it as is.
 */
export function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
