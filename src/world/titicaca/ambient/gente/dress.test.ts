import { describe, expect, test } from "bun:test";
import { PEOPLE } from "../../../characters/presets";
import { LAKE_SPECS, lookOf, propOf, specOf } from "./dress";
import { gathering, type Role, spots } from "./logic";

const r = () => 0.42;

describe("the lake's people: who they are", () => {
  test("every role maps to a prefetched archetype with a full palette", () => {
    const roles = new Set<Role>([...spots(), ...gathering(true)].map((s) => s.role));
    for (const extra of ["fisher", "walk", "travel"] as const) roles.add(extra);
    for (const role of roles)
      for (const seed of [3, 4, 59, 80, 101, 200, 398, 500, 503]) {
        const w = specOf(role, seed);
        expect(LAKE_SPECS).toContain(w.spec);
        const d = w.palette(r);
        expect(d.skin).toMatch(/^#/);
      }
  });

  test("Taquile's dress only on Taquile's weavers", () => {
    expect(specOf("knit", 59).spec).toBe(PEOPLE.taquile);
    expect(specOf("knit", 59).palette(r).hat).toBe("#b8282f");
    // A Taquile spinner (seed < 100) has no hat; the shepherdess (seed ≥ 100) wears the bombín.
    expect(specOf("spin", 80).spec.hat).toBeUndefined();
    expect(specOf("spin", 80).palette(r).skirt).toBe("#b8282f");
    expect(specOf("spin", 398).spec.hat).toBe("bowler");
  });

  test("children, the paqo, men and women", () => {
    expect(specOf("kid", 3).kid).toBe(true);
    expect(specOf("kid", 3).spec.age).toBe("child");
    expect(specOf("paqo", 7).spec.age).toBe("elder");
    expect(specOf("fisher", 101).spec.sex).toBe("m");
    expect(specOf("wave", 3).spec.hat).toBe("bowler");
    expect(specOf("travel", 500).spec.sex).toBe("m");
    expect(specOf("travel", 503).spec.sex).toBe("f");
    expect(specOf("travel", 504).spec.hat).toBe("felt");
  });

  test("loads and tools", () => {
    expect(propOf("knit", 59)?.kind).toBe("knitting");
    expect(propOf("spin", 80)?.kind).toBe("pushka");
    expect(propOf("fisher", 101)?.kind).toBe("net");
    expect(propOf("mother", 9)?.kind).toBe("qipi");
    // Every woman traveller carries her q'ipi; men only on every fourth seed.
    expect(propOf("travel", 503)?.kind).toBe("qipi");
    expect(propOf("travel", 500)?.kind).toBe("qipi");
    expect(propOf("travel", 502)).toBeNull();
    expect(propOf("hearth", 3)).toBeNull();
  });

  test("busy hands and running children do not glance at the traveler", () => {
    for (const role of ["kid", "fisher", "knit", "sitWeave", "paqo", "pray"] as const) expect(lookOf(role)).toBe(0);
    expect(lookOf("wave")).toBeGreaterThan(0);
  });
});
