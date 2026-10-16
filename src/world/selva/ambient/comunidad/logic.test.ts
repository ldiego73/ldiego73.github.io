import { describe, expect, test } from "bun:test";
import {
  asideOf,
  atSpanEnd,
  CAST,
  CAST_CYCLE,
  castAt,
  GREET,
  greeting,
  HOURS,
  headcount,
  isOut,
  jumpArc,
  laneOf,
  netShape,
  nextStage,
  partiesFor,
  ROAD_SPANS,
  respawnT,
  riverLane,
  type SwimStage,
  shouldGiveWay,
  spanAt,
  within,
} from "./logic";

describe("schedule", () => {
  test("within handles plain and wrapping windows", () => {
    expect(within(0.5, 0.3, 0.7)).toBe(true);
    expect(within(0.1, 0.3, 0.7)).toBe(false);
    expect(within(0.9, 0.76, 0.18)).toBe(true);
    expect(within(0.1, 0.76, 0.18)).toBe(true);
    expect(within(0.5, 0.76, 0.18)).toBe(false);
    expect(within(1.5, 0.3, 0.7)).toBe(true);
  });
  test("everyone is out by day and home at night, except the elder's fire", () => {
    for (const a of ["play", "swim", "craft", "road", "fish", "boat"] as const) {
      expect(isOut(a, 0.5)).toBe(true);
      expect(isOut(a, 0.95)).toBe(false);
    }
    expect(isOut("fire", 0.95)).toBe(true);
    expect(isOut("fire", 0.5)).toBe(false);
    // Children are home before the adults stop working.
    expect(HOURS.play[1]).toBeLessThanOrEqual(HOURS.craft[1]);
  });
});

describe("headcount", () => {
  test("phones and the low tier get fewer people", () => {
    const sum = (o: ReturnType<typeof headcount>) => o.plazaKids + o.swimmers + o.walkers + o.crafts;
    const high = headcount("high", false);
    const low = headcount("low", false);
    const phone = headcount("high", true);
    expect(sum(low)).toBeLessThan(sum(high));
    expect(sum(phone)).toBeLessThanOrEqual(sum(low));
    // Walkers come in whole parties; the arcade and the totem get fewer people too.
    for (const o of [high, low, phone]) {
      expect(partiesFor(o.walkers).reduce((s, p) => s + p.length, 0)).toBe(o.walkers);
      expect(o.raftPlayers).toBeGreaterThanOrEqual(1);
      expect(o.finale).toBeGreaterThanOrEqual(4);
    }
    expect(low.finale).toBeLessThan(high.finale);
    expect(low.raftPlayers + low.raftKids).toBeLessThan(high.raftPlayers + high.raftKids + (high.raftWatcher ? 1 : 0));
  });
});

describe("river lane", () => {
  // A straight river along +X at z = -20, road along z = 0: the far side is −Z.
  const pts = Array.from({ length: 30 }, (_, i) => [i * 4, -20] as const);
  const hw = pts.map(() => 10);
  const roadDist = (_x: number, z: number) => Math.abs(z);
  test("keeps to the far half when it is open", () => {
    const lane = riverLane(pts, hw, roadDist, () => true, 0.5);
    for (const p of lane) expect(p[1]).toBeCloseTo(-25, 5);
  });
  test("steps back toward the centerline round an obstacle, and only past it when it must", () => {
    // A sandbar on the far half from x = 40 to 60.
    const ok = (x: number, z: number) => !(x >= 40 && x <= 60 && z < -21);
    const lane = riverLane(pts, hw, roadDist, ok, 0.5);
    const mid = lane[12] as readonly [number, number];
    expect(mid[1]).toBeGreaterThan(-21.5);
    expect(mid[1]).toBeLessThan(-14);
    expect((lane[0] as readonly [number, number])[1]).toBeCloseTo(-25, 5);
  });
  test("is smooth (no zigzag between neighbours)", () => {
    const ok = (x: number, z: number) => !(x === 48 && z < -19);
    const lane = riverLane(pts, hw, roadDist, ok, 0.5);
    for (let i = 1; i < lane.length; i++)
      expect(Math.abs((lane[i] as readonly number[])[1] - (lane[i - 1] as readonly number[])[1])).toBeLessThan(3);
  });
});

describe("swimming", () => {
  test("the jump arc starts on the tip, peaks above the line and lands on the water", () => {
    const o = { x: 0, y: 0, z: 0 };
    jumpArc(0, 0, 2, 0, 2, 1, 0, 1, o);
    expect(o).toEqual({ x: 0, y: 2, z: 0 });
    jumpArc(0.5, 0, 2, 0, 2, 1, 0, 1, o);
    expect(o.y).toBeCloseTo(2.5, 5);
    jumpArc(1, 0, 2, 0, 2, 1, 0, 1, o);
    expect(o.x).toBe(2);
    expect(o.y).toBe(1);
  });
  test("the loop comes back round to the trunk", () => {
    let s: SwimStage = "wait";
    const seen: SwimStage[] = [];
    for (let i = 0; i < 7; i++) {
      seen.push(s);
      s = nextStage(s);
    }
    expect(seen).toEqual(["wait", "log", "tip", "jump", "under", "swim", "climb"]);
    expect(s).toBe("wait");
  });
});

describe("cast net", () => {
  test("castAt walks the stages in order and wraps", () => {
    let t = 0;
    for (const [stage, d] of CAST) {
      expect(castAt(t + d / 2).stage).toBe(stage);
      t += d;
    }
    expect(castAt(CAST_CYCLE + 0.1).stage).toBe("coil");
    expect(castAt(-0.1).stage).toBe("rest");
  });
  test("the net opens in flight, lies open on the water, closes as it comes back", () => {
    expect(netShape("coil", 0.5).open).toBeLessThan(0.2);
    expect(netShape("fly", 1).open).toBeCloseTo(1, 5);
    expect(netShape("fly", 1).out).toBe(1);
    expect(netShape("sink", 0.5).open).toBe(1);
    expect(netShape("haul", 1).out).toBe(0);
    expect(netShape("haul", 1).open).toBeLessThan(0.2);
  });
});

describe("road", () => {
  test("a walker gives way when the traveler comes toward them, and only then", () => {
    // Walker at the origin heading +X.
    expect(shouldGiveWay(0, 0, 1, 0, 4, 0.5, false)).toBe(true);
    expect(shouldGiveWay(0, 0, 1, 0, -4, 0, false)).toBe(false);
    expect(shouldGiveWay(0, 0, 1, 0, 4, 5, false)).toBe(false);
    expect(shouldGiveWay(0, 0, 1, 0, 12, 0, false)).toBe(false);
    // Very close from any side.
    expect(shouldGiveWay(0, 0, 1, 0, -1, 1, false)).toBe(true);
    // Keeps yielding until the traveler is clear.
    expect(shouldGiveWay(0, 0, 1, 0, -3, 0, true)).toBe(true);
    expect(shouldGiveWay(0, 0, 1, 0, -5, 0, true)).toBe(false);
  });
  test("everyone keeps to their right and steps aside within the road", () => {
    expect(laneOf(1)).toBeGreaterThan(0);
    expect(laneOf(-1)).toBeLessThan(0);
    expect(Math.abs(laneOf(1, 1))).toBeGreaterThan(Math.abs(laneOf(1, 0)));
    expect(Math.abs(asideOf(1))).toBeLessThan(2.6);
    expect(Math.abs(asideOf(-1))).toBeGreaterThan(Math.abs(laneOf(-1, 1)));
  });
  test("the walking stretches stay off the canopy walkway and inside the road", () => {
    let prev = 0;
    for (const [a, b] of ROAD_SPANS) {
      expect(a).toBeLessThan(b);
      expect(a).toBeGreaterThan(prev);
      expect(a).toBeGreaterThan(0.03);
      expect(b).toBeLessThan(1);
      // No stretch overlaps the canopy walkway (CANOPY_T 0.83–0.9).
      expect(b <= 0.83 || a >= 0.9).toBe(true);
      prev = b;
    }
    expect(spanAt(0.5)).toBe(0);
    expect(spanAt(0.86)).toBe(-1);
    expect(spanAt(0.95)).toBe(1);
    expect(spanAt(0.01)).toBe(-1);
    expect(atSpanEnd(0.82, 1, 0)).toBe(true);
    expect(atSpanEnd(0.82, -1, 0)).toBe(false);
    expect(atSpanEnd(0.04, -1, 0)).toBe(true);
  });
  test("travellers out of sight come back just past the view, walking toward the traveler", () => {
    const ahead = respawnT(0.4, 0.15, 1);
    expect(ahead).toEqual({ t: 0.55, span: 0, dir: -1 });
    const behind = respawnT(0.4, 0.15, -1);
    expect(behind?.dir).toBe(1);
    expect(behind?.t).toBeCloseTo(0.25);
    // Ahead falls on the canopy walkway: on to its far end.
    expect(respawnT(0.75, 0.1, 1)).toEqual({ t: 0.905, span: 1, dir: -1 });
    expect(respawnT(0.98, 0.1, -1)?.t).toBe(0.82);
    // Past the end of the road: the other side.
    const end = respawnT(0.97, 0.15, 1);
    expect(end?.t).toBeCloseTo(0.82);
    expect(end?.dir).toBe(1);
    expect(respawnT(0.05, 0.1, -1)?.dir).toBe(-1);
    // Nowhere to go.
    expect(respawnT(0.5, 2, 1)).toBeNull();
  });
});

describe("greetings", () => {
  test("every line is bilingual and cycles", () => {
    for (const list of Object.values(GREET))
      for (const l of list) {
        expect(l.es.length).toBeGreaterThan(10);
        expect(l.en.length).toBeGreaterThan(10);
      }
    expect(greeting("walker", 0)).toBe(GREET.walker[0] as (typeof GREET.walker)[number]);
    expect(greeting("walker", GREET.walker.length)).toBe(greeting("walker", 0));
    expect(greeting("weaver", -1)).toBe(greeting("weaver", GREET.weaver.length - 1));
  });
});
