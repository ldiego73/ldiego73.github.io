import { describe, expect, test } from "bun:test";
import { SKILLS } from "../../../../data/career";
import { ISLAND_Y, ISLANDS, WALK_Y } from "../../plan";
import { islandAt, islandPanel, islandPoint, islandPrompt, islandYaw, rampY, spans } from "./logic";

describe("Uros islands", () => {
  test("each panel shows its SKILLS group, all of its items, and its place among the islands", () => {
    ISLANDS.forEach((isl, i) => {
      for (const lang of ["es", "en"] as const) {
        const p = islandPanel(i, lang);
        const g = SKILLS[isl.group];
        expect(p.title).toBe(g?.group[lang] as string);
        expect(p.items).toEqual(g?.items ?? []);
        expect(p.position).toContain(String(i + 1));
        expect(islandPrompt(isl, lang)).toContain(g?.group[lang] as string);
      }
    });
    // Browsing wraps round.
    expect(islandPanel(-1, "es").title).toBe(islandPanel(ISLANDS.length - 1, "es").title);
    expect(islandPanel(ISLANDS.length, "en").title).toBe(islandPanel(0, "en").title);
  });

  test("standing on an island needs its floor's height", () => {
    const isl = ISLANDS[0];
    if (!isl) return;
    expect(islandAt(isl.x, ISLAND_Y, isl.z)?.id).toBe(isl.id);
    expect(islandAt(isl.x, ISLAND_Y + 3, isl.z)).toBeNull();
    expect(islandAt(isl.x + isl.r + 2, ISLAND_Y, isl.z)).toBeNull();
  });

  test("the first span ramps from the landing down to the walk level; the rest are level", () => {
    const [first] = spans();
    if (!first) return;
    expect(rampY(first, 1, first.a[0], first.a[1])).toBeCloseTo(1, 6);
    expect(rampY(first, 1, first.b[0], first.b[1])).toBeCloseTo(WALK_Y, 6);
    // Steps between the ramp and the floors stay walkable (MAX_STEP 0.9).
    expect(Math.abs(ISLAND_Y - WALK_Y)).toBeLessThan(0.5);
    for (const s of spans()) expect(s.halfD).toBeGreaterThan(1);
  });

  test("island frames face the way the boardwalk arrives", () => {
    for (const isl of ISLANDS) {
      const p = islandPoint(isl, 0, isl.r);
      expect(Math.hypot(p.x - isl.x, p.z - isl.z)).toBeCloseTo(isl.r, 6);
      expect(Number.isFinite(islandYaw(isl))).toBe(true);
    }
  });
});
