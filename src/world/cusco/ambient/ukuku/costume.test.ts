import { describe, expect, test } from "bun:test";
import { rigOf, specKey } from "../../../characters/archetype";
import { PALETTE_SIZE } from "../../../characters/slots";
import { DANCER_DRESS, ukukuSpec } from "./costume";

describe("ukuku costume", () => {
  const spec = ukukuSpec();
  test("a masked person: no painted face, the costume in the extra hook", () => {
    expect(spec.hideFace).toBe(true);
    expect(spec.extra?.length).toBeGreaterThan(60);
  });
  test("every primitive rides a bone of the skeleton and paints a palette slot", () => {
    const bones = new Set(rigOf(spec).bones.map((b) => b.name));
    for (const e of spec.extra ?? []) {
      expect(bones.has(e.bone)).toBe(true);
      expect(e.slot).toBeGreaterThanOrEqual(0);
      expect(e.slot).toBeLessThan(PALETTE_SIZE);
    }
    expect(DANCER_DRESS.length).toBe(PALETTE_SIZE);
  });
  test("fleece on the body, both arms and both legs; the mask on the head", () => {
    const on = new Set((spec.extra ?? []).map((e) => e.bone));
    for (const b of ["hips", "chest", "head", "armL", "armR", "foreL", "foreR", "thighL", "thighR", "shinL", "shinR"])
      expect(on.has(b)).toBe(true);
  });
  test("deterministic data (one cache key)", () => {
    expect(specKey(ukukuSpec())).toBe(specKey(spec));
  });
});
