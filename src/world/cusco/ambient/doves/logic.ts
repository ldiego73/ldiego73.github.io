/**
 * Pure logic of the plaza's doves (../doves.ts): where a dove may land (open flagstones, off the usnu, away
 * from the traveler), the flight arc between two spots, and when a pecking dove takes off. No DOM, no
 * three.js (tested in logic.test.ts). Eared doves (Zenaida auriculata) are native to the Andes.
 */
import { PLAZA, USNU } from "../../plan";

export const FLEE_R = 3.4;
/** Landing spots keep this far from the traveler and inside the plaza by this margin. */
export const LAND_AWAY = 9;
const MARGIN = 2.5;

export interface Spot {
  x: number;
  z: number;
}

export function onFlagstones(x: number, z: number): boolean {
  if (x < PLAZA.x0 + MARGIN || x > PLAZA.x1 - MARGIN || z < PLAZA.z0 + MARGIN || z > PLAZA.z1 - MARGIN) return false;
  const half = (USNU.tiers[0]?.half ?? 6.6) + 1;
  return Math.abs(x - USNU.x) > half || Math.abs(z - USNU.z) > half;
}

/** A landing spot near `near` (within `r`) on the flagstones, at least LAND_AWAY from `avoid`. */
export function pickLanding(rand: () => number, avoid: Spot, near: Spot, r = 14): Spot {
  for (let i = 0; i < 60; i++) {
    const a = rand() * Math.PI * 2;
    const d = 2 + rand() * r;
    const x = near.x + Math.cos(a) * d;
    const z = near.z + Math.sin(a) * d;
    if (onFlagstones(x, z) && Math.hypot(x - avoid.x, z - avoid.z) >= LAND_AWAY) return { x, z };
  }
  // Fallback: the plaza corner farthest from the traveler.
  const x = avoid.x > 0 ? PLAZA.x0 + MARGIN + 2 : PLAZA.x1 - MARGIN - 2;
  const z = avoid.z > 0 ? PLAZA.z0 + MARGIN + 2 : PLAZA.z1 - MARGIN - 2;
  return { x, z };
}

/** Position along a flight from a to b at u ∈ [0, 1] (an arc `h` high), with the heading. */
export function flightAt(a: Spot, b: Spot, u: number, h: number): { x: number; y: number; z: number; yaw: number } {
  const k = Math.max(0, Math.min(1, u));
  // Ease in and out: quick take-off, gliding landing.
  const e = k * k * (3 - 2 * k);
  return {
    x: a.x + (b.x - a.x) * e,
    y: 4 * h * k * (1 - k),
    z: a.z + (b.z - a.z) * e,
    yaw: Math.atan2(b.x - a.x, b.z - a.z),
  };
}

/** Flight time for a hop of distance d. */
export const flightTime = (d: number) => 0.8 + d / 7;

/** A dove on the ground takes off when the traveler comes within FLEE_R. */
export const shouldFlee = (dove: Spot, traveler: Spot) => Math.hypot(dove.x - traveler.x, dove.z - traveler.z) < FLEE_R;
