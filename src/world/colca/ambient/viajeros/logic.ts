/**
 * Pure plan of the people on the Kuntisuyu road (../viajeros.ts): who walks which stretch, how they walk it
 * (there and back on their own side of the road, waiting when the traveler stands in their way, pausing and
 * turning at the ends of their stretch), and who gathers at the Cruz del Cóndor at the end of the road.
 * No DOM, no three.js (tested in logic.test.ts).
 *
 * Stretches (road t, ≈ 1331 u): the canyon rim 0.02–0.48 (past the punku, through the village and the colcas,
 * to where the road leaves the rim), the descent 0.44–0.6, the pampa 0.565–0.86 (the mirador, the geoglyphs,
 * Cahuachi) and the climb back to the rim 0.85–0.985 (stopping short of the Cruz platform, where the gathering
 * is). Walkers keep to the right of the way they walk, LANE u from the centreline (the road's half width is
 * 2.6): heading east on the rim that is the canyon side, still well on the road.
 */

export type Role =
  | "cabana"
  | "collagua"
  | "basket"
  | "farmer"
  | "caravan"
  | "trekker"
  | "archaeologist"
  | "tourist"
  | "local-man"
  | "local-woman";

export interface TravellerSpec {
  role: Role;
  /** Stretch of road (t0 < t1) walked there and back. */
  t0: number;
  t1: number;
  /** Where on the stretch they start (0..1) and which way (+1 toward the Cruz). */
  start: number;
  dir: 1 | -1;
  /** Walking speed, u/s. */
  speed: number;
  /** Only on high quality. */
  high?: boolean;
}

export const RIM: [number, number] = [0.02, 0.48];
export const PAMPA: [number, number] = [0.565, 0.86];

export const TRAVELLERS: ReadonlyArray<TravellerSpec> = [
  // Canyon rim: valley women in their embroidered dress, walkers with packs, a farmer, a llama caravan.
  { role: "cabana", t0: 0.02, t1: 0.2, start: 0.3, dir: 1, speed: 0.9 },
  { role: "collagua", t0: 0.08, t1: 0.3, start: 0.7, dir: -1, speed: 0.85 },
  { role: "trekker", t0: 0.03, t1: 0.48, start: 0.12, dir: 1, speed: 1.15 },
  { role: "trekker", t0: 0.03, t1: 0.48, start: 0.85, dir: -1, speed: 1.1, high: true },
  { role: "caravan", t0: 0.27, t1: 0.47, start: 0.5, dir: 1, speed: 0.8 },
  { role: "farmer", t0: 0.15, t1: 0.4, start: 0.4, dir: -1, speed: 0.95, high: true },
  { role: "basket", t0: 0.2, t1: 0.45, start: 0.2, dir: 1, speed: 0.85, high: true },
  // The descent to the pampa.
  { role: "trekker", t0: 0.44, t1: 0.6, start: 0.5, dir: -1, speed: 1.0 },
  // The pampa: archaeologists, visitors, people from Nasca.
  { role: "archaeologist", t0: 0.58, t1: 0.72, start: 0.4, dir: 1, speed: 0.9 },
  { role: "archaeologist", t0: 0.6, t1: 0.7, start: 0.8, dir: -1, speed: 0.85, high: true },
  { role: "tourist", t0: 0.57, t1: 0.85, start: 0.6, dir: -1, speed: 1.05 },
  { role: "tourist", t0: 0.62, t1: 0.85, start: 0.3, dir: 1, speed: 1.0, high: true },
  { role: "local-man", t0: 0.7, t1: 0.86, start: 0.5, dir: -1, speed: 0.95 },
  { role: "local-woman", t0: 0.74, t1: 0.86, start: 0.2, dir: 1, speed: 0.85, high: true },
  // The climb back to the rim.
  { role: "trekker", t0: 0.85, t1: 0.985, start: 0.6, dir: 1, speed: 1.05 },
  { role: "cabana", t0: 0.86, t1: 0.985, start: 0.3, dir: -1, speed: 0.85, high: true },
];

/** Offset from the centreline, to the right of the walking direction. */
export const LANE = 1.3;
/** A walker waits while the traveler stands this close ahead of them. */
export const BLOCK_R = 2;
/** Pause at the ends of the stretch before turning back (s). */
export const TURN_PAUSE = [2.5, 5] as const;

export interface Walk {
  t: number;
  dir: 1 | -1;
  /** Seconds left standing (blocked or turning). */
  wait: number;
}

export function startWalk(s: TravellerSpec): Walk {
  return { t: s.t0 + (s.t1 - s.t0) * s.start, dir: s.dir, wait: 0 };
}

/**
 * One step along the stretch: stand while blocked or turning; at an end, stop there, wait a moment and turn.
 * Returns the speed walked this step (0 when standing). `rand` picks the turn pause.
 */
export function stepWalk(w: Walk, s: TravellerSpec, dt: number, length: number, blocked: boolean, rand: () => number) {
  if (blocked) w.wait = Math.max(w.wait, 0.6);
  if (w.wait > 0) {
    w.wait = Math.max(0, w.wait - dt);
    return 0;
  }
  w.t += (w.dir * s.speed * dt) / length;
  if (w.t >= s.t1 || w.t <= s.t0) {
    w.t = Math.min(s.t1, Math.max(s.t0, w.t));
    w.dir = w.t >= s.t1 ? -1 : 1;
    w.wait = TURN_PAUSE[0] + (TURN_PAUSE[1] - TURN_PAUSE[0]) * rand();
  }
  return s.speed;
}

/** Side of the road (+1 right of increasing t) a walker heading `dir` keeps to. */
export const laneSide = (dir: 1 | -1): 1 | -1 => dir;

// ---------------------------------------------------------------- the gathering at the Cruz del Cóndor

export type GatherPose = "watch" | "photo" | "sit" | "vend" | "play";

export interface GatherSpot {
  role: "tourist" | "vendor" | "cabana" | "kid";
  /** Platform-local frame (../cruz.ts): +z toward the canyon, the cross at (0, 3.6), parapet at r ≈ 8.2. */
  x: number;
  z: number;
  /** Facing, radians from +z toward +x. */
  a: number;
  pose: GatherPose;
  high?: boolean;
}

/**
 * Who is at the viewpoint by day: visitors along the parapet's flanks watching the condors (one taking a
 * photo), one resting on a stone bench, a vendor with her textiles laid out on the landward side, a woman of
 * Cabanaconde in her embroidered hat and two children playing near the sign. The way from the road's end to
 * the cross stays clear (|x| < 2.2 for z < 3.6), as do the cross's pedestal and the benches.
 */
export const GATHER: ReadonlyArray<GatherSpot> = [
  { role: "tourist", x: 6.6, z: 2.2, a: 1.25, pose: "watch" },
  { role: "tourist", x: -6.7, z: 1.9, a: -1.3, pose: "photo" },
  { role: "tourist", x: 5.0, z: 4.6, a: 0.75, pose: "watch", high: true },
  { role: "tourist", x: -4.4, z: 2.6, a: -0.5, pose: "sit", high: true },
  { role: "vendor", x: 4.9, z: -5.4, a: -Math.PI / 2 - 0.3, pose: "vend" },
  { role: "cabana", x: -5.9, z: -1.2, a: -0.9, pose: "watch" },
  { role: "kid", x: -4.3, z: -3.8, a: 0, pose: "play" },
  { role: "kid", x: -4.3, z: -3.8, a: Math.PI, pose: "play", high: true },
];

/** The vendor's cloth with folded textiles, in front of her (platform-local). */
export const STALL = { x: 3.7, z: -5.0, w: 1.6, d: 1.1 } as const;
/** The children's loop round their spot (radius, angular speed). */
export const PLAY = { r: 1.2, w: 1.4 } as const;

/** Clear corridor from the road's end to the cross (platform-local). */
export const inCorridor = (x: number, z: number) => Math.abs(x) < 2.2 && z < 3.6;

/** By day (sky time; 0.25 sunrise, 0.75 sunset): people are out. */
export const isDay = (t: number) => t > 0.27 && t < 0.73;
