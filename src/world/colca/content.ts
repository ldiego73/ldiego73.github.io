/**
 * What the Kuntisuyu shows of the career, read only from src/data/career.ts (no claim lives here): the colcas'
 * stages (one granary per career stage, in time order, each holding that stage's knots), the geoglyphs'
 * artifacts with the stages and companies that used them, and the finale's true counts. Pure: the ambients,
 * the text mode and the tests share it.
 */
import { ARTIFACTS, type Artifact, COMPANIES, type Company, type Knot, type L, type Stage } from "../../data/career";

export interface ColcaStage {
  /** Granary index along the cliff, 0 = the oldest stage. */
  index: number;
  company: Company;
  stage: Stage;
  knots: Knot[];
  /** Education (the master's) hangs with the career like on the home khipu; the panel says so. */
  education: boolean;
}

/** Every stage of every company (education included), oldest first. */
export function colcaStages(): ColcaStage[] {
  const all: Array<Omit<ColcaStage, "index">> = [];
  for (const company of COMPANIES)
    for (const stage of company.stages)
      all.push({ company, stage, knots: stage.knots, education: !!company.education });
  all.sort((a, b) => a.stage.start.localeCompare(b.stage.start) || a.company.id.localeCompare(b.company.id));
  return all.map((s, index) => ({ ...s, index }));
}

export interface ArtifactUseView {
  company: string;
  /** The stage belongs to education (the master's), not to an employer. */
  education: boolean;
  role: L;
  start: string;
  end?: string;
  text: L;
}

/** An artifact's uses with the company and role of each stage (unknown stage ids are skipped). */
export function artifactUses(a: Artifact): ArtifactUseView[] {
  const out: ArtifactUseView[] = [];
  for (const u of a.uses) {
    for (const c of COMPANIES) {
      const s = c.stages.find((x) => x.id === u.stage);
      if (s)
        out.push({ company: c.name, education: !!c.education, role: s.role, start: s.start, end: s.end, text: u.text });
    }
  }
  return out;
}

/** Distinct employers (in order of first use) where an artifact was built (education is not counted). */
export function artifactCompanies(a: Artifact): string[] {
  return [
    ...new Set(
      artifactUses(a)
        .filter((u) => !u.education)
        .map((u) => u.company),
    ),
  ];
}

export const artifacts = (): Artifact[] => ARTIFACTS;

/** "2016-09" → "2016"; a stage's span as "2016–2020" or "2026–hoy". */
export function span(start: string, end: string | undefined, lang: "es" | "en"): string {
  const a = start.slice(0, 4);
  const b = end ? end.slice(0, 4) : lang === "es" ? "hoy" : "now";
  return a === b ? a : `${a}–${b}`;
}

export interface FinaleStats {
  artifacts: number;
  knots: number;
  stages: number;
  companies: number;
}

/** True counts of what the road shows: geoglyphs (artifacts), knots in the colcas, stages, employers. */
export function finaleStats(): FinaleStats {
  const stages = colcaStages();
  return {
    artifacts: ARTIFACTS.length,
    knots: stages.reduce((n, s) => n + s.knots.length, 0),
    stages: stages.length,
    // Employers only: the university's stage is in the colcas, but it is not a company.
    companies: COMPANIES.filter((c) => !c.education).length,
  };
}
