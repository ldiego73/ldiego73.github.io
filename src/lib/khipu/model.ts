import { ARTIFACTS, COMPANIES, type Company, type Dye, type Stage } from "../../data/career";

/** One physical cord in the scene: a company pendant or a stage subsidiary. */
export interface CordSpec {
  id: string;
  companyId: string;
  stage?: Stage;
  company: Company;
  dye: Dye;
  /** Index of the parent cord, -1 when hanging from the primary cord. */
  parent: number;
  /** Fraction along the parent where a subsidiary is tied. */
  tie: number;
  /** Lateral rest offset for subsidiaries, in world units. */
  fan: number;
  length: number;
  radius: number;
  knots: Array<{ t: number; n: number; id: string }>;
}

const knotLayout = (stage: Stage, from: number, to: number) =>
  stage.knots.map((k, i, all) => ({
    id: k.id,
    n: k.n,
    t: all.length === 1 ? (from + to) / 2 : from + ((to - from) * i) / (all.length - 1),
  }));

/**
 * Turns the career into cords. Companies with one stage carry knots on the pendant.
 * Companies with several stages, and education, become subsidiaries tied to a pendant.
 */
export function buildCords(): CordSpec[] {
  const cords: CordSpec[] = [];
  const pendants = COMPANIES.filter((c) => !c.education);
  for (const company of pendants) {
    const multi = company.stages.length > 1;
    const main = company.stages[0] as Stage;
    const pendantIndex = cords.length;
    cords.push({
      id: company.id,
      companyId: company.id,
      company,
      stage: multi ? undefined : main,
      dye: company.dye,
      parent: -1,
      tie: 0,
      fan: 0,
      length: multi ? 2.2 : 4.4 + main.knots.length * 0.55,
      radius: 0.075,
      knots: multi ? [] : knotLayout(main, 0.3, 0.86),
    });
    if (multi) {
      company.stages.forEach((stage, i) => {
        cords.push({
          id: stage.id,
          companyId: company.id,
          company,
          stage,
          dye: stage.dye,
          parent: pendantIndex,
          tie: 0.35 + i * 0.25,
          fan: (i - (company.stages.length - 1) / 2) * 0.62,
          length: 3.6 + stage.knots.length * 0.5,
          radius: 0.058,
          knots: knotLayout(stage, 0.22, 0.86),
        });
      });
    }
  }
  // Education hangs as a subsidiary of the company it ran alongside (Xepelin).
  for (const edu of COMPANIES.filter((c) => c.education)) {
    const host = cords.findIndex((c) => c.id === "xepelin");
    const stage = edu.stages[0] as Stage;
    cords.push({
      id: stage.id,
      companyId: edu.id,
      company: edu,
      stage,
      dye: "turq",
      parent: host,
      tie: 0.12,
      fan: 0.55,
      length: 3.2,
      radius: 0.05,
      knots: knotLayout(stage, 0.5, 0.5),
    });
  }
  return cords;
}

/** Cord indices touched by an artifact (through the stages it lists). */
export function artifactCords(cords: CordSpec[], artifactId: string): number[] {
  const art = ARTIFACTS.find((a) => a.id === artifactId);
  if (!art) return [];
  const ids = new Set(art.uses.map((u) => u.stage));
  return cords.map((c, i) => (c.stage && ids.has(c.stage.id) ? i : -1)).filter((i) => i >= 0);
}
