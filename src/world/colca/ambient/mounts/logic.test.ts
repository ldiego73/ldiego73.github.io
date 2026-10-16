import { describe, expect, test } from "bun:test";
import { ARRIVE_T, ROAD_HALF, roadAt } from "../../plan";
import { MULE, muleStops, parkingDisc, parkingWalk, QUAD, quadStops, roadGap } from "./logic";

describe("Kuntisuyu mounts", () => {
  test("the stretches meet: there is always a mount on the road", () => {
    expect(MULE.endT).toBeGreaterThanOrEqual(QUAD.startT);
    expect(muleStops({ t: MULE.homeT })).toBe(false);
    expect(muleStops({ t: 0.5 })).toBe(false);
    expect(muleStops({ t: MULE.endT })).toBe(true);
    expect(quadStops({ t: 0.7 })).toBe(false);
    expect(quadStops({ t: 0.99 })).toBe(false);
    expect(quadStops({ t: 0.5 })).toBe(true);
  });

  test("the quad's home lies well inside its own stretch, a few steps from where the mule stops", () => {
    expect(quadStops({ t: QUAD.homeT })).toBe(false);
    expect(roadGap(QUAD.homeT, QUAD.startT)).toBeGreaterThan(8);
    expect(muleStops({ t: QUAD.homeT })).toBe(true);
    const drop = roadAt(MULE.endT);
    const quad = parkingDisc(QUAD.homeT, QUAD.side, QUAD.off);
    expect(Math.hypot(quad.x - drop.x, quad.z - drop.z)).toBeLessThan(16);
  });

  test("the mule waits past the arrival spot, clear of the punku's prompt", () => {
    const punku = roadAt(0);
    const spawn = roadAt(ARRIVE_T);
    const home = parkingDisc(MULE.homeT, MULE.side, MULE.off);
    expect(Math.hypot(home.x - punku.x, home.z - punku.z)).toBeGreaterThan(3.6 + 2.4 + 0.5 + home.r);
    expect(Math.hypot(home.x - spawn.x, home.z - spawn.z)).toBeGreaterThan(2 + home.r);
  });

  test("the parking disc is off the road band, on the requested side", () => {
    const d = parkingDisc(0.3, 1, 5.6);
    const r = roadAt(0.3);
    expect(Math.hypot(d.x - r.x, d.z - r.z)).toBeCloseTo(5.6, 6);
    // Heading west on the rim, the right side is north (smaller z).
    expect(d.z).toBeLessThan(r.z);
  });

  test("the walkable parking area reaches the road band, so the traveler can walk up to the mount", () => {
    for (const m of [MULE, QUAD]) {
      const d = parkingDisc(m.homeT, m.side, m.off);
      const w = parkingWalk(d, m.off);
      expect(m.off - w.r).toBeLessThan(ROAD_HALF - 0.5);
      expect(w.r).toBeGreaterThan(d.r);
    }
  });
});
