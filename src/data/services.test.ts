import { describe, expect, test } from "bun:test";
import { BUDGETS, FAQ, FORMATS, fromPrice, STEPS } from "./services";

describe("services", () => {
  test("fromPrice formats one-off and monthly floors in both languages", () => {
    expect(fromPrice("es", { fromUsd: 1500 })).toBe("Desde USD 1,500");
    expect(fromPrice("en", { fromUsd: 2500 })).toBe("From USD 2,500");
    expect(fromPrice("es", { fromUsd: 1000, monthly: true })).toBe("Desde USD 1,000 / mes");
    expect(fromPrice("en", { fromUsd: 1000, monthly: true })).toBe("From USD 1,000 / month");
  });

  test("formats have unique ids and growing knots", () => {
    expect(new Set(FORMATS.map((f) => f.id)).size).toBe(FORMATS.length);
    FORMATS.forEach((f, i) => {
      expect(f.knots).toBe(i + 1);
      expect(f.fromUsd).toBeGreaterThan(0);
    });
  });

  test("every string is bilingual", () => {
    const strings = [
      ...FORMATS.flatMap((f) => [f.name, f.kicker, f.pitch, f.priceNote, f.ai, f.fit, f.cta, ...f.items]),
      ...STEPS.flatMap((s) => [s.title, s.text, s.ai]),
      ...FAQ.flatMap((q) => [q.q, q.a]),
      ...BUDGETS,
    ];
    for (const s of strings) {
      expect(s.es.trim()).not.toBe("");
      expect(s.en.trim()).not.toBe("");
    }
  });
});
