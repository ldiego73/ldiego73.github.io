import { describe, expect, test } from "bun:test";
import { CERTIFICATIONS, COMPANIES, EDUCATION } from "../../../data/career";
import { SITE, SOCIALS } from "../../../data/site";
import { CATALOG } from "../../../lib/passport";
import { careerRows, contactLinks, educationRows, khipuCords, roomStamp, salaLinks, studyLinks } from "./content";
import { ROOMS } from "./plan";

describe("wasi rooms content (facts only from career.ts / site.ts)", () => {
  test("every room stamps its passport entry, with the catalog label", () => {
    for (const r of ROOMS) {
      const s = roomStamp(r.id);
      const entry = CATALOG.find((c) => c.id === `wasi:${r.id}`);
      expect(entry).toBeDefined();
      expect(s.kind).toBe("room");
      expect(s.label).toEqual(entry!.label);
    }
  });

  test("career rows: every company but education, every role", () => {
    for (const lang of ["es", "en"] as const) {
      const rows = careerRows(lang);
      const work = COMPANIES.filter((c) => !c.education);
      expect(rows.map((r) => r.name)).toEqual(work.map((c) => c.name));
      for (const [i, r] of rows.entries()) {
        expect(r.roles.map((x) => x.role)).toEqual(work[i]!.stages.map((s) => s.role[lang]));
        for (const x of r.roles) expect(x.years).toMatch(/^\d{4}(–(\d{4}|hoy|present))?$/);
      }
    }
  });

  test("the wall khipu has one cord per company, one knot per stage", () => {
    const cords = khipuCords();
    expect(cords).toHaveLength(COMPANIES.length);
    for (const [i, c] of cords.entries()) expect(c.knots).toBe(COMPANIES[i]!.stages.length);
  });

  test("study: education, certifications and the resume files", () => {
    expect(educationRows("en").map((e) => e.school)).toEqual(EDUCATION.map((e) => e.school));
    expect(CERTIFICATIONS.length).toBeGreaterThan(0);
    const links = studyLinks("es").map((l) => l.href);
    expect(links).toContain(SITE.resume.es);
    expect(links).toContain(SITE.resume.en);
    expect(links).toContain("/es/cv/");
    expect(salaLinks("en").map((l) => l.href)).toEqual(["/en/#story", "/en/cv/"]);
  });

  test("contact: email, Calendly, socials and the contact form anchor", () => {
    const c = contactLinks("en");
    expect(c.mailto).toBe(`mailto:${SITE.email}`);
    expect(c.calendly.href).toBe(SITE.calendly);
    expect(c.social.map((s) => s.href)).toEqual(SOCIALS.filter((s) => s.icon !== "mail").map((s) => s.url));
    expect(c.form.href).toBe("/en/#contact");
  });
});
