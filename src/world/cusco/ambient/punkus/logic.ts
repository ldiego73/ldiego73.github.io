/**
 * Pure rules of the hub's five punkus (../punkus.ts): each gate's local frame, when its prompt shows, what E
 * does (travel to an open world, a "coming soon" note at a closed one), and the prefetch range. No DOM, no
 * three.js (tested in logic.test.ts). The gate table itself is ../../plan.ts GATES.
 */
import type { L } from "../../../contract";
import type { WorldId } from "../../../events";
import { GATES, type Gate, gatePoint, gateYaw } from "../../plan";

/** The prompt shows within this distance of the doorway centre, on its plaza side. */
export const PROMPT_R = 3.4;
/** Warm an open world's page within this distance of its gate (once). */
export const PREFETCH_R = 30;
/** Opening of the doorway (local x across, y up): Inca trapezoid. */
export const DOOR = { bottom: 3.0, top: 2.2, height: 3.9, depth: 1.8, outer: 4.6 } as const;

/** Gate-local coordinates: x across the doorway, z out of its front (toward the plaza). */
export function gateLocal(g: Gate, x: number, z: number): { x: number; z: number } {
  const [gx, gz] = gatePoint(g);
  const yaw = gateYaw(g);
  const dx = x - gx;
  const dz = z - gz;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

/** Gate-local → world. */
export function gateWorld(g: Gate, lx: number, lz: number): { x: number; z: number } {
  const [gx, gz] = gatePoint(g);
  const yaw = gateYaw(g);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: gx + lx * c + lz * s, z: gz - lx * s + lz * c };
}

/** The gate whose prompt the traveler at (x, z) is in, if any (never from behind the stones). */
export function gateInRange(x: number, z: number, gates: ReadonlyArray<Gate> = GATES): Gate | null {
  for (const g of gates) {
    const l = gateLocal(g, x, z);
    if (Math.hypot(l.x, l.z) <= PROMPT_R && l.z > -0.9) return g;
  }
  return null;
}

export type GateAction = { kind: "travel"; to: WorldId } | { kind: "soon" };

/** What E does at a gate: travel only when its world is open and is a real page (not this hub). */
export function gateAction(g: Gate): GateAction {
  return g.available && g.world !== "cusco" ? { kind: "travel", to: g.world as WorldId } : { kind: "soon" };
}

const PROMPTS = {
  qhapaq: { es: "E · Volver al Qhapaq Ñan", en: "E · Back to the Qhapaq Ñan" },
  travel: { es: "E · Viajar al {name}", en: "E · Travel to the {name}" },
  soon: { es: "{name} · Próximamente", en: "{name} · Coming soon" },
} satisfies Record<string, L>;

export function gatePrompt(g: Gate, lang: "es" | "en"): string {
  const a = gateAction(g);
  if (a.kind === "travel" && g.id === "qhapaq") return PROMPTS.qhapaq[lang];
  const t = a.kind === "travel" ? PROMPTS.travel[lang] : PROMPTS.soon[lang];
  return t.replace("{name}", g.name[lang]);
}

/** Open gates within the prefetch range of (x, z). */
export function gatesToPrefetch(x: number, z: number, gates: ReadonlyArray<Gate> = GATES): Gate[] {
  return gates.filter((g) => {
    if (gateAction(g).kind !== "travel") return false;
    const [gx, gz] = gatePoint(g);
    return Math.hypot(x - gx, z - gz) < PREFETCH_R;
  });
}
