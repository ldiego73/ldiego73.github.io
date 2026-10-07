import { describe, expect, test } from "bun:test";
import { buildSelvaLayout } from "../../layout";
import { stairY } from "../embarcadero/amazon";
import {
  alongPath,
  type Boat,
  boardPath,
  boatWater,
  buildRoute,
  CRUISE,
  clampBoat,
  DRY_TOL,
  dockGeo,
  dockingEnd,
  earnsRideStamp,
  idleEnd,
  MAX_SPEED,
  pierPlan,
  routeAt,
  standPoint,
  stepBoat,
  stepTrip,
  TURN_RATE,
} from "./logic";

const L = buildSelvaLayout({ cells: 280 });

describe("route", () => {
  test("arc length of a straight polyline and positions along it", () => {
    const r = buildRoute([
      [0, 0],
      [3, 4],
      [3, 4],
      [3, 10],
    ]);
    expect(r.length).toBeCloseTo(11);
    expect(r.pts.length).toBe(3);
    const p = routeAt(r, 5);
    expect(p.x).toBeCloseTo(3);
    expect(p.z).toBeCloseTo(4);
    const q = routeAt(r, 99);
    expect(q.z).toBeCloseTo(10);
    expect(Math.hypot(q.tx, q.tz)).toBeCloseTo(1);
  });

  test("the real canoe route is ~160 u of water", () => {
    const r = buildRoute(L.canoe.path);
    expect(r.length).toBeGreaterThan(140);
    expect(r.length).toBeLessThan(190);
    for (let s = 0; s <= r.length; s += 4) {
      const p = routeAt(r, s);
      expect(L.isWater(p.x, p.z)).toBe(true);
    }
  });
});

describe("player navigation", () => {
  const start = (): Boat => ({ x: L.canoe.from.x, z: L.canoe.from.z, yaw: Math.PI / 2, vx: 0, vz: 0 });
  const simulate = (intent: { x: number; z: number; running: boolean }) => {
    let boat = start();
    for (let i = 0; i < 180; i++) boat = stepBoat(L, boat, intent, 1 / 30);
    return boat;
  };
  test("no automatic paddling: idle drifts only with the gentle downstream current", () => {
    const boat = simulate({ x: 0, z: 0, running: false });
    expect(Math.hypot(boat.vx, boat.vz)).toBeLessThanOrEqual(0.221);
    expect(Math.hypot(boat.x - start().x, boat.z - start().z)).toBeLessThan(1.4);
  });
  test("forward and boost reach bounded cruise speeds; back brakes then reverses", () => {
    const forward = simulate({ x: 1, z: 0, running: false });
    const boost = simulate({ x: 1, z: 0, running: true });
    expect(Math.hypot(forward.vx, forward.vz)).toBeGreaterThan(4);
    expect(Math.hypot(forward.vx, forward.vz)).toBeLessThanOrEqual(CRUISE);
    expect(Math.hypot(boost.vx, boost.vz)).toBeGreaterThan(6);
    expect(Math.hypot(boost.vx, boost.vz)).toBeLessThanOrEqual(MAX_SPEED);
    const braking = stepBoat(L, forward, { x: -1, z: 0, running: false }, 1 / 30);
    expect(braking.vx).toBeLessThan(forward.vx);
    let reverse = forward;
    for (let i = 0; i < 180; i++) reverse = stepBoat(L, reverse, { x: -1, z: 0, running: false }, 1 / 30);
    expect(reverse.vx).toBeLessThan(-1.5);
    const coast = stepBoat(L, forward, { x: 0, z: 0, running: false }, 1 / 30);
    expect(coast.vx).toBeGreaterThan(0);
    expect(coast.vx).toBeLessThan(forward.vx);
  });
  test("left/right turns at 1.2 rad/s even at rest, with analog magnitude", () => {
    const boat = { ...start(), yaw: 0 };
    expect(stepBoat(L, boat, { x: 1, z: 0, running: false }, 0.05).yaw).toBeCloseTo(TURN_RATE * 0.05);
    expect(stepBoat(L, boat, { x: -0.5, z: 0, running: false }, 0.05).yaw).toBeCloseTo(-TURN_RATE * 0.025);
  });
  test("solid river animals gently push; traveler and submerged animals do not", () => {
    const boat = start();
    const animal = { x: boat.x, z: boat.z, r: 1, solid: true, kind: "bufeo" };
    const idle = { x: 0, z: 0, running: false };
    const noBody = stepBoat(L, boat, idle, 0.05);
    const pushed = stepBoat(L, boat, idle, 0.05, [animal]);
    expect(Math.hypot(pushed.x - noBody.x, pushed.z - noBody.z)).toBeGreaterThan(0.05);
    expect(stepBoat(L, boat, idle, 0.05, [{ ...animal, solid: false }])).toEqual(noBody);
    expect(stepBoat(L, boat, idle, 0.05, [{ ...animal, kind: "traveler" }])).toEqual(noBody);
  });
  test("a bank bump slides along shore and steering back into the river recovers", () => {
    const river = buildRoute(L.river.pts);
    const p = routeAt(river, river.length * 0.5);
    const nx = -p.tz,
      nz = p.tx;
    const edge = clampBoat(L, p.x + nx * 100, p.z + nz * 100, p);
    let boat: Boat = { ...edge, yaw: Math.atan2(nx, nz), vx: 0, vz: 0 };
    const start = { ...boat };
    for (let i = 0; i < 300; i++) boat = stepBoat(L, boat, { x: p.tx, z: p.tz, running: false }, 0.05);
    expect(Math.hypot(boat.x - start.x, boat.z - start.z)).toBeGreaterThan(10);
    for (let i = 0; i < 200; i++) {
      const dx = p.x - boat.x,
        dz = p.z - boat.z,
        d = Math.hypot(dx, dz) || 1;
      boat = stepBoat(L, boat, { x: dx / d, z: dz / d, running: false }, 0.05);
    }
    expect(boatWater(L, boat.x, boat.z)).toBe(true);
    expect(L.riverDist(boat.x, boat.z)).toBeLessThan(-5);
  });
  for (const cells of [160, 190, 280]) {
    test(`${cells} cells: randomized navigation and bank/world projection keep the complete hull on water`, () => {
      const lay = cells === 280 ? L : buildSelvaLayout({ cells });
      let seed = 12345;
      const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const river = buildRoute(lay.river.pts);
      // Start all along the visible river, including beyond both original trip endpoints.
      for (let s = 10; s < river.length; s += 24) {
        const p = routeAt(river, s);
        if (!boatWater(lay, p.x, p.z)) continue;
        let boat: Boat = { x: p.x, z: p.z, yaw: rand() * Math.PI * 2, vx: 0, vz: 0 };
        for (let i = 0; i < 160; i++) {
          const a = rand() * Math.PI * 2,
            magnitude = rand();
          boat = stepBoat(
            lay,
            boat,
            { x: Math.sin(a) * magnitude, z: Math.cos(a) * magnitude, running: rand() > 0.5 },
            0.05,
          );
          expect(boatWater(lay, boat.x, boat.z)).toBe(true);
          expect(lay.isWater(boat.x, boat.z)).toBe(true);
          const clamped = clampBoat(lay, boat.x + (rand() - 0.5) * 80, boat.z + (rand() - 0.5) * 80, boat);
          expect(boatWater(lay, clamped.x, clamped.z)).toBe(true);
        }
        // Sustained outward input still permits sliding along a bank and recovering into open water.
        for (let i = 0; i < 300; i++) {
          boat = stepBoat(lay, boat, { x: 0, z: 1, running: true }, 0.05);
          expect(boatWater(lay, boat.x, boat.z)).toBe(true);
        }
      }
    });
  }
});

describe("trip", () => {
  test("boarding waits for player navigation, landing requires explicit state change", () => {
    const boat: Boat = { x: 10, z: 20, yaw: 0, vx: 0, vz: 0 };
    for (const end of [0, 1] as const) {
      const riding = stepTrip({ kind: "boarding", end, u: 0 }, 1, boat);
      expect(riding).toEqual({ kind: "riding", boat });
      expect(stepTrip(riding, 100, boat)).toEqual(riding);
      expect(stepTrip({ kind: "landing", end, u: 0 }, 1, boat)).toEqual({ kind: "moored", end });
    }
  });
  test("idle canoe follows the traveler to the other dock only when out of sight", () => {
    expect(idleEnd({ at: 0, d0: 150, d1: 10, dCanoe: 150 })).toBe(1);
    expect(idleEnd({ at: 0, d0: 40, d1: 10, dCanoe: 40 })).toBe(0);
    expect(idleEnd({ at: 1, d0: 5, d1: 150, dCanoe: 150 })).toBe(0);
    expect(idleEnd({ at: 1, d0: 80, d1: 80, dCanoe: 80 })).toBe(1);
  });
});

describe("docks", () => {
  test("either dock accepts slow boats only; stamp requires a different dock", () => {
    const docks = [
      dockGeo(L, "embarcadero", L.canoe.path[0]!, 0),
      dockGeo(L, "palafitos", L.canoe.path[L.canoe.path.length - 1]!, 1),
    ];
    for (const d of docks) {
      const boat: Boat = { ...d.moor, yaw: 0, vx: 0.22, vz: 0 };
      expect(dockingEnd(boat, docks)).toBe(d.end);
      expect(dockingEnd({ ...boat, vx: 1 }, docks)).toBeNull();
      expect(dockingEnd({ ...boat, x: boat.x + 8 }, docks)).toBeNull();
      expect(earnsRideStamp(d.end, d.end)).toBe(false);
      expect(earnsRideStamp(d.end, d.end === 0 ? 1 : 0)).toBe(true);
    }
  });
  const ends = [
    ["embarcadero", L.canoe.path[0], 0],
    ["palafitos", L.canoe.path[L.canoe.path.length - 1], 1],
  ] as const;
  for (const [id, moor, end] of ends) {
    test(`${id}: the pier head is dry and flat, its root on the plaza; the mooring point is water`, () => {
      const d = dockGeo(L, id, moor as [number, number], end);
      expect(Math.abs(L.heightAt(d.head.x, d.head.z) - d.y)).toBeLessThanOrEqual(DRY_TOL);
      // Every point from the plaza out to the head is flat apron, so a pier walk area there keeps feet on planks.
      for (let k = 0; k <= 1; k += 0.05) {
        const x = d.root.x + (d.head.x - d.root.x) * k;
        const z = d.root.z + (d.head.z - d.root.z) * k;
        expect(Math.abs(L.heightAt(x, z) - d.y)).toBeLessThanOrEqual(DRY_TOL);
      }
      expect(L.walkable(d.root.x, d.root.z)).toBe(true);
      expect(L.isWater(d.moor.x, d.moor.z)).toBe(true);
      const safe = clampBoat(L, d.moor.x, d.moor.z, d.moor);
      expect(boatWater(L, safe.x, safe.z)).toBe(true);
      expect(Math.hypot(d.tip.x - d.head.x, d.tip.z - d.head.z)).toBeGreaterThan(2);
    });
    test(`${id}: the pier steps down the bank to a jetty on the water, boarding from it`, () => {
      const d = dockGeo(L, id, moor as [number, number], end);
      checkPier(L, d);
    });
  }
});

/** Pier plan sanity on a layout: level pier over the apron, treads ≤ a step apart and above the bank. */
function checkPier(lay: typeof L, d: ReturnType<typeof dockGeo>) {
  const P = pierPlan(d, lay.river.level);
  const tread = stairY([0, P.stairTop], P.deckY, [0, P.foot - 0.2], P.stairFootY);
  const world = (k: number) => [d.head.x + d.dir.x * k, d.head.z + d.dir.z * k] as const;
  // The level pier clears the apron under it.
  for (let k = P.back; k <= P.stairTop; k += 0.2) {
    const [x, z] = world(k);
    expect(P.deckY).toBeGreaterThanOrEqual(lay.heightAt(x, z) - d.y - 1e-9);
  }
  // Treads: risers below core's MAX_STEP (0.9), never buried in the bank by more than a plank.
  let prev = P.deckY;
  for (let k = P.stairTop; k <= P.foot - 0.2; k += 0.05) {
    const y = tread(0, k);
    expect(prev - y).toBeLessThan(0.45);
    expect(prev - y).toBeGreaterThanOrEqual(-1e-9);
    prev = y;
    const [x, z] = world(k);
    expect(y).toBeGreaterThan(lay.heightAt(x, z) - d.y - 0.25);
  }
  // Last tread → jetty is a small step; the boarding spot is on the jetty, clear of the moored hull.
  expect(Math.abs(prev - P.jettyY)).toBeLessThan(0.45);
  const s = standPoint(d, lay.river.level);
  expect(s[1]).toBeCloseTo(lay.river.level + 0.32, 9);
  expect(P.stand).toBeGreaterThan(P.jetty.z0);
  expect(P.stand).toBeLessThan(P.jetty.z1);
  expect(Math.hypot(s[0] - d.moor.x, s[2] - d.moor.z)).toBeGreaterThan(1.1 + 0.42);
  expect(lay.isWater(s[0], s[2])).toBe(true);
  // The hop into the canoe goes from the jetty down to the seat.
  const path = boardPath(s, [d.moor.x, lay.river.level - 0.3, d.moor.z]);
  expect(alongPath(path, 0)[1]).toBeCloseTo(s[1], 9);
  expect(alongPath(path, 1)[0]).toBeCloseTo(d.moor.x, 9);
}

describe("docks on the coarser phone / low-quality terrain", () => {
  for (const cells of [160, 190]) {
    const C = buildSelvaLayout({ cells });
    const p = C.canoe.path;
    for (const [id, moor, end] of [
      ["embarcadero", p[0], 0],
      ["palafitos", p[p.length - 1], 1],
    ] as const) {
      test(`${cells} cells, ${id}: dry head, walkable root, mooring on water`, () => {
        const d = dockGeo(C, id, moor as [number, number], end);
        expect(Math.abs(C.heightAt(d.head.x, d.head.z) - d.y)).toBeLessThanOrEqual(DRY_TOL);
        expect(C.walkable(d.root.x, d.root.z)).toBe(true);
        expect(C.isWater(d.moor.x, d.moor.z)).toBe(true);
        const safe = clampBoat(C, d.moor.x, d.moor.z, d.moor);
        expect(boatWater(C, safe.x, safe.z)).toBe(true);
        expect(dockingEnd({ ...safe, yaw: 0, vx: 0, vz: 0 }, [d])).toBe(end);
        checkPier(C, d);
      });
    }
  }
});
