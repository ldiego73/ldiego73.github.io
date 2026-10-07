import { describe, expect, test } from "bun:test";
import { CANOPY_T } from "../contract";
import { buildSelvaLayout } from "../layout";
import { mistAmount, shaftAmount } from "./atmos";
import { CLEAR, createClearance, distSeg } from "./clearance";
import { CARPET, type Inst, planScenery, SPEC, SPECIES, type Species, underCarpet } from "./placement";

// Same grids as the runtime (selva/index.ts): 280 cells on high, 190 on low.
const L = buildSelvaLayout({ cells: 280 });
const Llow = buildSelvaLayout({ cells: 190 });
const high = planScenery(L, "high");
const low = planScenery(Llow, "low");
const phone = planScenery(Llow, "low", true);
const C = createClearance(L);
const hw = L.trail.halfWidth;

const LAND: Species[] = [
  "ceiba",
  "broadleaf",
  "tiered",
  "cecropia",
  "aguaje",
  "huasai",
  "shapaja",
  "banana",
  "heliconia",
  "shrub",
  "fern",
];
const TREES: Species[] = ["broadleaf", "tiered", "cecropia", "aguaje", "huasai", "shapaja", "banana"];
const UNDER: Species[] = ["heliconia", "shrub", "fern", "reed"];
const total = (p: typeof high, list: Species[]) => list.reduce((n, s) => n + p.inst[s].length, 0);
const walkwayCeiba = (i: Inst) => high.platforms.some((p) => Math.hypot(p.x - i.x, p.z - i.z) < 0.01);

function distPath(x: number, z: number) {
  let best = Infinity;
  const pts = L.canoe.path;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i] as [number, number];
    const [bx, bz] = pts[i + 1] as [number, number];
    best = Math.min(best, distSeg(x, z, ax, az, bx, bz));
  }
  return best;
}

describe("selva scenery placement", () => {
  test("deterministic", () => {
    expect(JSON.stringify(planScenery(L, "high"))).toBe(JSON.stringify(high));
  });

  test("fills the forest; low and phones get fewer plants", () => {
    for (const s of SPECIES) expect(high.inst[s].length).toBeGreaterThan(0);
    expect(total(high, TREES)).toBeGreaterThan(1200);
    expect(total(high, UNDER)).toBeGreaterThan(4000);
    expect(total(low, TREES)).toBeLessThan(total(high, TREES));
    expect(total(low, UNDER)).toBeLessThan(total(high, UNDER));
    expect(total(phone, TREES)).toBeLessThan(total(low, TREES));
    expect(total(phone, UNDER)).toBeLessThan(total(low, UNDER));
  });

  test("land plants stand on open forest floor, clear of plazas, docks, the punku and the road", () => {
    for (const s of LAND)
      for (const i of high.inst[s]) {
        if (s === "ceiba" && walkwayCeiba(i)) continue;
        expect(L.isGround(i.x, i.z)).toBe(true);
        const kind = SPEC[s].trunk > 0 ? "tree" : "under";
        expect(C.blocked(i.x, i.z, kind)).toBe(false);
        expect(L.trailQuery(i.x, i.z).d).toBeGreaterThan(hw + 1.2);
        expect(L.isWater(i.x, i.z)).toBe(false);
      }
  });

  test("sight lines: only low plants right by the road", () => {
    for (const s of SPECIES)
      for (const i of high.inst[s]) {
        if (L.trailQuery(i.x, i.z).d >= CLEAR.roadLow || (s === "ceiba" && walkwayCeiba(i))) continue;
        expect(SPEC[s].h * i.s).toBeLessThanOrEqual(CLEAR.lowMax + 1e-6);
      }
  });

  test("no trees in the canopy walkway corridor except the walkway ceibas", () => {
    for (const s of [...TREES, "ceiba" as const])
      for (const i of high.inst[s]) {
        if (s === "ceiba" && walkwayCeiba(i)) continue;
        const q = L.trailQuery(i.x, i.z);
        if (q.t > CANOPY_T[0] && q.t < CANOPY_T[1]) expect(q.d).toBeGreaterThanOrEqual(CLEAR.canopyTree);
      }
  });

  test("nothing hidden deep under the far canopy carpet", () => {
    for (const s of ["fern", "shrub", "heliconia", "broadleaf", "cecropia"] as const)
      for (const i of high.inst[s]) expect(underCarpet(L.trailQuery(i.x, i.z).d, L.riverDist(i.x, i.z), 4)).toBe(false);
    expect(CARPET.road).toBeGreaterThan(CLEAR.roadLow);
  });

  test("water plants: lilies float on the river, out of the canoe lane and the docks", () => {
    expect(high.inst.lily.length).toBeGreaterThan(20);
    for (const i of high.inst.lily) {
      expect(L.isWater(i.x, i.z)).toBe(true);
      expect(distPath(i.x, i.z)).toBeGreaterThanOrEqual(CLEAR.canoe);
      expect(C.blocked(i.x, i.z, "water")).toBe(false);
      expect(i.y).toBeCloseTo(L.river.level + 0.03, 5);
    }
    for (const i of high.inst.reed) {
      expect(Math.abs(i.y + 0.05 - L.river.level)).toBeLessThan(1.7);
      expect(distPath(i.x, i.z)).toBeGreaterThanOrEqual(CLEAR.canoe);
      expect(L.trailQuery(i.x, i.z).d).toBeGreaterThan(hw + 3);
    }
  });

  test("sandbars sit at river bends, away from the road, docks and canoe lane", () => {
    expect(high.sandbars.length).toBeGreaterThan(3);
    for (const b of high.sandbars) {
      expect(L.riverDist(b.x, b.z)).toBeLessThan(0);
      expect(L.trailQuery(b.x, b.z).d).toBeGreaterThan(8);
      expect(distPath(b.x, b.z)).toBeGreaterThanOrEqual(CLEAR.canoe);
    }
  });

  test("colliders never cut into the road band; walkway ceibas hold platforms at deck height", () => {
    expect(high.colliders.length).toBeGreaterThan(50);
    for (const c of high.colliders) expect(L.trailQuery(c.x, c.z).d - c.r).toBeGreaterThan(hw);
    expect(high.platforms.length).toBe(3);
    for (const p of high.platforms) {
      expect(p.t).toBeGreaterThan(CANOPY_T[0]);
      expect(p.t).toBeLessThan(CANOPY_T[1]);
      expect(p.y).toBeCloseTo(L.canopyDeckAt(p.t) as number, 5);
      // High above the floor: the deck passes beside the trunk, not over the buttresses.
      expect(p.y - L.heightAt(p.x, p.z)).toBeGreaterThan(6);
      expect(high.colliders.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 0.01)).toBe(true);
    }
  });

  test("dock corridors run from each river-side plaza into the water", () => {
    expect(C.docks.length).toBe(4);
    for (const [x0, z0, x1, z1] of C.docks) {
      expect(L.plazas.some((p) => Math.hypot(p.x - x0, p.z - z0) < 0.01)).toBe(true);
      expect(L.riverDist(x1, z1)).toBeLessThan(-CLEAR.dockWater + 0.6);
    }
    const gate = L.plazas.find((p) => p.id === "puerto");
    expect(gate && C.blocked(gate.x, gate.z, "tree")).toBe(true);
    // Landmark ceiba crowns (~10 u) stay off the corridors.
    for (const i of high.inst.ceiba) {
      if (walkwayCeiba(i)) continue;
      for (const [x0, z0, x1, z1] of C.docks) expect(distSeg(i.x, i.z, x0, z0, x1, z1)).toBeGreaterThan(CLEAR.dock + 9);
    }
  });
});

describe("selva atmosphere clock", () => {
  test("river mist: thick at dawn, a veil at night, gone by day", () => {
    expect(mistAmount(0.27)).toBeGreaterThan(0.9);
    expect(mistAmount(0.0)).toBeGreaterThan(0.3);
    expect(mistAmount(0.0)).toBeLessThan(mistAmount(0.27));
    expect(mistAmount(0.5)).toBeLessThan(0.02);
  });

  test("light shafts by day only", () => {
    expect(shaftAmount(0.0)).toBe(0);
    expect(shaftAmount(0.9)).toBe(0);
    expect(shaftAmount(0.35)).toBeGreaterThan(0.4);
    expect(shaftAmount(0.5)).toBeGreaterThan(0.3);
  });
});
