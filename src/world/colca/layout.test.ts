import { describe, expect, test } from "bun:test";
import { gateOf } from "../cusco/plan";
import { resolveSpawn } from "../suyu/arrival";
import { buildColcaLayout, canyonY, plazaCenter, terrainY } from "./layout";
import { ARRIVE_T, CANYON, COLCA_STATIONS, canyonS, ROAD, ROAD_HALF, roadAt, STATION_T, TOWER } from "./plan";

/** The suyu runtime's step limit (src/world/suyu/index.ts MAX_STEP). */
const MAX_STEP = 0.9;

describe("Kuntisuyu plan", () => {
  test("the road runs from the punku to the Cruz del Cóndor and never enters the canyon", () => {
    expect(ROAD.length).toBeGreaterThan(1000);
    for (const [x, z] of ROAD.pts) expect(canyonS(x, z)).toBeLessThan(-5);
    // The rim stretch keeps close to the edge (the canyon right beside it).
    for (let t = 0; t < 0.36; t += 0.02) {
      const r = roadAt(t);
      expect(canyonS(r.x, r.z)).toBeGreaterThan(-16);
    }
    expect(canyonS(roadAt(1).x, roadAt(1).z)).toBeGreaterThan(-25);
  });

  test("stations are ordered along the road; the punku stamps nothing, Cahuachi is a bonus", () => {
    const ts = COLCA_STATIONS.map((s) => s.t);
    expect([...ts].sort((a, b) => a - b)).toEqual(ts);
    expect(COLCA_STATIONS.find((s) => s.id === "punku")?.stamp).toBe(false);
    expect(COLCA_STATIONS.find((s) => s.id === "cahuachi")?.stamp).toBe("egg");
    expect(STATION_T.cruz).toBe(1);
  });

  test("the canyon is deep: terraced upper slopes, the river far below the rim", () => {
    expect(canyonY(0, 2, 12)).toBe(2);
    expect(canyonY(CANYON.river, 2, 12)).toBeLessThan(CANYON.riverY);
    expect(canyonY(CANYON.south, 2, 12)).toBeCloseTo(12, 5);
    let prev = Infinity;
    for (let s = 0; s <= CANYON.river; s += 5) {
      const y = canyonY(s, 2, 12);
      expect(y).toBeLessThanOrEqual(prev + 1e-9);
      prev = y;
    }
    expect(terrainY(0, 30 + 150)).toBeLessThan(-150);
  });

  test("the Kuntisuyu gate in Qusqu is open and arrivals from it land at the punku", () => {
    expect(gateOf("colca")?.available).toBe(true);
    expect(gateOf("colca")?.pages).toEqual(["colca"]);
    const spawn = { default: { t: ARRIVE_T }, from: { cusco: { t: ARRIVE_T } } };
    expect(resolveSpawn(spawn, "?from=cusco", "colca").point).toEqual({ t: ARRIVE_T });
    // Out of the punku's prompt range (3.6 u).
    expect(ARRIVE_T * ROAD.length).toBeGreaterThan(5);
  });
});

describe("Kuntisuyu layout", () => {
  const L = buildColcaLayout({ cells: 120 });

  test("the road and every plaza are walkable; the canyon is not", () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const p = L.trail.pointAt(t);
      expect(L.walkable(p.x, p.z)).toBe(true);
    }
    for (const pl of L.plazas) expect(L.walkable(pl.x, pl.z)).toBe(true);
    const r = roadAt(0.2);
    expect(L.walkable(r.x, r.z + 30)).toBe(false);
    expect(L.isGround(r.x, r.z + 30)).toBe(false);
  });

  test("the road climbs gently (no step a walker can't take)", () => {
    const d = 1 / ROAD.length;
    for (let t = 0; t < 1; t += d) {
      const a = L.roadY(t);
      const b = L.roadY(t + d);
      expect(Math.abs(b - a)).toBeLessThan(MAX_STEP * 0.5);
    }
  });

  test("water is only the river at the bottom of the canyon", () => {
    const r = roadAt(0.25);
    expect(L.isWater(r.x, r.z)).toBe(false);
    expect(L.waterDist(r.x, r.z)).toBeGreaterThan(100);
    const s = canyonS(r.x, r.z);
    expect(L.isWater(r.x, r.z - s + CANYON.river)).toBe(true);
  });

  test("station poses sit on their plazas; the pampa is low and the tower stands off the road", () => {
    for (const s of COLCA_STATIONS) {
      const p = L.stationPose(s.id).position;
      const c = plazaCenter(s.id as keyof typeof STATION_T);
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeLessThan(0.01);
      expect(Number.isFinite(p.y)).toBe(true);
    }
    expect(L.plaza("nazca").y).toBeLessThan(-15);
    expect(L.trailQuery(TOWER.x, TOWER.z).d).toBeGreaterThan(ROAD_HALF + TOWER.half + 5);
    expect(L.plaza("cruz").y).toBeGreaterThan(-2);
  });
});
