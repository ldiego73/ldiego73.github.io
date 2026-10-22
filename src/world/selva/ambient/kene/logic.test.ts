import { describe, expect, test } from "bun:test";
import {
  arrived,
  BURST,
  burstScale,
  countStamps,
  finaleTitle,
  glowAt,
  morphoAt,
  prng,
  spawnMorphos,
  spawnPetals,
  statTiles,
  stepPetal,
} from "./logic";

const counts = { tools: 40, posts: 8, projects: 7, games: 9, stamps: { got: 6, total: 10 } };

describe("finale stats", () => {
  test("three counts and the stamps, in order", () => {
    const t = statTiles(counts);
    expect(t.map((x) => x.key)).toEqual(["tools", "posts", "projects", "stamps"]);
    expect(t[3]?.value).toBe("6/10");
    expect(t[0]?.label.es).toContain("herramientas");
    expect(t[0]?.label.en).toContain("tools");
  });
  test("an empty source is dropped, never invented", () => {
    const t = statTiles({ ...counts, posts: 0 });
    expect(t.map((x) => x.key)).toEqual(["tools", "projects", "games", "stamps"]);
    expect(t.find((x) => x.key === "games")?.value).toBe("9");
    const none = statTiles({ tools: 0, posts: 0, projects: 0, games: 0, stamps: { got: 0, total: 0 } });
    expect(none).toEqual([]);
  });
  test("stamps clamp to the total", () => {
    expect(statTiles({ ...counts, stamps: { got: 14, total: 10 } }).at(-1)?.value).toBe("10/10");
  });
  test("counts only required stamps the traveler has", () => {
    expect(countStamps(["a", "b", "c"], new Set(["a", "c", "zzz"]))).toEqual({ got: 2, total: 3 });
  });
});

describe("finale title", () => {
  test("with and without a name, both languages", () => {
    expect(finaleTitle("es", "Ana")).toBe("¡Lo lograste, Ana!");
    expect(finaleTitle("en", "Ana")).toBe("You made it, Ana!");
    expect(finaleTitle("es", "  ")).toBe("¡Lo lograste!");
    expect(finaleTitle("en", "")).toBe("You made it!");
  });
});

describe("arrival", () => {
  test("hysteresis", () => {
    expect(arrived(false, 4, 4.5)).toBe(true);
    expect(arrived(false, 5, 4.5)).toBe(false);
    expect(arrived(true, 6, 4.5)).toBe(true);
    expect(arrived(true, 7, 4.5)).toBe(false);
  });
});

describe("celebration burst", () => {
  test("petals fly up, then flutter down and rest on the floor", () => {
    const rand = prng(3);
    const ps = spawnPetals(40, 7, 5, rand);
    const floor = () => 0;
    let maxY = 0;
    for (let k = 0; k < 60 * BURST.life; k++) {
      for (const p of ps) stepPetal(p, 1 / 60, k / 60, floor);
      maxY = Math.max(maxY, ...ps.map((p) => p.y));
    }
    expect(maxY).toBeGreaterThan(7.5);
    for (const p of ps) {
      expect(p.y).toBeCloseTo(0.02, 5);
      // Drifted out from the totem but stays near the plaza.
      expect(Math.hypot(p.x, p.z)).toBeLessThan(9);
    }
    expect(new Set(ps.map((p) => p.c)).size).toBe(5);
  });
  test("falling petals drift downwind, resting ones stay put", () => {
    const still = spawnPetals(30, 7, 5, prng(4));
    const blown = spawnPetals(30, 7, 5, prng(4));
    const floor = () => 0;
    for (let k = 0; k < 60 * BURST.life; k++) {
      for (const p of still) stepPetal(p, 1 / 60, k / 60, floor);
      for (const p of blown) stepPetal(p, 1 / 60, k / 60, floor, { x: 0.5, z: 0 });
    }
    const meanX = (ps: typeof still) => ps.reduce((a, p) => a + p.x, 0) / ps.length;
    expect(meanX(blown)).toBeGreaterThan(meanX(still) + 0.5);
    for (const p of blown) expect(p.y).toBeCloseTo(0.02, 5);
    const rest = blown.map((p) => p.x);
    for (const p of blown) stepPetal(p, 1 / 60, 99, floor, { x: 3, z: 0 });
    expect(blown.map((p) => p.x)).toEqual(rest);
  });
  test("morphos climb and spiral outward", () => {
    for (const m of spawnMorphos(12, prng(9))) {
      const a = morphoAt(m, 0.2, 7);
      const b = morphoAt(m, 5, 7);
      expect(b.y).toBeGreaterThan(a.y + 1);
      expect(Math.hypot(b.x, b.z)).toBeGreaterThan(Math.hypot(a.x, a.z) + 2);
      expect(Number.isFinite(b.yaw)).toBe(true);
    }
  });
  test("scale and glow envelopes", () => {
    expect(burstScale(-1)).toBe(0);
    expect(burstScale(0.1)).toBeGreaterThan(0);
    expect(burstScale(2)).toBe(1);
    expect(burstScale(BURST.life)).toBe(0);
    expect(glowAt(0)).toBe(0);
    expect(glowAt(1)).toBe(1);
    expect(glowAt(3)).toBeGreaterThan(0);
    expect(glowAt(3)).toBeLessThan(1);
    expect(glowAt(5)).toBe(0);
  });
});
