import { describe, expect, test } from "bun:test";
import { mountHome } from "../../../ambient/mount/logic";
import { buildCostaLayout, ROAD_HALF } from "../../layout";
import { COSTA_STATIONS, PUNKU_T } from "../../plan";
import { HOME_T, homePatch, inside, rideStops } from "./logic";

const L = buildCostaLayout({ cells: 200 });
/** ../../def.ts START_T (def.ts uses import.meta.glob, which bun:test cannot load). */
const START_T = 0.016;
const home = () => {
  const p = L.trail.pointAt(HOME_T);
  const tg = L.trail.tangentAt(HOME_T);
  const punku = L.trail.pointAt(PUNKU_T);
  const spawn = L.trail.pointAt(START_T);
  return mountHome({
    plaza: homePatch(p, tg),
    station: { x: p.x, z: p.z },
    walkable: L.walkable,
    heightAt: L.groundAt,
    trailDistance: (x, z) => L.trailQuery(x, z),
    halfWidth: ROAD_HALF,
    avoid: [
      [punku.x, punku.z, 6.5],
      [spawn.x, spawn.z, 2],
    ],
    roadDir: tg,
  });
};

describe("coast horse", () => {
  test("waits on walkable dry ground off the road, seaward, past the spawn and clear of the punku", () => {
    const h = home();
    expect(L.walkable(h.x, h.z)).toBe(true);
    expect(L.isWater(h.x, h.z)).toBe(false);
    const q = L.trailQuery(h.x, h.z);
    expect(q.d).toBeGreaterThanOrEqual(ROAD_HALF + 1.4);
    expect(q.t).toBeGreaterThan(START_T);
    expect(h.x).toBeLessThan(L.trail.pointAt(HOME_T).x);
    const punku = L.trail.pointAt(PUNKU_T);
    expect(Math.hypot(h.x - punku.x, h.z - punku.z)).toBeGreaterThan(10);
    // Not inside a ride stop (or mounting would dismount at once).
    expect(inside(rideStops(L.plazas), h.x, h.z)).toBe(false);
    // Level with the road beside it.
    expect(Math.abs(L.groundAt(h.x, h.z) - L.trail.pointAt(q.t).y)).toBeLessThan(0.8);
  });

  test("every station's plaza (the punku, huacas, market, beach, finale) is a stop; the open road is not", () => {
    const zones = rideStops(L.plazas);
    for (const s of COSTA_STATIONS) {
      const pose = L.stationPose(s.id).position;
      expect(inside(zones, pose.x, pose.z)).toBe(true);
    }
    // The punku's prompt (3.6 round the doorway) lies inside its stop.
    const punku = L.trail.pointAt(PUNKU_T);
    expect(inside(zones, punku.x, punku.z + 3.6)).toBe(true);
    // Riding along the road between stations never stops.
    let stops = 0;
    for (let t = 0.04; t < 0.96; t += 0.002) {
      const p = L.trail.pointAt(t);
      if (inside(zones, p.x, p.z)) stops++;
    }
    expect(stops).toBe(0);
  });
});
