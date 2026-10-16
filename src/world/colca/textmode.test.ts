import { describe, expect, test } from "bun:test";
import { ARTIFACTS, COMPANIES } from "../../data/career";
import { SITE } from "../../data/site";
import { GLYPHS } from "./glyphs";
import { renderColcaTextMode } from "./textmode";
import { COLCA_WILDLIFE } from "./wildlife";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

describe("Kuntisuyu text mode", () => {
  for (const lang of ["es", "en"] as const) {
    const doc = renderColcaTextMode(lang);
    test(`every stage, knot, artifact and figure (${lang})`, () => {
      for (const c of COMPANIES) {
        expect(doc).toContain(esc(c.name));
        for (const s of c.stages) for (const k of s.knots) expect(doc).toContain(esc(k.text[lang]));
      }
      for (const a of ARTIFACTS) expect(doc).toContain(esc(a.name[lang]));
      for (const g of Object.values(GLYPHS)) expect(doc).toContain(esc(g.name[lang]));
      for (const w of COLCA_WILDLIFE) expect(doc).toContain(esc(w.name[lang]));
    });
    test(`links, stamps and title (${lang})`, () => {
      expect(doc).toContain(SITE.calendly);
      expect(doc).toContain(SITE.resume[lang]);
      expect(doc).toContain(`href="/${lang}/world/cusco/?from=colca"`);
      expect(doc).toContain(lang === "es" ? "Sello del pasaporte" : "Passport stamp");
      expect(doc).toContain(lang === "es" ? "Sello extra del pasaporte" : "Bonus passport stamp");
      expect(doc).toMatch(/<h1 id="kw-colca-tm-title"/);
      expect(doc).not.toContain("TODO");
    });
  }
});
