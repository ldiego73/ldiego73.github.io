import { describe, expect, test } from "bun:test";
import {
  canTalk,
  figureFade,
  NOTICE_R,
  newSpirit,
  PREFERRED_T,
  pickSite,
  placePrints,
  RESET_R,
  type RoadFrame,
  STRIDE,
  siteAt,
  siteClear,
  TALK_R,
  TALK_TIME,
  talk,
  tick,
  VANISH_TIME,
} from "./logic";

/** A straight road along +x: t maps to x = 1000 t; side +1 is (-tz, tx) = (0, 1), i.e. +z. */
const frameAt = (t: number): RoadFrame => ({ px: t * 1000, pz: 0, tx: 1, tz: 0 });
const open = () => true;

describe("chullachaqui site", () => {
  test("leaves the road on the forest side (+1) and ends in a clearing ~8 u out", () => {
    const s = siteAt(0.5, frameAt(0.5), 8, 1.8);
    expect(s.a[1]).toBeLessThan(0); // starts just across the centerline
    expect(s.b[1]).toBeCloseTo(8);
    expect(s.spirit[1]).toBeGreaterThan(s.b[1]);
  });

  test("with no trunks the preferred t is taken", () => {
    expect(pickSite(frameAt, [], open).t).toBeCloseTo(PREFERRED_T);
  });

  test("a trunk on the preferred path moves the site, and the chosen site misses every trunk", () => {
    const pref = siteAt(PREFERRED_T, frameAt(PREFERRED_T), 8, 1.8);
    const trunks = [
      { x: pref.b[0], z: pref.b[1], r: 0.5 },
      { x: PREFERRED_T * 1000, z: 4, r: 0.6 },
    ];
    const s = pickSite(frameAt, trunks, open);
    expect(siteClear(s, trunks)).toBe(true);
    expect(siteClear(pref, trunks)).toBe(false);
  });

  test("closed ground rejects candidates; with nothing open it falls back to the preferred spot", () => {
    const s = pickSite(frameAt, [], () => false);
    expect(s.t).toBeCloseTo(PREFERRED_T);
    const onlyFar = pickSite(frameAt, [], (x) => x > 700);
    expect(onlyFar.t).toBeGreaterThan(0.69);
    const skipped = pickSite(frameAt, [], open, (t) => Math.abs(t - PREFERRED_T) < 0.01);
    expect(Math.abs(skipped.t - PREFERRED_T)).toBeGreaterThanOrEqual(0.01);
  });
});

describe("chullachaqui prints", () => {
  const s = siteAt(0.5, frameAt(0.5), 8, 0);
  const prints = placePrints(s);

  test("alternate a human foot and a hoof, about a stride apart", () => {
    expect(prints.length).toBeGreaterThan(10);
    prints.forEach((p, i) => {
      expect(p.kind).toBe(i % 2 === 0 ? "foot" : "hoof");
    });
    for (let i = 2; i < prints.length; i++) {
      const a = prints[i - 2];
      const b = prints[i];
      if (!a || !b) continue;
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(2 * STRIDE, 0);
    }
  });

  test("head into the forest and stop short of the spirit", () => {
    const first = prints[0];
    const last = prints[prints.length - 1];
    if (!first || !last) throw new Error("no prints");
    expect(last.z).toBeGreaterThan(first.z + 6);
    expect(Math.hypot(last.x - s.spirit[0], last.z - s.spirit[1])).toBeGreaterThan(1);
    // Feet on the left of the walk (heading +z: left is +x), hooves on the right.
    const foot = prints.find((p) => p.kind === "foot" && p.z > 3 && p.z < 5);
    const hoof = prints.find((p) => p.kind === "hoof" && p.z > 3 && p.z < 5);
    expect(foot && hoof && foot.x > hoof.x).toBe(true);
  });
});

describe("chullachaqui encounter", () => {
  test("turns and quips once when the traveler comes near, then talks, vanishes and comes back", () => {
    const s = newSpirit();
    expect(tick(s, 0.1, 30).quip).toBe(false);
    expect(s.phase).toBe("lurk");
    expect(tick(s, 0.1, NOTICE_R - 1).quip).toBe(true);
    expect(s.phase).toBe("watch");
    tick(s, 0.1, NOTICE_R + 3);
    expect(s.phase).toBe("lurk");
    expect(tick(s, 0.1, NOTICE_R - 1).quip).toBe(false);

    expect(talk(s, TALK_R + 1)).toBe(-1);
    expect(canTalk(s, TALK_R - 0.5)).toBe(true);
    expect(talk(s, TALK_R - 0.5)).toBe(0);
    expect(canTalk(s, 1)).toBe(false);
    expect(tick(s, TALK_TIME + 0.01, 1).vanish).toBe(true);
    expect(s.phase).toBe("vanish");
    tick(s, VANISH_TIME / 2, 1);
    expect(figureFade(s)).toBeGreaterThan(0);
    expect(figureFade(s)).toBeLessThan(1);
    tick(s, VANISH_TIME, 1);
    expect(s.phase).toBe("gone");
    expect(figureFade(s)).toBe(0);
    for (let i = 0; i < 40; i++) tick(s, 0.1, 10);
    expect(s.prints).toBe(0);

    expect(tick(s, 0.1, RESET_R + 1).back).toBe(true);
    expect(s.phase).toBe("lurk");
    for (let i = 0; i < 40; i++) tick(s, 0.1, RESET_R + 1);
    expect(s.prints).toBe(1);
    // The next visit quips again and the folk line alternates.
    expect(tick(s, 0.1, 3).quip).toBe(true);
    expect(talk(s, 1)).toBe(1);
  });
});
