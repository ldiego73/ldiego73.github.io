import { describe, expect, test } from "bun:test";
import { buildCuscoLayout, coreDist, onPlaza, onStreet, usnuTop, valleyHeight } from "./layout";
import {
  CUSCO_STATIONS,
  DEFAULT_SPAWN,
  GATES,
  gateArrival,
  gatePoint,
  PLAZA,
  ROAD_HALF,
  stationSpot,
  USNU,
  WALL_OFF,
} from "./plan";

/** The suyu runtime's step limit (src/world/suyu/index.ts MAX_STEP). */
const MAX_STEP = 0.9;

describe("Cusco hub plan", () => {
  test("five roads with the Inca bearings; the mountain, the coast and the jungle are open", () => {
    const by = Object.fromEntries(GATES.map((g) => [g.id, g]));
    expect(GATES.map((g) => g.id).sort()).toEqual(["antisuyu", "chinchaysuyu", "collasuyu", "kuntisuyu", "qhapaq"]);
    // −z is north, +x east.
    expect(by.chinchaysuyu?.dir[0]).toBeLessThan(0);
    expect(by.chinchaysuyu?.dir[1]).toBeLessThan(0);
    expect(by.antisuyu?.dir[0]).toBeGreaterThan(0);
    expect(by.antisuyu?.dir[1]).toBeLessThan(0);
    expect(by.collasuyu?.dir[0]).toBeGreaterThan(0);
    expect(by.collasuyu?.dir[1]).toBeGreaterThan(0);
    expect(by.kuntisuyu?.dir[0]).toBeLessThan(0);
    expect(by.kuntisuyu?.dir[1]).toBeGreaterThan(0);
    expect(GATES.filter((g) => g.available).map((g) => g.world)).toEqual(["qhapaq", "costa", "selva"]);
    for (const g of GATES) expect(Math.hypot(g.dir[0], g.dir[1])).toBeCloseTo(1, 6);
  });

  test("usnu tiers are each a walkable step", () => {
    let prev = 0;
    for (const t of USNU.tiers) {
      expect(t.top - prev).toBeLessThan(MAX_STEP);
      prev = t.top;
    }
    expect(usnuTop(USNU.x, USNU.z)).toBe(prev);
    expect(usnuTop(USNU.x + USNU.tiers[0].half + 0.1, USNU.z)).toBeNull();
  });

  test("the plaza and streets are flat; the valley rises outside the core", () => {
    expect(valleyHeight(0, 0)).toBe(0);
    for (const g of GATES) {
      const [x, z] = gatePoint(g);
      expect(coreDist(x, z)).toBeLessThan(0);
      expect(valleyHeight(x, z)).toBe(0);
    }
    expect(valleyHeight(0, -200)).toBeGreaterThan(20);
    expect(valleyHeight(180, 60)).toBeGreaterThan(15);
  });
});

describe("Cusco hub layout", () => {
  for (const cells of [160, 112]) {
    const L = buildCuscoLayout({ cells });

    test(`plaza and streets walkable, the street walls and beyond the gates not (${cells})`, () => {
      expect(L.walkable(0, 10)).toBe(true);
      expect(L.walkable(PLAZA.x1 - 0.5, PLAZA.z1 - 0.5)).toBe(true);
      for (const g of GATES) {
        const mid = { x: g.mouth[0] + g.dir[0] * 15, z: g.mouth[1] + g.dir[1] * 15 };
        expect(L.walkable(mid.x, mid.z)).toBe(true);
        // The walls stand outside the band.
        const nx = -g.dir[1];
        const nz = g.dir[0];
        expect(L.walkable(mid.x + nx * WALL_OFF, mid.z + nz * WALL_OFF)).toBe(false);
        expect(L.walkable(mid.x - nx * WALL_OFF, mid.z - nz * WALL_OFF)).toBe(false);
        // Past the doorway: nothing to walk on.
        const [gx, gz] = gatePoint(g);
        expect(L.walkable(gx + g.dir[0] * 2, gz + g.dir[1] * 2)).toBe(false);
      }
      expect(L.walkable(PLAZA.x1 + 3, 0)).toBe(false);
      expect(ROAD_HALF).toBeLessThan(WALL_OFF - 0.5);
    });

    test(`spawns and arrivals stand on walkable ground (${cells})`, () => {
      expect(L.walkable(DEFAULT_SPAWN.x, DEFAULT_SPAWN.z)).toBe(true);
      for (const g of GATES) {
        const a = gateArrival(g);
        expect(onStreet(a.x, a.z)).toBe(true);
        // Facing the plaza: the plaza centre is ahead.
        const ahead = Math.sin(a.yaw) * (0 - a.x) + Math.cos(a.yaw) * (0 - a.z);
        expect(ahead).toBeGreaterThan(0);
      }
    });

    test(`station poses: in front of their place, on walkable ground (${cells})`, () => {
      for (const s of CUSCO_STATIONS) {
        const spot = stationSpot(s.id);
        expect(spot).not.toBeNull();
        const pose = L.stationPose(s.id);
        // The runtime's fast travel lands 3 u along the facing: that must be walkable.
        const fx = pose.position.x + Math.sin(pose.yaw) * 3;
        const fz = pose.position.z + Math.cos(pose.yaw) * 3;
        expect(L.walkable(fx, fz)).toBe(true);
      }
      expect(L.plazas.find((p) => p.id === "usnu")).toMatchObject({ x: USNU.x, z: USNU.z });
      expect(L.groundAt(USNU.x, USNU.z)).toBeCloseTo(USNU.tiers[2].top, 6);
      expect(onPlaza(USNU.x, USNU.z)).toBe(true);
    });

    test(`trail: the axis from the Qhapaq gate north over the usnu (${cells})`, () => {
      const a = L.trail.pointAt(0);
      const b = L.trail.pointAt(1);
      expect(a.z).toBeGreaterThan(PLAZA.z1);
      expect(b.z).toBeCloseTo(PLAZA.z0, 6);
      expect(L.trail.nearestT(0, 0)).toBeGreaterThan(0.3);
      expect(L.trailQuery(5, 0).d).toBeCloseTo(5, 6);
      expect(L.isWater(0, 0)).toBe(false);
      expect(L.waterDist(0, 0)).toBeGreaterThan(0);
    });
  }
});
