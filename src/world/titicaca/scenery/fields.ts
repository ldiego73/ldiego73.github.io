/**
 * Chacras of the altiplano: the patchwork of small fields between the road and the hills (quinoa in reds and
 * oranges, potato and broad bean greens, barley gold, fallow earth), separated by pirca walls of piled stones.
 * Pure (no three.js): the terrain colours its faces with `parcelAt`, and ./walls.ts lays stones along
 * `parcelEdges`. The parcels are cells of a grid turned a little off the road's axis, kept to a band of land.
 */
import { landField, mainLand, noise } from "../layout";

/** Field colours: quinoa red / orange, potato and haba greens, barley gold, fallow brown. */
export const CROPS = ["#b84a3a", "#d0773a", "#6f9a3c", "#87a548", "#d2b04c", "#9c7a4e"] as const;

const CELL_U = 19;
const CELL_V = 13;
const TURN = 0.21;
const C = Math.cos(TURN);
const S = Math.sin(TURN);

/** Where fields are tilled: a band of gentle land between the road and the hills (and on Taquile's slopes). */
export function tilled(x: number, z: number): boolean {
  const m = mainLand(x, z);
  if (m > 44 && m < 170 && noise(x / 70 + 3, z / 70) > 0.32) return true;
  // Taquile's terraced fields (the headland at x ≈ 108, z ≈ −30).
  const tq = Math.hypot((x - 108) / 40, (z + 30) / 34);
  return tq > 0.32 && tq < 0.86 && landField(x, z) > 4;
}

/** The parcel at (x, z): its crop colour index, or −1 when untilled. */
export function parcelAt(x: number, z: number): number {
  if (!tilled(x, z)) return -1;
  const u = Math.floor((x * C + z * S) / CELL_U);
  const v = Math.floor((-x * S + z * C) / CELL_V);
  let h = Math.imul(u, 73856093) ^ Math.imul(v, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  const r = ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  // A third of the cells lie fallow as puna grass (no colour).
  if (r < 0.3) return -1;
  return Math.floor(((r - 0.3) / 0.7) * CROPS.length) % CROPS.length;
}

/** Points along the parcel borders inside the tilled band (for the pirca walls), every `step` units. */
export function parcelEdges(
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  step = 1.1,
): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const us = Math.floor(Math.min(x0 * C + z0 * S, x1 * C + z0 * S, x0 * C + z1 * S, x1 * C + z1 * S) / CELL_U);
  const ue = Math.ceil(Math.max(x0 * C + z0 * S, x1 * C + z0 * S, x0 * C + z1 * S, x1 * C + z1 * S) / CELL_U);
  const vs = Math.floor(Math.min(-x0 * S + z0 * C, -x1 * S + z0 * C, -x0 * S + z1 * C, -x1 * S + z1 * C) / CELL_V);
  const ve = Math.ceil(Math.max(-x0 * S + z0 * C, -x1 * S + z0 * C, -x0 * S + z1 * C, -x1 * S + z1 * C) / CELL_V);
  const toWorld = (u: number, v: number): [number, number] => [u * C - v * S, u * S + v * C];
  // Lines of constant u (yaw along v) and constant v (yaw along u); a stone where either side is tilled.
  for (let ui = us; ui <= ue; ui++)
    for (let v = vs * CELL_V; v < ve * CELL_V; v += step) {
      const [x, z] = toWorld(ui * CELL_U, v);
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      if (tilled(x, z)) out.push([x, z, TURN]);
    }
  for (let vi = vs; vi <= ve; vi++)
    for (let u = us * CELL_U; u < ue * CELL_U; u += step) {
      const [x, z] = toWorld(u, vi * CELL_V);
      if (x < x0 || x > x1 || z < z0 || z > z1) continue;
      if (tilled(x, z)) out.push([x, z, TURN + Math.PI / 2]);
    }
  return out;
}
