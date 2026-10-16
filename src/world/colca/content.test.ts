import { describe, expect, test } from "bun:test";
import { ARTIFACTS, COMPANIES } from "../../data/career";
import { artifactCompanies, artifactUses, colcaStages, finaleStats, span } from "./content";

describe("Kuntisuyu content (from career.ts only)", () => {
  test("one colca per stage, oldest first, each with that stage's knots", () => {
    const stages = colcaStages();
    const all = COMPANIES.flatMap((c) => c.stages);
    expect(stages.length).toBe(all.length);
    for (let i = 1; i < stages.length; i++)
      expect(stages[i]?.stage.start.localeCompare(stages[i - 1]?.stage.start ?? "")).toBeGreaterThanOrEqual(0);
    for (const s of stages) expect(s.knots).toBe(s.stage.knots);
    expect(stages.filter((s) => s.education).every((s) => s.company.education)).toBe(true);
  });

  test("every artifact use resolves to a real stage; employers exclude education", () => {
    for (const a of ARTIFACTS) {
      expect(artifactUses(a).length).toBe(a.uses.length);
      for (const c of artifactCompanies(a)) expect(COMPANIES.find((x) => x.name === c)?.education).toBeFalsy();
    }
  });

  test("finale stats are counts of the data", () => {
    const s = finaleStats();
    expect(s.artifacts).toBe(ARTIFACTS.length);
    expect(s.stages).toBe(COMPANIES.flatMap((c) => c.stages).length);
    expect(s.knots).toBe(COMPANIES.flatMap((c) => c.stages).reduce((n, st) => n + st.knots.length, 0));
    expect(s.companies).toBe(COMPANIES.filter((c) => !c.education).length);
  });

  test("spans", () => {
    expect(span("2016-09", "2020-07", "es")).toBe("2016–2020");
    expect(span("2026-04", undefined, "es")).toBe("2026–hoy");
    expect(span("2016-01", "2016-09", "en")).toBe("2016");
  });
});
