import { describe, expect, test } from "bun:test";
import { wovenCell } from "./aguayo";

describe("wovenCell", () => {
  test("edges are indigo and cotton stripes", () => {
    for (let x = 0; x < 16; x++) {
      expect(wovenCell(x, 0)).toBe("indigo");
      expect(wovenCell(x, 15)).toBe("indigo");
      expect(wovenCell(x, 1)).toBe("cotton");
      expect(wovenCell(x, 14)).toBe("cotton");
    }
  });
  test("each column has gold and green zig-zag threads over a red ground", () => {
    for (let x = 0; x < 16; x++) {
      const col = Array.from({ length: 16 }, (_, y) => wovenCell(x, y));
      expect(col).toContain("gold");
      expect(col).toContain("red");
    }
    const all = new Set<string>();
    for (let x = 0; x < 16; x++) for (let y = 0; y < 16; y++) all.add(wovenCell(x, y));
    expect([...all].sort()).toEqual(["cotton", "gold", "green", "indigo", "red"]);
  });
  test("tiles seamlessly along the band", () => {
    for (let y = 0; y < 16; y++) expect(wovenCell(0, y)).toBe(wovenCell(16, y));
  });
});
