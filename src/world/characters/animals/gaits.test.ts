import { describe, expect, test } from "bun:test";
import { blendGait, blendPhase, bobAt, feetDown, GAITS, type GaitKey, legPhaseOf, pickGait, strideAt } from "./gaits";

const sample = (n: number) => Array.from({ length: n }, (_, i) => i / n);

describe("gaits", () => {
  test("a walk always keeps at least two feet down; gallops and bounds have a moment of suspension", () => {
    for (const k of ["walk", "stalk", "crawl", "paso"] as GaitKey[])
      for (const p of sample(200)) expect(feetDown(p, GAITS[k]).length).toBeGreaterThanOrEqual(2);
    for (const k of ["gallop", "bound", "hop"] as GaitKey[])
      expect(sample(200).some((p) => feetDown(p, GAITS[k]).length === 0)).toBe(true);
  });

  test("trot pairs diagonals, pace pairs sides", () => {
    const t = GAITS.trot.offs;
    expect(Math.abs(t.lh - t.rf)).toBeLessThan(0.05);
    expect(Math.abs(t.rh - t.lf)).toBeLessThan(0.05);
    const p = GAITS.pace.offs;
    expect(Math.abs(p.lh - p.lf)).toBeLessThan(0.05);
    expect(Math.abs(p.rh - p.rf)).toBeLessThan(0.05);
  });

  test("pickGait holds one gait, then blends to the next near the change-over", () => {
    const uses = [
      { gait: "walk" as const, speed: 1, stride: 1.4 },
      { gait: "trot" as const, speed: 3, stride: 2.4 },
    ];
    expect(pickGait(uses, 0).t).toBe(0);
    expect(pickGait(uses, 1.5).t).toBe(0);
    expect(pickGait(uses, 2.95).t).toBeGreaterThan(0.9);
    expect(pickGait(uses, 9).a.gait).toBe("trot");
    // Stride grows with speed and never collapses.
    let last = 0;
    for (let s = 0.2; s < 5; s += 0.2) {
      const st = pickGait(uses, s).stride;
      expect(st).toBeGreaterThanOrEqual(last - 1e-9);
      last = st;
    }
    expect(strideAt(uses[0] as (typeof uses)[0], 0)).toBeCloseTo(1.4 * 0.35);
  });

  test("phases blend the short way round and stay in 0..1", () => {
    expect(blendPhase(0.95, 0.05, 0.5)).toBeCloseTo(0, 5);
    expect(blendPhase(0.1, 0.3, 0.5)).toBeCloseTo(0.2, 5);
    const g = blendGait(GAITS.walk, GAITS.gallop, 0.5);
    for (const v of Object.values(g.offs)) expect(v >= 0 && v < 1).toBe(true);
    expect(legPhaseOf(0.1, 0.3)).toBeCloseTo(0.8);
  });

  test("bob stays in 0..1", () => {
    for (const k of Object.keys(GAITS) as GaitKey[])
      for (const p of sample(50)) {
        const b = bobAt(p, GAITS[k]);
        expect(b).toBeGreaterThanOrEqual(-1e-9);
        expect(b).toBeLessThanOrEqual(1 + 1e-9);
      }
  });
});
