/**
 * Pure helpers for the tambo exhibits (no three.js): which knot each company shows, how its period
 * reads, and where the exhibit sits in the tambo's local frame so its E range never overlaps the
 * tambo's own khipu spot (content.ts: r 3.6 around local (kx·0.7, 2.2)).
 */
import { COMPANIES, type Company, type Knot, type L, type Stage } from "../../../data/career";
import type { Lang } from "../../contract";

/** One concrete achievement (a knot from career.ts) per company tambo, matching its 3D object. */
export const EXHIBIT_KNOT: Record<string, string> = {
  avances: "first-ms",
  hundred: "sync-50",
  belcorp: "kong-omni",
  auna: "kong-sla",
  xepelin: "ai-dev",
  topsort: "topsort-eda",
  globant: "insis-50",
};

export interface Achievement {
  company: Company;
  stage: Stage;
  knot: Knot;
}

/** The knot (and the stage it belongs to) shown at a company's exhibit. */
export function achievementOf(companyId: string): Achievement | null {
  const company = COMPANIES.find((c) => c.id === companyId);
  const knotId = EXHIBIT_KNOT[companyId];
  if (!company || !knotId) return null;
  for (const stage of company.stages) {
    const knot = stage.knots.find((k) => k.id === knotId);
    if (knot) return { company, stage, knot };
  }
  return null;
}

const MONTHS: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

const month = (ym: string, lang: Lang) => {
  const [y, m] = ym.split("-");
  const name = MONTHS[lang][Number(m) - 1];
  return name ? `${name} ${y}` : (y ?? ym);
};

/** "ene 2022 – ago 2022" · "abr 2026 – hoy". */
export function period(stage: Stage, lang: Lang): string {
  const end = stage.end ? month(stage.end, lang) : lang === "es" ? "hoy" : "now";
  return `${month(stage.start, lang)} – ${end}`;
}

export const pick = (l: L, lang: Lang) => l[lang];

/** Content's company spot (content.ts) and the exhibit's own prompt radius. */
export const CONTENT_SPOT_R = 3.6;
export const PROMPT_R = 1.5;

export interface ExhibitLayout {
  /** -1/1: the khipu side; the exhibit stands on the opposite side (the sign's side). */
  side: number;
  /** Exhibit center (local tambo frame, +Z toward the trail). */
  center: { x: number; z: number };
  /** Where the traveler stands to look at it (prompt center). */
  anchor: { x: number; z: number };
  /** Content's khipu spot center. */
  focus: { x: number; z: number };
  /** Yaw offset (local) so the object turns a little toward the plaza. */
  turn: number;
}

/**
 * Layout from the khipu frame's local x (tambo.ts places it at side·(w/2 + 0.2)) and the exhibit's
 * footprint radius r: beside the tambo's side wall, its front toward the trail.
 */
export function exhibitLayout(kx: number, r = 1): ExhibitLayout {
  const side = kx < 0 ? -1 : 1;
  const half = Math.max(1.4, Math.abs(kx) - 0.2);
  const cx = half + 0.6 + r;
  const cz = -0.25;
  return {
    side,
    center: { x: -side * cx, z: cz },
    anchor: { x: -side * (cx - 0.25), z: cz + r + 0.75 },
    focus: { x: kx * 0.7, z: 2.2 },
    turn: side * 0.3,
  };
}

/** True while (x, z) is in the exhibit's prompt range and outside the tambo's own E spot. */
export function inExhibitRange(
  x: number,
  z: number,
  anchor: { x: number; z: number },
  focus: { x: number; z: number },
): boolean {
  if (Math.hypot(x - anchor.x, z - anchor.z) > PROMPT_R) return false;
  return Math.hypot(x - focus.x, z - focus.z) > CONTENT_SPOT_R + 0.15;
}
