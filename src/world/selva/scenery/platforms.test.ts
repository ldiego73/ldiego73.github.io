import { describe, expect, test } from "bun:test";
import { buildSelvaLayout } from "../layout";
import { planScenery } from "./placement";
import { canopyPlatforms, onCanopyPlatform, platformY, railGap, rimOutside, ringSpan } from "./platforms";

const L = buildSelvaLayout({ cells: 190 });
const hw = L.trail.halfWidth;
const len = L.trail.length;
const list = canopyPlatforms(L);
/** Runtime constants (selva/index.ts): body radius and the highest step a walker takes. */
const BODY_R = 0.42;
const MAX_STEP = 0.9;
/** Rim colliders as ambient/canopy-platforms.ts registers them. */
const rim = list.flatMap((p) => {
  const n = Math.ceil((Math.PI * 2 * p.outer) / 0.45);
  return Array.from({ length: n }, (_, k) => (k / n) * Math.PI * 2)
    .filter((a) => rimOutside(L, p, a))
    .map((a) => ({ x: p.x + Math.cos(a) * p.outer, z: p.z + Math.sin(a) * p.outer, r: 0.25 }));
});

describe("canopy platforms", () => {
  test("the scenery plants its walkway ceibas exactly where the platforms are", () => {
    const plan = planScenery(L, "low");
    expect(plan.platforms.length).toBe(list.length);
    for (const [i, p] of list.entries()) {
      const q = plan.platforms[i] as (typeof plan.platforms)[number];
      expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThan(1e-9);
      expect(q.y).toBeCloseTo(p.y, 9);
      // The trunk is a collider and stands just outside the bridge band.
      expect(plan.colliders.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 1e-9 && c.r === p.trunk)).toBe(true);
      expect(L.trailQuery(p.x, p.z).d - p.trunk).toBeGreaterThan(hw);
    }
  });

  test("the deck agrees with the walkway wherever they overlap (no step onto or off the ring)", () => {
    for (const p of list)
      for (let a = 0; a < Math.PI * 2; a += 0.1)
        for (let r = p.trunk; r <= p.outer; r += 0.25) {
          const x = p.x + Math.cos(a) * r;
          const z = p.z + Math.sin(a) * r;
          if (L.trailQuery(x, z).d <= hw) expect(platformY(L, x, z)).toBeCloseTo(L.groundAt(x, z), 6);
        }
  });

  test("ring planks stop at the bridge band; rim colliders never squeeze the bridge", () => {
    for (const p of list) {
      for (let a = 0; a < Math.PI * 2; a += 0.05) {
        const [r0, r1] = ringSpan(L, p, a);
        for (let r = r0; r < r1 - 0.05; r += 0.1)
          expect(L.trailQuery(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r).d).toBeGreaterThan(hw - 0.1);
      }
    }
    for (const c of rim) expect(L.trailQuery(c.x, c.z).d - c.r - BODY_R).toBeGreaterThan(hw);
  });

  test("the railing opens on the tree's side around each trunk", () => {
    for (const p of list) {
      const [t0, t1] = railGap(L, p);
      expect(t0).toBeLessThan(p.t);
      expect(t1).toBeGreaterThan(p.t);
      // Wide enough to step through on both sides of the trunk.
      expect((p.t - t0) * len).toBeGreaterThan(p.trunk + 1.5);
      expect((t1 - p.t) * len).toBeGreaterThan(p.trunk + 1.5);
    }
  });

  test("walking: from the bridge onto the ring, round the back of the trunk and off the other side", () => {
    // BFS on a 0.2 u grid over walkable cells (bridge band or ring deck, clear of trunk and rim colliders),
    // with steps between neighbours no higher than MAX_STEP.
    const cols = [...list.map((p) => ({ x: p.x, z: p.z, r: p.trunk })), ...rim];
    for (const p of list) {
      const h = 0.2;
      const span = p.outer + 4;
      const n = Math.ceil((span * 2) / h);
      const at = (i: number, j: number): [number, number] => [p.x - span + i * h, p.z - span + j * h];
      const y = (x: number, z: number) => {
        const onBand = L.trailQuery(x, z).d <= hw;
        const onRing = onCanopyPlatform([p], x, z);
        if (!onBand && !onRing) return null;
        if (cols.some((c) => Math.hypot(x - c.x, z - c.z) < c.r + BODY_R)) return null;
        return onRing ? platformY(L, x, z) : L.groundAt(x, z);
      };
      const cell = (x: number, z: number) => [Math.round((x - p.x + span) / h), Math.round((z - p.z + span) / h)];
      const seen = new Uint8Array(n * n);
      const [si, sj] = cell(
        ...(() => {
          const q = L.trail.pointAt(p.t - 6 / len);
          return [q.x, q.z] as [number, number];
        })(),
      ) as [number, number];
      const queue: Array<[number, number]> = [[si, sj]];
      seen[sj * n + si] = 1;
      while (queue.length) {
        const [i, j] = queue.shift() as [number, number];
        const ya = y(...at(i, j)) as number;
        for (const [di, dj] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const a = i + (di as number);
          const b = j + (dj as number);
          if (a < 0 || b < 0 || a >= n || b >= n || seen[b * n + a]) continue;
          const yb = y(...at(a, b));
          if (yb === null || yb - ya > MAX_STEP) continue;
          seen[b * n + a] = 1;
          queue.push([a, b]);
        }
      }
      // Behind the trunk (away from the road) on the ring, and the bridge past the tree.
      const q = L.trail.pointAt(p.t);
      const away = Math.atan2(p.z - q.z, p.x - q.x);
      const [bi, bj] = cell(p.x + Math.cos(away) * 3.4, p.z + Math.sin(away) * 3.4) as [number, number];
      expect(seen[bj * n + bi]).toBe(1);
      const e = L.trail.pointAt(p.t + 6 / len);
      const [ei, ej] = cell(e.x, e.z) as [number, number];
      expect(seen[ej * n + ei]).toBe(1);
    }
  });
});
