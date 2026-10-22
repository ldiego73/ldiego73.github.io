import { describe, expect, test } from "bun:test";
import {
  calmAt,
  createSpringField,
  emptyWindState,
  gustAt,
  MAX_KICKS,
  MAX_PUSHERS,
  packWind,
  pickPushers,
  pushRadius,
  STILL,
  WIND_SLOT,
  type WindProfile,
  windAt,
  windState,
} from "./wind";

const P: WindProfile = {
  dir: 0.6,
  strength: 1,
  drift: 0.3,
  gust: { amp: 1, length: 30, speed: 8, sharp: 3 },
  flutter: 1,
};

describe("wind state", () => {
  test("direction is a unit vector that drifts slowly around the base", () => {
    const a = windState(P, 0, false);
    expect(Math.hypot(a.dirX, a.dirZ)).toBeCloseTo(1, 6);
    for (let t = 0; t < 2000; t += 37) {
      const s = windState(P, t, false);
      const ang = Math.atan2(s.dirZ, s.dirX);
      expect(Math.abs(ang - P.dir)).toBeLessThanOrEqual(P.drift + 1e-9);
    }
  });
  test("reduced motion: no gusts, no flutter, slower clock, fixed direction", () => {
    const s = windState(P, 100, true);
    expect(s.gustAmp).toBe(0);
    expect(s.flutter).toBe(0);
    expect(s.time).toBeLessThan(100);
    // The direction stays where it was at t = 0 (no drift).
    const s2 = windState(P, 900, true);
    expect(Math.atan2(s2.dirZ, s2.dirX)).toBeCloseTo(Math.atan2(s.dirZ, s.dirX), 9);
    expect(gustAt(s, 3, 4)).toBe(0);
    expect(s.strength).toBeGreaterThan(0);
  });
  test("still air packs zeros the shaders read as no wind", () => {
    const u = new Float32Array(13 * 4);
    packWind(windState(STILL, 50, false), u);
    expect(u[WIND_SLOT.W0 * 4 + 2]).toBe(0);
    expect(u[WIND_SLOT.W1 * 4]).toBe(0);
  });
});

describe("gusts", () => {
  test("bounded by the amplitude and travel downwind at the profile speed", () => {
    const s0 = windState({ ...P, drift: 0 }, 0, false);
    let max = 0;
    for (let x = -100; x <= 100; x += 0.7) max = Math.max(max, gustAt(s0, x, 0));
    expect(max).toBeLessThanOrEqual(P.gust.amp + 1e-9);
    expect(max).toBeGreaterThan(P.gust.amp * 0.5);
    // The pattern at time t, shifted downwind by speed × t, matches the pattern at time 0 (cross = 0 line;
    // only the slow wobble of the fronts, 0.05 rad/s, differs).
    const t = 0.5;
    const s1 = windState({ ...P, drift: 0 }, t, false);
    const d = P.gust.speed * t;
    for (const a of [-20, -3, 0, 5, 17]) {
      const g0 = gustAt(s0, a * s0.dirX, a * s0.dirZ);
      const g1 = gustAt(s1, (a + d) * s1.dirX, (a + d) * s1.dirZ);
      expect(Math.abs(g1 - g0)).toBeLessThan(0.02);
    }
  });
  test("windAt follows direction, gust and the calm band", () => {
    const calm: WindProfile = { ...P, calm: { below: 5, above: 15, k: 0.3 } };
    const s = windState(calm, 10, false);
    const lo = windAt(s, 4, 2, 0);
    const hi = windAt(s, 4, 2, 20);
    expect(hi.speed / lo.speed).toBeCloseTo(1 / 0.3, 4);
    expect(lo.x / lo.speed).toBeCloseTo(s.dirX, 6);
    expect(calmAt(s)).toBe(1);
    expect(calmAt(emptyWindState(), -50)).toBe(1);
  });
});

describe("pushers", () => {
  test("nearest solid bodies within range, sorted, rest zeroed", () => {
    const bodies = [
      { x: 1, z: 0, r: 0.4, solid: true },
      { x: 50, z: 0, r: 0.4, solid: true },
      { x: 0.5, z: 0, r: 0.6, solid: false },
      { x: -3, z: 0, r: 0.5, solid: true },
    ];
    const out = new Float32Array(MAX_PUSHERS * 4).fill(9);
    const n = pickPushers(bodies, 0, 0, out);
    expect(n).toBe(2);
    expect([out[0], out[1], out[2], out[3]]).toEqual([1, 0, Math.fround(pushRadius(0.4)), 1]);
    expect(out[4]).toBe(-3);
    expect(out[8]).toBe(0);
    expect(out[MAX_PUSHERS * 4 - 1]).toBe(0);
  });
  test("keeps only the closest MAX_PUSHERS", () => {
    const bodies = Array.from({ length: 40 }, (_, i) => ({ x: 40 - i, z: 0, r: 0.3, solid: true }));
    const out = new Float32Array(MAX_PUSHERS * 4);
    expect(pickPushers(bodies, 0, 0, out)).toBe(MAX_PUSHERS);
    expect(out[0]).toBe(1);
    expect(out[(MAX_PUSHERS - 1) * 4]).toBe(MAX_PUSHERS);
  });
});

describe("spring kicks", () => {
  test("a mover brushing a tree kicks it along its velocity, then it settles", () => {
    const f = createSpringField();
    const off = f.add([{ x: 0, z: 0, r: 0.4 }]);
    const mover = { x: -0.5, z: 0, vx: 4, vz: 0, r: 0.4 };
    for (let i = 0; i < 6; i++) f.step(1 / 60, [mover]);
    const out = new Float32Array(MAX_KICKS * 4);
    expect(f.pack(out, 0, 0)).toBe(1);
    expect(out[2]).toBeGreaterThan(0);
    mover.x = 30;
    for (let i = 0; i < 60 * 20; i++) f.step(1 / 60, [mover]);
    expect(f.active()).toBe(0);
    off();
    f.step(1 / 60, [{ x: 0, z: 0, vx: 4, vz: 0, r: 0.4 }]);
    expect(f.active()).toBe(0);
  });
  test("slow movers and far trees do nothing; offsets stay bounded", () => {
    const f = createSpringField();
    f.add([
      { x: 0, z: 0, r: 0.4 },
      { x: 10, z: 0, r: 0.4 },
    ]);
    f.step(1 / 60, [{ x: 0, z: 0, vx: 0.1, vz: 0, r: 0.4 }]);
    expect(f.active()).toBe(0);
    for (let i = 0; i < 300; i++) f.step(1 / 60, [{ x: 0, z: 0, vx: 40, vz: 0, r: 0.4 }]);
    const out = new Float32Array(MAX_KICKS * 4);
    f.pack(out, 0, 0);
    expect(Math.hypot(out[2] as number, out[3] as number)).toBeLessThanOrEqual(0.55 + 1e-6);
    expect(f.active()).toBe(1);
  });
});
