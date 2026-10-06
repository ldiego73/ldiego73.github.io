import { describe, expect, test } from "bun:test";
import { flicker, roadsideFires, TRAIL_TS } from "./spots";

// A straight trail along +x on flat ground.
const flat = {
  point: (t: number) => ({ x: t * 400, y: 10, z: 0 }),
  tangent: () => ({ x: 1, z: 0 }),
  heightAt: () => 10,
  halfWidth: 2.6,
  avoid: [] as Array<{ x: number; z: number; r: number }>,
};

describe("festival spots", () => {
  test("one fire per trail t, off the path, alternating sides", () => {
    const f = roadsideFires(flat);
    expect(f.length).toBe(TRAIL_TS.length);
    for (const p of f) expect(Math.abs(p.z)).toBeGreaterThan(flat.halfWidth + 1);
    for (let i = 1; i < f.length; i++) expect(Math.sign(f[i]!.z)).toBe(-Math.sign(f[i - 1]!.z));
  });

  test("skips spots near stations and on steep ground", () => {
    const p = flat.point(TRAIL_TS[0]!);
    const avoid = [{ x: p.x, z: 0, r: 8 }];
    const f = roadsideFires({ ...flat, avoid });
    expect(f.length).toBe(TRAIL_TS.length - 1);
    const cliff = roadsideFires({ ...flat, heightAt: (_x: number, z: number) => 10 + Math.abs(z) });
    expect(cliff.length).toBe(0);
  });

  test("flicker stays in a sane band", () => {
    for (let t = 0; t < 50; t += 0.37) {
      const v = flicker(t, 2.3);
      expect(v).toBeGreaterThan(0.65);
      expect(v).toBeLessThan(1.2);
    }
  });
});
