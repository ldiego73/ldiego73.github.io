/**
 * The action poses of the human animation controller, as pure functions of time (no keyframe files, no DOM,
 * no Three). Each action writes the local rotations of the bones it controls (Euler x, y, z in radians, the
 * bone's own order unless `o` says otherwise), an optional hips offset and tilt, and flags: whether it owns the
 * legs (sitting, kneeling, dancing) or leaves them to the walk cycle (carrying, waving while walking), whether
 * it owns the head (looking at the traveler is skipped), and a face expression.
 *
 * Conventions (./gait.ts): bind pose world aligned, facing +Z, left = +X. A downward limb swings BACK with +x
 * (so −x raises an arm forward or a thigh up); +z on the left arm (−z on the right) lifts it out to the side;
 * a forearm bends with −x, a knee with +x on the shin; +x on the spine, chest, neck or head leans forward;
 * +y turns them to the character's left.
 *
 * Distances are in body units (the traveler's): the animator scales them by the person's size.
 * `side` mirrors a one-handed action (1 = right hand, −1 = left hand).
 */

export interface Rot {
  x: number;
  y: number;
  z: number;
  /** Euler order override (default: the bone's). */
  o?: "XYZ" | "YXZ" | "ZXY";
}

export interface Pose {
  rot: Record<string, Rot>;
  /** Hips offset from rest (body units) and hips rotation (absolute). */
  hips: { x: number; y: number; z: number; rx: number; ry: number; rz: number } | null;
  /** The pose owns the legs (no walk cycle, no foot IK). */
  legs: boolean;
  /** The pose owns the arms (no arm swing underneath). */
  arms: boolean;
  /** The pose owns the head (no look-at). */
  head: boolean;
  /** Face expression the pose asks for (null = automatic). */
  face: "smile" | "blink" | "neutral" | null;
}

export interface PoseCtx {
  /** Seconds since the action started. */
  t: number;
  /** Walk-cycle phase 0..1 (actions that move with the gait). */
  phase: number;
  /** Ground speed (m/s), 0 when standing. */
  speed: number;
  /** Reduced motion: smaller, slower movements. */
  rm: boolean;
  /** 1 = right hand leads, −1 = left. */
  side: 1 | -1;
  /** Per-person offset (seconds) so a group does not move in lockstep. */
  seed: number;
  /** Seat height for "sit-bench" / "sit-stool" (body units above the feet). */
  seat: number;
}

export const ACTIONS = [
  "none",
  // idle variants
  "hands-clasp",
  "hands-back",
  "hands-hips",
  "arms-crossed",
  // sitting and low poses
  "sit-bench",
  "sit-stool",
  "sit-ground",
  "sit-cross",
  "kneel",
  "crouch",
  // social
  "wave",
  "greet",
  "talk",
  "point",
  "giggle",
  // carrying
  "carry-back",
  "carry-shoulder",
  "carry-hand",
  "carry-head",
  // festivals and play
  "dance",
  "hop",
  "kick",
  "jump",
  "swim",
  // crafts and work
  "weave",
  "spin",
  "knit",
  "paint",
  "stir",
  "drink",
  "tend-fire",
  "plough",
  "sow",
  "herd",
  "fish-cast",
  "paddle",
  "row",
  "pole",
  // the traveler
  "type",
  "ride",
] as const;
export type Action = (typeof ACTIONS)[number];

/** Clears a pose for reuse (no allocation per frame once warm). */
export function resetPose(p: Pose): Pose {
  for (const k of Object.keys(p.rot)) delete p.rot[k];
  p.hips = null;
  p.legs = false;
  p.arms = false;
  p.head = false;
  p.face = null;
  return p;
}

export const emptyPose = (): Pose => ({ rot: {}, hips: null, legs: false, arms: false, head: false, face: null });

const TAU = Math.PI * 2;
const r = (x: number, y = 0, z = 0, o?: Rot["o"]): Rot => (o ? { x, y, z, o } : { x, y, z });
const set = (p: Pose, bone: string, v: Rot) => {
  p.rot[bone] = v;
};
const hips = (p: Pose, y: number, x = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
  p.hips = { x, y, z, rx, ry, rz };
};
/** Mirror a right/left bone name by side (side 1 = "R" is the leading hand). */
const S = (c: PoseCtx, base: string, lead: boolean) => `${base}${(c.side === 1) === lead ? "R" : "L"}`;
/** Lateral sign of the leading side: +1 when the left (+X) side leads. */
const sx = (c: PoseCtx, lead: boolean) => ((c.side === 1) === lead ? -1 : 1);
const amp = (c: PoseCtx) => (c.rm ? 0.35 : 1);
const osc = (c: PoseCtx, f: number, ph = 0) => Math.sin((c.t + c.seed) * f * TAU + ph);

/** Arm pose helper: shoulder pitch, outward lift, elbow bend, hand pitch for one side (+1 left, −1 right). */
function arm(p: Pose, sd: "L" | "R", pitch: number, out: number, elbow: number, twist = 0, hand = 0) {
  const s = sd === "L" ? 1 : -1;
  set(p, `arm${sd}`, r(pitch, twist * s, out * s));
  set(p, `fore${sd}`, r(elbow, 0, 0));
  set(p, `hand${sd}`, r(hand, 0, 0));
}

/** Leg pose helper: thigh pitch and spread, knee bend, foot pitch (relative), for one side. */
function leg(p: Pose, sd: "L" | "R", thigh: number, spread: number, knee: number, foot = -(thigh + knee), twist = 0) {
  const s = sd === "L" ? 1 : -1;
  set(p, `thigh${sd}`, r(thigh, twist * s, spread * s));
  set(p, `shin${sd}`, r(knee, 0, 0));
  set(p, `foot${sd}`, r(foot, 0, 0));
}

function sitLegs(p: Pose, swing: number) {
  const k = 1.5 + swing;
  leg(p, "L", -1.5, 0.06, k);
  leg(p, "R", -1.5, 0.06, 3 - k);
  p.legs = true;
}

/** Writes action `a` at context `c` into `p` (cleared first). */
export function actionPose(a: Action, c: PoseCtx, p: Pose): Pose {
  resetPose(p);
  const A = amp(c);
  switch (a) {
    case "none":
      break;
    // ---------------------------------------------------------------- idle variants
    case "hands-clasp": {
      // Hands together in front of the waist (the highland women's rest, above the pollera's bell).
      for (const [sd, s] of [
        ["L", 1],
        ["R", -1],
      ] as const) {
        set(p, `arm${sd}`, r(-0.32, 0.18 * s, 0.1 * s));
        set(p, `fore${sd}`, r(-1.25, -0.85 * s, 0, "YXZ"));
        set(p, `hand${sd}`, r(-0.1, -0.3 * s, 0.1 * s));
      }
      p.arms = true;
      break;
    }
    case "hands-back": {
      for (const [sd, s] of [
        ["L", 1],
        ["R", -1],
      ] as const) {
        set(p, `arm${sd}`, r(0.42, -0.25 * s, 0.12 * s));
        set(p, `fore${sd}`, r(-1.0, 0.9 * s, 0, "YXZ"));
        set(p, `hand${sd}`, r(0.1, 0, 0));
      }
      set(p, "chest", r(-0.04, 0, 0));
      p.arms = true;
      break;
    }
    case "hands-hips": {
      arm(p, "L", 0.15, 0.62, -1.5, -0.6, 0.2);
      arm(p, "R", 0.15, 0.62, -1.5, -0.6, 0.2);
      p.arms = true;
      break;
    }
    case "arms-crossed": {
      for (const [sd, s] of [
        ["L", 1],
        ["R", -1],
      ] as const) {
        set(p, `arm${sd}`, r(-0.42, 0.25 * s, 0.24 * s));
        set(p, `fore${sd}`, r(-1.5, -1.05 * s, 0, "YXZ"));
        set(p, `hand${sd}`, r(0, 0, 0));
      }
      p.arms = true;
      break;
    }
    // ---------------------------------------------------------------- sitting and low poses
    case "sit-bench":
    case "sit-stool": {
      // Thighs level on the seat, shins hanging; the hips drop so the thighs rest on the seat surface.
      const seat = c.seat || (a === "sit-stool" ? 0.32 : 0.42);
      hips(p, seat + 0.083 - 0.76, 0, -0.04);
      const swing = c.rm ? 0 : 0.1 * Math.sin((c.t + c.seed) * 1.7);
      if (a === "sit-stool") {
        // A low stool: knees high, feet drawn back under.
        leg(p, "L", -1.75, 0.18, 2.1);
        leg(p, "R", -1.75, 0.18, 2.1);
        p.legs = true;
      } else sitLegs(p, swing);
      set(p, "spine", r(0.06, 0, 0));
      arm(p, "L", -0.62, 0.2, -0.55, 0, 0.1);
      arm(p, "R", -0.62, 0.2, -0.55, 0, 0.1);
      p.arms = true;
      break;
    }
    case "sit-ground": {
      // On the ground, legs forward with soft knees, leaning back a little on straight arms... or hugging
      // the knees: alternate slowly between the two.
      hips(p, -0.66, 0, -0.08);
      leg(p, "L", -1.42, 0.14, 0.3);
      leg(p, "R", -1.38, 0.12, 0.42);
      set(p, "spine", r(0.12, 0, 0));
      set(p, "chest", r(0.06, 0, 0));
      arm(p, "L", -0.55, 0.3, -0.6, 0, 0.2);
      arm(p, "R", -0.55, 0.3, -0.6, 0, 0.2);
      p.legs = true;
      p.arms = true;
      break;
    }
    case "sit-cross": {
      // Cross-legged on a mat (weaving, by the fire): thighs out, shins crossed under.
      hips(p, -0.64, 0, -0.04);
      leg(p, "L", -1.2, 1.0, 2.15, -0.6, -0.2);
      leg(p, "R", -1.2, 1.0, 2.15, -0.6, -0.2);
      set(p, "spine", r(0.08, 0, 0));
      arm(p, "L", -0.5, 0.15, -0.9, 0, 0);
      arm(p, "R", -0.5, 0.15, -0.9, 0, 0);
      p.legs = true;
      p.arms = true;
      break;
    }
    case "kneel": {
      hips(p, -0.37, 0, -0.06);
      leg(p, "L", -0.15, 0.08, 1.6, -0.9);
      leg(p, "R", -0.15, 0.08, 1.6, -0.9);
      set(p, "spine", r(0.05, 0, 0));
      arm(p, "L", -0.4, 0.15, -0.6);
      arm(p, "R", -0.4, 0.15, -0.6);
      p.legs = true;
      p.arms = true;
      break;
    }
    case "crouch": {
      hips(p, -0.44, 0, -0.12);
      leg(p, "L", -1.55, 0.32, 2.45, -0.9);
      leg(p, "R", -1.55, 0.32, 2.45, -0.9);
      set(p, "spine", r(0.35, 0, 0));
      set(p, "chest", r(0.15, 0, 0));
      set(p, "head", r(-0.2, 0, 0));
      arm(p, "L", -0.9, 0.25, -0.5);
      arm(p, "R", -0.9, 0.25, -0.5);
      p.legs = true;
      p.arms = true;
      break;
    }
    // ---------------------------------------------------------------- social
    case "wave": {
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      const w = osc(c, 1.6) * 0.35 * A;
      arm(p, s, -0.35, 2.35, -0.5 + w * 0.5, 0, 0);
      set(p, `fore${s}`, r(-0.45, 0, w * (s === "L" ? 1 : -1)));
      set(p, "head", r(-0.06, 0, 0.05 * sx(c, true)));
      p.face = "smile";
      break;
    }
    case "greet": {
      // A small bow with the right hand to the chest.
      const k = Math.min(1, c.t / 0.5) * (1 - Math.max(0, Math.min(1, (c.t - 1.6) / 0.6)));
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      arm(p, s, -0.55, 0.05, -1.9, -0.4, 0.2);
      set(p, "spine", r(0.18 * k, 0, 0));
      set(p, "neck", r(0.12 * k, 0, 0));
      set(p, "head", r(0.18 * k, 0, 0));
      p.face = "smile";
      break;
    }
    case "talk": {
      // Hands explain in turn, a little nod.
      const a1 = osc(c, 0.55) * A;
      const a2 = osc(c, 0.45, 2.1) * A;
      arm(p, "R", -0.55 - 0.25 * Math.max(0, a1), 0.18, -1.1 - 0.35 * a1, -0.3, 0.1);
      arm(p, "L", -0.35 - 0.2 * Math.max(0, a2), 0.15, -0.9 - 0.3 * a2, -0.3, 0.1);
      set(p, "head", r(0.05 * osc(c, 1.1) * A, 0.12 * osc(c, 0.23) * A, 0));
      break;
    }
    case "point": {
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      arm(p, s, -1.45, 0.25, -0.1, 0, 0);
      set(p, "chest", r(0, 0.15 * sx(c, true), 0));
      break;
    }
    case "giggle": {
      // A hand to the mouth, shoulders bobbing.
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      arm(p, s, -1.0, 0.35, -2.2, -0.5, 0.2);
      set(p, "spine", r(0.1 + Math.abs(osc(c, 3.5)) * 0.08 * A, 0, 0));
      p.face = "smile";
      break;
    }
    // ---------------------------------------------------------------- carrying
    case "carry-back": {
      // Hands at the knot of a q'ipi on the chest, leaning into the load.
      for (const [sd, s] of [
        ["L", 1],
        ["R", -1],
      ] as const) {
        set(p, `arm${sd}`, r(-0.5, 0.2 * s, -0.05 * s));
        set(p, `fore${sd}`, r(-1.6, -0.9 * s, 0, "YXZ"));
      }
      set(p, "spine", r(0.16, 0, 0));
      set(p, "chest", r(0.06, 0, 0));
      set(p, "head", r(-0.14, 0, 0));
      p.arms = true;
      break;
    }
    case "carry-shoulder": {
      // A load on the shoulder (a bunch of bananas, a bundle of reeds), steadied with one hand up.
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      arm(p, s, -0.4, 1.1, -2.2, 0.3, 0);
      set(p, "neck", r(0, 0, 0.12 * sx(c, true)));
      break;
    }
    case "carry-hand": {
      // A basket in the hand, arm a little out, the other arm balancing.
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      arm(p, s, -0.1, 0.32, -0.25);
      set(p, "spine", r(0, 0, 0.06 * sx(c, true)));
      break;
    }
    case "carry-head": {
      for (const sd of ["L", "R"] as const) arm(p, sd, -0.3, 2.55, -0.9, 0, 0);
      set(p, "head", r(0, 0, 0));
      p.arms = true;
      p.head = true;
      break;
    }
    // ---------------------------------------------------------------- festivals and play
    case "dance": {
      // Huayno: a quick step-hop on the beat, the handkerchief waving overhead in the leading hand.
      const beat = (c.t + c.seed) * 1.2 * TAU;
      const s = Math.sin(beat);
      leg(p, "L", Math.max(0, s) * -0.7 * A, 0.04, Math.max(0, s) * 1.0 * A);
      leg(p, "R", Math.max(0, -s) * -0.7 * A, 0.04, Math.max(0, -s) * 1.0 * A);
      hips(p, Math.abs(s) * 0.07 * A - 0.02, 0, 0, 0, 0, s * 0.06 * A);
      const lead = S(c, "arm", true).slice(-1) as "L" | "R";
      const other = lead === "L" ? "R" : "L";
      arm(p, lead, -0.4 + Math.sin(beat * 0.5) * 0.3 * A, 2.3, -0.5, 0, 0);
      arm(p, other, -0.3, 0.6 + Math.max(0, s) * 0.2 * A, -0.7);
      set(p, "chest", r(0, 0, s * 0.06 * A));
      set(p, "head", r(0, 0, -s * 0.06 * A));
      p.legs = true;
      p.arms = true;
      p.face = "smile";
      break;
    }
    case "hop": {
      // Hopscotch / skipping in a ring: bounce on every beat, arms up and out.
      const beat = (c.t + c.seed) * 1.7 * TAU;
      const h = Math.abs(Math.sin(beat));
      hips(p, h * 0.16 * A);
      leg(p, "L", -0.35 * h * A, 0.04, 0.8 * h * A);
      leg(p, "R", -0.15 * h * A, 0.04, 0.4 * h * A);
      arm(p, "L", -0.3, 1.0, -0.3);
      arm(p, "R", -0.3, 1.0, -0.3);
      p.legs = true;
      p.arms = true;
      p.face = "smile";
      break;
    }
    case "kick": {
      // A kick of a ball with the leading foot (one shot: wind back, swing through, settle).
      const k = c.t;
      const s = S(c, "thigh", true).slice(-1) as "L" | "R";
      const back = k < 0.18 ? k / 0.18 : 0;
      const through = k >= 0.18 && k < 0.45 ? (k - 0.18) / 0.27 : 0;
      const settle = k >= 0.45 ? Math.max(0, 1 - (k - 0.45) / 0.3) : 0;
      const th = back * 0.5 - through * 1.15 - settle * 0.6;
      leg(p, s, th, 0.05, back * 1.1 + (1 - through) * 0.1 * through + settle * 0.2);
      arm(p, s === "L" ? "R" : "L", -0.6 * (through + settle), 0.35, -0.4);
      p.face = "smile";
      break;
    }
    case "jump": {
      // Crouch, launch with the arms up, tuck in the air (time 0..1.2 s), then land.
      const k = c.t;
      const crouch = k < 0.25 ? Math.sin((k / 0.25) * Math.PI * 0.5) : Math.max(0, 1 - (k - 0.25) / 0.1);
      const air = k > 0.3 && k < 1.0 ? Math.sin(((k - 0.3) / 0.7) * Math.PI) : 0;
      hips(p, -0.22 * crouch);
      leg(p, "L", -0.9 * crouch - 0.9 * air, 0.06, 1.6 * crouch + 1.5 * air);
      leg(p, "R", -0.9 * crouch - 0.9 * air, 0.06, 1.6 * crouch + 1.5 * air);
      arm(p, "L", 0.4 * crouch - 2.4 * air, 0.3 + 0.4 * air, -0.3);
      arm(p, "R", 0.4 * crouch - 2.4 * air, 0.3 + 0.4 * air, -0.3);
      set(p, "spine", r(0.3 * crouch, 0, 0));
      p.legs = true;
      p.arms = true;
      p.face = "smile";
      break;
    }
    case "swim": {
      // Face down on the water (the owner holds the root at the surface, the hips pitch the body flat), crawl
      // strokes (each arm turns full circles at the shoulder, half a turn apart) and a flutter kick.
      const ph = (c.t + c.seed) * 0.6 * TAU * (c.rm ? 0.6 : 1);
      hips(p, -0.72, 0, 0, 1.4, 0, Math.sin(ph) * 0.12 * A);
      for (const [sd, o, s] of [
        ["L", 0, 1],
        ["R", Math.PI, -1],
      ] as const) {
        const a1 = (((ph + o) % TAU) + TAU) % TAU;
        set(p, `arm${sd}`, r(-a1, 0, s * (0.2 + 0.25 * Math.max(0, Math.sin(a1)))));
        set(p, `fore${sd}`, r(-0.25 - 0.6 * Math.max(0, -Math.sin(a1)), 0, 0));
        leg(p, sd, Math.sin(ph * 3 + o) * 0.22 * A, 0.05, 0.2 + Math.sin(ph * 3 + o + 1) * 0.12 * A, 0.7);
      }
      set(p, "neck", r(-0.55, Math.sin(ph) * 0.35 * A, 0));
      set(p, "head", r(-0.4, 0, 0));
      p.legs = true;
      p.arms = true;
      p.head = true;
      break;
    }
    // ---------------------------------------------------------------- crafts and work
    case "weave": {
      // Backstrap loom, seated: both hands pass the weft across and beat it down.
      hips(p, -0.64, 0, -0.04);
      leg(p, "L", -1.3, 0.3, 0.35);
      leg(p, "R", -1.3, 0.3, 0.35);
      const pass = osc(c, 0.35) * A;
      const beat = Math.max(0, osc(c, 0.7, 1)) ** 4 * A;
      arm(p, "L", -0.95 - beat * 0.2, 0.2 + pass * 0.18, -0.75 + beat * 0.3);
      arm(p, "R", -0.95 - beat * 0.2, 0.2 - pass * 0.18, -0.75 + beat * 0.3);
      set(p, "spine", r(0.12 - beat * 0.08, 0, 0));
      set(p, "head", r(0.3, 0, 0));
      p.legs = true;
      p.arms = true;
      p.head = true;
      break;
    }
    case "spin": {
      // Drop spindle (pushka): the right hand twirls the spindle low, the left holds the fibre up high.
      const tw = osc(c, 1.4) * A;
      arm(p, "L", -1.45, 0.3, -0.4, 0, 0.3);
      arm(p, "R", -0.55, 0.22, -0.7 + tw * 0.15, 0, 0.2 + tw * 0.3);
      set(p, "head", r(0.22, 0.1, 0));
      p.arms = true;
      break;
    }
    case "knit": {
      const k = osc(c, 1.8) * A;
      for (const [sd, s] of [
        ["L", 1],
        ["R", -1],
      ] as const) {
        set(p, `arm${sd}`, r(-0.45, 0.2 * s, 0.12 * s));
        set(p, `fore${sd}`, r(-1.35 + (sd === "R" ? k * 0.12 : 0), -0.6 * s, 0, "YXZ"));
        set(p, `hand${sd}`, r(-0.2, 0, 0));
      }
      set(p, "head", r(0.32, 0, 0));
      p.arms = true;
      p.head = true;
      break;
    }
    case "paint": {
      // Painting a pot held in the left hand, the brush hand making small strokes.
      const st = osc(c, 0.9) * A;
      arm(p, "L", -0.75, 0.25, -1.3, -0.3, 0);
      arm(p, "R", -0.65, 0.1, -1.4 + st * 0.12, -0.5, 0.2 + st * 0.2);
      set(p, "spine", r(0.18, 0, 0));
      set(p, "head", r(0.35, 0.08, 0));
      p.arms = true;
      p.head = true;
      break;
    }
    case "stir": {
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      const a1 = (c.t + c.seed) * 0.8 * TAU;
      arm(p, s, -0.75 + Math.sin(a1) * 0.15 * A, 0.2 + Math.cos(a1) * 0.15 * A, -0.7);
      set(p, "spine", r(0.15, 0, 0));
      break;
    }
    case "drink": {
      // Cup to the lips now and then.
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      const sip = Math.max(0, Math.sin((c.t + c.seed) * 0.25 * TAU)) ** 3;
      arm(p, s, -0.5 - 0.6 * sip, 0.2, -1.1 - 1.0 * sip, -0.3);
      set(p, "head", r(-0.15 * sip, 0, 0));
      break;
    }
    case "tend-fire": {
      // Crouched by the fire, poking it now and then with a stick.
      hips(p, -0.44, 0, -0.12);
      leg(p, "L", -1.55, 0.32, 2.45, -0.9);
      leg(p, "R", -1.55, 0.32, 2.45, -0.9);
      const poke = Math.max(0, osc(c, 0.3)) ** 2 * A;
      set(p, "spine", r(0.35, 0, 0));
      arm(p, "L", -0.7, 0.25, -0.9);
      arm(p, "R", -1.0 - poke * 0.35, 0.15, -0.3 + poke * 0.2);
      set(p, "head", r(0.1, 0, 0));
      p.legs = true;
      p.arms = true;
      break;
    }
    case "plough": {
      // Chakitaqlla: plunge with the foot on the peg (0–0.35), lever back (0.35–0.65), step on (0.65–1).
      const k = c.rm ? 0.5 : ((((c.t + c.seed) * 0.4) % 1) + 1) % 1;
      const plunge = k < 0.35 ? Math.sin((k / 0.35) * Math.PI) : 0;
      const lever = k >= 0.35 && k < 0.65 ? Math.sin(((k - 0.35) / 0.3) * Math.PI) : 0;
      const step = k >= 0.65 ? Math.sin(((k - 0.65) / 0.35) * Math.PI) : 0;
      leg(p, "R", -0.7 * plunge + step * 0.35, 0.05, 0.9 * plunge);
      leg(p, "L", -step * 0.3, 0.05, 0.3 * step + 0.1);
      hips(p, plunge * 0.04 - 0.03);
      set(p, "spine", r(0.3 - lever * 0.32 + plunge * 0.08, 0, 0));
      arm(p, "R", -0.95 - lever * 0.2, 0.12, -0.5);
      arm(p, "L", -1.15 - lever * 0.15, 0.18, -0.4);
      set(p, "head", r(0.2, 0, 0));
      p.legs = true;
      p.arms = true;
      break;
    }
    case "sow": {
      // Bent over the furrow: dip into the pouch, cast the seed in a low arc.
      const k = c.rm ? 0.3 : ((((c.t + c.seed) * 0.55) % 1) + 1) % 1;
      set(p, "spine", r(0.45 + Math.sin(k * TAU) * 0.05 * A, 0, 0));
      set(p, "head", r(-0.15, 0, 0));
      arm(p, "L", -0.7, 0.1, -0.6);
      arm(p, "R", k < 0.4 ? -0.4 - k * 0.8 : -0.72 + Math.sin(((k - 0.4) / 0.6) * Math.PI) * -0.75, 0.25, -0.4);
      p.arms = true;
      break;
    }
    case "herd": {
      // Walking with a staff (or a sling), waving it now and then to turn the animals.
      const s = S(c, "arm", true).slice(-1) as "L" | "R";
      const wave = Math.max(0, osc(c, 0.18)) ** 6 * A;
      arm(p, s, -0.55 - wave * 1.6, 0.18 + wave * 0.5, -0.6 + wave * 0.4);
      break;
    }
    case "fish-cast": {
      // Cast net: gather (0–0.4), swing (0.4–0.65), throw open (0.65–0.8), draw in (0.8–1).
      const k = c.rm ? 0.2 : ((((c.t + c.seed) * 0.22) % 1) + 1) % 1;
      const swing = k > 0.4 && k < 0.8 ? Math.sin(((k - 0.4) / 0.4) * Math.PI) : 0;
      const draw = k >= 0.8 ? (k - 0.8) / 0.2 : 0;
      set(p, "spine", r(0.15 + swing * 0.15, -0.5 * swing, 0));
      arm(p, "R", -0.9 - swing * 0.8, 0.3 + swing * 0.6, -0.6 + swing * 0.4);
      arm(p, "L", -0.8 - draw * 0.5, 0.25, -0.9 + draw * 0.6);
      leg(p, "L", -0.25, 0.1, 0.2);
      leg(p, "R", 0.15, 0.1, 0.15);
      p.legs = true;
      p.arms = true;
      break;
    }
    case "paddle": {
      // Kneeling or seated in a canoe, a single-blade paddle: reach forward on one side, pull back, switch.
      const ph = (c.t + c.seed) * 0.6 * TAU;
      const sideK = Math.sin(ph * 0.25) > 0 ? 1 : -1;
      const pull = Math.sin(ph);
      hips(p, -0.5, 0, -0.04);
      leg(p, "L", -1.45, 0.2, 1.2);
      leg(p, "R", -1.45, 0.2, 1.2);
      set(p, "spine", r(0.15 + pull * 0.1 * A, 0.35 * sideK * pull * A, 0));
      arm(p, sideK > 0 ? "L" : "R", -0.9 - pull * 0.4 * A, 0.2, -0.3);
      arm(p, sideK > 0 ? "R" : "L", -1.6 + pull * 0.3 * A, 0.4, -1.0);
      p.legs = true;
      p.arms = true;
      break;
    }
    case "row": {
      const ph = Math.sin((c.t + c.seed) * 0.55 * TAU) * A;
      hips(p, -0.5, 0, -0.04);
      leg(p, "L", -1.45, 0.15, 1.3);
      leg(p, "R", -1.45, 0.15, 1.3);
      set(p, "spine", r(0.2 + ph * 0.22, 0, 0));
      arm(p, "L", -1.1 - ph * 0.35, 0.28, -0.3 - (1 - ph) * 0.4);
      arm(p, "R", -1.1 - ph * 0.35, 0.28, -0.3 - (1 - ph) * 0.4);
      p.legs = true;
      p.arms = true;
      break;
    }
    case "pole": {
      // Standing, punting with a long pole: hands high, push down and back, recover.
      const ph = (c.t + c.seed) * 0.32 * TAU;
      const push = Math.max(0, Math.sin(ph));
      set(p, "spine", r(0.15 + push * 0.18 * A, 0.4, 0));
      arm(p, "R", -1.3 + push * 0.6 * A, 0.35, -0.6);
      arm(p, "L", -1.7 + push * 0.5 * A, 0.15, -1.0);
      leg(p, "L", -0.25, 0.12, 0.25);
      leg(p, "R", 0.2, 0.12, 0.2);
      p.legs = true;
      p.arms = true;
      break;
    }
    // ---------------------------------------------------------------- the traveler
    case "type": {
      const seat = c.seat || 0.48;
      hips(p, seat + 0.083 - 0.76, 0, -0.04);
      leg(p, "L", -1.5, 0.06, 1.5);
      leg(p, "R", -1.5, 0.06, 1.5);
      const t1 = c.rm ? 0 : Math.max(0, Math.sin((c.t + c.seed) * 13)) * 0.07;
      const t2 = c.rm ? 0 : Math.max(0, Math.sin((c.t + c.seed) * 13 + 2.2)) * 0.07;
      set(p, "spine", r(0.14, 0, 0));
      arm(p, "L", -0.75 - t1, 0.12, -0.85);
      arm(p, "R", -0.75 - t2, 0.12, -0.85);
      set(p, "head", r(0.22, 0, 0));
      p.legs = true;
      p.arms = true;
      p.head = true;
      break;
    }
    case "ride": {
      // Astride a saddle: thighs forward and out, shins down, hands low on the reins.
      // The thighs rest on the saddle at RIDER_SEAT (0.56 above the feet origin, where the mounts put it).
      hips(p, -0.12, 0, -0.02);
      leg(p, "L", -0.95, 0.45, 1.15, -0.2);
      leg(p, "R", -0.95, 0.45, 1.15, -0.2);
      set(p, "spine", r(0.06, 0, 0));
      arm(p, "L", -0.62, 0.12, -0.75, -0.2);
      arm(p, "R", -0.62, 0.12, -0.75, -0.2);
      p.legs = true;
      p.arms = true;
      break;
    }
  }
  return p;
}

/** Actions that own the legs (the controller skips the walk cycle under them). */
export function ownsLegs(a: Action): boolean {
  const p = actionPose(a, { t: 0, phase: 0, speed: 0, rm: false, side: 1, seed: 0, seat: 0 }, emptyPose());
  return p.legs;
}
