import { describe, expect, test } from "bun:test";
import { LOD_BANDS, lodFor, poseThisFrame } from "./lod";
import { lollop, porpoise, spineWave } from "./swim";

describe("swimming", () => {
  test("the wave grows toward the tail and stays within its amplitude", () => {
    const out: number[] = [];
    let maxHead = 0;
    let maxTail = 0;
    for (let t = 0; t < 2; t += 0.01) {
      spineWave(5, t, { amp: 0.4, hz: 1, lag: 0.15, taper: 0.2 }, out);
      maxHead = Math.max(maxHead, Math.abs(out[0] as number));
      maxTail = Math.max(maxTail, Math.abs(out[4] as number));
    }
    expect(maxTail).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(maxTail).toBeGreaterThan(maxHead * 3);
  });

  test("porpoising happens only inside its window; lollop stays bounded", () => {
    expect(porpoise(5, 7, 2, 0.5).y).toBe(0);
    expect(porpoise(1, 7, 2, 0.5).y).toBeCloseTo(0.5);
    for (let p = 0; p < 1; p += 0.05) {
      const l = lollop(p);
      expect(l.arch).toBeGreaterThanOrEqual(0);
      expect(Math.abs(l.fore)).toBeLessThanOrEqual(0.5);
    }
  });
});

describe("LOD", () => {
  test("bands scale with size and end in a far cut-off", () => {
    expect(lodFor(5, 1.5)).toBe(0);
    expect(lodFor(LOD_BANDS.near * 1.5 + 1, 1.5)).toBe(1);
    expect(lodFor(LOD_BANDS.mid * 1.5 + 1, 1.5)).toBe(2);
    expect(lodFor(1e5, 1.5)).toBe(-1);
    // A condor stays sharp farther away than a cuy.
    expect(lodFor(20, 3)).toBe(0);
    expect(lodFor(20, 0.3)).toBe(2);
  });

  test("far instances are posed in a staggered fraction of frames", () => {
    let n = 0;
    for (let f = 0; f < 400; f++) for (let i = 0; i < 10; i++) if (poseThisFrame(2, i, f)) n++;
    expect(n).toBe(1000);
    for (let f = 0; f < 4; f++) expect(poseThisFrame(0, 3, f)).toBe(true);
  });
});
