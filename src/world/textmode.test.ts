import { describe, expect, test } from "bun:test";
import { SITE } from "../data/site";
import { CATALOG, WORLD_PAGES, worldOf } from "../lib/passport";
import { esc, renderPassport, renderTextMode, renderWildlife } from "./textmode";
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
    // Every mountain wildlife stamp in the passport has a field-guide entry (the jungle has its own guide).
    for (const s of CATALOG.filter((x) => x.kind === "fauna" && worldOf(x) === "qhapaq"))
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
    const stations = CATALOG.filter((x) => x.kind === "station" && worldOf(x) === "qhapaq").length;
    expect(html).toContain(
      `<h5 data-group="qhapaq:station">Estaciones <span class="kw-tm-count">1 de ${stations}</span>`,
    );
    const jungleStations = CATALOG.filter((x) => x.kind === "station" && worldOf(x) === "selva").length;
    expect(html).toContain(
      `<h5 data-group="selva:station">Estaciones <span class="kw-tm-count">0 de ${jungleStations}</span>`,
    );
    expect(html).toContain("Oso de anteojos");
    // Puma not seen yet: its name stays secret.
    expect(html).not.toContain(">Puma<");
    expect(html).toContain("Sello secreto");
    expect(html).toContain("9 min 05 s · 2 subidas");
    expect(html.match(/<li data-stamp=/g)?.length).toBe(CATALOG.length);
  });

  test("groups stamps by world page, in WORLD_PAGES order, with per-page counts", () => {
    const html = renderPassport("en", { "wasi:sala": 1, "wasi:mesa": 2 }, { bestMs: null, climbs: 0 }, 4);
    const at = WORLD_PAGES.map((page) => html.indexOf(`<h4 data-page="${page.id}">`));
    for (const i of at) expect(i).toBeGreaterThanOrEqual(0);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const rooms = CATALOG.filter((x) => worldOf(x) === "wasi").length;
    expect(html).toContain(`<h4 data-page="wasi">Wasi · the house <span class="kw-tm-count">2 of ${rooms}</span>`);
    expect(html).toContain("Living room · career");
    // Jungle wildlife stays secret until found.
    expect(html).not.toContain("Scarlet macaw");
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

describe("text mode trailhead: Wasi house and the tinkuy", () => {
  test("narrates the house and its four rooms right after the gate, from career.ts and site.ts", () => {
    for (const lang of ["es", "en"] as const) {
      const doc = renderTextMode(lang, data);
      const gate = doc.indexOf(`id="kw-tm-gate"`);
      const wasi = doc.indexOf(`id="kw-tm-wasi"`);
      const tinkuy = doc.indexOf(`id="kw-tm-tinkuy"`);
      expect(gate).toBeGreaterThanOrEqual(0);
      expect(wasi).toBeGreaterThan(gate);
      expect(tinkuy).toBeGreaterThan(wasi);
      expect(tinkuy).toBeLessThan(doc.indexOf(`id="kw-tm-avances"`));
      for (const room of ["sala", "estudio", "buzon", "mesa"]) {
        const label = CATALOG.find((x) => x.id === `wasi:${room}`)?.label[lang] ?? "";
        expect(doc).toContain(esc(label));
      }
      expect(doc).toContain(`href="${SITE.resume.es}"`);
      expect(doc).toContain(`href="${SITE.resume.en}"`);
      expect(doc).toContain(`href="mailto:${SITE.email}"`);
      expect(doc).toContain("Universidad Complutense de Madrid");
      expect(doc).toContain("Globant");
    }
  });

  test("the Antisuyu branch links to the jungle page with a normal link", () => {
    expect(renderTextMode("es", data)).toContain('href="/es/world/selva/"');
    const en = renderTextMode("en", data);
    expect(en).toContain('href="/en/world/selva/"');
    expect(en).toContain("Tinkuy · the crossroads");
    expect(en).toContain("punku");
  });
});
