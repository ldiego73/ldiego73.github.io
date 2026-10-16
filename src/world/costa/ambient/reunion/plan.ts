/**
 * Layout and hours of the gathering at the road's end (../reunion.ts), pure (tested in plan.test.ts).
 *
 * Coordinates are in the finale frame (../finale/logic.ts finaleFrame): origin at the road's end, +Z toward
 * the sunset over the sea; the platform stands at (0, PLATFORM.z) and the road arrives from +x (along local
 * z ≈ −1…−5). Everyone stands on the flat cliff-top behind and beside the platform: the seaward flank (−x,
 * where the cliff drops past x ≈ −12) and the land side (−z), never on the platform, its banners (r ≈ 6), the
 * reward prompt or the road. Measured against the layout's heights (flat to ±0.5 u over x −10…4, z −14…6).
 */
import { PLATFORM } from "../finale/logic";

export interface P2 {
  x: number;
  z: number;
}

export type Role = "vendor" | "offer" | "sit-offer" | "family" | "family-kid" | "kid";

export interface Spot extends P2 {
  role: Role;
  /** Facing (local yaw, three.js convention: 0 looks along +Z, toward the sea). */
  yaw: number;
  man: boolean;
  /** In the low-quality gathering too. */
  low: boolean;
}

/** The chicha and ceviche stall (table centre), facing the arriving road (+x, toward the platform). */
export const STALL: P2 & { yaw: number } = { x: -6.4, z: -8.6, yaw: Math.PI / 2 - 0.5 };
/** Where the vendor stands, behind the table. */
export const VENDOR_AT: P2 = { x: -7.4, z: -9.2 };
/** The fishermen's offering to the Mamacocha: shells, amancae flowers and a gourd on a cloth on the ground. */
export const OFFERING: P2 = { x: -8.2, z: 6.6 };
/** The children's running ring. */
export const KIDS: P2 & { r: number } = { x: -1.8, z: -11.6, r: 1.7 };

export const SPOTS: readonly Spot[] = [
  { role: "vendor", ...VENDOR_AT, yaw: STALL.yaw, man: false, low: true },
  // Fishermen at the seaward flank, facing the sea: one stands with his arms raised, one sits by the offering.
  { role: "offer", x: -9.2, z: 4.4, yaw: -0.25, man: true, low: true },
  { role: "sit-offer", x: -8.9, z: 6.0, yaw: -0.15, man: true, low: false },
  // A family watching the sunset from the land side of the platform.
  { role: "family", x: -4.4, z: -5.4, yaw: 0.2, man: true, low: true },
  { role: "family", x: -2.7, z: -5.8, yaw: 0.1, man: false, low: false },
  { role: "family-kid", x: -3.55, z: -5.2, yaw: 0.15, man: false, low: true },
  // Children chasing each other round a ring.
  { role: "kid", x: KIDS.x + KIDS.r, z: KIDS.z, yaw: 0, man: true, low: true },
  { role: "kid", x: KIDS.x - KIDS.r, z: KIDS.z, yaw: Math.PI, man: false, low: false },
];

export function reunionSpots(quality: "low" | "high"): Spot[] {
  return SPOTS.filter((s) => quality === "high" || s.low);
}

/** Walkable discs over the flat cliff-top so the traveler can walk among them (beyond the platform's own). */
export const WALK: ReadonlyArray<P2 & { r: number }> = [
  { x: -4.8, z: -8.4, r: 6.2 },
  { x: -8.2, z: 3.4, r: 3.4 },
];

/** Solid props (colliders): the stall table and the offering cloth. */
export const SOLIDS: ReadonlyArray<P2 & { r: number }> = [
  { x: STALL.x, z: STALL.z, r: 1.0 },
  { x: OFFERING.x, z: OFFERING.z, r: 0.45 },
];

/**
 * Out from a little after sunrise until the dusk after the sunset: the finale sweeps the sky to the sunset
 * (SUNSET 0.744) and the gathering is there for it.
 */
export const HOURS: [number, number] = [0.24, 0.8];
export const within = (time: number, [a, b]: [number, number]) => time > a && time < b;

/** Nearest any spot may come to the platform's centre (its tier, the banners round it and the reward prompt). */
export const PLATFORM_CLEAR = PLATFORM.half + 3;
