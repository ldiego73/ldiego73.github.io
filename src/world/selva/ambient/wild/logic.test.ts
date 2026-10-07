/** Pure fauna helpers: schedules, the good-look timer, motion shapes and spot pickers on the real layout. */
import { describe, expect, test } from "bun:test";
import { CANOPY_T, SELVA_STATIONS } from "../../contract";
import { buildSelvaLayout } from "../../layout";
import {
  awayFrom,
  bankSpot,
  collpaPresence,
  diurnal,
  jaguarHours,
  LookTimer,
  leapPoint,
  margin,
  morphoHours,
  nightAmount,
  offRoad,
  quietT,
  rng,
  roadFrame,
  surfaceArc,
  treeSites,
  turnToward,
  waterSpot,
  wrapAngle,
} from "./logic";

const layout = buildSelvaLayout({ cells: 280 });
const STATION_T = SELVA_STATIONS.map((s) => s.t);

describe("time-of-day windows", () => {
  test("the collpa flock is there in the early morning only", () => {
    expect(collpaPresence(0.3)).toBe(1);
    expect(collpaPresence(0.36)).toBe(1);
    expect(collpaPresence(0.2)).toBe(0);
    expect(collpaPresence(0.5)).toBe(0);
    expect(collpaPresence(0.9)).toBe(0);
  });

  test("diurnal animals sleep at night, morphos fly at midday, the jaguar only in true night", () => {
    expect(diurnal(0.5)).toBe(1);
    expect(diurnal(0.05)).toBe(0);
    expect(diurnal(0.95)).toBe(0);
    expect(morphoHours(0.5)).toBe(1);
    expect(morphoHours(0.27)).toBe(0);
    expect(jaguarHours(0.95)).toBe(true);
    expect(jaguarHours(0.1)).toBe(true);
    expect(jaguarHours(0.5)).toBe(false);
    expect(jaguarHours(0.78)).toBe(false); // dusk is not yet jaguar time
    expect(nightAmount(0)).toBe(1);
    expect(nightAmount(0.5)).toBe(0);
  });
});

describe("good look (passport stamp)", () => {
  test("fires once after 1.5 s of continuous sight", () => {
    const t = new LookTimer(1.5);
    let fired = 0;
    for (let i = 0; i < 14; i++) if (t.update(0.1, true)) fired++;
    expect(fired).toBe(0);
    for (let i = 0; i < 2; i++) if (t.update(0.1, true)) fired++;
    expect(fired).toBe(1);
    for (let i = 0; i < 50; i++) if (t.update(0.1, true)) fired++;
    expect(fired).toBe(1);
    expect(t.done).toBe(true);
  });

  test("a glimpse is not enough: losing sight drains the timer", () => {
    const t = new LookTimer(1.5);
    // On and off every 0.5 s never adds up to a good look.
    for (let k = 0; k < 20; k++) {
      for (let i = 0; i < 5; i++) expect(t.update(0.1, true)).toBe(false);
      for (let i = 0; i < 5; i++) expect(t.update(0.1, false)).toBe(false);
    }
    expect(t.done).toBe(false);
    // A one-frame dropout barely matters.
    const u = new LookTimer(1.5);
    let fired = false;
    for (let i = 0; i < 20; i++) fired = u.update(0.1, i !== 7) || fired;
    expect(fired).toBe(true);
  });
});

describe("motion shapes", () => {
  test("angles wrap and turn the short way, capped per step", () => {
    expect(Math.abs(wrapAngle(Math.PI * 3))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI * 1.5)).toBeCloseTo(Math.PI / 2, 6);
    expect(turnToward(0, 1, 0.25)).toBeCloseTo(0.25, 6);
    expect(turnToward(3, -3, 0.1)).toBeGreaterThan(3); // across ±π, not the long way round
  });

  test("fleeing points away from the threat", () => {
    const out = { x: 0, z: 0 };
    awayFrom(10, 0, 0, 0, 5, out);
    expect(out.x).toBeCloseTo(15, 6);
    expect(out.z).toBeCloseTo(0, 6);
    awayFrom(3, 4, 3, 4, 2, out); // right on top: still a finite step away
    expect(Math.hypot(out.x - 3, out.z - 4)).toBeCloseTo(2, 6);
  });

  test("the dolphin surfaces in one low arc: under, back out at mid-arc, under again", () => {
    const a0 = surfaceArc(0, 4, 0.06, 0.95);
    const a5 = surfaceArc(0.5, 4, 0.06, 0.95);
    const a1 = surfaceArc(1, 4, 0.06, 0.95);
    expect(a0.y).toBeCloseTo(-0.95, 6);
    expect(a5.y).toBeCloseTo(0.06, 6);
    expect(a1.y).toBeCloseTo(-0.95, 6);
    expect(a0.pitch).toBeGreaterThan(0); // nose up rising
    expect(Math.abs(a5.pitch)).toBeLessThan(1e-6);
    expect(a1.pitch).toBeLessThan(0); // nose down diving
  });

  test("a leap starts and ends on the branches and rises above both", () => {
    const a = { x: 0, y: 5, z: 0 };
    const b = { x: 4, y: 6, z: 0 };
    const p = { x: 0, y: 0, z: 0 };
    leapPoint(a, b, 0.8, 0, p);
    expect(p).toEqual({ x: 0, y: 5, z: 0 });
    leapPoint(a, b, 0.8, 1, p);
    expect(p.x).toBeCloseTo(4, 6);
    expect(p.y).toBeCloseTo(6, 6);
    let top = 0;
    for (let u = 0; u <= 1; u += 0.01) top = Math.max(top, leapPoint(a, b, 0.8, u, p).y);
    expect(top).toBeGreaterThan(6.5);
  });

  test("seeded rng is deterministic and in [0, 1)", () => {
    const r1 = rng(42);
    const r2 = rng(42);
    for (let i = 0; i < 100; i++) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("places on the jungle layout", () => {
  test("the river side of the road frame points at the water", () => {
    for (const t of [0.1, 0.42, 0.6, 0.97]) {
      const f = roadFrame(layout, t);
      expect(layout.riverDist(f.x + f.rx * 40, f.z + f.rz * 40)).toBeLessThan(layout.riverDist(f.x, f.z));
    }
  });

  test("bank and water spots are where they claim to be", () => {
    for (const t of [0.15, 0.42, 0.6, 0.97]) {
      const bank = bankSpot(layout, t);
      expect(bank).not.toBeNull();
      if (bank) {
        expect(margin(layout, bank.x, bank.z).dry).toBe(true);
        expect(offRoad(layout, bank.x, bank.z)).toBe(true);
      }
      const w = waterSpot(layout, t, 1.6, 3);
      expect(w).not.toBeNull();
      if (w) {
        expect(layout.isWater(w.x, w.z)).toBe(true);
        expect(margin(layout, w.x, w.z).deep).toBe(true);
      }
    }
  });

  test("host trees stand on open forest floor, off the road and the plazas", () => {
    const sites = treeSites(layout, { t0: 0.515, t1: 0.562, n: 6, lat0: 6.6, lat1: 8.5, side: -1, gap: 4.6, seed: 7 });
    expect(sites.length).toBeGreaterThanOrEqual(3);
    for (const s of sites) {
      expect(offRoad(layout, s.x, s.z, 1.6)).toBe(true);
      expect(layout.isWater(s.x, s.z)).toBe(false);
      expect(layout.trailQuery(s.x, s.z).d).toBeGreaterThan(5.5); // the scenery's low strip by the road
      for (const o of sites) if (o !== s) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThanOrEqual(4.6);
    }
  });

  test("quiet stretches avoid the stations and the canopy walkway", () => {
    for (const s of STATION_T) expect(quietT(s, STATION_T, CANOPY_T)).toBe(false);
    expect(quietT((CANOPY_T[0] + CANOPY_T[1]) / 2, STATION_T, CANOPY_T)).toBe(false);
    expect(quietT(0.5, STATION_T, CANOPY_T)).toBe(true);
    expect(quietT(0.01, STATION_T, CANOPY_T)).toBe(false);
  });
});
