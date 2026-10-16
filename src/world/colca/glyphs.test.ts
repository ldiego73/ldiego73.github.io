import { describe, expect, test } from "bun:test";
import { circle, GLYPHS, glyphBounds, spiral } from "./glyphs";

describe("Nazca glyphs", () => {
  test("every figure is a few polylines inside its unit frame, bilingual", () => {
    for (const g of Object.values(GLYPHS)) {
      expect(g.lines.length).toBeGreaterThan(2);
      for (const line of g.lines) expect(line.length).toBeGreaterThanOrEqual(2);
      const b = glyphBounds(g);
      for (const v of [b.x0, b.y0, b.x1, b.y1]) expect(Math.abs(v)).toBeLessThanOrEqual(1.1);
      expect(g.name.es && g.name.en && g.real.es && g.real.en).toBeTruthy();
    }
  });

  test("curve helpers", () => {
    const c = circle(0, 0, 1, 8);
    const [a, b] = [c[0] as [number, number], c[c.length - 1] as [number, number]];
    expect(a[0]).toBeCloseTo(b[0], 9);
    expect(a[1]).toBeCloseTo(b[1], 9);
    const s = spiral(0, 0, 1, 0.1, 0, 2, 40);
    const r = (p: [number, number]) => Math.hypot(p[0], p[1]);
    expect(r(s[0] as [number, number])).toBeCloseTo(1, 6);
    expect(r(s[s.length - 1] as [number, number])).toBeCloseTo(0.1, 6);
  });
});
