import { describe, expect, test } from "bun:test";
import { ARTIFACTS, COMPANIES } from "../../data/career";
import { SITE } from "../../data/site";
import { CATALOG } from "../../lib/passport";
import { esc } from "../textmode";
import { CULTURES } from "./plan";
import { renderCostaTextMode } from "./textmode";
import { COSTA_WILDLIFE } from "./wildlife";

describe("coast text mode", () => {
  for (const lang of ["es", "en"] as const) {
    const doc = renderCostaTextMode(lang);
    test(`every working company, its monument, stages and knots (${lang})`, () => {
      for (const c of COMPANIES) {
        if (!c.education) expect(doc).toContain(esc(c.name));
        for (const s of c.stages) {
          expect(doc).toContain(esc(s.role[lang]));
          for (const k of s.knots) expect(doc).toContain(esc(k.text[lang]));
        }
      }
      for (const cu of Object.values(CULTURES)) expect(doc).toContain(esc(cu.name[lang]));
    });
    test(`artifacts, finale links, stamps and wildlife (${lang})`, () => {
      for (const a of ARTIFACTS) expect(doc).toContain(a.tech);
      expect(doc).toContain(SITE.calendly);
      expect(doc).toContain(SITE.resume[lang]);
      expect(doc).toContain(`/${lang}/world/cusco/?from=costa`);
      // Secrets (kind "egg") stay unnamed: the text mode only hints at them.
      for (const s of CATALOG.filter((x) => x.world === "costa" && x.kind !== "fauna" && x.kind !== "egg"))
        expect(doc).toContain(esc(s.label[lang]));
      for (const w of COSTA_WILDLIFE) {
        expect(doc).toContain(w.latin);
        // Stampless entries (the riding horse, the land animals) give no passport stamp.
        if (w.stamp) expect(CATALOG.some((s) => s.id === w.stamp)).toBe(true);
      }
      // A vague hint at the hidden Ekeko (./ambient/ekeko.ts), without naming it.
      expect(doc).toContain(lang === "es" ? "amuleto de la abundancia" : "charm of abundance");
      expect(doc).not.toContain("Ekeko");
      expect(doc).toMatch(/<h1 id="kw-costa-tm-title"/);
      expect(doc).not.toContain("undefined");
    });
  }
});
