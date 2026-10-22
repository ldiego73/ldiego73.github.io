import { describe, expect, test } from "bun:test";
import { chain, chainStep, dampingFor, spring, springStep } from "./spring";

describe("spring step", () => {
  test("settles on the target", () => {
    const s = spring();
    for (let i = 0; i < 300; i++) springStep(s, 1, 80, dampingFor(80, 0.7), 1 / 60);
    expect(s.x).toBeCloseTo(1, 3);
    expect(Math.abs(s.v)).toBeLessThan(1e-3);
  });
  test("critically damped never overshoots", () => {
    const s = spring();
    let max = 0;
    for (let i = 0; i < 300; i++) max = Math.max(max, springStep(s, 1, 120, dampingFor(120, 1), 1 / 60));
    expect(max).toBeLessThanOrEqual(1.0001);
  });
  test("stable on a huge frame (sub-steps)", () => {
    const s = spring();
    springStep(s, 1, 900, dampingFor(900, 0.3), 0.5);
    expect(Number.isFinite(s.x)).toBe(true);
    expect(Math.abs(s.x)).toBeLessThan(3);
  });
  test("frame-rate independent", () => {
    const a = spring();
    const b = spring();
    for (let i = 0; i < 60; i++) springStep(a, 1, 60, 6, 1 / 60);
    for (let i = 0; i < 30; i++) springStep(b, 1, 60, 6, 1 / 30);
    expect(a.x).toBeCloseTo(b.x, 2);
  });
  test("zero or negative dt does nothing", () => {
    const s = spring(0.3);
    expect(springStep(s, 1, 60, 6, 0)).toBe(0.3);
    expect(springStep(s, 1, 60, 6, -1)).toBe(0.3);
  });
});

describe("spring chain", () => {
  const drive = { accZ: 0, accX: 0, velZ: 0, pushX: 0, gainAcc: 0.05, gainVel: 0.1, rest: 0, limit: 1.2 };
  test("walking forward trails the chain back, tip lagging most", () => {
    const ch = chain(3, 60, 0.5);
    const p = [0, 0, 0];
    const r = [0, 0, 0];
    for (let i = 0; i < 20; i++) chainStep(ch, { ...drive, velZ: 1.5 }, 1 / 60, p, r);
    expect(ch.pitch[0]?.x).toBeLessThan(0);
    expect(ch.pitch[2]?.x ?? 0).toBeGreaterThan(ch.pitch[0]?.x ?? 0);
  });
  test("rests at the rest angle and respects the limit", () => {
    const ch = chain(2, 60, 0.8);
    const p = [0, 0];
    const r = [0, 0];
    for (let i = 0; i < 600; i++) chainStep(ch, { ...drive, rest: 0.3 }, 1 / 60, p, r);
    expect(ch.pitch[0]?.x).toBeCloseTo(0.3, 2);
    for (let i = 0; i < 600; i++) chainStep(ch, { ...drive, velZ: 100 }, 1 / 60, p, r);
    for (const v of p) expect(Math.abs(v)).toBeLessThanOrEqual(1.2 + 1e-9);
  });
});
