import { describe, expect, test } from "bun:test";
import {
  boardDims,
  CORD_Y,
  circleLayout,
  cordX,
  FZ,
  headYaw,
  inPromptRect,
  modeAt,
  pointWeight,
  readerCords,
  SPACING,
} from "./logic";

describe("board dims", () => {
  test("match khipu-board.ts (blank khipu, few and many posts)", () => {
    expect(boardDims(0)).toEqual({ n: 4, half: 1.6, x0: -0.63 });
    expect(boardDims(2).half).toBeCloseTo(1.6);
    const d12 = boardDims(30);
    expect(d12.n).toBe(12);
    expect(d12.half).toBeCloseTo((12 * SPACING + 1) / 2);
    expect(cordX(d12, 11)).toBeCloseTo(-d12.x0);
    expect(CORD_Y).toBeGreaterThan(2);
  });
});

describe("circle layout keeps the E spot free", () => {
  for (const posts of [0, 1, 2, 5, 8, 12]) {
    test(`${posts} posts`, () => {
      const d = boardDims(posts);
      const L = circleLayout(d, 4);
      const pts = [L.elder, ...L.kids, ...L.fire, ...L.out];
      for (const p of pts) expect(inPromptRect(d, p.x, p.z)).toBe(false);
      // The hearth ring (r ≈ 0.55) too.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        expect(inPromptRect(d, L.hearth.x + Math.cos(a) * 0.55, L.hearth.z + Math.sin(a) * 0.55, 0)).toBe(false);
      }
      // Everyone on the +x side (the path to the trail leaves toward −x), children clear of the hearth.
      for (const k of L.kids) {
        expect(k.x).toBeGreaterThan(d.half);
        expect(Math.hypot(k.x - L.hearth.x, k.z - L.hearth.z)).toBeGreaterThan(0.9);
      }
      // Readers behind the frame line, outside the prompt rectangle.
      expect(L.readerZ).toBeLessThan(FZ);
      expect(inPromptRect(d, 0, L.readerZ, 0)).toBe(false);
    });
  }
});

describe("schedule", () => {
  test("story by day; sitters by the fire at night, the rest home", () => {
    expect(modeAt(0.5, false)).toBe("story");
    expect(modeAt(0.5, true)).toBe("story");
    expect(modeAt(0.85, true)).toBe("fire");
    expect(modeAt(0.1, true)).toBe("fire");
    expect(modeAt(0.85, false)).toBe("home");
  });
  test("point weight stays in 0..1 and points part of the time", () => {
    let pointing = 0;
    for (let t = 0; t < 22; t += 0.05) {
      const w = pointWeight(t);
      expect(w).toBeGreaterThanOrEqual(0);
      expect(w).toBeLessThanOrEqual(1);
      if (w === 1) pointing++;
    }
    expect(pointing).toBeGreaterThan(0);
  });
  test("head yaw is relative and clamped", () => {
    expect(headYaw(0, 0, 0, 0, 1)).toBeCloseTo(0);
    expect(headYaw(0, 0, 0, 1, 0)).toBeCloseTo(Math.PI / 2 > 1.05 ? 1.05 : Math.PI / 2);
    expect(headYaw(Math.PI, 0, 0, 0, -1)).toBeCloseTo(0);
  });
  test("readers keep to separate halves of the cords", () => {
    for (const posts of [1, 2, 3, 12]) {
      const d = boardDims(posts);
      const a = readerCords(d, 0);
      const b = readerCords(d, 1);
      expect(a[0]).toBeLessThanOrEqual(a[1]);
      expect(b[0]).toBeLessThanOrEqual(b[1]);
      if (d.n > 1) expect(a[1]).toBeLessThan(b[0]);
    }
  });
});
