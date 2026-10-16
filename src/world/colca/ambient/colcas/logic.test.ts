import { describe, expect, test } from "bun:test";
import { atPlaza, colcaSlots, knotDrops, step, TIERS } from "./logic";

describe("colcas", () => {
  test("one slot per stage on the ledges, bottom rows first, none overlapping", () => {
    const slots = colcaSlots(10);
    expect(slots.length).toBe(10);
    for (let i = 1; i < slots.length; i++) expect(slots[i]?.y).toBeGreaterThanOrEqual(slots[i - 1]?.y ?? 0);
    for (const a of slots)
      for (const b of slots) if (a !== b && a.y === b.y) expect(Math.abs(a.x - b.x)).toBeGreaterThan(2.2);
    for (const s of slots) {
      const tier = TIERS[s.row];
      expect(Math.abs(s.x)).toBeLessThan(tier?.half ?? 0);
    }
    expect(colcaSlots(12).length).toBe(12);
  });

  test("navigation wraps; knots hang down the cord; the plaza test", () => {
    expect(step(0, -1, 10)).toBe(9);
    expect(step(9, 1, 10)).toBe(0);
    expect(knotDrops(0)).toEqual([]);
    const d = knotDrops(6, 1.5);
    expect(d.length).toBe(6);
    expect(d[d.length - 1]).toBeLessThan(1.5);
    const plaza = { x: 0, y: 1, z: 0, r: 6 };
    expect(atPlaza({ x: 3, y: 1, z: 0 }, plaza)).toBe(true);
    expect(atPlaza({ x: 3, y: 9, z: 0 }, plaza)).toBe(false);
    expect(atPlaza({ x: 9, y: 1, z: 0 }, plaza)).toBe(false);
  });
});
