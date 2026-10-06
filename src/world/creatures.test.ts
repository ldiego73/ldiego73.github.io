import { describe, expect, test } from "bun:test";
import { createCreatureRegistry } from "./creatures";

const v = { x: 0, z: 0 };

describe("creatures.resolve", () => {
  test("pushes a body out of a solid one", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("vicuna", 0.5, { x: 0, z: 0 });
    const b = reg.add("alpaca", 0.5, { x: 0.6, z: 0 });
    expect(reg.resolve(a)).toBe(true);
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(1, 5);
  });

  test("ignores non-solid bodies", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("traveler", 0.4);
    reg.add("condor", 0.8, { solid: false, x: 0.1 });
    expect(reg.resolve(a)).toBe(false);
    expect(a.x).toBe(0);
  });

  test("an immovable body does not yield; a yielding one takes the whole push", () => {
    const reg = createCreatureRegistry();
    const bear = reg.add("bear", 0.7, { give: 0, x: 0 });
    const fox = reg.add("fox", 0.4, { x: 0.8 });
    expect(reg.resolve(bear)).toBe(false);
    reg.resolve(fox);
    expect(fox.x).toBeCloseTo(1.1, 5);
  });

  test("a stiff body yields only its share against a soft one", () => {
    const reg = createCreatureRegistry();
    const stiff = reg.add("puma", 0.5, { give: 0.25, x: 0 });
    reg.add("vicuna", 0.5, { x: 0.6 });
    reg.resolve(stiff);
    expect(stiff.x).toBeCloseTo(-0.1, 5);
  });

  test("never moves onto rejected ground (tries each axis, else stays)", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("vicuna", 0.5, { x: 0, z: 0 });
    reg.add("vicuna", 0.5, { x: 0.5, z: 0.5 });
    // A wall at x < -0.05: only the z part of the push is allowed.
    expect(reg.resolve(a, (x) => x > -0.05)).toBe(true);
    expect(a.x).toBe(0);
    expect(a.z).toBeLessThan(0);
    const c = reg.add("llama", 0.5, { x: 3, z: 3 });
    reg.add("llama", 0.5, { x: 3.2, z: 3 });
    expect(reg.resolve(c, () => false)).toBe(false);
    expect(c.x).toBe(3);
  });

  test("the push per call is clamped", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("bear", 2, { x: 0 });
    reg.add("bear", 2, { x: 0.1, give: 0 });
    reg.resolve(a, undefined, 0.3);
    expect(Math.abs(a.x)).toBeCloseTo(0.3, 5);
  });
});

describe("creatures.steer", () => {
  test("leaves the velocity alone with nothing ahead", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("vicuna", 0.5);
    reg.add("vicuna", 0.5, { x: -3, z: 0 }); // behind
    reg.add("vicuna", 0.5, { x: 2, z: 4 }); // well to the side
    reg.steer(a, 1, 0, 1, v);
    expect(v.x).toBe(1);
    expect(v.z).toBe(0);
  });

  test("bends around a body dead ahead and slows when close", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("vicuna", 0.5);
    reg.add("vicuna", 0.5, { x: 1.4, z: 0.1 });
    reg.steer(a, 1, 0, 1, v);
    // Obstacle slightly to the left (+z): pass on the right (-z).
    expect(v.z).toBeLessThan(-0.2);
    expect(Math.hypot(v.x, v.z)).toBeLessThan(1);
  });

  test("walking toward a goal behind a body: goes around it, never overlapping", () => {
    const reg = createCreatureRegistry();
    const a = reg.add("alpaca", 0.5, { x: 0, z: 0 });
    const o = reg.add("vicuna", 0.55, { x: 4, z: 0.05 });
    const goal = { x: 8, z: 0 };
    let minGap = Infinity;
    for (let i = 0; i < 2000; i++) {
      const dx = goal.x - a.x;
      const dz = goal.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.05) break;
      const sp = Math.min(1.2, d * 2);
      reg.steer(a, (dx / d) * sp, (dz / d) * sp, 1, v);
      a.x += v.x * 0.02;
      a.z += v.z * 0.02;
      reg.resolve(a);
      minGap = Math.min(minGap, Math.hypot(a.x - o.x, a.z - o.z) - (a.r + o.r));
    }
    expect(Math.hypot(goal.x - a.x, goal.z - a.z)).toBeLessThan(0.1);
    expect(minGap).toBeGreaterThan(-0.03);
  });

  test("two herds crossing paths do not interpenetrate", () => {
    const reg = createCreatureRegistry();
    const left = [0, 1, 2].map((k) => reg.add("vicuna", 0.55, { x: -6, z: k * 1.4 - 1.4 }));
    const right = [0, 1, 2].map((k) => reg.add("alpaca", 0.5, { x: 6, z: k * 1.4 - 1.2 }));
    let minGap = Infinity;
    for (let i = 0; i < 900; i++) {
      for (const [list, dir] of [
        [left, 1],
        [right, -1],
      ] as const)
        for (const b of list) {
          reg.steer(b, dir * 1.1, 0, 0.8, v);
          b.x += v.x * 0.02;
          b.z += v.z * 0.02;
          reg.resolve(b);
        }
      for (const a of left)
        for (const b of right) minGap = Math.min(minGap, Math.hypot(a.x - b.x, a.z - b.z) - (a.r + b.r));
    }
    expect(minGap).toBeGreaterThan(-0.05);
    // They got past each other.
    expect(Math.min(...left.map((b) => b.x))).toBeGreaterThan(0);
  });
});

describe("creatures.park", () => {
  test("a parked body is never solid nor the nearest of its kind", async () => {
    const { park, isParked } = await import("./creatures");
    const reg = createCreatureRegistry();
    const a = reg.add("puma", 0.6);
    const b = reg.add("puma", 0.6, { x: 50, z: 50 });
    park(a);
    expect(isParked(a)).toBe(true);
    expect(a.solid).toBe(false);
    expect(reg.nearestOf("puma", 0, 0)).toBe(b);
    park(b);
    expect(reg.nearestOf("puma", 0, 0)).toBe(null);
  });
});
