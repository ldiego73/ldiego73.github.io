import { describe, expect, test } from "bun:test";
import { arcDir } from "../../../ambient/sky/moon";
import { buildCostaLayout, ROAD_HALF } from "../../layout";
import { finaleFrame, PLATFORM, SUNSET } from "../finale/logic";
import { toWorld } from "../huacas/logic";
import { HOURS, KIDS, OFFERING, PLATFORM_CLEAR, reunionSpots, SOLIDS, SPOTS, STALL, WALK, within } from "./plan";

const L = buildCostaLayout({ cells: 200 });
const end = L.trail.pointAt(1);
const f = finaleFrame({ x: end.x, z: end.z, y: L.groundAt(end.x, end.z) }, arcDir(SUNSET, 0, { x: 0, y: 0, z: 0 }));
const flatDry = (lx: number, lz: number) => {
  const w = toWorld(f, lx, lz);
  expect(L.isWater(w.x, w.z)).toBe(false);
  expect(Math.abs(L.groundAt(w.x, w.z) - f.y)).toBeLessThan(0.8);
  return w;
};

describe("gathering at the road's end", () => {
  test("8 people at high quality, 5 at low", () => {
    expect(reunionSpots("high").length).toBe(8);
    expect(reunionSpots("low").length).toBe(5);
  });

  test("everyone and every prop stands on flat dry cliff-top, off the platform and the road", () => {
    const pts = [
      ...SPOTS,
      STALL,
      OFFERING,
      ...[0, 1, 2, 3].map((k) => ({
        x: KIDS.x + Math.cos((k * Math.PI) / 2) * KIDS.r,
        z: KIDS.z + Math.sin((k * Math.PI) / 2) * KIDS.r,
      })),
    ];
    for (const p of pts) {
      const w = flatDry(p.x, p.z);
      expect(Math.hypot(p.x, p.z - PLATFORM.z)).toBeGreaterThan(PLATFORM_CLEAR);
      expect(L.trailQuery(w.x, w.z).d).toBeGreaterThan(ROAD_HALF + 1);
    }
    for (const s of SOLIDS) expect(Math.hypot(s.x, s.z - PLATFORM.z)).toBeGreaterThan(PLATFORM_CLEAR);
  });

  test("the walkable discs are flat and dry all over", () => {
    for (const w of WALK)
      for (let k = 0; k < 16; k++)
        for (const rf of [0.3, 0.7, 1]) {
          const a = (k / 16) * Math.PI * 2;
          flatDry(w.x + Math.cos(a) * w.r * rf, w.z + Math.sin(a) * w.r * rf);
        }
  });

  test("they are there for the sunset, home at night", () => {
    expect(within(0.5, HOURS)).toBe(true);
    expect(within(SUNSET, HOURS)).toBe(true);
    expect(within(0.9, HOURS)).toBe(false);
    expect(within(0.1, HOURS)).toBe(false);
  });
});
