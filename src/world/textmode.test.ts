import { describe, expect, test } from "bun:test";
import { CATALOG } from "../lib/passport";
import { renderPassport, renderTextMode, renderWildlife } from "./textmode";
import { WILDLIFE } from "./wildlife";

const data = { repos: [], posts: [] } as unknown as Parameters<typeof renderTextMode>[1];

describe("text mode wildlife", () => {
  test("every species has bilingual facts and a real passport stamp when it names one", () => {
    const ids = new Set(CATALOG.map((s) => s.id));
    for (const w of WILDLIFE) {
      for (const k of ["name", "where", "when", "does"] as const) {
        expect(w[k].es.length).toBeGreaterThan(3);
        expect(w[k].en.length).toBeGreaterThan(3);
      }
      if (w.stamp) expect(ids.has(w.stamp)).toBe(true);
    }
    // Every wildlife stamp in the passport has a field-guide entry.
    for (const s of CATALOG.filter((x) => x.kind === "fauna"))
      expect(WILDLIFE.some((w) => w.stamp === s.id)).toBe(true);
  });

  test("renders one heading + definition list per species, inside the narration", () => {
    const html = renderWildlife("es", 3);
    expect(html.match(/<h3>/g)?.length).toBe(WILDLIFE.length);
    expect(html.match(/<dl class="kw-tm-facts">/g)?.length).toBe(WILDLIFE.length);
    const doc = renderTextMode("en", data, { headingLevel: 1 });
    expect(doc).toContain("Wildlife on the trail");
    expect(doc).toContain("Spectacled bear");
    expect(doc).not.toContain("kw-tm-passport");
  });
});

describe("text mode passport", () => {
  test("counts by section, hides undiscovered secrets, shows the best climb", () => {
    const html = renderPassport(
      "es",
      { "station:gate": 1, "fauna:oso": 2, "ride:llama": 3 },
      { bestMs: 545_000, climbs: 2 },
      4,
    );
    expect(html).toContain(`3 de ${CATALOG.length}`);
    const stations = CATALOG.filter((x) => x.kind === "station").length;
    expect(html).toContain(`Estaciones <span class="kw-tm-count">1 de ${stations}</span>`);
    expect(html).toContain("Oso de anteojos");
    // Puma not seen yet: its name stays secret.
    expect(html).not.toContain(">Puma<");
    expect(html).toContain("Sello secreto");
    expect(html).toContain("9 min 05 s · 2 subidas");
    expect(html.match(/<li data-stamp=/g)?.length).toBe(CATALOG.length);
  });

  test("no climb yet", () => {
    expect(renderPassport("en", {}, { bestMs: null, climbs: 0 }, 4)).toContain("No timed climb completed yet.");
  });

  test("the in-world document reserves the passport section first", () => {
    const doc = renderTextMode("es", data, { headingLevel: 2, idPrefix: "x-", passport: true });
    expect(doc.indexOf(`id="x-passport"`)).toBeLessThan(doc.indexOf(`id="x-gate"`));
    expect(doc).toContain('href="#x-passport"');
  });
});
