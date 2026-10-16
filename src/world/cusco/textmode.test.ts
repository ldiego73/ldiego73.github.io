import { describe, expect, test } from "bun:test";
import { SITE } from "../../data/site";
import { GATES } from "./plan";
import { renderCuscoTextMode } from "./textmode";

describe("Cusco text mode", () => {
  for (const lang of ["es", "en"] as const) {
    const doc = renderCuscoTextMode(lang);
    test(`every gate, its state and a link to every world (${lang})`, () => {
      for (const g of GATES) expect(doc).toContain(g.name[lang]);
      for (const g of GATES) expect(g.available).toBe(true);
      expect(doc).not.toContain(lang === "es" ? "Próximamente" : "Coming soon");
      expect(doc).toContain(`href="/${lang}/world/selva/"`);
      expect(doc).toContain(`href="/${lang}/world/?from=cusco"`);
      expect(doc).toContain(`href="/${lang}/world/costa/?from=cusco"`);
      expect(doc).toContain(`href="/${lang}/world/titicaca/?from=cusco"`);
      expect(doc).toContain(`href="/${lang}/world/colca/?from=cusco"`);
      // The jungle's punku returns to the mountain's tinkuy, not to the hub: the text says so.
      expect(doc).toContain("tinkuy");
    });
    test(`khipu, finale, chasqui contact and stamps (${lang})`, () => {
      expect(doc).toContain(SITE.email);
      expect(doc).toContain(SITE.calendly);
      expect(doc).toContain(SITE.resume[lang]);
      expect(doc).toContain("Qorikancha");
      expect(doc).toContain("Hatun Rumiyoc");
      expect(doc).toContain(lang === "es" ? "Sello del pasaporte" : "Passport stamp");
      expect(doc).toContain(lang === "es" ? "Sello extra del pasaporte" : "Bonus passport stamp");
      expect(doc).toMatch(/<h1 id="kw-cusco-tm-title"/);
      // A vague hint of the midnight ukuku (ambient/ukuku.ts), never its name or its spot.
      expect(doc).toContain(lang === "es" ? "pasada la medianoche" : "past midnight");
      expect(doc).not.toContain("ukuku");
    });
  }
});
