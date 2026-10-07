import { describe, expect, test } from "bun:test";
import { buildSelvaLayout } from "../../layout";
import { stairY } from "../embarcadero/amazon";
import {
  alongPath,
  boardPath,
  buildRoute,
  CRUISE,
  DRY_TOL,
  dockGeo,
  idleEnd,
  MAX_SPEED,
  MIN_SPEED,
  paddleSpeed,
  pierPlan,
  routeAt,
  standPoint,
  stepTrip,
  type Trip,
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

describe("paddling", () => {
  const base = { dirX: 1, dirZ: 0, sinceStart: 50, toGo: 50, running: false };
  test("cruises with no intent, W speeds up, S slows down but never reverses", () => {
    const idle = paddleSpeed({ ...base, intentX: 0, intentZ: 0 });
    const fwd = paddleSpeed({ ...base, intentX: 1, intentZ: 0 });
    const back = paddleSpeed({ ...base, intentX: -1, intentZ: 0 });
    expect(idle).toBeCloseTo(CRUISE);
    expect(fwd).toBeGreaterThan(idle);
    expect(back).toBeLessThan(idle);
    expect(back).toBeGreaterThanOrEqual(MIN_SPEED);
    expect(paddleSpeed({ ...base, intentX: 1, intentZ: 0, running: true })).toBeLessThanOrEqual(MAX_SPEED);
  });
  test("eases near both docks", () => {
    const mid = paddleSpeed({ ...base, intentX: 0, intentZ: 0 });
    const start = paddleSpeed({ ...base, intentX: 0, intentZ: 0, sinceStart: 0 });
    const end = paddleSpeed({ ...base, intentX: 0, intentZ: 0, toGo: 0.5 });
    expect(start).toBeLessThan(mid);
    expect(end).toBeLessThan(mid);
    expect(end).toBeGreaterThan(0);
  });
});

describe("trip", () => {
  test("boarding → riding → landing → moored, both directions", () => {
    const len = 100;
    for (const end of [0, 1] as const) {
      let trip: Trip = { kind: "boarding", end, u: 0 };
      let steps = 0;
      const seen = new Set<string>();
      while (!(trip.kind === "moored") && steps < 20000) {
        trip = stepTrip(trip, 1 / 30, len);
        seen.add(trip.kind);
        steps++;
      }
      expect(seen.has("riding")).toBe(true);
      expect(seen.has("landing")).toBe(true);
      expect(trip).toEqual({ kind: "moored", end: end === 0 ? 1 : 0 });
    }
  });
  test("riding speed approaches the wanted speed and s stays monotonic", () => {
    let trip: Trip = { kind: "riding", s: 0, dir: 1, speed: 0 };
    let prev = 0;
    for (let i = 0; i < 60; i++) {
      trip = stepTrip(trip, 1 / 30, 1000, 4);
      if (trip.kind !== "riding") throw new Error("left riding");
      expect(trip.s).toBeGreaterThanOrEqual(prev);
      prev = trip.s;
    }
    if (trip.kind === "riding") expect(trip.speed).toBeGreaterThan(2);
  });
  test("idle canoe follows the traveler to the other dock only when out of sight", () => {
    expect(idleEnd({ at: 0, d0: 150, d1: 10, dCanoe: 150 })).toBe(1);
    expect(idleEnd({ at: 0, d0: 40, d1: 10, dCanoe: 40 })).toBe(0);
    expect(idleEnd({ at: 1, d0: 5, d1: 150, dCanoe: 150 })).toBe(0);
    expect(idleEnd({ at: 1, d0: 80, d1: 80, dCanoe: 80 })).toBe(1);
  });
});

describe("docks", () => {
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
        checkPier(C, d);
      });
    }
  }
});
