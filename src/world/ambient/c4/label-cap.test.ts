import { describe, expect, test } from "bun:test";
import { LABEL_MAX_FRAC, labelCap, MAQ_SCALE } from "./maquette";

describe("labelCap", () => {
  const h = 0.17 * MAQ_SCALE;
  test("keeps full size from the follow camera", () => {
    expect(labelCap(h, 8, 50)).toBe(1);
  });
  test("shrinks close-ups to the cap", () => {
    const k = labelCap(h, 1.5, 50);
    expect(k).toBeLessThan(0.5);
    const frac = (h * k) / (2 * 1.5 * Math.tan((25 * Math.PI) / 180));
    expect(frac).toBeCloseTo(LABEL_MAX_FRAC, 6);
  });
});
