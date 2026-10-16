import { describe, expect, test } from "bun:test";
import { finaleStats } from "../../content";
import { arrived, BURST, bitScale, finaleTitle, prng, spawnBits, statTiles, stepBit } from "./logic";

describe("Kuntisuyu finale", () => {
  test("four true stat tiles; zeros dropped", () => {
    const s = finaleStats();
    const tiles = statTiles(s);
    expect(tiles.map((t) => t.key)).toEqual(["artifacts", "knots", "stages", "companies"]);
    expect(tiles[0]?.value).toBe(String(s.artifacts));
    expect(statTiles({ ...s, knots: 0 }).length).toBe(3);
  });

  test("title with and without the traveler's name", () => {
    expect(finaleTitle("es", "Ana")).toBe("¡Lo lograste, Ana!");
    expect(finaleTitle("en", "  ")).toBe("You made it!");
  });

  test("arrival hysteresis", () => {
    expect(arrived(false, 4, 5)).toBe(true);
    expect(arrived(true, 6, 5)).toBe(true);
    expect(arrived(true, 8, 5)).toBe(false);
  });

  test("feathers and confetti fly up and settle on the floor", () => {
    const bits = spawnBits(30, 4, 5, prng(3));
    expect(bits.length).toBe(30);
    for (let k = 0; k < 2400; k++) for (const b of bits) stepBit(b, 1 / 60, k / 60, () => 0);
    for (const b of bits) {
      expect(b.landed).toBe(true);
      expect(b.y).toBe(0);
    }
    expect(bitScale(0)).toBe(0);
    expect(bitScale(BURST.life)).toBe(0);
    expect(bitScale(3)).toBe(1);
  });
});
