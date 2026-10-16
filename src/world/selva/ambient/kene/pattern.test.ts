import { describe, expect, test } from "bun:test";
import { keneDesign, PERIOD, stairRing } from "./pattern";

const key = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
/** A thin segment as an order-free key, wrapped onto the torus. */
const segKey = (s: [[number, number], [number, number]], cols: number, rows: number) => {
  const w = ([x, y]: [number, number]) => key(((x % cols) + cols) % cols, ((y % rows) + rows) % rows);
  return [w(s[0]), w(s[1])].sort().join("|");
};

describe("kené pattern", () => {
  test("stair ring: closed, 4-connected, unit steps, mirror symmetric", () => {
    const r = stairRing(5);
    for (let i = 0; i < r.length; i++) {
      const [ax, ay] = r[i] as [number, number];
      const [bx, by] = r[(i + 1) % r.length] as [number, number];
      expect(Math.abs(ax - bx) + Math.abs(ay - by)).toBe(1);
    }
    const cells = new Set(r.map(([x, y]) => key(x, y)));
    expect(cells.size).toBe(r.length);
    for (const [x, y] of r) {
      expect(cells.has(key(-x, y))).toBe(true);
      expect(cells.has(key(x, -y))).toBe(true);
    }
    expect(cells.has(key(5, 0))).toBe(true);
    expect(cells.has(key(0, -5))).toBe(true);
  });

  test("deterministic per seed, varied across seeds", () => {
    const a = keneDesign({ cols: 32, rows: 32, seed: 7 });
    const b = keneDesign({ cols: 32, rows: 32, seed: 7 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const variants = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((seed) => {
        const d = keneDesign({ cols: 32, rows: 32, seed });
        return `${d.thick.length}:${d.thin.length}:${d.dots.length}`;
      }),
    );
    expect(variants.size).toBeGreaterThan(1);
  });

  test("bold labyrinth and fine echo lines fill the field", () => {
    const d = keneDesign({ cols: PERIOD * 2, rows: PERIOD * 4, seed: 3 });
    expect(d.thick.length).toBeGreaterThan(8);
    // Fine lines cover a good part of the field (several echoes beside every bold line).
    expect(d.thin.length).toBeGreaterThan(d.cols * d.rows * 0.4);
    for (const [[x0, y0], [x1, y1]] of d.thin) {
      expect(Math.abs(x0 - x1) + Math.abs(y0 - y1)).toBe(1);
      for (const v of [x0, x1]) expect(v >= 0 && v <= d.cols).toBe(true);
      for (const v of [y0, y1]) expect(v >= 0 && v <= d.rows).toBe(true);
    }
  });

  test("fine lines repeat every PERIOD cells and mirror about a lozenge centre", () => {
    for (const seed of [2, 4, 9]) {
      const cols = PERIOD * 2;
      const rows = PERIOD * 2;
      const d = keneDesign({ cols, rows, seed });
      const set = new Set(d.thin.map((s) => segKey(s, cols, rows)));
      for (const [[x0, y0], [x1, y1]] of d.thin) {
        const shifted = segKey(
          [
            [x0 + PERIOD, y0],
            [x1 + PERIOD, y1],
          ],
          cols,
          rows,
        );
        expect(set.has(shifted)).toBe(true);
        // Mirror about the vertical line through the centre of cell 0 (a lozenge centre): x → 1 − x.
        const mirrored = segKey(
          [
            [1 - x0, y0],
            [1 - x1, y1],
          ],
          cols,
          rows,
        );
        expect(set.has(mirrored)).toBe(true);
      }
    }
  });
});
