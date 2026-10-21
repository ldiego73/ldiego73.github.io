import { describe, expect, test } from "bun:test";
import type { WorldId } from "./events";
import { hexLinear, hueOnly, inkColor, KW_SLOTS, luma, packStyle, profileColors, SLOT, STYLES, WIND } from "./style";

const WORLDS: WorldId[] = ["qhapaq", "wasi", "selva", "cusco", "costa", "titicaca", "colca"];

describe("profiles", () => {
  test("every world has a style and a wind profile with sane numbers", () => {
    for (const w of WORLDS) {
      const s = STYLES[w];
      expect(s.shadowStrength).toBeGreaterThan(0);
      expect(s.shadowStrength).toBeLessThanOrEqual(1);
      expect(s.cel.lit).toBeGreaterThan(0.5);
      expect(s.cel.shade).toBeLessThan(s.cel.lit);
      expect(s.atmosphere.far).toBeGreaterThan(s.atmosphere.near);
      expect(s.ink.silhouette).toBeGreaterThanOrEqual(1);
      expect(s.paint.amount).toBeLessThanOrEqual(0.2);
      expect(s.clouds.cover).toBeLessThanOrEqual(1);
      // Ink is warm/coloured, never black.
      expect(luma(hexLinear(s.ink.color))).toBeGreaterThan(0.005);
      expect(WIND[w].strength).toBeGreaterThan(0);
      expect(WIND[w].gust.length).toBeGreaterThan(0);
    }
  });
  test("the jungle floor is calm, the coast has few gusts, the lake is the gustiest", () => {
    expect(WIND.selva.calm?.k).toBeLessThan(1);
    expect(WIND.costa.gust.amp).toBeLessThan(WIND.qhapaq.gust.amp);
    expect(WIND.titicaca.gust.amp).toBeGreaterThanOrEqual(Math.max(...WORLDS.map((w) => WIND[w].gust.amp)));
  });
});

describe("colour helpers", () => {
  test("hex to linear matches the sRGB curve", () => {
    expect(hexLinear("#ffffff")).toEqual([1, 1, 1]);
    expect(hexLinear("#000000")).toEqual([0, 0, 0]);
    expect(hexLinear("#808080")[0]).toBeCloseTo(0.2159, 3);
  });
  test("hueOnly keeps the hue at unit luminance and caps channels", () => {
    const h = hueOnly(hexLinear("#5d5cb4"));
    expect(Math.max(...h)).toBeLessThanOrEqual(1.9 + 1e-9);
    expect(h[2]).toBeGreaterThan(h[0]);
    const g = hueOnly([0.5, 0.5, 0.5]);
    for (const c of g) expect(c).toBeCloseTo(1, 6);
  });
});

describe("packing", () => {
  test("writes the cel, paint and haze slots; the haze vanishes in the title void", () => {
    const p = STYLES.qhapaq;
    const c = profileColors(p);
    const u = new Float32Array(KW_SLOTS * 4);
    packStyle(p, c, { keyRef: 2, fog: [0.7, 0.8, 0.8], night: 0, void: 0 }, u);
    expect(u[SLOT.CEL0 * 4]).toBeCloseTo(p.cel.lit, 6);
    expect(u[SLOT.CEL1 * 4 + 3]).toBeCloseTo(p.shadowStrength, 6);
    expect(u[SLOT.CEL2 * 4 + 2]).toBe(2);
    expect(u[SLOT.PAINT0 * 4 + 1]).toBeCloseTo(1 / p.paint.scale, 6);
    expect(u[SLOT.ATMO0 * 4 + 3]).toBeCloseTo(p.atmosphere.strength, 6);
    // Haze is bluer than the fog it comes from.
    const hz = [u[SLOT.ATMO0 * 4], u[SLOT.ATMO0 * 4 + 1], u[SLOT.ATMO0 * 4 + 2]] as number[];
    expect((hz[2] as number) - (hz[0] as number)).toBeGreaterThan(0.8 - 0.7);
    packStyle(p, c, { keyRef: 2, fog: [0.7, 0.8, 0.8], night: 0, void: 1 }, u);
    expect(u[SLOT.ATMO0 * 4 + 3]).toBe(0);
    // Wind and flag slots are left alone.
    expect(u[SLOT.W0 * 4]).toBe(0);
    expect(u[SLOT.FLAGS * 4]).toBe(0);
  });
  test("ink drifts from the day ink to the night ink", () => {
    const c = profileColors(STYLES.qhapaq);
    const day = inkColor(c, 0);
    const night = inkColor(c, 1);
    for (let i = 0; i < 3; i++) {
      expect(day[i]).toBeCloseTo(c.ink[i] as number, 9);
      expect(night[i]).toBeCloseTo(c.inkNight[i] as number, 9);
    }
  });
});
