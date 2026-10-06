/**
 * Chasqui errands (pure state, no DOM / Three): three relays offered in order by the NPC chasquis
 * (npcs.ts). Each one hands the traveler a khipu for a tambo well up the trail; walking into that tambo's
 * plaza completes it. Persisted in localStorage; the passport reads it for the "en curso" line.
 */
import { type L, STATIONS } from "../../contract";

export type MissionId = "mission:1" | "mission:2" | "mission:3";

export interface Mission {
  id: MissionId;
  /** Target STATIONS id. */
  to: string;
  /** Where the khipu goes, with its preposition, for the HUD chip ("lleva el khipu a Xepelin"). */
  place: L;
  /** The thank-you on arrival: who speaks, and the line. */
  thanks: { who: L; text: L };
}

export const MISSIONS: Mission[] = [
  {
    id: "mission:1",
    to: "xepelin",
    place: { es: "a Xepelin", en: "to Xepelin" },
    thanks: {
      who: { es: "Tambo de Xepelin", en: "Xepelin tambo" },
      text: {
        es: "«¡Llegó completo, ni un nudo suelto! Gracias, viajero: el relevo sigue.»",
        en: "“It arrived whole, not one loose knot! Thank you, traveler: the relay goes on.”",
      },
    },
  },
  {
    id: "mission:2",
    to: "arcade",
    place: { es: "al Tambo arcade", en: "to the Arcade Tambo" },
    thanks: {
      who: { es: "Tambo arcade", en: "Arcade Tambo" },
      text: {
        es: "«¡Los puntajes de la semana! Justo a tiempo para la tabla. Gracias por cruzar el puente.»",
        en: "“This week's high scores! Just in time for the board. Thanks for crossing the bridge.”",
      },
    },
  },
  {
    id: "mission:3",
    to: "contact",
    place: { es: "al Puesto del chasqui", en: "to the Chasqui Post" },
    thanks: {
      who: { es: "Puesto del chasqui", en: "Chasqui Post" },
      text: {
        es: "«Mensaje entregado en la cumbre. Ya eres parte del relevo del Qhapaq Ñan.»",
        en: "“Message delivered at the summit. You're part of the Qhapaq Ñan relay now.”",
      },
    },
  },
];

/** A giver only offers an errand whose tambo is at least this far up the trail (a real walk, not next door). */
export const MIN_LEG = 0.12;
/** Within this distance of the target plaza (same radius the passport uses for stations) the khipu is delivered. */
export const ARRIVE_R = 7;

export interface ErrandState {
  /** Errands completed so far (they unlock in order). */
  done: number;
  /** The errand being carried, if any. */
  active: MissionId | null;
}

export const ERRAND_KEY = "qn.npcs.errands";
export const emptyErrands = (): ErrandState => ({ done: 0, active: null });

export const missionById = (id: string) => MISSIONS.find((m) => m.id === id) ?? null;
export const targetT = (m: Mission) => STATIONS.find((s) => s.id === m.to)?.t ?? 1;

/** The next errand to offer (none while carrying one, or after the third). */
export function nextMission(s: ErrandState): Mission | null {
  if (s.active) return null;
  return MISSIONS[s.done] ?? null;
}

/** Offer the next errand only when its tambo is a good walk uphill from where the traveler talks (trail t). */
export function offerable(s: ErrandState, t: number): Mission | null {
  const m = nextMission(s);
  return m && targetT(m) - t >= MIN_LEG ? m : null;
}

export function accept(s: ErrandState, id: MissionId): ErrandState {
  const m = nextMission(s);
  return m && m.id === id ? { done: s.done, active: id } : s;
}

export function drop(s: ErrandState): ErrandState {
  return s.active ? { done: s.done, active: null } : s;
}

/** The traveler stands in `stationId`'s plaza: completes the active errand when it is that tambo. */
export function arrive(s: ErrandState, stationId: string): { state: ErrandState; completed: Mission | null } {
  const m = s.active ? missionById(s.active) : null;
  if (!m || m.to !== stationId) return { state: s, completed: null };
  return { state: { done: Math.min(MISSIONS.length, s.done + 1), active: null }, completed: m };
}

/** Per-errand view for the passport: done, carrying, or still to come. */
export function errandRows(s: ErrandState): Array<{ mission: Mission; status: "done" | "active" | "todo" }> {
  return MISSIONS.map((m, i) => ({
    mission: m,
    status: i < s.done ? "done" : s.active === m.id ? "active" : "todo",
  }));
}

export function sanitizeErrands(v: unknown): ErrandState {
  if (!v || typeof v !== "object") return emptyErrands();
  const o = v as { done?: unknown; active?: unknown };
  const done =
    typeof o.done === "number" && Number.isFinite(o.done)
      ? Math.max(0, Math.min(MISSIONS.length, Math.floor(o.done)))
      : 0;
  // Only the next errand in order can be the one being carried.
  const active = typeof o.active === "string" && MISSIONS[done]?.id === o.active ? (o.active as MissionId) : null;
  return { done, active };
}

export function loadErrands(): ErrandState {
  try {
    return sanitizeErrands(JSON.parse(localStorage.getItem(ERRAND_KEY) ?? "null"));
  } catch {
    return emptyErrands();
  }
}

export function saveErrands(s: ErrandState): void {
  try {
    localStorage.setItem(ERRAND_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable: the errand lives for this visit */
  }
}
