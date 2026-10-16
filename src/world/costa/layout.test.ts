import { describe, expect, test } from "bun:test";
import { COMPANIES } from "../../data/career";
import { buildCostaLayout, ROAD_HALF, SEA } from "./layout";
import { COMPANY_STOPS, COSTA_STATIONS, CULTURES, STATION, WORK } from "./plan";

const L = buildCostaLayout({ cells: 200 });
/** The runtime's step (src/world/suyu/index.ts MAX_STEP). */
const MAX_STEP = 0.9;

describe("coast plan", () => {
  test("one station per working company, in chronological order, then the market and the end", () => {
    const work = COMPANIES.filter((c) => !c.education);
    expect(COMPANY_STOPS.map((s) => s.companyId).sort()).toEqual(work.map((c) => c.id).sort());
    const starts = WORK.map((c) => Math.min(...c.stages.map((s) => Number(s.start.replace("-", "")))));
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    const ts = COMPANY_STOPS.map((s) => s.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(new Set(COMPANY_STOPS.map((s) => s.culture)).size).toBe(Math.min(COMPANY_STOPS.length, 7));
    for (const s of COMPANY_STOPS) expect(CULTURES[s.culture]).toBeDefined();
    const market = COSTA_STATIONS.find((s) => s.id === STATION.market);
    expect(market?.t).toBeGreaterThan(Math.max(...ts));
    expect(COSTA_STATIONS.find((s) => s.id === STATION.finale)?.t).toBe(1);
  });
});

describe("coast layout", () => {
  test("the road runs south to north with the sea always on the left (west)", () => {
    const a = L.trail.pointAt(0);
    const b = L.trail.pointAt(1);
    expect(a.z).toBeGreaterThan(b.z);
    expect(L.trail.length).toBeGreaterThan(650);
    for (let t = 0; t <= 1; t += 0.02) {
      const p = L.trail.pointAt(t);
      expect(L.shoreX(p.z)).toBeLessThan(p.x - 8);
      expect(L.walkable(p.x, p.z)).toBe(true);
      expect(L.isWater(p.x, p.z)).toBe(false);
      // Out to sea, west of the road, is water.
      expect(L.isWater(L.shoreX(p.z) - 40, p.z)).toBe(true);
    }
  });
  test("the road climbs gently enough to walk", () => {
    let prev = L.trail.pointAt(0);
    for (let i = 1; i <= 800; i++) {
      const p = L.trail.pointAt(i / 800);
      const run = Math.hypot(p.x - prev.x, p.z - prev.z);
      expect(Math.abs(p.y - prev.y)).toBeLessThan(Math.max(0.5, run * 0.45));
      prev = p;
    }
  });
  test("every station plaza is on dry walkable ground off the road, linked to it", () => {
    for (const s of COSTA_STATIONS) {
      const pose = L.stationPose(s.id);
      const p = pose.position;
      expect(L.walkable(p.x, p.z)).toBe(true);
      expect(L.isWater(p.x, p.z)).toBe(false);
      expect(p.y).toBeGreaterThan(SEA);
      if (s.offset > 1) {
        // A path from the road edge to the plaza.
        const q = L.trailQuery(p.x, p.z);
        const r = L.trail.pointAt(q.t);
        for (let u = 0; u <= 1; u += 0.1) {
          const x = r.x + (p.x - r.x) * u;
          const z = r.z + (p.z - r.z) * u;
          expect(L.walkable(x, z)).toBe(true);
        }
      }
    }
  });
  test("company monuments stand on flat aprons", () => {
    expect(L.aprons.length).toBeGreaterThanOrEqual(COMPANY_STOPS.length);
    for (const ap of L.aprons) {
      for (const [dx, dz] of [
        [0, 0],
        [ap.r * 0.6, 0],
        [0, -ap.r * 0.6],
        [-ap.r * 0.6, ap.r * 0.3],
      ] as const) {
        expect(Math.abs(L.heightAt(ap.x + dx, ap.z + dz) - ap.y)).toBeLessThan(0.6);
      }
    }
  });
  test("bridges carry the road over the rivers", () => {
    expect(L.bridges.length).toBe(L.rivers.length);
    for (const b of L.bridges) {
      expect(L.walkable(b.x, b.z)).toBe(true);
      expect(L.isWater(b.x, b.z)).toBe(false);
      expect(L.groundAt(b.x, b.z)).toBeGreaterThan(L.heightAt(b.x, b.z));
      // The channel runs under it.
      expect(L.riverDist(b.x, b.z)).toBeLessThan(0);
    }
  });
  test("beaches: a landing on dry sand just above the sea, walkable and reachable from the road", () => {
    for (const t of [0.8, 0.905]) {
      const p = L.beachPoint(t);
      expect(L.heightAt(p.x, p.z)).toBeGreaterThan(SEA);
      expect(L.heightAt(p.x, p.z)).toBeLessThan(1);
      expect(L.walkable(p.x + 2, p.z)).toBe(true);
      // A walk straight inland to the road never meets a wall of more than a step.
      const road = L.roadX(p.z);
      let prev = L.groundAt(p.x + 2, p.z);
      for (let x = p.x + 2; x < road; x += 0.5) {
        const y = L.groundAt(x, p.z);
        expect(Math.abs(y - prev)).toBeLessThan(MAX_STEP);
        prev = y;
      }
    }
  });
  test("the walkable strip stops at the water and the road's inland edge", () => {
    const z = L.zAt(0.6);
    const road = L.roadX(z);
    expect(L.walkable(road + ROAD_HALF + 12, z)).toBe(false);
    expect(L.walkable(L.shoreX(z) - 5, z)).toBe(false);
  });
  test("islets rise out of the sea; the guano island is offshore", () => {
    for (const i of L.islets) expect(L.heightAt(i.x, i.z)).toBeGreaterThan(1);
    const g = L.islets.find((i) => i.id === "guano");
    expect(g).toBeDefined();
    if (g) expect(L.shoreDist(g.x, g.z)).toBeLessThan(-80);
  });
});
