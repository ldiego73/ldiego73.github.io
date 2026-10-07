/** The jungle field guide covers every jungle fauna stamp and is fully bilingual. */
import { describe, expect, test } from "bun:test";
import { CATALOG } from "../../lib/passport";
import { SELVA_WILDLIFE } from "./wildlife";

const faunaStamps = CATALOG.filter((s) => s.id.startsWith("selva:fauna:")).map((s) => s.id);

describe("jungle field guide", () => {
  test("every selva:fauna stamp in the passport has an entry", () => {
    expect(faunaStamps.length).toBeGreaterThan(0);
    const stamps = new Set(SELVA_WILDLIFE.map((s) => s.stamp).filter(Boolean));
    for (const id of faunaStamps) expect(stamps.has(id)).toBe(true);
  });

  test("every stamp an entry names exists in the catalog, once", () => {
    const seen = new Set<string>();
    for (const s of SELVA_WILDLIFE) {
      if (!s.stamp) continue;
      expect(faunaStamps).toContain(s.stamp);
      expect(seen.has(s.stamp)).toBe(false);
      seen.add(s.stamp);
    }
  });

  test("entries are bilingual and complete, with unique ids", () => {
    const ids = new Set<string>();
    for (const s of SELVA_WILDLIFE) {
      expect(ids.has(s.id)).toBe(false);
      ids.add(s.id);
      expect(s.latin.trim().length).toBeGreaterThan(0);
      for (const field of [s.name, s.where, s.when, s.does]) {
        expect(field.es.trim().length).toBeGreaterThan(0);
        expect(field.en.trim().length).toBeGreaterThan(0);
      }
      // A translation, not a copy (names like "Otorongo (jaguar)" may share words, the prose may not).
      expect(s.does.es).not.toBe(s.does.en);
      expect(s.where.es).not.toBe(s.where.en);
    }
  });
});
