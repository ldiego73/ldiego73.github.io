import { describe, expect, test } from "bun:test";
import { STATIONS } from "../../contract";
import { buildLayout } from "../../layout";
import { angleLerp, llamaHome, rideAction } from "./logic";

const FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s.kind === "gate" ? 4.5 : s.kind === "bridge" ? 0 : 6]),
);
describe("llama ride", () => {
  test.each([280, 190])("home spot is on the trailhead plaza, off the stone path (%i cells)", (cells) => {
    const L = buildLayout({ cells, footprint: FOOTPRINT });
    const h = llamaHome({
      ...L,
      extra: {
        trailDistance: (x, z) => {
          const q = L.trailQuery(x, z);
          return { d: q.d, t: q.t };
        },
      },
    });
    expect(L.walkable(h.x, h.z)).toBe(true);
    expect(L.trailQuery(h.x, h.z).d).toBeGreaterThan(L.trail.halfWidth + 1.3);
    const g = L.stationPose("gate").position;
    expect(Math.hypot(h.x - g.x, h.z - g.z)).toBeLessThan(5);
    console.log(`[${cells}] llama home: (${h.x.toFixed(1)}, ${L.heightAt(h.x, h.z).toFixed(1)}, ${h.z.toFixed(1)})`);
  });

  test("angleLerp takes the short way round", () => {
    expect(angleLerp(3, -3, 1)).toBeCloseTo(-3 + Math.PI * 2, 5);
    expect(angleLerp(0, 1, 0.5)).toBeCloseTo(0.5, 5);
  });

  test("ride actions", () => {
    expect(rideAction({ state: "idle", dist: 1, range: 2.4, blocked: false })).toBe("mount");
    expect(rideAction({ state: "idle", dist: 3, range: 2.4, blocked: false })).toBe("none");
    expect(rideAction({ state: "riding", dist: 0, range: 2.4, blocked: false })).toBe("dismount");
    expect(rideAction({ state: "riding", dist: 0, range: 2.4, blocked: true })).toBe("none");
  });
});
