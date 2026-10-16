/**
 * Pure rules of the colcas (../colcas.ts): where each granary sits on the stepped cliff, the cliff's tiers,
 * when the traveler is at the plaza to read them, and which colca the panel moves to next. No DOM, no
 * three.js (tested in logic.test.ts).
 *
 * Frame: origin on the foot of the cliff straight north of the plaza, local +z toward the road (south),
 * local x along the cliff (world x), y up from the plaza floor. Tiers step back (−z) as they rise; each tier's
 * top is a ledge, and the colcas stand on the ledges, oldest stage bottom-left, newest top-right.
 */

/** Cliff tiers: top height of each ledge and how far back its front face stands. */
export const TIERS: ReadonlyArray<{ top: number; back: number; half: number }> = [
  { top: 4.4, back: 0, half: 24 },
  { top: 8.8, back: 2.4, half: 21 },
  { top: 13.2, back: 4.8, half: 18 },
  { top: 17.6, back: 7.2, half: 14 },
  { top: 22.5, back: 9.6, half: 11 },
];

/** Granaries per ledge, bottom → top (sums to at least the number of stages). */
const ROWS = [3, 3, 2, 2];

export interface ColcaSlot {
  /** Stage index (chronological). */
  index: number;
  x: number;
  /** Ledge height (the colca's floor) and its front z. */
  y: number;
  z: number;
  row: number;
}

/** Where the n colcas stand (n ≤ 10 fills the rows in order; more spill onto the top ledge). */
export function colcaSlots(n: number): ColcaSlot[] {
  const out: ColcaSlot[] = [];
  let i = 0;
  for (let row = 0; row < TIERS.length - 1 && i < n; row++) {
    const per = row < ROWS.length ? (ROWS[row] as number) : n - i;
    const count = row === TIERS.length - 2 ? n - i : Math.min(per, n - i);
    const tier = TIERS[row] as (typeof TIERS)[number];
    const next = TIERS[row + 1] as (typeof TIERS)[number];
    const span = Math.min(tier.half, next.half) * 1.3;
    for (let k = 0; k < count; k++) {
      // Spread across the ledge, staggered row to row so no colca hides one above it.
      const u = count === 1 ? 0.5 : k / (count - 1);
      const x = -span / 2 + u * span + (row % 2 ? 2.2 : -1.2);
      out.push({ index: i++, x, y: tier.top, z: -tier.back - 0.95, row });
    }
  }
  return out;
}

/** Next / previous index with wrap-around. */
export const step = (i: number, dir: -1 | 1, n: number) => (((i + dir) % n) + n) % n;

/** At the plaza: within its radius of the centre and near its floor height. */
export function atPlaza(p: { x: number; y: number; z: number }, plaza: { x: number; y: number; z: number; r: number }) {
  return Math.hypot(p.x - plaza.x, p.z - plaza.z) <= plaza.r + 0.5 && Math.abs(p.y - plaza.y) < 2;
}

/** Knot positions down a colca's hanging cord (n knots, spaced, the first just under the window). */
export function knotDrops(n: number, len = 1.5): number[] {
  const k = Math.max(0, Math.min(12, Math.floor(n)));
  if (!k) return [];
  const gap = Math.min(0.22, (len - 0.2) / k);
  return Array.from({ length: k }, (_, i) => 0.18 + i * gap);
}
