import { describe, expect, test } from "bun:test";
import { buildLayout, SUMMIT } from "../../layout";
import { detectCells } from "./cap";

describe("snow cap lattice", () => {
  // The overlay only lies exactly on the terrain if it samples the same grid (high 280, low 190 cells).
  for (const cells of [190, 280])
    test(`detects the ${cells}-cell terrain grid`, () => {
      const L = buildLayout({ cells });
      for (const guesses of [
        [280, 190],
        [190, 280],
      ])
        expect(detectCells(L.heightAt, SUMMIT.x + 22, SUMMIT.z + 9, guesses)).toBe(cells);
    });
});
