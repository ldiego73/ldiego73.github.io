import { describe, expect, test } from "bun:test";
import { specKey } from "../../../characters/archetype";
import { adult, COAST_PEOPLE, COAST_SPECS, type CoastWho, coastDress } from "./dress";

const seq = (seed: number) => {
  let a = seed;
  return () => {
    a = (a * 16807) % 2147483647;
    return a / 2147483647;
  };
};

describe("coast dress", () => {
  test("every archetype is distinct (one build each) and dressed for the coast", () => {
    const keys = new Set(COAST_SPECS.map(specKey));
    expect(keys.size).toBe(COAST_SPECS.length);
    // No highland garments on the warm coast.
    for (const s of COAST_SPECS) {
      expect(s.hat === undefined || s.hat === "straw").toBe(true);
      for (const l of s.layers ?? []) expect(["skirt", "apron"]).toContain(l.kind);
    }
    expect(COAST_PEOPLE.fisher.feet).toBe("bare");
    expect(COAST_PEOPLE.manHat.feet).toBe("sandals");
    expect(COAST_PEOPLE.womanHat.layers?.some((l) => l.kind === "apron")).toBe(true);
    expect(COAST_PEOPLE.boy.age).toBe("child");
    expect(COAST_PEOPLE.girl.age).toBe("child");
  });

  test("hatless variants only drop the hat", () => {
    const { hat: _a, ...m } = COAST_PEOPLE.manHat;
    expect(COAST_PEOPLE.man).toEqual(m);
    const { hat: _b, ...w } = COAST_PEOPLE.womanHat;
    expect(COAST_PEOPLE.woman).toEqual(w);
    expect(adult(true, true)).toBe("manHat");
    expect(adult(true, false)).toBe("man");
    expect(adult(false, true)).toBe("womanHat");
    expect(adult(false, false)).toBe("woman");
  });

  test("palettes: valid colours, seeded, the slots each garment paints", () => {
    const hex = /^#[0-9a-f]{6}$/i;
    for (const who of Object.keys(COAST_PEOPLE) as CoastWho[]) {
      const d = coastDress(who, seq(7));
      expect(coastDress(who, seq(7))).toEqual(d);
      for (const v of Object.values(d)) expect(v).toMatch(hex);
      expect(d.skin).toBeDefined();
    }
    expect(coastDress("womanHat", seq(3)).shawl).toBeDefined(); // the apron
    expect(coastDress("woman", seq(3)).skirt).toBeDefined();
    expect(coastDress("manHat", seq(3)).hat).toBe("#d8c07a"); // straw
    expect(coastDress("surfer", seq(3)).legs).toBeDefined(); // board shorts
  });
});
