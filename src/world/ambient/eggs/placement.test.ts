import { describe, expect, test } from "bun:test";
import { STATIONS } from "../../contract";
import { buildLayout, type Layout, RIVER_LEVEL } from "../../layout";
import { trailWallPlacements } from "../../trail";
import { khipuNiche, type PlaceEnv, seeded, vizcachaNooks } from "./placement";

// Mirrors content.ts STATION_FOOTPRINT (same as dev/layout-check.ts).
const FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [
    s.id,
    s.kind === "arcade"
      ? 10.5
      : s.kind === "contact"
        ? 7.5
        : s.kind === "company"
          ? 6
          : s.kind === "bridge"
            ? 0
            : s.kind === "build"
              ? 5
              : 4.5,
  ]),
);
const placeEnv = (L: Layout): PlaceEnv => ({
  heightAt: L.heightAt,
  trail: L.trail,
  stationPose: L.stationPose,
  extra: {
    isWater: (x, z) => L.streamDist(x, z) < 1.1 || L.heightAt(x, z) < RIVER_LEVEL,
    trailDistance: (x, z) => {
      const q = L.trailQuery(x, z);
      return { d: q.d, t: q.t };
    },
    stream: L.stream,
  },
});

test("seeded rng is deterministic", () => {
  const a = seeded(7);
  const b = seeded(7);
  for (let i = 0; i < 5; i++) expect(a()).toBe(b());
});

// High quality builds the layout with 280 cells, low with 190: both must give reachable eggs.
for (const cells of [280, 190]) {
  describe(`egg placement (${cells} cells)`, () => {
    const L = buildLayout({ cells, footprint: FOOTPRINT });
    const env = placeEnv(L);
    const nooks = vizcachaNooks(env);
    const niche = khipuNiche(env, nooks);
    const walls = trailWallPlacements(L, cells === 280 ? "high" : "low");

    test("five vizcachas, deterministic", () => {
      expect(nooks).toHaveLength(5);
      expect(vizcachaNooks(env)).toEqual(nooks);
    });

    test("every egg is reachable from the path, dry and outside plazas", () => {
      for (const n of [...nooks, niche]) {
        const q = L.trailQuery(n.x, n.z);
        expect(n.where).not.toContain("fallback");
        expect(q.d).toBeLessThanOrEqual(L.trail.halfWidth + 2.2);
        expect(env.extra.isWater(n.x, n.z)).toBe(false);
        // Stand-point on the path, within greeting range (XZ) of the egg.
        expect(L.walkable(n.standX, n.standZ)).toBe(true);
        expect(Math.hypot(n.standX - n.x, n.standZ - n.z)).toBeLessThan(2.5);
      }
    });

    test("no egg sits inside a curb stone or trail wall", () => {
      for (const n of nooks) for (const w of walls) expect(Math.hypot(n.x - w.x, n.z - w.z)).toBeGreaterThan(0.45);
      for (const w of walls) expect(Math.hypot(niche.x - w.x, niche.z - w.z)).toBeGreaterThan(0.75);
    });

    test("eggs are spread out", () => {
      for (let i = 0; i < nooks.length; i++)
        for (let j = i + 1; j < nooks.length; j++) {
          const a = nooks[i]!;
          const b = nooks[j]!;
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(15);
        }
    });

    test("print coordinates (for screenshots)", () => {
      const f = (v: number) => v.toFixed(1);
      for (const [i, n] of nooks.entries())
        console.log(
          `[${cells}] vizcacha-${i + 1}: (${f(n.x)}, ${f(n.y)}, ${f(n.z)}) t=${n.t.toFixed(3)} stand (${f(n.standX)}, ${f(n.standZ)}) – ${n.where}`,
        );
      console.log(
        `[${cells}] golden-khipu: (${f(niche.x)}, ${f(niche.y)}, ${f(niche.z)}) t=${niche.t.toFixed(3)} stand (${f(niche.standX)}, ${f(niche.standZ)}) – ${niche.where}`,
      );
      expect(nooks.length).toBe(5);
    });
  });
}
