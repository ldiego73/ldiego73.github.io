/**
 * Pure data for the project stilt houses (palafitos): one house per project shown on the /projects page,
 * the curated case studies first (career.ts ARTIFACTS, with each use's year, company and role, as the page
 * lists them) and then the top GitHub repositories from the page's world data (most stars first). Also the
 * row layout along the bank, keeping the canoe pier slot in the middle free. No DOM, no three.js.
 */
import { ARTIFACTS, type Dye, type L, stageById } from "../../../../data/career";
import type { WorldRepo } from "../../../data";

export const MAX_REPOS = 3;

export interface CaseUse {
  year: string;
  company: string;
  role: L;
  text: L;
}

export type Project =
  | { kind: "case"; id: string; name: L; tech: string; summary: L; dye: Dye; uses: CaseUse[] }
  | {
      kind: "repo";
      id: string;
      name: string;
      description: string | null;
      url: string;
      stars: number;
      language: string | null;
    };

const ym = (s: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? Number(m[1]) * 12 + Number(m[2]) : 0;
};

/** Case studies (all) then the most-starred repos (up to `maxRepos`). */
export function projects(repos: ReadonlyArray<WorldRepo>, maxRepos = MAX_REPOS): Project[] {
  const cases: Project[] = ARTIFACTS.map((a) => ({
    kind: "case",
    id: a.id,
    name: a.name,
    tech: a.tech,
    summary: a.summary,
    dye: a.dye,
    uses: a.uses
      .map((u) => {
        const hit = stageById(u.stage);
        return hit
          ? {
              at: ym(hit.stage.start),
              year: hit.stage.start.slice(0, 4),
              company: hit.company.name,
              role: hit.stage.role,
              text: u.text,
            }
          : null;
      })
      .filter((x): x is CaseUse & { at: number } => x !== null)
      .sort((a, b) => a.at - b.at)
      .map(({ year, company, role, text }) => ({ year, company, role, text })),
  }));
  const top: Project[] = repos
    .filter((r) => r.name?.trim())
    .slice()
    .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
    .slice(0, maxRepos)
    .map((r) => ({
      kind: "repo",
      id: `repo:${r.name}`,
      name: r.name,
      description: r.description,
      url: r.url,
      stars: r.stars ?? 0,
      language: r.language,
    }));
  return [...cases, ...top];
}

/** Display name of a project in a language. */
export const projectName = (p: Project, lang: "es" | "en") => (p.kind === "case" ? p.name[lang] : p.name);

export interface Slot {
  /** Local x of the house centre (row along the bank) and its local z (toward the river is negative). */
  x: number;
  z: number;
  /** Slight turn so the row follows the curve of the bank (radians). */
  yaw: number;
}

/** Half width of the canoe pier slot kept free at x = 0. */
export const PIER_GAP = 2.4;
/** House footprint width along the row, and the gap between houses. */
export const HOUSE_W = 3.0;
export const HOUSE_GAP = 0.9;

/**
 * Houses in a gentle arc along the bank, alternating right/left of the pier (first = right of the pier,
 * as seen from the trail), nearest the pier first. The outer houses step toward the trail because the flat
 * apron narrows away from the station centre.
 */
export function rowSlots(n: number): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i < n; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const k = Math.floor(i / 2);
    const x = side * (PIER_GAP + HOUSE_W / 2 + k * (HOUSE_W + HOUSE_GAP));
    const z = -8.6 + 0.022 * x * x;
    out.push({ x, z, yaw: -Math.atan(0.044 * x) });
  }
  return out;
}
