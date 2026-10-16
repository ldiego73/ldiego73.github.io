import { describe, expect, test } from "bun:test";
import { buildTiticacaLayout, segQuery } from "../layout";
import { boardwalks, ISLANDS } from "../plan";
import { CROPS, parcelAt, parcelEdges } from "./fields";
import { grassSpots, reedFree, reedSpots, rockSpots } from "./placement";

const L = buildTiticacaLayout({ cells: 100 });

describe("Collasuyu scenery placement", () => {
  test("reeds stand in water, never on the boardwalk or an island", () => {
    const spots = reedSpots(L, 300);
    expect(spots.length).toBeGreaterThan(150);
    for (const s of spots) {
      expect(L.landField(s.x, s.z)).toBeLessThan(0);
      expect(reedFree(s.x, s.z)).toBe(true);
      for (const [a, b] of boardwalks()) expect(segQuery(a, b, s.x, s.z).d).toBeGreaterThan(2);
      for (const i of ISLANDS) expect(Math.hypot(s.x - i.x, s.z - i.z)).toBeGreaterThan(i.r);
    }
  });

  test("grass and rocks on open ground, off the chacras; fields have colours and walls", () => {
    for (const s of [...grassSpots(L, 200), ...rockSpots(L, 60)]) {
      expect(L.isGround(s.x, s.z)).toBe(true);
      expect(parcelAt(s.x, s.z)).toBe(-1);
    }
    let tilled = 0;
    for (let x = -300; x < 300; x += 7) for (let z = 50; z < 180; z += 7) if (parcelAt(x, z) >= 0) tilled++;
    expect(tilled).toBeGreaterThan(20);
    for (let x = -300; x < 300; x += 7) {
      const c = parcelAt(x, 90);
      if (c >= 0) expect(c).toBeLessThan(CROPS.length);
    }
    expect(parcelEdges(-100, 40, 100, 160).length).toBeGreaterThan(50);
  });
});
