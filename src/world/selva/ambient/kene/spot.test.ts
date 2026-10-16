import { describe, expect, test } from "bun:test";
import { CANOPY_T } from "../../contract";
import { buildSelvaLayout } from "../../layout";
import { collpaCliff } from "../collpa/spot";
import { AHEAD, aroundTotem, DAIS_R, keneSpot, PLAZA_R, POLE_ANGLES, POLE_R, POTS, TOTEM_LOCAL } from "./spot";

const L = buildSelvaLayout({ cells: 200 });
const s = keneSpot(L);

describe("kené totem spot", () => {
  test("straight on past the road end, local +Z facing back down the road", () => {
    expect(Math.hypot(s.x - s.end.x, s.z - s.end.z)).toBeCloseTo(AHEAD, 5);
    const back = s.world(0, 5);
    const toward = L.trail.pointAt(0.99);
    expect(Math.hypot(back.x - toward.x, back.z - toward.z)).toBeLessThan(Math.hypot(s.x - toward.x, s.z - toward.z));
    // The road end lies inside the clearing, so walking off the road steps onto the plaza.
    expect(Math.hypot(s.end.x - s.x, s.end.z - s.z)).toBeLessThan(PLAZA_R);
  });

  test("dry, level ground away from the river, the collpa and the canopy walkway", () => {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const x = s.x + Math.sin(a) * PLAZA_R;
      const z = s.z + Math.cos(a) * PLAZA_R;
      expect(L.isWater(x, z)).toBe(false);
      expect(L.riverDist(x, z)).toBeGreaterThan(4);
      expect(Math.abs(L.heightAt(x, z) - s.roadY)).toBeLessThan(0.6);
    }
    const cliff = collpaCliff(L);
    const c = L.stationPose("collpa");
    const view = { x: cliff.view.x, z: cliff.view.z };
    expect(Math.hypot(view.x - s.x, view.z - s.z)).toBeGreaterThan(PLAZA_R + 12);
    expect(Math.hypot(c.position.x - s.x, c.position.z - s.z)).toBeGreaterThan(PLAZA_R + 10);
    const canopyEnd = L.trail.pointAt(CANOPY_T[1]);
    expect(Math.hypot(canopyEnd.x - s.x, canopyEnd.z - s.z)).toBeGreaterThan(40);
  });

  test("props fit inside the clearing; the poles leave the road side open", () => {
    for (const a of POLE_ANGLES) {
      expect(Math.hypot(Math.sin(a) * POLE_R, Math.cos(a) * POLE_R)).toBeLessThan(PLAZA_R - 0.5);
      // Entrance: no pole within ±0.6 rad of +Z (the road).
      const d = Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
      expect(d).toBeGreaterThan(0.6);
    }
    for (const [a, r] of POTS) {
      const [lx, lz] = aroundTotem(a, r);
      expect(Math.hypot(lx, lz)).toBeLessThan(PLAZA_R - 1);
      expect(r).toBeGreaterThan(DAIS_R + 0.3);
    }
    expect(Math.hypot(TOTEM_LOCAL[0], TOTEM_LOCAL[1]) + DAIS_R).toBeLessThan(PLAZA_R);
  });

  test("footprint covers the clearing", () => {
    expect(s.footprint.some((f) => Math.hypot(f.x - s.x, f.z - s.z) + PLAZA_R <= f.r + 1e-6)).toBe(true);
  });
});
