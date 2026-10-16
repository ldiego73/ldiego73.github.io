/**
 * Pure rules of the lake's people (../gente.ts): who is where (on the Uros islands, at Taquile's plaza, by the
 * alpaca herd), the fishermen's loops on open water, the road walkers' stretch and the day / night switch.
 * No DOM, no three.js (tested in logic.test.ts).
 */
import { HERDS, ISLAND_Y, ISLANDS, type Island, LOOM, TAQUILE } from "../../plan";
import { islandPoint } from "../uros/logic";

/** People are out between these day fractions (0.25 sunrise, 0.75 sunset). */
export const isDay = (time: number) => time > 0.27 && time < 0.73;

export type Role = "wave" | "sitWeave" | "hearth" | "work" | "kid" | "knit" | "spin" | "herd" | "fisher" | "walk";

export interface Spot {
  role: Role;
  x: number;
  z: number;
  /** Floor height (deck or ground: null → ground). */
  y: number | null;
  yaw: number;
  /** Stays out at night (by the hearth, the herder with her animals). */
  night: boolean;
}

const isl = (i: number) => ISLANDS[Math.min(i, ISLANDS.length - 1)] as Island;
const onIsland = (i: number, lx: number, lz: number, role: Role, yawToCentre = true, night = false): Spot => {
  const p = islandPoint(isl(i), lx, lz);
  const c = isl(i);
  return {
    role,
    x: p.x,
    z: p.z,
    y: ISLAND_Y,
    yaw: yawToCentre ? Math.atan2(c.x - p.x, c.z - p.z) : Math.atan2(p.x - c.x, p.z - c.z),
    night,
  };
};

/** Everyone with a fixed place (fishermen and walkers move, see below). */
export function spots(): Spot[] {
  const out: Spot[] = [
    // The hub island: a woman greeting visitors at the arrival, another by the hearth, two children playing.
    onIsland(1, 1.6, 6.2, "wave", false),
    onIsland(1, -0.9, 2.9, "hearth", true, true),
    onIsland(1, -1.5, -1.5, "kid"),
    onIsland(1, 1.8, -2, "kid"),
    // Weaving and mending reeds on the others.
    onIsland(0, 0.8, -0.6, "sitWeave"),
    onIsland(2, 1.3, 0.3, "work"),
    onIsland(3, 1, -0.5, "sitWeave"),
    onIsland(4, 1.4, -0.7, "work"),
  ];
  // Taquile: men knitting chullos on the plaza's edge, women spinning near the loom.
  for (const [dx, dz, yaw] of [
    [-5.2, -3.2, 1.1],
    [-5.8, -1.0, 1.4],
    [5.6, -2.4, -1.2],
  ] as const)
    out.push({ role: "knit", x: TAQUILE.x + dx, z: TAQUILE.z + dz, y: null, yaw, night: false });
  for (const [dx, dz] of [
    [-2.6, 1.6],
    [2.8, 1.4],
  ] as const)
    out.push({
      role: "spin",
      x: LOOM.x + dx,
      z: LOOM.z + dz,
      y: null,
      yaw: Math.atan2(-dx, -dz) + Math.PI * 0.15,
      night: false,
    });
  // The herder sitting by her alpacas.
  out.push({
    role: "herd",
    x: HERDS.alpacas.x + 2,
    z: HERDS.alpacas.z - HERDS.alpacas.r - 2,
    y: null,
    yaw: 0,
    night: true,
  });
  return out;
}

/** Fishermen's loops on open water: centre, radii, speed (u/s) and starting phase. */
export const LOOPS: ReadonlyArray<{ x: number; z: number; rx: number; rz: number; speed: number; phase: number }> = [
  { x: -40, z: -70, rx: 30, rz: 16, speed: 1.1, phase: 0 },
  { x: 150, z: -96, rx: 26, rz: 18, speed: 0.9, phase: 2 },
  { x: -230, z: -56, rx: 24, rz: 14, speed: 1, phase: 4 },
];

/** Pose on a loop at arc parameter s (radians of travel), heading along it. */
export function loopPose(l: (typeof LOOPS)[number], s: number): { x: number; z: number; yaw: number } {
  const a = s + l.phase;
  const x = l.x + Math.cos(a) * l.rx;
  const z = l.z + Math.sin(a) * l.rz;
  const dx = -Math.sin(a) * l.rx;
  const dz = Math.cos(a) * l.rz;
  return { x, z, yaw: Math.atan2(dx, dz) };
}

/** Angular speed on a loop for a given linear speed (its mean radius). */
export const loopRate = (l: (typeof LOOPS)[number]) => l.speed / ((l.rx + l.rz) / 2);

/** The road stretch two walkers go up and down by day (t range, between the Uros landing and Taquile). */
export const WALK_T: readonly [number, number] = [0.33, 0.56];
