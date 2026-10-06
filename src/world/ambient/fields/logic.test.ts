import { describe, expect, test } from "bun:test";
import { arcLayout, cropFor, formatDate, growth, knotsFor, plantCount, safeHref, wrap } from "./logic";

describe("huerto crops", () => {
  test("language → crop legend", () => {
    expect(cropFor("TypeScript")).toBe("maize");
    expect(cropFor("JavaScript")).toBe("maize");
    expect(cropFor("Python")).toBe("potato");
    expect(cropFor("Go")).toBe("quinoa");
    expect(cropFor("Rust")).toBe("quinoa");
    expect(cropFor("Kotlin")).toBe("tarwi");
    expect(cropFor("Shell")).toBe("oca");
    expect(cropFor(null)).toBe("fallow");
    expect(cropFor("  ")).toBe("fallow");
  });
  test("growth is log-scaled, bounded and monotonic", () => {
    expect(growth(0, 500)).toBeCloseTo(0.25);
    expect(growth(500, 500)).toBeCloseTo(1);
    expect(growth(5000, 500)).toBe(1);
    expect(growth(50, 500)).toBeGreaterThan(growth(5, 500));
    // Log scale: 22 of 500 stars is already past the midpoint.
    expect(growth(22, 500)).toBeGreaterThan(0.6);
    // A garden of tiny repos stays modest (reference is at least 10 stars).
    expect(growth(2, 2)).toBeLessThan(0.7);
    expect(growth(Number.NaN, 10)).toBeCloseTo(0.25);
  });
  test("plant count", () => {
    expect(plantCount(1, false)).toBe(22);
    expect(plantCount(0.25, true)).toBeGreaterThanOrEqual(3);
  });
  test("arc layout stays behind the plaza", () => {
    expect(arcLayout(0).center).toEqual([]);
    const a = arcLayout(8);
    expect(a.center).toHaveLength(8);
    const first = a.center[0] as number;
    const last = a.center[7] as number;
    expect(last - first + a.width).toBeCloseTo((220 * Math.PI) / 180);
    expect((first + last) / 2).toBeCloseTo(Math.PI);
    expect(arcLayout(2).width).toBeCloseTo(Math.PI / 6);
  });
});

describe("khipu knots", () => {
  test("encodes year tens/units and month", () => {
    expect(knotsFor("2023-07-14T00:00:00.000Z")).toEqual({ year: 2023, month: 7, tens: 2, units: 3 });
    expect(knotsFor("2020-12-01")).toEqual({ year: 2020, month: 12, tens: 2, units: 0 });
    expect(knotsFor("nope")).toBeNull();
    expect(knotsFor("2020-13-01")).toBeNull();
  });
});

describe("links and dates", () => {
  test("safeHref", () => {
    expect(safeHref("/es/blog/hola/")).toBe("/es/blog/hola/");
    expect(safeHref("https://medium.com/@ldiego73/x")).toBe("https://medium.com/@ldiego73/x");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    expect(safeHref("")).toBeNull();
  });
  test("formatDate", () => {
    expect(formatDate("2023-07-14T00:00:00.000Z", "en")).toBe("Jul 14, 2023");
    expect(formatDate("bad", "es")).toBe("");
  });
  test("wrap", () => {
    expect(wrap(-1, 5)).toBe(4);
    expect(wrap(5, 5)).toBe(0);
    expect(wrap(3, 0)).toBe(0);
  });
});
