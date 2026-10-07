/**
 * Ground the jungle's content stations build on, as world circles (pure, from the layout): the scenery
 * agent can keep trees and undergrowth out of them (a bush growing through the floating arcade's raft or a
 * ceiba inside the maloca reads as a bug) and the fauna agent can treat them as no-go ground. The plazas
 * themselves are already excluded by `layout.isGround`; these are the parts outside the plaza circles.
 * Helpers only: this file does not export `create`.
 */
import type { SelvaLayout } from "../../contract";
import { collpaCliff } from "../collpa/spot";

export interface Footprint {
  station: string;
  x: number;
  z: number;
  r: number;
}

/** Local rectangles / circles per station (station frame: +Z toward the road, river side at −Z). */
const LOCAL: Record<string, Array<[lx: number, lz: number, r: number]>> = {
  // Stalls deck, stairs and the trader's boat.
  regaton: rectCircles(-7.6, -18, 7.4, -4, 2.2),
  // Round maloca (radius 5) with its eave and board.
  maloca: [
    [0, -7.6, 6.4],
    [3.9, -2.4, 1.6],
  ],
  // Shelter, sign and the pier corridor.
  embarcadero: [[-5.2, -4.6, 2.8], [3.4, -4.2, 1.6], ...rectCircles(-1.5, -16, 1.5, -4, 1.5)],
  // Row of stilt houses on the bank and their boardwalk.
  palafitos: rectCircles(-17.6, -11.5, 17.6, -1, 2.2),
  // Pond and raft.
  arcade: [
    [0, -11.6, 7.0],
    [3.6, -4.4, 1.6],
  ],
  // Viewpoint deck and sign.
  collpa: [...rectCircles(-3.6, -10.2, 3.6, -4.8, 1.8), [-5, -3.6, 1.6]],
};

function rectCircles(x0: number, z0: number, x1: number, z1: number, r: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const step = r * 1.3;
  for (let x = x0 + r * 0.6; x <= x1 - r * 0.6 + 1e-6; x += step)
    for (let z = z0 + r * 0.6; z <= z1 - r * 0.6 + 1e-6; z += step) out.push([x, z, r]);
  return out;
}

export function stationFootprints(L: Pick<SelvaLayout, "stationPose" | "riverDist" | "river">): Footprint[] {
  const out: Footprint[] = [];
  for (const [station, list] of Object.entries(LOCAL)) {
    const p = L.stationPose(station);
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    for (const [lx, lz, r] of list)
      out.push({ station, x: p.position.x + lx * c + lz * s, z: p.position.z - lx * s + lz * c, r });
  }
  // The collpa cliff: its massif and the strip of far bank in front of the face (keep the view clear).
  const cliff = collpaCliff(L);
  for (const f of cliff.footprint) out.push({ station: "collpa", ...f });
  for (let u = -1; u <= 1.001; u += 0.2) {
    const p = cliff.point(u, 0);
    out.push({ station: "collpa", x: p.x, z: p.z, r: 2.6 });
  }
  return out;
}

/** True when (x, z) lies inside any station footprint (grown by `pad`). */
export function inStationFootprint(list: ReadonlyArray<Footprint>, x: number, z: number, pad = 0): boolean {
  for (const f of list) if ((x - f.x) ** 2 + (z - f.z) ** 2 < (f.r + pad) ** 2) return true;
  return false;
}
