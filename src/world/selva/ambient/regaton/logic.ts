/**
 * Pure data for the trader's boat (regatón, "Lo que uso"): the owner's tools from src/data/uses.ts (and the
 * professional stack from career.ts SKILLS, which the /uses page shows too), grouped like the /uses page into
 * stalls of wares on the dock. No DOM, no three.js; every fact comes from those two files.
 */
import { type Dye, type L, SKILLS } from "../../../../data/career";
import { AI_TOOLS, AIDLC, DAILY, SITE_STACK, type UseGroup } from "../../../../data/uses";

export interface Ware {
  name: string;
  why?: L;
  url?: string;
  /** Sub-heading inside the stall (an AIDLC phase, a SKILLS group). */
  group?: L;
}

export interface Stall {
  id: "aidlc" | "ai" | "site" | "daily" | "pro";
  /** Short tab label. */
  tab: L;
  title: L;
  lede?: L;
  dye: Dye;
  wares: Ware[];
}

const l = (es: string, en: string): L => ({ es, en });

const fromGroup = (g: UseGroup, id: Stall["id"], tab: L): Stall => ({
  id,
  tab,
  title: g.title,
  ...(g.lede ? { lede: g.lede } : {}),
  dye: g.dye,
  wares: g.items.map((it) => ({ name: it.name, why: it.why, ...(it.url ? { url: it.url } : {}) })),
});

/** The stalls in the /uses page order: AIDLC first, then AI tools, the site stack, daily tools, pro stack. */
export function stalls(): Stall[] {
  const orchestrator = l("Orquestador", "Orchestrator");
  return [
    {
      id: "aidlc",
      tab: l("AIDLC", "AIDLC"),
      title: l("Cómo trabajo con agentes de IA", "How I work with AI agents"),
      lede: l(
        "Del SDLC tradicional a un AIDLC (AI-Driven Development Lifecycle): un agente orquestador reparte el trabajo entre especialistas por fase; yo defino el objetivo y reviso los resultados.",
        "From a traditional SDLC to an AIDLC (AI-Driven Development Lifecycle): an orchestrator agent hands work to specialists by phase; I set the goal and review the results.",
      ),
      dye: "turq",
      wares: [
        { name: AIDLC.orchestrator.name, why: AIDLC.orchestrator.why, group: orchestrator },
        ...AIDLC.phases.flatMap((p) => p.agents.map((a) => ({ name: a.name, why: a.why, group: p.phase }))),
      ],
    },
    fromGroup(AI_TOOLS, "ai", l("Agentes", "Agents")),
    fromGroup(SITE_STACK, "site", l("Este sitio", "This site")),
    fromGroup(DAILY, "daily", l("Día a día", "Daily")),
    {
      id: "pro",
      tab: l("Stack pro", "Pro stack"),
      title: l("Stack profesional", "Professional stack"),
      lede: l("Lo que uso en el trabajo, por área.", "What I use at work, by area."),
      dye: "alpaca",
      wares: SKILLS.flatMap((g) => g.items.map((name) => ({ name, group: g.group }))),
    },
  ];
}

/** Consecutive runs of wares sharing a group label (for sub-headings in the panel). */
export function runs(wares: Ware[]): Array<{ group?: L; wares: Ware[] }> {
  const out: Array<{ group?: L; wares: Ware[] }> = [];
  for (const w of wares) {
    const last = out[out.length - 1];
    if (last && last.group?.es === w.group?.es) last.wares.push(w);
    else out.push({ ...(w.group ? { group: w.group } : {}), wares: [w] });
  }
  return out;
}

/** Wares shown as crates on a stall table: one per item, capped so the table stays readable. */
export const crateCount = (s: Stall, max = 14) => Math.min(max, s.wares.length);
