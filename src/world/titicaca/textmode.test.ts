import { describe, expect, test } from "bun:test";
import { CERTIFICATIONS, EDUCATION, SKILLS } from "../../data/career";
import { SITE } from "../../data/site";
import { esc } from "../textmode";
import { renderTiticacaTextMode } from "./textmode";
import { TITICACA_WILDLIFE } from "./wildlife";

describe("Collasuyu text mode", () => {
  for (const lang of ["es", "en"] as const) {
    const doc = renderTiticacaTextMode(lang);
    test(`every skill, study and certification from the data (${lang})`, () => {
      for (const g of SKILLS) {
        expect(doc).toContain(esc(g.group[lang]));
        for (const item of g.items) expect(doc).toContain(esc(item));
      }
      for (const e of EDUCATION) {
        expect(doc).toContain(esc(e.title[lang]));
        expect(doc).toContain(esc(e.school));
        expect(doc).toContain(e.years);
      }
      for (const c of CERTIFICATIONS) {
        expect(doc).toContain(esc(c.name));
        expect(doc).toContain(c.years);
      }
    });
    test(`finale links, the way back, wildlife and stamps (${lang})`, () => {
      expect(doc).toContain(SITE.calendly);
      expect(doc).toContain(SITE.resume[lang]);
      expect(doc).toContain(`href="/${lang}/world/cusco/?from=titicaca"`);
      for (const w of TITICACA_WILDLIFE) expect(doc).toContain(esc(w.name[lang]));
      expect(doc).toContain(lang === "es" ? "Sello del pasaporte" : "Passport stamp");
      expect(doc).toContain(lang === "es" ? "Sello extra del pasaporte" : "Bonus passport stamp");
      expect(doc).toContain("Titikala");
      // A vague hint of the lake's night secret (the sunken city), told as a legend.
      expect(doc).toContain(
        lang === "es" ? "Cuentan que el lago guarda una ciudad antigua" : "Legend says the lake keeps",
      );
      expect(doc).toMatch(/<h1 id="kw-titicaca-tm-title"/);
    });
  }
  test("headings shift with the level (the dialog renders under its own title)", () => {
    const doc = renderTiticacaTextMode("es", { headingLevel: 2, titleId: "x" });
    expect(doc).toMatch(/<h2 id="x"/);
    expect(doc).not.toMatch(/<h1/);
  });
});
