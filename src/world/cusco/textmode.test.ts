import { describe, expect, test } from "bun:test";
import { SITE } from "../../data/site";
import { GATES } from "./plan";
import { renderCuscoTextMode } from "./textmode";

describe("Cusco text mode", () => {
  for (const lang of ["es", "en"] as const) {
    const doc = renderCuscoTextMode(lang);
    test(`every gate, its state and a link only for open worlds (${lang})`, () => {
      for (const g of GATES) expect(doc).toContain(g.name[lang]);
      expect(doc).toContain(lang === "es" ? "Próximamente" : "Coming soon");
      expect(doc).toContain(`href="/${lang}/world/selva/"`);
      expect(doc).toContain(`href="/${lang}/world/?from=cusco"`);
      expect(doc).not.toContain("/world/colca");
      expect(doc).toContain(`href="/${lang}/world/titicaca/"`);
      expect(doc).not.toContain("/world/colca");
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
    });
  }
});
