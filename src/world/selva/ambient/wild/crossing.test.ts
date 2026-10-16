/** Road crossings, the single-file trail and the small timing helpers of the crossing animals. */
import { describe, expect, test } from "bun:test";
import { buildSelvaLayout } from "../../layout";
import { crossingPlan, duskToDawn, RoadTracker, ranks, SpeedMeter, stagger, Trail } from "./crossing";
import { rng } from "./logic";

const L = buildSelvaLayout({ cells: 128 });

describe("SpeedMeter", () => {
  test("reads walking and running speeds and ignores teleports", () => {
    const m = new SpeedMeter();
    for (let i = 0; i <= 120; i++) m.update(i * 3.5 * 0.05, 0, 0.05);
    expect(m.speed).toBeCloseTo(3.5, 1);
    expect(m.running).toBe(false);
    for (let i = 0; i <= 120; i++) m.update(21 + i * 7 * 0.05, 0, 0.05);
    expect(m.running).toBe(true);
    const before = m.speed;
    m.update(5000, 0, 0.05);
    expect(m.speed).toBe(before);
  });
});

describe("RoadTracker", () => {
  test("follows the heading along the road", () => {
    const tr = new RoadTracker(0.1);
    const nearest = (x: number, z: number) => L.trail.nearestT(x, z);
    for (let k = 0; k < 6; k++) {
      const p = L.trail.pointAt(0.5 - k * 0.01);
      tr.update(nearest, p.x, p.z, 0.2);
    }
    expect(tr.dir).toBe(-1);
    expect(tr.t).toBeCloseTo(0.45, 2);
  });
});

describe("crossingPlan", () => {
  const stations = [0.02, 0.15, 0.3, 0.42, 0.6, 0.76, 0.97];
  const canopy = [0.83, 0.9] as const;

  test("lands ahead of the traveler on a quiet stretch, both ends off the road and dry", () => {
    const R = rng(7);
    let found = 0;
    for (let t = 0.05; t < 0.95; t += 0.05) {
      const c = crossingPlan(L, { t, dir: 1, ahead: [20, 30], off: 14, stations, canopy }, R);
      if (!c) continue;
      found++;
      expect(c.t).toBeGreaterThan(t);
      expect((c.t - t) * L.trail.length).toBeLessThanOrEqual(30.001);
      for (const s of stations) expect(Math.abs(c.t - s)).toBeGreaterThan(0.04);
      expect(c.t < canopy[0] - 0.04 || c.t > canopy[1] + 0.04).toBe(true);
      expect(L.isWater(c.ax, c.az)).toBe(false);
      expect(L.isWater(c.bx, c.bz)).toBe(false);
      expect(L.trailQuery(c.ax, c.az).d).toBeGreaterThan(12);
      expect(L.trailQuery(c.bx, c.bz).d).toBeGreaterThan(12);
      expect(L.trailQuery(c.mx, c.mz).d).toBeLessThan(0.5);
    }
    expect(found).toBeGreaterThan(5);
  });

  test("starts on the requested side (−1 = river side)", () => {
    const c = crossingPlan(L, { t: 0.5, dir: 1, ahead: [20, 20], off: 14, stations, canopy, side: -1 }, rng(3));
    expect(c).not.toBeNull();
    if (!c) return;
    expect(L.riverDist(c.ax, c.az)).toBeLessThan(L.riverDist(c.bx, c.bz));
  });

  test("honours the blocked predicate and the heading", () => {
    expect(
      crossingPlan(L, { t: 0.5, dir: 1, ahead: [20, 30], off: 14, stations, canopy, blocked: () => true }, rng(1)),
    ).toBeNull();
    const c = crossingPlan(L, { t: 0.55, dir: -1, ahead: [20, 30], off: 14, stations, canopy }, rng(9));
    if (c) expect(c.t).toBeLessThan(0.55);
  });
});

describe("Trail", () => {
  test("followers sit the asked distance back along the leader's path", () => {
    const tr = new Trail(0.2, 20);
    tr.reset(0, 0, 0); // facing +Z, straight tail behind along −Z
    const o = { x: 0, z: 0, yaw: 0 };
    tr.at(0, 0, 3, o);
    expect(o.x).toBeCloseTo(0, 5);
    expect(o.z).toBeCloseTo(-3, 5);
    expect(o.yaw).toBeCloseTo(0, 5);
    // The leader turns right (+X) and walks 5 u: a follower 3 u back is on the new leg, one 7 u back on the old.
    for (let x = 0.1; x <= 5.0001; x += 0.1) tr.push(x, 0);
    tr.at(5, 0, 3, o);
    expect(o.x).toBeCloseTo(2, 1);
    expect(o.z).toBeCloseTo(0, 5);
    expect(o.yaw).toBeCloseTo(Math.PI / 2, 5);
    tr.at(5, 0, 7, o);
    expect(o.x).toBeCloseTo(0, 1);
    expect(o.z).toBeCloseTo(-2, 1);
  });

  test("stays bounded and clamps to the oldest point", () => {
    const tr = new Trail(0.5, 5);
    for (let i = 0; i < 1000; i++) tr.push(i * 0.5, 0);
    expect(tr.length).toBeLessThanOrEqual(12);
    const o = { x: 0, z: 0, yaw: 0 };
    tr.at(499.5, 0, 100, o);
    expect(o.x).toBeGreaterThan(490);
  });
});

describe("timing helpers", () => {
  test("ranks orders by distance, stable on ties", () => {
    expect(ranks([5, 1, 3, 1])).toEqual([3, 0, 2, 1]);
  });
  test("stagger grows with rank", () => {
    const R = rng(2);
    expect(stagger(0, 0.5, 0.2, R)).toBeLessThan(0.21);
    expect(stagger(3, 0.5, 0.2, R)).toBeGreaterThanOrEqual(1.5);
  });
  test("duskToDawn: off at noon, on at midnight, ramps at dusk and dawn", () => {
    expect(duskToDawn(0.5)).toBe(0);
    expect(duskToDawn(0.4)).toBe(0);
    expect(duskToDawn(0)).toBe(1);
    expect(duskToDawn(0.9)).toBe(1);
    expect(duskToDawn(0.715)).toBeGreaterThan(0.3);
    expect(duskToDawn(0.715)).toBeLessThan(0.7);
    expect(duskToDawn(0.275)).toBeGreaterThan(0.3);
  });
});
