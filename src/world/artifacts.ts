/**
 * Pure data helpers for the Andean world content (no three.js, unit-tested).
 * Maps career data to khipu cords, artifact uses with company + year, and station lookups.
 */
import { ARTIFACTS, type Artifact, COMPANIES, type Company, type Knot, type Stage, stageById } from "../data/career";
import { type L, type Lang, STATIONS, type Station } from "./contract";

export interface CordSpec {
  /** Stage id (one pendant per stage). */
  id: string;
  stage: Stage;
  company: Company;
  /** "main" hangs from the frame bar; "sub" hangs from the company's main cord (multi-stage, education). */
  kind: "main" | "sub";
  knots: Knot[];
}

/** The khipu for one company tambo: a main pendant cord; extra stages and education hang as subsidiaries. */
export function khipuFor(companyId: string): CordSpec[] {
  const company = COMPANIES.find((c) => c.id === companyId);
  if (!company) return [];
  const out: CordSpec[] = company.stages.map((stage, i) => ({
    id: stage.id,
    stage,
    company,
    kind: i === 0 ? "main" : "sub",
    knots: stage.knots,
  }));
  // Education hangs at the tambo of the company it overlapped with (Xepelin hosts the Complutense cord).
  for (const edu of COMPANIES.filter((c) => c.education)) {
    const host = hostOfEducation(edu);
    if (host === companyId) {
      for (const stage of edu.stages) out.push({ id: stage.id, stage, company: edu, kind: "sub", knots: stage.knots });
    }
  }
  return out;
}

/** The working company whose period overlaps the education the most. */
export function hostOfEducation(edu: Company): string | undefined {
  const s = edu.stages[0];
  if (!s) return undefined;
  const a = ym(s.start);
  const b = s.end ? ym(s.end) : ym("2100-01");
  let best: string | undefined;
  let bestOverlap = 0;
  for (const c of COMPANIES) {
    if (c.education) continue;
    for (const st of c.stages) {
      const o = Math.min(b, st.end ? ym(st.end) : ym("2100-01")) - Math.max(a, ym(st.start));
      if (o > bestOverlap) {
        bestOverlap = o;
        best = c.id;
      }
    }
  }
  return best;
}

export const ym = (s: string) => {
  const [y, m] = s.split("-").map(Number);
  return (y ?? 0) * 12 + ((m ?? 1) - 1);
};

export const yearOf = (s: string) => s.slice(0, 4);

/** "2014–2016" or "2026–" for a company across its stages. */
export function companyYears(c: Company, lang: Lang): string {
  const first = c.stages[0];
  const last = c.stages[c.stages.length - 1];
  if (!first || !last) return "";
  const end = last.end ? yearOf(last.end) : lang === "es" ? "hoy" : "now";
  const start = yearOf(first.start);
  return start === end ? start : `${start}–${end}`;
}

/** Total knot turns per cord (single = 1, long = n). Used to size cords. */
export const turns = (knots: Knot[]) => knots.reduce((a, k) => a + Math.max(1, k.n), 0);

/** The first metric on a company (headline number for the panel). */
export function headlineMetric(c: Company): { metric: string; text: L } | undefined {
  for (const s of c.stages) for (const k of s.knots) if (k.metric) return { metric: k.metric, text: k.text };
  return undefined;
}

export interface ArtifactUseView {
  company: string;
  year: string;
  text: L;
}

/** Artifact uses resolved to company name + year, in trail (chronological) order. */
export function artifactUses(a: Artifact): ArtifactUseView[] {
  return a.uses
    .map((u) => {
      const hit = stageById(u.stage);
      return hit
        ? { company: hit.company.name, year: yearOf(hit.stage.start), text: u.text, at: ym(hit.stage.start) }
        : null;
    })
    .filter((x): x is ArtifactUseView & { at: number } => x !== null)
    .sort((a, b) => a.at - b.at)
    .map(({ company, year, text }) => ({ company, year, text }));
}

export const artifactsOnBridge = (): Artifact[] => ARTIFACTS;

/** Stations in trail order (valley → summit). */
export const stationsInOrder = (): Station[] => [...STATIONS].sort((a, b) => a.t - b.t);

/** AI points for the Intihuatana panel: knots that talk about AI plus the AI artifact uses. */
export function aiPoints(): Array<{ where: string; text: L }> {
  const out: Array<{ where: string; text: L }> = [];
  const ai = ARTIFACTS.find((a) => a.id === "ai");
  if (ai) for (const u of artifactUses(ai)) out.push({ where: `${u.company} · ${u.year}`, text: u.text });
  return out;
}

/** Nearest item within its radius; ties resolved by distance. Pure for testing. */
export function nearest<T extends { x: number; z: number; r: number }>(items: T[], x: number, z: number): T | null {
  let best: T | null = null;
  let bd = Infinity;
  for (const it of items) {
    const d = Math.hypot(it.x - x, it.z - z);
    if (d <= it.r && d < bd) {
      bd = d;
      best = it;
    }
  }
  return best;
}
