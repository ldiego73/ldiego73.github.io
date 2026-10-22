/**
 * Colour regions on a one-surface body, crisp without UVs.
 *
 * A polygonised body has no UVs and no natural seams, so a sleeve cuff or a boot top cannot follow triangle
 * edges (they would zig-zag). Instead every vertex carries two palette slots and a signed scalar: the slot on
 * the negative side of its nearest colour boundary, the slot on the positive side, and its signed distance to
 * that boundary. The fragment shader picks one slot per pixel from the interpolated scalar (./material.ts), so
 * the boundary is a clean line through the triangles. Away from any boundary both slots are the same.
 *
 * Boundaries are "bands": a scalar function of the bind-pose position (a plane, a zig-zag around a hat), a
 * list of stops along it and the slots between the stops. A band applies to the vertices whose nearest
 * primitive belongs to it, so a cuff on the wrist never leaks onto the hip next to the hand.
 *
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "./sdf";

export interface Band {
  /** Primitive indices this band paints (by each vertex's nearest primitive). */
  prims: readonly number[];
  /** Signed scalar at a bind-pose point (e.g. height along a bone). */
  at(p: Vec3): number;
  /** Increasing stops along the scalar. */
  stops: readonly number[];
  /** Slots between the stops: slots[0] below stops[0] … slots[n] above stops[n − 1]. */
  slots: readonly number[];
}

export interface PaintOut {
  /** Slot on the negative side, slot on the positive side, per vertex. */
  slots: Uint8Array;
  /** Signed distance to the nearest boundary (≥ 1 when there is none). */
  cut: Float32Array;
}

/**
 * Which slots and signed distance a band gives at scalar t (pure helper, tested). Farther than `margin` from
 * the nearest stop, both slots are the side's own slot: only vertices next to a boundary carry two colours, so
 * a triangle shared with a neighbouring region (whose cut reads +1) can never flip to the other colour.
 */
export function bandAt(
  stops: readonly number[],
  slots: readonly number[],
  t: number,
  margin = Infinity,
): [number, number, number] {
  if (!stops.length) return [slots[0] as number, slots[0] as number, 1];
  let best = 0;
  let bd = Infinity;
  for (let k = 0; k < stops.length; k++) {
    const d = Math.abs(t - (stops[k] as number));
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  const d = t - (stops[best] as number);
  if (Math.abs(d) > margin) {
    // Keep the real signed distance: a triangle toward a boundary vertex then keeps this side's sign.
    const own = (d < 0 ? slots[best] : slots[best + 1]) as number;
    return [own, own, d];
  }
  return [slots[best] as number, slots[best + 1] as number, d];
}

export function paintVertices(
  positions: Float32Array,
  nearest: (v: number) => number,
  primSlot: ArrayLike<number>,
  bands: readonly Band[],
  margin = 0.035,
): PaintOut {
  const nv = positions.length / 3;
  const slots = new Uint8Array(nv * 2);
  const cut = new Float32Array(nv).fill(1);
  const byPrim = new Map<number, Band>();
  for (const b of bands) for (const p of b.prims) if (!byPrim.has(p)) byPrim.set(p, b);
  const p: Vec3 = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    const n = nearest(v);
    const band = n >= 0 ? byPrim.get(n) : undefined;
    if (!band) {
      const s = n >= 0 ? (primSlot[n] as number) : 0;
      slots[v * 2] = s;
      slots[v * 2 + 1] = s;
      continue;
    }
    p[0] = positions[v * 3] as number;
    p[1] = positions[v * 3 + 1] as number;
    p[2] = positions[v * 3 + 2] as number;
    const [a, b, d] = bandAt(band.stops, band.slots, band.at(p), margin);
    slots[v * 2] = a;
    slots[v * 2 + 1] = b;
    cut[v] = d;
  }
  return { slots, cut };
}

/** One slot everywhere (lofted locks, cords, a hat ring). */
export function solidPaint(nv: number, slot: number): PaintOut {
  const slots = new Uint8Array(nv * 2).fill(slot);
  return { slots, cut: new Float32Array(nv).fill(1) };
}
