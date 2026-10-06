/**
 * Pure pieces of the spectacled bear: postures, pose blending, tree ranking, trunk axes and the
 * relocation / "good look" predicates (unit-tested; no scene access here).
 */

/** Joint angles (radians) and heights of one bear. Arms are relative to the torso; legs to the root. */
export interface Pose {
  /** Hip pivot height above the root (ground, or the climbing point). */
  hipY: number;
  torsoP: number;
  torsoR: number;
  headP: number;
  headYaw: number;
  armL: number;
  armR: number;
  legL: number;
  legR: number;
  /** Bromeliad in the paws: 0 hidden … 1 held. */
  prop: number;
}

export const POSE_KEYS = [
  "hipY",
  "torsoP",
  "torsoR",
  "headP",
  "headYaw",
  "armL",
  "armR",
  "legL",
  "legR",
  "prop",
] as const satisfies ReadonlyArray<keyof Pose>;

const pose = (p: Partial<Pose>): Pose => ({
  hipY: 0.7,
  torsoP: 0,
  torsoR: 0,
  headP: 0,
  headYaw: 0,
  armL: 0,
  armR: 0,
  legL: 0,
  legR: 0,
  prop: 0,
  ...p,
});

/**
 * Posture library. Torso pitch is negative to rear up (−π/2 = upright). An arm's world angle is
 * torsoP + arm (0 hangs straight down, negative swings forward/up).
 */
export const POSES = {
  /** On all fours, head carried low. */
  walk: pose({ headP: 0.06 }),
  /** Sitting on the rump eating: hind legs forward, paws up at the mouth, head bowed to the food. */
  sit: pose({ hipY: 0.36, torsoP: -1.05, headP: 1.1, armL: -0.62, armR: -0.62, legL: -1.38, legR: -1.38, prop: 1 }),
  /** Standing on the hind legs to sniff: forepaws dangling, nose up. */
  stand: pose({ torsoP: -1.27, headP: 1.2, armL: 0.85, armR: 0.85, legL: 0.06, legR: 0.06 }),
  /** Hugging a trunk (root = hip on the trunk surface), forepaws reaching up, hind feet gripping. */
  climb: pose({ hipY: 0, torsoP: -1.42, headP: 0.95, armL: -1.2, armR: -1.2, legL: -0.8, legR: -0.8 }),
} satisfies Record<string, Pose>;

export function copyPose(out: Pose, src: Pose): Pose {
  for (const k of POSE_KEYS) out[k] = src[k];
  return out;
}

/** Frame-rate independent ease of `cur` toward `tgt` (rate per second). */
export function dampPose(cur: Pose, tgt: Pose, rate: number, dt: number): Pose {
  const a = 1 - Math.exp(-rate * dt);
  for (const k of POSE_KEYS) cur[k] += (tgt[k] - cur[k]) * a;
  return cur;
}

/** Shortest signed angle from a to b. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export type BearTreeKind = "unca" | "aliso";

export interface BearTree {
  kind: BearTreeKind;
  /** Base of the trunk (world). */
  x: number;
  y: number;
  z: number;
  /** Instance scale (xz) and vertical scale. */
  s: number;
  sy: number;
  yaw: number;
  /** Nearest trail t and distance to the trail centerline. */
  t: number;
  d: number;
}

/** Trees usable by a bear near the trail: inside [tMin, tMax], within maxD of the path, closest first. */
export function rankTrees(trees: BearTree[], tMin: number, tMax: number, maxD: number): BearTree[] {
  return trees.filter((tr) => tr.t >= tMin && tr.t <= tMax && tr.d <= maxD).sort((a, b) => a.d - b.d);
}

/** Trunk radius (local units, before instance scale) near the ground. */
export const TRUNK_R: Record<BearTreeKind, number> = { unca: 0.3, aliso: 0.22 };

/** How high a bear climbs (local units): below the first limbs. */
export const CLIMB_TOP: Record<BearTreeKind, number> = { unca: 1.25, aliso: 1.55 };

/**
 * Trunk centerline in the tree's local space at height h (matches flora/models.ts: the unca trunk is
 * crooked, the aliso trunk is nearly straight).
 */
export function trunkAxis(kind: BearTreeKind, h: number, out: { x: number; y: number; z: number }) {
  if (kind === "unca") {
    const t = Math.max(0, Math.min(1, h / 3.4));
    out.x = Math.sin(t * 3.2) * 0.35;
    out.z = Math.cos(t * 2.6 + 1) * 0.25 - 0.25;
  } else {
    out.x = 0;
    out.z = 0;
  }
  out.y = h;
  return out;
}

/** A first good look: close enough and in front of the camera. */
export function isGoodLook(dist: number, inView: boolean, maxDist = 12): boolean {
  return inView && dist <= maxDist;
}

/**
 * Should a bear be moved ahead of the traveler (never while it could be watched)? An unseen bear moves
 * when it is farther than `far`, or when the traveler has left it behind (`behind`).
 */
export function shouldRelocate(o: {
  hidden: boolean;
  dist: number;
  inView: boolean;
  cooldown: number;
  far: number;
  behind: boolean;
}): boolean {
  if (o.cooldown > 0) return false;
  if (o.hidden) return true;
  return !o.inView && (o.dist > o.far || o.behind);
}

/** The bear's active hours (sky time: 0.25 sunrise, 0.75 sunset): mostly day, lingering into dusk. */
export function isAwake(time: number, from = 0.23, to = 0.8): boolean {
  return time >= from && time <= to;
}
