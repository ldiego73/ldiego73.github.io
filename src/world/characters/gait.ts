/**
 * Procedural locomotion math shared by the new characters (no keyframe files): the gait cycle, the foot path
 * of one leg (stance with heel strike and toe roll, swing with lift), a two-bone leg IK that keeps the stance
 * foot on the ground, the pelvis motion of a walk (bounce, sway toward the stance leg, hip drop, hip yaw), and
 * the leg order of the llama's walk.
 *
 * Conventions (bind pose is world aligned, the character faces +Z, its left is +X): a bone's rotation.x > 0
 * swings a downward-pointing limb BACK (toward −Z); foot pitch > 0 lifts the toes.
 *
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "./sdf";

export const TAU = Math.PI * 2;

/** Advance a 0..1 cycle phase by `dt` at `speed` units/s over a cycle of `cycleLen` units (two steps). */
export function advancePhase(phase: number, dt: number, speed: number, cycleLen: number) {
  if (cycleLen <= 0) return phase;
  const p = phase + (dt * speed) / cycleLen;
  return p - Math.floor(p);
}

export interface FootPose {
  /** Forward offset of the ankle from under the hip. */
  z: number;
  /** Lift of the ankle above its standing height. */
  y: number;
  /** Toe up (> 0) / heel up (< 0), radians. */
  pitch: number;
  /** True while the foot bears weight. */
  stance: boolean;
  /** 0..1 progress through the current stance or swing. */
  s: number;
}

const ss = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/**
 * Ankle path of one leg at cycle phase `phase` (0..1, 0 = heel strike). `duty` is the stance share (walk ≈ 0.6,
 * run ≈ 0.38), `half` half the foot's travel, `lift` the swing height, `roll` the toe-off heel lift (radians).
 * During stance the foot slides back at constant speed (what the ground does under a walking body).
 */
export function footPath(phase: number, duty: number, half: number, lift: number, roll = 0.6): FootPose {
  const p = phase - Math.floor(phase);
  if (p < duty) {
    const s = p / duty;
    // Heel strike (toes up) → flat → heel off, rolling over the toes.
    let pitch = 0;
    if (s < 0.15) pitch = 0.22 * (1 - s / 0.15);
    else if (s > 0.62) pitch = -roll * ((s - 0.62) / 0.38) ** 2;
    return { z: half * (1 - 2 * s), y: 0, pitch, stance: true, s };
  }
  const s = (p - duty) / (1 - duty);
  // Forward fast early, settle late; the lift peaks a little before mid-swing (the knee leads).
  const z = -half + 2 * half * ss(s);
  const y = lift * Math.sin(Math.PI * Math.min(1, s * 1.08)) ** 1.2;
  const pitch = -roll + (roll + 0.22) * ss(s / 0.85);
  return { z, y: Math.max(0, y), pitch, stance: false, s };
}

export interface LegAngles {
  /** Thigh rotation about x (negative = forward) and about z (toward the foot's side). */
  pitch: number;
  roll: number;
  /** Knee rotation about x (positive = shin back for a human knee). */
  knee: number;
  /** True when the target was beyond reach (clamped). */
  clamped: boolean;
}

/**
 * Two-bone IK in the leg's plane: hip → knee → ankle with lengths l1, l2. `bend` +1 bends like a human knee
 * (joint forward, shin back), −1 like a llama's hock (joint back). Apply as Euler order "ZXY": roll then pitch.
 */
export function legIK(hip: Vec3, ankle: Vec3, l1: number, l2: number, bend: 1 | -1 = 1): LegAngles {
  const dx = ankle[0] - hip[0];
  const dy = hip[1] - ankle[1];
  const dz = ankle[2] - hip[2];
  const roll = Math.atan2(dx, Math.max(1e-6, dy));
  const dyp = Math.hypot(dx, dy);
  let D = Math.hypot(dyp, dz);
  const maxD = (l1 + l2) * 0.9995;
  const minD = Math.abs(l1 - l2) + 1e-4;
  const clamped = D > maxD || D < minD;
  D = Math.min(maxD, Math.max(minD, D));
  const phi = Math.atan2(dz, dyp);
  const alpha = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D))));
  const beta = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - D * D) / (2 * l1 * l2))));
  const flex = Math.PI - beta;
  return { pitch: -(phi + bend * alpha), roll, knee: bend * flex, clamped };
}

/** Forward kinematics of `legIK`'s convention (tests, debugging): ankle position from the angles. */
export function legFK(hip: Vec3, a: LegAngles, l1: number, l2: number): Vec3 {
  const t1 = -a.pitch;
  const t2 = -a.pitch - a.knee;
  // In the leg plane: down component and forward component.
  const down = l1 * Math.cos(t1) + l2 * Math.cos(t2);
  const fwd = l1 * Math.sin(t1) + l2 * Math.sin(t2);
  return [hip[0] + down * Math.sin(a.roll), hip[1] - down * Math.cos(a.roll), hip[2] + fwd];
}

export interface PelvisPose {
  /** Vertical offset (bounce). */
  y: number;
  /** Lateral shift toward the stance leg. */
  x: number;
  /** Hip drop on the swing side (rotation about z). */
  roll: number;
  /** Hip yaw following the forward leg. */
  yaw: number;
}

/**
 * Pelvis of a biped at phase (left heel strike at 0, right at 0.5). Highest at mid-stance, lowest at the
 * double support (walk); a run is the opposite (lowest at mid-stance, highest in flight).
 */
export function pelvis(phase: number, walk: number, run: number): PelvisPose {
  const a = phase * TAU;
  // Two bounces per cycle.
  const walkBob = -Math.cos(2 * a - 0.6) * 0.5 + 0.5;
  const runBob = Math.cos(2 * a - 0.3) * 0.5 + 0.5;
  return {
    y: walk * 0.022 * walkBob + run * 0.05 * runBob,
    x: Math.sin(a + 0.4) * (0.022 * walk + 0.008 * run),
    roll: -Math.sin(a + 0.4) * (0.05 * walk + 0.03 * run),
    yaw: Math.cos(a) * (0.11 * walk + 0.16 * run),
  };
}

/** Phase offsets of the llama's lateral-sequence walk (LH, LF, RH, RF fall in turn). */
export const LLAMA_WALK = { lf: 0.25, rf: 0.75, lh: 0, rh: 0.5 } as const;

/** Phase of one llama leg given the body phase. */
export const legPhase = (phase: number, offset: number) => {
  const p = phase - offset;
  return p - Math.floor(p);
};
