import { describe, expect, test } from "bun:test";
import { ARTIFACTS } from "../../data/career";
import { AI_TOOLS, DAILY, SITE_STACK } from "../../data/uses";
import type { WorldData } from "../data";
import { esc } from "../textmode";
import { SELVA_STATIONS } from "./contract";
import { renderSelvaTextMode, selvaTextCopy, selvaTextId } from "./textmode";

const data: WorldData = {
  repos: [
    {
      name: "alpha",
      description: "First <repo>",
      url: "https://github.com/x/alpha",
      stars: 3,
      language: "Go",
      pushedAt: "2025-01-01",
    },
    {
      name: "beta",
      description: null,
      url: "https://github.com/x/beta",
      stars: 9,
      language: null,
      pushedAt: "2025-01-01",
    },
  ],
  posts: [
    {
      title: "Old post",
      description: "",
      date: "2021-02-03T00:00:00.000Z",
      href: "/es/blog/old/",
      source: "site",
      tags: [],
    },
    {
      title: "New on Medium",
      description: "d",
      date: "2025-05-06T00:00:00.000Z",
      href: "https://medium.com/@x/new",
      source: "medium",
      tags: [],
    },
  ],
};

describe("jungle text mode", () => {
  for (const lang of ["es", "en"] as const) {
    const html = renderSelvaTextMode(lang, data);
    test(`${lang}: one section per stop in road order, plus the canopy and the way back`, () => {
      const ids = [...html.matchAll(/<section class="kw-tm-station" id="([^"]+)"/g)].map((m) => m[1]);
      const want = [...SELVA_STATIONS].sort((a, b) => a.t - b.t).map((s) => selvaTextId(s.id));
      want.splice(want.indexOf(selvaTextId("arcade")) + 1, 0, selvaTextId("dosel"));
      want.push(selvaTextId("fauna"), selvaTextId("volver"));
      expect(ids).toEqual(want);
      expect(html).toContain("Otorongo");
      for (const s of SELVA_STATIONS) expect(html).toContain(esc(s.label[lang]));
    });
    test(`${lang}: the stations' real content`, () => {
      for (const i of [...AI_TOOLS.items, ...SITE_STACK.items, ...DAILY.items]) expect(html).toContain(i.name);
      for (const a of ARTIFACTS) expect(html).toContain(esc(a.name[lang]));
      expect(html.indexOf("New on Medium")).toBeLessThan(html.indexOf("Old post"));
      expect(html.indexOf(">beta<")).toBeLessThan(html.indexOf(">alpha<"));
      expect(html).toContain(`/${lang}/uses/`);
      expect(html).toContain(`/${lang}/blog/`);
      expect(html).toContain(`/${lang}/projects/`);
      expect(html).toContain(`/${lang}/arcade/`);
      expect(html).toContain(`href="/${lang}/world/"`);
      expect(html).toContain(lang === "es" ? "Viaje en canoa" : "Canoe trip");
      expect(html).toContain(lang === "es" ? "Puentes del dosel" : "Canopy walkway");
    });
    test(`${lang}: escapes data and links external sites safely`, () => {
      expect(html).not.toContain("<repo>");
      expect(html).toContain("First &lt;repo&gt;");
      expect(html).toContain('href="https://medium.com/@x/new" target="_blank" rel="noopener"');
    });
  }
  test("offline build: empty states, still complete", () => {
    const html = renderSelvaTextMode("es", { repos: [], posts: [] }, { headingLevel: 2, titleId: "t" });
    expect(html).toContain('<h2 id="t"');
    expect(html).toContain("no llegaron los artículos");
    expect(html).toContain("no llegaron los repositorios");
  });
  test("copy is bilingual", () => {
    expect(Object.keys(selvaTextCopy("es")).sort()).toEqual(Object.keys(selvaTextCopy("en")).sort());
  });
});
