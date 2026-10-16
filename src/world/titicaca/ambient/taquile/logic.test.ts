import { describe, expect, test } from "bun:test";
import { CERTIFICATIONS, EDUCATION } from "../../../../data/career";
import { LOOM } from "../../plan";
import { HOUSES, inLoomRange, LOOM_R, TAQUILE_COPY, taquilePanel, WORKSHOP } from "./logic";

describe("Taquile", () => {
  test("the panel lists exactly the education and certifications in the data", () => {
    for (const lang of ["es", "en"] as const) {
      const p = taquilePanel(lang);
      expect(p.education.map((r) => r.title)).toEqual(EDUCATION.map((e) => e.title[lang]));
      expect(p.education.map((r) => r.detail)).toEqual(EDUCATION.map((e) => e.school));
      expect(p.certs.map((r) => r.title)).toEqual(CERTIFICATIONS.map((c) => c.name));
      expect(p.certs.map((r) => r.years)).toEqual(CERTIFICATIONS.map((c) => c.years));
      expect(TAQUILE_COPY.prompt[lang].startsWith("E ·")).toBe(true);
    }
  });

  test("the loom's prompt range, and buildings clear of the loom", () => {
    expect(inLoomRange(LOOM.x, LOOM.z + LOOM_R - 0.1)).toBe(true);
    expect(inLoomRange(LOOM.x, LOOM.z + LOOM_R + 0.5)).toBe(false);
    for (const h of [...HOUSES, WORKSHOP]) expect(Math.hypot(h.x - LOOM.x, h.z - LOOM.z)).toBeGreaterThan(2.5);
  });
});
