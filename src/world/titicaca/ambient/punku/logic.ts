/**
 * Pure rules of the Collasuyu's punku (../punku.ts): where it stands (across the road at its start, facing along
 * the road, so the traveler arrives with it at their back), its doorway's size, when its prompt shows and its
 * copy. No DOM, no three.js (tested in logic.test.ts).
 */
import type { L, Trail } from "../../../contract";

/** Doorway (local x across, y up): an Inca trapezoid, a little taller than the traveler's camera needs. */
export const GATE = { bottom: 3.0, top: 2.2, height: 3.9, depth: 1.8 } as const;
/** The prompt shows within this distance of the doorway centre, on its road side. */
export const PROMPT_R = 3.4;
/** Warm the hub's page and chunks within this distance (once). */
export const PREFETCH_R = 30;

export const PUNKU_COPY = {
  prompt: { es: "E · Volver a Qusqu", en: "E · Back to Qusqu" },
  sub: { es: "Camino de vuelta a Haukaypata", en: "The road back to Haukaypata" },
} satisfies Record<string, L>;

export interface GateFrame {
  x: number;
  y: number;
  z: number;
  /** Facing along the road (models face +z): the front looks at the traveler arriving. */
  yaw: number;
}

/** The gate: 1.5 u behind the road's start, across it. */
export function gateFrame(L: { trail: Trail; heightAt(x: number, z: number): number }): GateFrame {
  const p = L.trail.pointAt(0);
  const t = L.trail.tangentAt(0);
  const x = p.x - t.x * 1.5;
  const z = p.z - t.z * 1.5;
  return { x, y: Math.min(p.y, L.heightAt(x, z)), z, yaw: Math.atan2(t.x, t.z) };
}

/** Gate-local coordinates: x across the doorway, z out of its front (toward the road). */
export function gateLocal(f: GateFrame, x: number, z: number): { x: number; z: number } {
  const dx = x - f.x;
  const dz = z - f.z;
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: dx * c - dz * s, z: dx * s + dz * c };
}

export function inPrompt(f: GateFrame, x: number, z: number): boolean {
  const l = gateLocal(f, x, z);
  return Math.hypot(l.x, l.z) <= PROMPT_R && l.z > -0.6;
}
