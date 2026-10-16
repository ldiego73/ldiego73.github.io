import { describe, expect, test } from "bun:test";
import { buildTiticacaLayout, landField } from "../../layout";
import { FROG_SPOT, ISLANDS, TROUT } from "../../plan";
import { canSail, docks } from "../balsa/logic";
import {
  CAPTION,
  holdLook,
  isGoodLook,
  LABEL,
  LOOK_HOLD,
  LOOK_R,
  nightAmount,
  pulse,
  reveal,
  SIZE,
  SPOT,
  STAMP_ID,
} from "./logic";

const L = buildTiticacaLayout({ cells: 120 });
const ds = docks(0.8);

describe("the sunken city", () => {
  test("lies in deep open water, off the reed shelf, where the balsa can sail over it", () => {
    expect(L.isWater(SPOT.x, SPOT.z)).toBe(true);
    // The reed shelf ends ~14 u from the waterline (layout.ts baseHeight); the whole decal sits past it.
    expect(landField(SPOT.x, SPOT.z)).toBeLessThan(-SIZE);
    expect(canSail(SPOT.x, SPOT.z, ds)).toBe(true);
    for (const i of ISLANDS) expect(Math.hypot(i.x - SPOT.x, i.z - SPOT.z)).toBeGreaterThan(i.r + SIZE);
    expect(Math.hypot(FROG_SPOT.x - SPOT.x, FROG_SPOT.z - SPOT.z)).toBeGreaterThan(SIZE);
    for (const t of TROUT) expect(Math.hypot(t.x - SPOT.x, t.z - SPOT.z)).toBeGreaterThan(SIZE);
  });

  test("the Taquile pier's tip is close enough to stamp, the road is not", () => {
    const pier = ds[1].stand;
    expect(Math.hypot(pier.x - SPOT.x, pier.z - SPOT.z)).toBeLessThan(LOOK_R - 2);
    const p = L.trail.pointAt(L.trail.nearestT(SPOT.x, SPOT.z));
    expect(Math.hypot(p.x - SPOT.x, p.z - SPOT.z) - L.trail.halfWidth).toBeGreaterThan(LOOK_R + 10);
    // …but the road still sees its glow at night.
    expect(reveal(Math.hypot(p.x - SPOT.x, p.z - SPOT.z), 1).glow).toBeGreaterThan(0.9);
  });

  test("only at night: nothing by day or at dusk, full by midnight", () => {
    expect(nightAmount(0.5)).toBe(0);
    expect(nightAmount(0.27)).toBe(0);
    expect(nightAmount(0.75)).toBe(0);
    expect(nightAmount(0)).toBe(1);
    expect(nightAmount(0.9)).toBe(1);
    expect(reveal(5, 0)).toEqual({ glow: 0, ruins: 0 });
  });

  test("the ruins show only up close, the glow from afar", () => {
    const near = reveal(10, 1);
    const mid = reveal(30, 1);
    const far = reveal(120, 1);
    expect(near.ruins).toBe(1);
    expect(mid.ruins).toBeGreaterThan(0);
    expect(mid.ruins).toBeLessThan(1);
    expect(far.ruins).toBe(0);
    expect(far.glow).toBeGreaterThan(0);
    expect(reveal(400, 1).glow).toBe(0);
  });

  test("the pulse breathes, still under reduced motion", () => {
    expect(pulse(0, true)).toBe(pulse(3, true));
    expect(pulse(1.2, false)).not.toBe(pulse(3.6, false));
    for (let t = 0; t < 10; t += 0.37) {
      expect(pulse(t, false)).toBeGreaterThanOrEqual(0.6);
      expect(pulse(t, false)).toBeLessThanOrEqual(1);
    }
  });

  test("a good look: night, in range, on screen, held for a moment", () => {
    const on = { x: 0.1, y: -0.2, z: 0.9 };
    expect(isGoodLook({ dist: 20, night: true, ndc: on })).toBe(true);
    expect(isGoodLook({ dist: 20, night: false, ndc: on })).toBe(false);
    expect(isGoodLook({ dist: LOOK_R + 1, night: true, ndc: on })).toBe(false);
    expect(isGoodLook({ dist: 20, night: true, ndc: { x: 0.95, y: 0, z: 0.9 } })).toBe(false);
    expect(isGoodLook({ dist: 20, night: true, ndc: { x: 0, y: 0, z: 1.2 } })).toBe(false);
    let s = { seen: 0, done: false };
    for (let i = 0; i < 5; i++) s = holdLook(s.seen, true, 0.1);
    expect(s.done).toBe(false);
    s = holdLook(s.seen, false, 0.1);
    expect(s.seen).toBe(0);
    for (let i = 0; i < Math.ceil(LOOK_HOLD / 0.1) + 1; i++) s = holdLook(s.seen, true, 0.1);
    expect(s.done).toBe(true);
  });

  test("bilingual copy, told as a legend", () => {
    expect(STAMP_ID).toBe("titicaca:egg:sunken-city");
    expect(LABEL.es && LABEL.en).toBeTruthy();
    expect(CAPTION.es.startsWith("Cuentan que")).toBe(true);
    expect(CAPTION.en.startsWith("Legend says")).toBe(true);
  });
});
