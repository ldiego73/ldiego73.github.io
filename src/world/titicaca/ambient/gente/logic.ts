/**
 * Pure rules of the lake's people (../gente.ts): who is where (on the Uros islands, at Taquile's plaza, by the
 * alpaca herd and the sheep, at the offering on Titikala), the fishermen's loops on open water, the road
 * walkers' stretch, the travellers who come and go along the whole road, and the day / night switch.
 * No DOM, no three.js (tested in logic.test.ts).
 */
import { HERDS, ISLAND_Y, ISLANDS, type Island, LOOM, OFFERING, SHEEP, TAQUILE, TITIKALA } from "../../plan";
import { islandPoint } from "../uros/logic";

/** People are out between these day fractions (0.25 sunrise, 0.75 sunset). */
export const isDay = (time: number) => time > 0.27 && time < 0.73;

export type Role =
  | "wave"
  | "sitWeave"
  | "hearth"
  | "work"
  | "kid"
  | "knit"
  | "spin"
  | "herd"
  | "fisher"
  | "walk"
  | "travel"
  | "paqo"
  | "pilgrim"
  | "pray"
  | "mother";

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
  // The shepherdess spinning wool on her feet at the edge of her flock, facing the road.
  out.push({ role: "spin", x: SHEEP.x + 3, z: SHEEP.z - SHEEP.r - 1.5, y: null, yaw: Math.PI + 0.3, night: false });
  return out;
}

/**
 * The offering at Titikala (pago a la Pachamama): the paqo kneeling at the east edge of the cloth (../../plan.ts
 * OFFERING), pilgrims seated round it, one standing with raised hands toward the rock, and on the west side a
 * mother with her aguayo bundle watching two children play. `high` gives 8 people, low quality 5. Every spot
 * stays clear of the finale's colliders (rock, table, stela, ring stones, board) and of the walk from the road
 * to the rock (x within ±3 of the plaza centre, south of the table), tested in logic.test.ts.
 */
export function gathering(high: boolean): Spot[] {
  const c = OFFERING;
  const R = 1.7;
  const round = (deg: number, role: Role, night = false): Spot => {
    const a = (deg * Math.PI) / 180;
    const x = c.x + Math.cos(a) * R;
    const z = c.z + Math.sin(a) * R;
    return { role, x, z, y: null, yaw: Math.atan2(c.x - x, c.z - z), night };
  };
  const out: Spot[] = [round(0, "paqo", true), round(70, "pilgrim", true), round(-70, "pilgrim")];
  if (high) out.push(round(140, "pilgrim"));
  const T = TITIKALA;
  // Standing a little back, facing the rock (north-west of the cloth).
  if (high) {
    const x = c.x + 1.2;
    const z = c.z - 3.6;
    out.push({ role: "pray", x, z, y: null, yaw: Math.atan2(T.x - x, T.z - 5.5 - z), night: false });
  }
  // West side: a mother with her bundle, her children playing round a spot near her.
  out.push({ role: "mother", x: T.x - 6.2, z: T.z + 0.5, y: null, yaw: Math.PI / 2 + 0.4, night: false });
  out.push({ role: "kid", x: T.x - 6, z: T.z + 3.2, y: null, yaw: 0, night: false });
  if (high) out.push({ role: "kid", x: T.x - 6, z: T.z + 3.2, y: null, yaw: Math.PI, night: false });
  return out;
}

/** Travellers come and go along the whole road between these t (the punku is at 0, Titikala's spur at 1). */
export const TRAVEL_T: readonly [number, number] = [0.035, 0.965];
/** Respawn only out of sight: farther than the people's draw distance from the camera (../gente.ts). */
export const TRAVEL_HIDE = 170;

export interface Traveller {
  /** Road parameter and direction (+1 toward Titikala, −1 toward the punku). */
  u: number;
  dir: 1 | -1;
}

/**
 * One step of a traveller along the road at `speed` (u/s) on a road `length` long. At either end it turns
 * back, unless it is out of sight (`hidden(t)`): then it reappears somewhere else on the road that is also out
 * of sight, heading a random way (`rand` picks; up to 24 tries, else it just turns). Mutates and returns `s`.
 */
export function stepTraveller(
  s: Traveller,
  dt: number,
  speed: number,
  length: number,
  hidden: (t: number) => boolean,
  rand: () => number,
): Traveller {
  s.u += (s.dir * speed * dt) / length;
  const [a, b] = TRAVEL_T;
  if (s.u >= a && s.u <= b) return s;
  s.u = Math.max(a, Math.min(b, s.u));
  if (hidden(s.u)) {
    for (let k = 0; k < 24; k++) {
      const t = a + rand() * (b - a);
      if (!hidden(t)) continue;
      s.u = t;
      s.dir = rand() < 0.5 ? 1 : -1;
      return s;
    }
  }
  s.dir = s.dir === 1 ? -1 : 1;
  return s;
}

/** Initial travellers spread along the road, alternating directions. */
export function travellers(n: number): Traveller[] {
  const [a, b] = TRAVEL_T;
  return Array.from({ length: n }, (_, i) => ({
    u: a + ((i + 0.5) / n) * (b - a),
    dir: i % 2 ? -1 : 1,
  }));
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
