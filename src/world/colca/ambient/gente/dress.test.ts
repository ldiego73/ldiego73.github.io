import { describe, expect, test } from "bun:test";
import { COLCA, FLOWERS, outdoor, rng, valleyMan, valleyWoman } from "./dress";

describe("Colca dress", () => {
  test("the valley women wear the white Cabana or Collagua hat and the bordado pollera", () => {
    for (const spec of [COLCA.cabana, COLCA.collagua, COLCA.girl]) {
      expect(["cabana", "collagua"]).toContain(spec.hat as string);
      const pollera = spec.layers?.find((l) => l.kind === "pollera");
      expect(pollera && "region" in pollera ? pollera.region : null).toBe("bordado");
    }
  });

  test("a valley woman's palette: white hat, embroidery in three different threads", () => {
    const r = rng(7);
    for (let i = 0; i < 20; i++) {
      const d = valleyWoman(r);
      expect(d.hat).toBe("#f5f1e8");
      const threads = [d.skirtR, d.skirtG, d.skirtB];
      for (const t of threads) expect(FLOWERS).toContain(t as string);
      expect(new Set(threads).size).toBe(3);
      // The Cabana hat's brim flowers are the same threads.
      expect(threads).toContain(d.hatBand as string);
    }
  });

  test("palettes are seeded (every visit dresses people the same way)", () => {
    expect(valleyWoman(rng(3))).toEqual(valleyWoman(rng(3)));
    expect(valleyMan(rng(3))).toEqual(valleyMan(rng(3)));
    expect(outdoor(rng(3), true)).toEqual(outdoor(rng(3), true));
  });

  test("walkers carry a day pack; visitors and archaeologists without one", () => {
    expect(COLCA.trekker.worn).toContain("daypack");
    expect(COLCA.trekkerWoman.worn).toContain("daypack");
    expect(COLCA.tourist.worn ?? []).not.toContain("daypack");
    expect(COLCA.archaeologist.hat).toBe("sunhat");
    expect(COLCA.archaeologist.worn ?? []).not.toContain("daypack");
  });
});
