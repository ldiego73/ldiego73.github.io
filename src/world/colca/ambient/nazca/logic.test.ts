import { describe, expect, test } from "bun:test";
import { ARTIFACTS } from "../../../../data/career";
import { ROAD, TOWER } from "../../plan";
import { facedFigure, figures, frame, onTowerTop, signInRange, signpost, worldLines } from "./logic";

describe("Nazca figures", () => {
  const list = figures();
  test("one geoglyph per artifact, each a different figure", () => {
    expect(list.length).toBe(ARTIFACTS.length);
    expect(new Set(list.map((f) => f.glyph.id)).size).toBe(list.length);
    expect(new Set(list.map((f) => f.artifact.id)).size).toBe(list.length);
  });

  test("no line touches the road, and the tower stands clear of every figure", () => {
    for (const f of list)
      for (const [x, z] of worldLines(f).flat()) {
        let d = Infinity;
        for (const p of ROAD.pts) d = Math.min(d, Math.hypot(p[0] - x, p[1] - z));
        expect(d).toBeGreaterThan(8);
        expect(Math.hypot(x - TOWER.x, z - TOWER.z)).toBeGreaterThan(20);
      }
  });

  test("figures face the tower (their up points away from it)", () => {
    for (const f of list) {
      const { up } = frame(f);
      expect((f.x - TOWER.x) * up[0] + (f.z - TOWER.z) * up[1]).toBeGreaterThan(0);
    }
  });

  test("signposts sit by the road and E finds them", () => {
    for (const f of list) {
      const s = signpost(f);
      expect(signInRange(list, s.x, s.z)).toBe(f);
    }
    expect(signInRange(list, TOWER.x + 300, TOWER.z)).toBeNull();
  });

  test("from the tower deck the faced figure is picked", () => {
    for (const f of list) {
      const got = facedFigure(list, TOWER, { x: f.x - TOWER.x, z: f.z - TOWER.z });
      expect(got).toBe(f);
    }
    expect(onTowerTop({ x: TOWER.x, y: 20, z: TOWER.z }, 20)).toBe(true);
    expect(onTowerTop({ x: TOWER.x, y: 2, z: TOWER.z }, 20)).toBe(false);
    expect(onTowerTop({ x: TOWER.x + 10, y: 20, z: TOWER.z }, 20)).toBe(false);
  });
});
