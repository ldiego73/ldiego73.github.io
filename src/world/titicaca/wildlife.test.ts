import { describe, expect, test } from "bun:test";
import { CATALOG } from "../../lib/passport";
import { TITICACA_WILDLIFE } from "./wildlife";

describe("Collasuyu field guide", () => {
  test("every lake fauna stamp has its species, and every species' stamp exists", () => {
    const stamps = CATALOG.filter((s) => s.id.startsWith("titicaca:fauna:")).map((s) => s.id);
    expect(TITICACA_WILDLIFE.map((w) => w.stamp).sort()).toEqual([...stamps].sort());
    for (const w of TITICACA_WILDLIFE) {
      expect(CATALOG.find((s) => s.id === w.stamp)?.kind).toBe("fauna");
      for (const f of [w.name, w.where, w.when, w.does]) {
        expect(f.es.length).toBeGreaterThan(2);
        expect(f.en.length).toBeGreaterThan(2);
      }
    }
  });
});
