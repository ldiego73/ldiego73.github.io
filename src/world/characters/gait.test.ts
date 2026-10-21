import { describe, expect, test } from "bun:test";
import { advancePhase, footPath, LLAMA_WALK, legFK, legIK, legPhase, pelvis } from "./gait";

describe("gait phase", () => {
  test("advances by distance over cycle length and wraps into [0, 1)", () => {
    expect(advancePhase(0, 0.5, 1, 2)).toBeCloseTo(0.25);
    expect(advancePhase(0.9, 0.5, 1, 2)).toBeCloseTo(0.15);
    expect(advancePhase(0.3, 1, 0, 2)).toBeCloseTo(0.3);
    expect(advancePhase(0.3, 1, 1, 0)).toBe(0.3);
  });
  test("llama legs fall in lateral sequence, a quarter cycle apart", () => {
    const order = Object.entries(LLAMA_WALK)
      .sort((a, b) => a[1] - b[1])
      .map((e) => e[0]);
    expect(order).toEqual(["lh", "lf", "rh", "rf"]);
    expect(legPhase(0.1, 0.25)).toBeCloseTo(0.85);
  });
});

describe("foot path", () => {
  const duty = 0.6;
  test("continuous at heel strike, toe off and the wrap", () => {
    const e = 1e-5;
    for (const p of [duty, 1]) {
      const a = footPath(p - e, duty, 0.3, 0.1);
      const b = footPath(p + e, duty, 0.3, 0.1);
      expect(Math.abs(a.z - b.z)).toBeLessThan(1e-3);
      expect(Math.abs(a.y - b.y)).toBeLessThan(1e-3);
      expect(Math.abs(a.pitch - b.pitch)).toBeLessThan(1e-2);
    }
  });
  test("stance slides back at constant speed on the ground; swing lifts", () => {
    const a = footPath(0.1, duty, 0.3, 0.1);
    const b = footPath(0.2, duty, 0.3, 0.1);
    const c = footPath(0.3, duty, 0.3, 0.1);
    expect(a.y).toBe(0);
    expect(a.stance).toBe(true);
    expect(a.z - b.z).toBeCloseTo(b.z - c.z);
    expect(footPath(0.8, duty, 0.3, 0.1).y).toBeGreaterThan(0.05);
  });
  test("pelvis bounces twice per cycle and sways toward the stance leg", () => {
    expect(pelvis(0.1, 1, 0).y).toBeCloseTo(pelvis(0.6, 1, 0).y);
    expect(Math.sign(pelvis(0.15, 1, 0).x)).toBe(-Math.sign(pelvis(0.65, 1, 0).x));
  });
});

describe("leg IK", () => {
  const hip: [number, number, number] = [0.1, 0.75, 0];
  test("forward kinematics lands on reachable targets (knee and hock)", () => {
    for (const bend of [1, -1] as const)
      for (const t of [
        [0.1, 0.15, 0.2],
        [0.14, 0.2, -0.25],
        [0.05, 0.3, 0.1],
      ] as const) {
        const a = legIK(hip, [t[0], t[1], t[2]], 0.33, 0.34, bend);
        const p = legFK(hip, a, 0.33, 0.34);
        expect(p[0]).toBeCloseTo(t[0], 4);
        expect(p[1]).toBeCloseTo(t[1], 4);
        expect(p[2]).toBeCloseTo(t[2], 4);
        expect(a.clamped).toBe(false);
      }
  });
  test("a human knee bends forward (shin back), a hock the other way", () => {
    const k = legIK(hip, [0.1, 0.2, 0], 0.33, 0.34, 1);
    expect(k.knee).toBeGreaterThan(0);
    expect(k.pitch).toBeLessThan(0);
    const h = legIK(hip, [0.1, 0.2, 0], 0.33, 0.34, -1);
    expect(h.knee).toBeLessThan(0);
  });
  test("out of reach clamps to a straight leg pointing at the target", () => {
    const a = legIK(hip, [0.1, -1, 0.2], 0.33, 0.34);
    expect(a.clamped).toBe(true);
    expect(Math.abs(a.knee)).toBeLessThan(0.1);
  });
});
