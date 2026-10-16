import { describe, expect, test } from "bun:test";
import { type Frame, toLocal, toWorld } from "../huacas/logic";
import { STALLS } from "../huacas/market";
import {
  BOUNCE_S,
  bounce,
  CAPTION_AWAY,
  CAPTION_S,
  COPY,
  CRATE_AT,
  createLook,
  ekekoSpot,
  inRange,
  RANGE,
  SPARKLE_FLASH,
  SPARKLE_PERIOD,
  STALL_INDEX,
  STAMP,
  STEADY_GLINT,
  sparkle,
} from "./logic";

const market: Frame = { x: -120, z: 40, y: 3, yaw: 1.1 };
const st = STALLS[STALL_INDEX] as (typeof STALLS)[number];
const stallFrame = (): Frame => {
  const c = toWorld(market, st.x, st.z);
  return { x: c.x, z: c.z, y: 0, yaw: market.yaw + st.yaw };
};

describe("ekeko placement", () => {
  test("the crate sits beside the stall, outside its posts and away from its reading spot", () => {
    const s = ekekoSpot(market);
    const local = toLocal(stallFrame(), s.x, s.z);
    expect(local.x).toBeCloseTo(CRATE_AT.x, 6);
    expect(local.z).toBeCloseTo(CRATE_AT.z, 6);
    // Outside the posts (±1.7) on the open side.
    expect(local.x).toBeGreaterThan(1.7 + 0.42);
    // The stall's artifact spot (local (0, 2.6), r 2.1) and the look range barely touch.
    expect(Math.hypot(local.x, local.z - 2.6)).toBeGreaterThan(2.1 + RANGE - 0.4);
  });
  test("the open side faces away from the neighbouring stall", () => {
    const s = ekekoSpot(market);
    const prev = STALLS[STALL_INDEX - 1] as (typeof STALLS)[number];
    const n = toWorld(market, prev.x, prev.z);
    const own = toWorld(market, st.x, st.z);
    expect(Math.hypot(s.x - n.x, s.z - n.z)).toBeGreaterThan(Math.hypot(own.x - n.x, own.z - n.z));
  });
  test("range", () => {
    const s = ekekoSpot(market);
    expect(inRange(s, s.x + RANGE - 0.01, s.z)).toBe(true);
    expect(inRange(s, s.x + RANGE + 0.01, s.z)).toBe(false);
  });
});

describe("ekeko sparkle and bounce", () => {
  test("one short flash per period, dark in between", () => {
    expect(sparkle(SPARKLE_FLASH * 0.25, false)).toBeCloseTo(1, 6);
    expect(sparkle(SPARKLE_FLASH + 0.1, false)).toBe(0);
    expect(sparkle(SPARKLE_PERIOD + SPARKLE_FLASH * 0.25, false)).toBeCloseTo(1, 6);
    let lit = 0;
    for (let t = 0; t < SPARKLE_PERIOD; t += 0.01) if (sparkle(t, false) > 0) lit++;
    expect(lit / (SPARKLE_PERIOD / 0.01)).toBeLessThan(0.2);
  });
  test("reduced motion: steady glint, no bounce", () => {
    for (const t of [0, 1.3, 7.7]) expect(sparkle(t, true)).toBe(STEADY_GLINT);
    expect(bounce(0.3, true)).toEqual({ lift: 0, squash: 1, tilt: 0 });
  });
  test("the bounce hops and settles", () => {
    expect(bounce(BOUNCE_S * 0.27, false).lift).toBeGreaterThan(0.1);
    expect(bounce(BOUNCE_S, false)).toEqual({ lift: 0, squash: 1, tilt: 0 });
    expect(bounce(Number.POSITIVE_INFINITY, false).lift).toBe(0);
  });
});

describe("ekeko look state", () => {
  test("stamps once, caption times out or closes when walking away", () => {
    const l = createLook();
    expect(l.open).toBe(false);
    expect(l.look().stamp).toBe(true);
    expect(l.open).toBe(true);
    expect(l.since).toBe(0);
    l.tick(CAPTION_S - 1, 1);
    expect(l.open).toBe(true);
    l.tick(1.01, 1);
    expect(l.open).toBe(false);
    expect(l.look().stamp).toBe(false);
    l.tick(0.1, CAPTION_AWAY + 0.1);
    expect(l.open).toBe(false);
    l.look();
    l.close();
    expect(l.open).toBe(false);
  });
  test("bilingual copy and the stamp", () => {
    for (const v of Object.values(COPY)) {
      expect(v.es.length).toBeGreaterThan(0);
      expect(v.en.length).toBeGreaterThan(0);
    }
    expect(COPY.body.es).toContain("Alasitas");
    expect(COPY.body.en).toContain("Alasitas");
    expect(STAMP).toEqual({ id: "costa:egg:ekeko", kind: "egg", label: { es: "El Ekeko", en: "The Ekeko" } });
  });
});
