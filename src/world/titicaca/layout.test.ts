import { describe, expect, test } from "bun:test";
import { buildTiticacaLayout, landField, onTerraces, terraceCone } from "./layout";
import {
  boardwalks,
  DEFAULT_T,
  DOCKS,
  FLAMINGO_BAY,
  FROG_SPOT,
  HERDS,
  HOUSES,
  ISLAND_Y,
  ISLANDS,
  LEVEL,
  ROAD_HALF,
  TAQUILE,
  TERRACE_HILLS,
  TITICACA_STATIONS,
  TITIKALA,
  UROS_LANDING,
} from "./plan";

const L = buildTiticacaLayout({ cells: 150 });

describe("Collasuyu plan", () => {
  test("one island per skill group, apart from each other and out on the water", () => {
    expect(ISLANDS.length).toBeGreaterThan(0);
    expect(new Set(ISLANDS.map((i) => i.id)).size).toBe(ISLANDS.length);
    for (const a of ISLANDS) {
      expect(landField(a.x, a.z)).toBeLessThan(-a.r - 6);
      for (const b of ISLANDS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r + 4);
    }
    // Island floors and the boardwalk are within one step of each other (the runtime's MAX_STEP is 0.9).
    expect(ISLAND_Y - LEVEL).toBeLessThan(0.9);
  });

  test("every station id is unique; gates and landings stamp nothing", () => {
    const ids = TITICACA_STATIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["punku", "uros", "muelle", "titikala"])
      expect(TITICACA_STATIONS.find((s) => s.id === id)?.stamp).toBe(false);
  });

  test("the boardwalk runs over water from the landing to the hub and on to each island", () => {
    const walks = boardwalks();
    expect(walks.length).toBe(ISLANDS.length);
    const [first] = walks;
    expect(first?.[0][0]).toBeCloseTo(UROS_LANDING.x, 6);
    for (const [a, b] of walks)
      for (let u = 0.2; u <= 0.8; u += 0.1) {
        const x = a[0] + (b[0] - a[0]) * u;
        const z = a[1] + (b[1] - a[1]) * u;
        expect(landField(x, z)).toBeLessThan(0);
      }
  });

  test("life is placed where it belongs", () => {
    for (const h of Object.values(HERDS)) expect(landField(h.x, h.z)).toBeGreaterThan(10);
    expect(landField(FLAMINGO_BAY.x, FLAMINGO_BAY.z)).toBeLessThan(0);
    expect(landField(FROG_SPOT.x, FROG_SPOT.z)).toBeLessThan(-2);
    for (const h of HOUSES) expect(landField(h.x, h.z)).toBeGreaterThan(10);
  });
});

describe("Collasuyu layout", () => {
  test("the road stays on dry land, with the lake on its north side", () => {
    for (let i = 0; i <= 200; i++) {
      const t = i / 200;
      const p = L.trail.pointAt(t);
      const tg = L.trail.tangentAt(t);
      for (const s of [-1, 1]) {
        const x = p.x - tg.z * s * ROAD_HALF;
        const z = p.z + tg.x * s * ROAD_HALF;
        expect(landField(x, z)).toBeGreaterThan(2);
        expect(L.walkable(x * 0.85 + p.x * 0.15, z * 0.85 + p.z * 0.15)).toBe(true);
      }
      expect(p.y).toBeGreaterThan(LEVEL);
    }
    expect(L.trail.length).toBeGreaterThan(500);
  });

  test("land plazas are dry and walkable, their spurs too; the islands are plazas on the water", () => {
    for (const pl of L.plazas) {
      const isl = ISLANDS.find((i) => i.id === pl.id);
      if (isl) {
        expect(pl.y).toBe(ISLAND_Y);
        expect(L.isWater(pl.x, pl.z)).toBe(true);
        continue;
      }
      expect(L.walkable(pl.x, pl.z)).toBe(true);
      expect(L.heightAt(pl.x, pl.z)).toBeGreaterThan(LEVEL);
    }
    for (const sp of L.spurs)
      for (let u = 0; u <= 1; u += 0.05) {
        const x = sp.a[0] + (sp.b[0] - sp.a[0]) * u;
        const z = sp.a[1] + (sp.b[1] - sp.a[1]) * u;
        expect(L.walkable(x, z)).toBe(true);
        expect(L.isWater(x, z)).toBe(false);
      }
    expect(L.plazas.find((p) => p.id === "taquile")?.y).toBeGreaterThan(8);
  });

  test("every station has a pose; the water is never walkable", () => {
    for (const s of TITICACA_STATIONS) {
      const pose = L.stationPose(s.id);
      expect(Number.isFinite(pose.position.x + pose.position.y + pose.position.z + pose.yaw)).toBe(true);
    }
    expect(() => L.stationPose("nope")).toThrow();
    const isl = ISLANDS[0];
    if (isl) expect(L.walkable(isl.x + isl.r + 4, isl.z)).toBe(false);
    expect(L.walkable(0, -200)).toBe(false);
  });

  test("open ground for animals and plants excludes paths, water and terraces", () => {
    const p = L.trail.pointAt(0.5);
    expect(L.isGround(p.x, p.z)).toBe(false);
    expect(L.isGround(0, -200)).toBe(false);
    const hill = TERRACE_HILLS[0];
    if (hill) {
      expect(onTerraces(hill.x, hill.z)).toBe(true);
      expect(L.isGround(hill.x, hill.z)).toBe(false);
      expect(terraceCone(hill.x, hill.z)).toBeGreaterThan(0);
    }
    let found = 0;
    for (let x = -300; x < 300; x += 20) if (L.isGround(x, 70)) found++;
    expect(found).toBeGreaterThan(10);
  });

  test("Taquile is a hill, the Isla del Sol a headland where the road ends, the piers start on land", () => {
    expect(L.heightAt(TAQUILE.x, TAQUILE.z)).toBeGreaterThan(8);
    expect(Math.hypot(L.end.x - TITIKALA.x, L.end.z - TITIKALA.z)).toBeLessThan(TITIKALA.r + 15);
    expect(landField(DOCKS.taquile.landX, DOCKS.taquile.landZ)).toBeGreaterThan(2);
    expect(landField(DOCKS.taquile.x, DOCKS.taquile.z)).toBeLessThan(0);
    expect(landField(DOCKS.uros.x, DOCKS.uros.z)).toBeLessThan(0);
  });

  test("the spawn is on the road near its start", () => {
    const p = L.trail.pointAt(DEFAULT_T);
    expect(L.walkable(p.x, p.z)).toBe(true);
    expect(L.trailQuery(p.x, p.z).d).toBeLessThan(0.5);
  });

  test("heightAt samples the grid it was built from", () => {
    const { n, size, h } = L.grid;
    const step = size / n;
    for (const [i, j] of [
      [10, 10],
      [n / 2, n / 3],
      [n - 3, 7],
    ] as const) {
      const x = L.bounds.x0 + Math.round(i) * step;
      const z = L.bounds.z0 + Math.round(j) * step;
      expect(L.heightAt(x, z)).toBeCloseTo(h[Math.round(j) * (n + 1) + Math.round(i)] as number, 4);
    }
  });
});
