import { describe, expect, test } from "bun:test";
import { CERTIFICATIONS, EDUCATION, SKILLS } from "../../../../data/career";
import { ISLANDS } from "../../plan";
import {
  ARRIVE_R,
  arrived,
  BURST,
  burstScale,
  finaleTitle,
  glowAt,
  prng,
  spawnSparks,
  statTiles,
  stepSpark,
} from "./logic";

describe("Titikala finale", () => {
  test("the four stats are counted from the data", () => {
    const [groups, skills, studies, certs] = statTiles();
    expect(groups?.value).toBe(String(ISLANDS.length));
    expect(skills?.value).toBe(String(SKILLS.slice(0, ISLANDS.length).reduce((n, g) => n + g.items.length, 0)));
    expect(studies?.value).toBe(String(EDUCATION.length));
    expect(certs?.value).toBe(String(CERTIFICATIONS.length));
  });

  test("title with and without a traveler name", () => {
    expect(finaleTitle("es", "  Ana ")).toBe("¡Lo lograste, Ana!");
    expect(finaleTitle("en", "")).toBe("You made it!");
  });

  test("arrival has hysteresis", () => {
    expect(arrived(false, ARRIVE_R - 0.1)).toBe(true);
    expect(arrived(false, ARRIVE_R + 0.5)).toBe(false);
    expect(arrived(true, ARRIVE_R + 1)).toBe(true);
    expect(arrived(true, ARRIVE_R + 3)).toBe(false);
  });

  test("sparks rise, fall slower than a stone and land on the floor; the glow and size fade out", () => {
    const sparks = spawnSparks(20, 1, 5, prng(1));
    expect(sparks).toHaveLength(20);
    const s = sparks[0];
    if (!s) return;
    const y0 = s.y;
    stepSpark(s, 0.1, 0.1, () => -10);
    expect(s.y).toBeGreaterThan(y0);
    for (let i = 0; i < 2000 && !s.landed; i++) stepSpark(s, 1 / 60, i / 60, () => 0);
    expect(s.landed).toBe(true);
    expect(s.y).toBe(0);
    expect(burstScale(0)).toBe(0);
    expect(burstScale(BURST.life / 2)).toBe(1);
    expect(burstScale(BURST.life)).toBe(0);
    expect(glowAt(-1)).toBe(0);
    expect(glowAt(0.4)).toBeCloseTo(1, 6);
    expect(glowAt(BURST.life)).toBe(0);
  });
});
