import { expect, test } from "bun:test";
import { buildLayout } from "../../layout";
import { type CaveEnv, CLIFF_COLLIDER, frameFromStream, planCave, toLocal } from "./placement";

for (const cells of [280, 190]) {
  const L = buildLayout({ cells });
  const env: CaveEnv = {
    heightAt: L.heightAt,
    halfWidth: L.trail.halfWidth,
    trailDistance: (x, z) => L.trailQuery(x, z),
    isWater: (x, z) => L.streamDist(x, z) < 1.1,
  };
  const f = frameFromStream(L.heightAt, L.stream.pts[0] as [number, number], L.stream.fallDir);
  const plan = planCave(f, env);
  const loc = { x: 0, z: 0 };

  test(`cave route is a continuous walkable chain from the trail (cells ${cells})`, () => {
    const first = plan.walk[0];
    expect(first).toBeDefined();
    // Starts on the paved band (reachable from the trail).
    expect(L.walkable(first?.x ?? 0, first?.z ?? 0)).toBe(true);
    // All circles form one connected chain (overlapping by a comfortable margin).
    const reached = new Set([0]);
    const queue = [0];
    while (queue.length) {
      const a = plan.walk[queue.shift() as number];
      plan.walk.forEach((b, j) => {
        if (!a || reached.has(j) || Math.hypot(a.x - b.x, a.z - b.z) >= a.r + b.r - 0.3) return;
        reached.add(j);
        queue.push(j);
      });
    }
    expect(reached.size).toBe(plan.walk.length);
  });

  test(`cave route stays out of the cliff collider and the stream (cells ${cells})`, () => {
    for (const c of plan.walk) {
      toLocal(f, c.x, c.z, loc);
      expect(Math.hypot(loc.x - CLIFF_COLLIDER.x, loc.z - CLIFF_COLLIDER.z)).toBeGreaterThan(CLIFF_COLLIDER.r + 0.2);
      expect(env.isWater(c.x, c.z)).toBe(false);
    }
  });

  test(`stepping stones climb at a walkable grade (cells ${cells})`, () => {
    expect(plan.stones.length).toBeGreaterThan(30);
    let maxRise = 0;
    for (let i = 1; i < plan.stones.length; i++) {
      const a = plan.stones[i - 1];
      const b = plan.stones[i];
      if (!a || !b) continue;
      maxRise = Math.max(maxRise, Math.abs(b.y - a.y));
    }
    expect(maxRise).toBeLessThan(0.75);
  });

  test(`grotto floor is near level (cells ${cells})`, () => {
    const band = plan.walk.slice(-6);
    for (const c of band) expect(Math.abs(L.heightAt(c.x, c.z) - plan.floorY)).toBeLessThan(0.75);
  });
}
