import { describe, expect, test } from "bun:test";
import { PLAZA, USNU } from "../../plan";
import { buildCloth, POLE_H, poles } from "./model";

describe("plaza cloth", () => {
  test("one pole per suyu, off the usnu and on the plaza", () => {
    const ps = poles();
    expect(ps.length).toBe(4);
    expect(new Set(ps.map((p) => p.gate.id)).size).toBe(4);
    for (const p of ps) {
      expect(Math.max(Math.abs(p.x - USNU.x), Math.abs(p.z - USNU.z))).toBeGreaterThan(USNU.tiers[0].half + 0.5);
      expect(p.x).toBeGreaterThan(PLAZA.x0);
      expect(p.x).toBeLessThan(PLAZA.x1);
      expect(p.z).toBeGreaterThan(PLAZA.z0);
      expect(p.z).toBeLessThan(PLAZA.z1);
    }
  });
  test("weights: 0 on rigid parts and pinned edges, up to 1 at the free edge", () => {
    const g = buildCloth();
    const flex = g.getAttribute("flex");
    const pos = g.getAttribute("position");
    expect(flex.count).toBe(pos.count);
    let max = 0;
    let rigid = 0;
    for (let i = 0; i < flex.count; i++) {
      const f = flex.getX(i);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      max = Math.max(max, f);
      if (f === 0) rigid++;
      // Nothing above the pole tops.
      expect(pos.getY(i)).toBeLessThan(POLE_H + 0.4);
    }
    expect(max).toBeCloseTo(1, 5);
    expect(rigid).toBeGreaterThan(0);
    g.dispose();
  });
});
