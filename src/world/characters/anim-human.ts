/**
 * Procedural animation of a new biped (no keyframe files): idle (breathing, weight shift, look-around, blink),
 * walk and run (foot path + two-bone leg IK so stance feet stay planted, pelvis bounce / sway / hip drop / yaw,
 * counter-rotating chest, counter arm swing with elbow bend, foot roll), plus the secondary motion of whatever
 * hangs off the body: spring chains for the chullo's tip and tassels, braids, and the cloth hems' pivot bones
 * (the cloth surface itself also rides the shared wind in its shader).
 *
 * The characters walk in place (a treadmill): `speed` is a virtual forward velocity, so stance feet slide
 * back at exactly that speed and the springs feel the motion as drag.
 *
 * Reduced motion: no bounce, smaller swings, slower idle, no look-around, stiffer springs.
 */
import * as THREE from "three";
import type { CharacterInstance } from "./character";
import { advancePhase, footPath, legIK, pelvis } from "./gait";
import { type Chain, type ChainDrive, chain, chainStep } from "./spring";

export type Mode = "idle" | "walk" | "run";
export type Expression = "auto" | "neutral" | "blink" | "smile";

export interface HangSpec {
  /** Bones of the chain, root first (each is a child of the previous, or of a body bone). */
  bones: string[];
  k: number;
  zeta: number;
  /** Tilt per unit of acceleration and of drag (forward speed / wind). */
  gainAcc: number;
  gainVel: number;
  /** Resting pitch (radians, negative = back) and limit. */
  rest?: number;
  limit?: number;
  /** "down" chains hang (positive bone rotation.x swings them back); "up" chains point up (the chullo tip). */
  dir: "down" | "up";
  /** Extra sideways sway from the hips (pollera swish) and from the arm swing. */
  hipSway?: number;
}

export interface HumanStyle {
  /** Cycle length (two steps) and stance share for walk and run. */
  walkCycle: number;
  runCycle: number;
  walkSpeed: number;
  runSpeed: number;
  /** Arm swing (radians at full stride) and resting arm abduction. */
  armSwing: number;
  armOut: number;
  /** Hip sway multiplier (the campesina sways more under the pollera). */
  hipSway: number;
  /** Foot spacing from the centre line. */
  stance: number;
  /**
   * Arms at rest: hanging ("hang") or forearms forward with the hands together in front of the waist ("clasp",
   * the campesina: her hands rest above the pollera's bell instead of inside it).
   */
  arms?: "hang" | "clasp";
  hangs: HangSpec[];
}

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const eA = new THREE.Euler(0, 0, 0, "ZXY");
const v3 = new THREE.Vector3();

export class HumanAnimator {
  phase = 0;
  walkW = 0;
  runW = 0;
  /** Freeze the cycle at a phase (screenshots of a walk strip); null = run freely. */
  hold: number | null = null;
  private speed = 0;
  private lastSpeed = 0;
  private lookYaw = 0;
  private lookTarget = 0;
  private lookTimer = 1.5;
  private blinkTimer = 2;
  private blinkT = -1;
  private chains: Array<{ spec: HangSpec; ch: Chain; p: number[]; r: number[] }>;
  private lastHipX = 0;
  private hipVX = 0;
  readonly b: Record<string, THREE.Bone>;
  private rest: Record<string, THREE.Vector3>;

  constructor(
    private inst: CharacterInstance,
    private st: HumanStyle,
  ) {
    this.b = inst.bones;
    this.rest = inst.rest;
    for (const n of ["thighL", "thighR", "armL", "armR", "footL", "footR", "hips", "spine", "chest", "head", "neck"])
      if (this.b[n]) (this.b[n] as THREE.Bone).rotation.order = "ZXY";
    this.chains = st.hangs.map((spec) => ({
      spec,
      ch: chain(spec.bones.length, spec.k, spec.zeta),
      p: new Array(spec.bones.length).fill(0),
      r: new Array(spec.bones.length).fill(0),
    }));
  }

  update(
    dt: number,
    t: number,
    s: { mode: Mode; rm: boolean; expression: Expression; windX?: number; windZ?: number },
  ) {
    dt = Math.min(dt, 0.05);
    const st = this.st;
    const rm = s.rm;
    const wantW = s.mode === "idle" ? 0 : 1;
    const wantR = s.mode === "run" ? 1 : 0;
    this.walkW = damp(this.walkW, wantW, 5, dt);
    this.runW = damp(this.runW, wantR, 4, dt);
    const walkW = this.walkW;
    const runW = this.runW * walkW;
    this.speed = mix(0, mix(st.walkSpeed, st.runSpeed, this.runW), walkW);
    const cycle = mix(st.walkCycle, st.runCycle, this.runW);
    if (this.hold !== null) this.phase = this.hold;
    else this.phase = advancePhase(this.phase, dt, Math.max(this.speed, 0.0001), cycle);
    const acc = dt > 0 ? (this.speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = this.speed;
    const ampK = rm ? 0.6 : 1;

    // ---------------------------------------------------------------- pelvis
    const duty = mix(0.6, 0.38, this.runW);
    const half = (duty * cycle) / 2;
    const pv = pelvis(this.phase, walkW * (1 - this.runW), runW);
    const breath = Math.sin(t * (rm ? 1.4 : 2.1));
    const idleW = 1 - walkW;
    const shift = (rm ? 0.008 : 0.016) * Math.sin(t * 0.55) * idleW;
    const hipRest = this.rest.hips as THREE.Vector3;
    const drop = 0.035 * walkW + 0.055 * runW;
    const hips = this.b.hips as THREE.Bone;
    hips.position.set(shift + pv.x * st.hipSway * ampK, hipRest.y - drop + (rm ? 0 : pv.y), 0);
    hips.rotation.set(0.04 * runW, pv.yaw * ampK, pv.roll * st.hipSway * ampK - shift * 1.6);
    hips.updateMatrix();
    this.hipVX = dt > 0 ? (hips.position.x - this.lastHipX) / dt : 0;
    this.lastHipX = hips.position.x;

    // ---------------------------------------------------------------- legs (IK)
    const lift = mix(0.075, 0.17, this.runW) * ampK;
    for (const [side, ph] of [
      ["L", this.phase],
      ["R", this.phase + 0.5],
    ] as const) {
      const sgn = side === "L" ? 1 : -1;
      const f = footPath(ph, duty, half * ampK, lift, mix(0.45, 0.6, this.runW));
      // Idle stance: feet a little apart, the left one slightly forward.
      const idleZ = sgn > 0 ? 0.025 : -0.015;
      const fz = mix(idleZ, f.z, walkW);
      const roll = Math.max(0, -f.pitch * walkW);
      const fy = (this.rest[`foot${side}`] as THREE.Vector3).y + f.y * walkW + Math.sin(roll) * 0.09;
      const fx = sgn * st.stance;
      // Hip joint in root space: hips position + rotated offset.
      const thighRest = this.rest[`thigh${side}`] as THREE.Vector3;
      v3.set(thighRest.x - hipRest.x, thighRest.y - hipRest.y, thighRest.z - hipRest.z).applyQuaternion(
        hips.quaternion,
      );
      const hx = hips.position.x + v3.x;
      const hy = hips.position.y + v3.y;
      const hz = hips.position.z + v3.z;
      const shinRest = this.rest[`shin${side}`] as THREE.Vector3;
      const footRest = this.rest[`foot${side}`] as THREE.Vector3;
      const l1 = shinRest.distanceTo(thighRest);
      const l2 = footRest.distanceTo(shinRest);
      const ik = legIK([hx, hy, hz], [fx, fy, fz], l1, l2, 1);
      // World (root) rotation of the thigh → local under the hips.
      qA.setFromEuler(eA.set(ik.pitch, 0, ik.roll, "ZXY"));
      qB.copy(hips.quaternion).invert().multiply(qA);
      (this.b[`thigh${side}`] as THREE.Bone).quaternion.copy(qB);
      (this.b[`shin${side}`] as THREE.Bone).rotation.set(ik.knee, 0, 0);
      // Foot pitch in root space: toes up > 0 ↔ rotation.x < 0.
      const footPitch = f.pitch * walkW;
      const world = ik.pitch + ik.knee; // leg plane pitch at the ankle
      (this.b[`foot${side}`] as THREE.Bone).rotation.set(-footPitch - world, 0, -ik.roll);
    }

    // ---------------------------------------------------------------- torso, head
    const lean = 0.04 * walkW + 0.17 * runW;
    const spine = this.b.spine as THREE.Bone;
    spine.rotation.set(lean * 0.5 + breath * 0.008 * idleW, -pv.yaw * 0.55 * ampK, -pv.roll * 0.5 * st.hipSway);
    const chest = this.b.chest as THREE.Bone;
    chest.rotation.set(lean * 0.5 - breath * 0.012 * idleW, -pv.yaw * 0.45 * ampK, shift * 1.2);
    // Breathing lifts the shoulders a touch.
    (this.b.clavL as THREE.Bone).rotation.z = breath * 0.025 * idleW;
    (this.b.clavR as THREE.Bone).rotation.z = -breath * 0.025 * idleW;
    if (!rm) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = idleW > 0.6 ? (Math.random() - 0.5) * 1.0 : 0;
        this.lookTimer = 2 + Math.random() * 3;
      }
    } else this.lookTarget = 0;
    this.lookYaw = damp(this.lookYaw, walkW > 0.4 ? 0 : this.lookTarget, 3, dt);
    const neck = this.b.neck as THREE.Bone;
    const head = this.b.head as THREE.Bone;
    neck.rotation.set(-lean * 0.4, this.lookYaw * 0.35 + pv.yaw * 0.3, 0);
    head.rotation.set(-lean * 0.5 + breath * 0.01 * idleW, this.lookYaw * 0.65 + pv.yaw * 0.4 * ampK, -shift * 0.8);

    // ---------------------------------------------------------------- arms (counter swing)
    for (const [side, ph] of [
      ["L", this.phase + 0.5],
      ["R", this.phase],
    ] as const) {
      const sgn = side === "L" ? 1 : -1;
      // The opposite leg's forward offset, -1 … 1.
      const f = footPath(ph, duty, 1, 0);
      const sw = f.z * walkW * ampK;
      const arm = this.b[`arm${side}`] as THREE.Bone;
      const swing = -sw * mix(st.armSwing, st.armSwing * 1.5, this.runW) - 0.25 * runW;
      const fore = this.b[`fore${side}`] as THREE.Bone;
      const hand = this.b[`hand${side}`] as THREE.Bone;
      if (st.arms === "clasp") {
        // Upper arms a little forward and in, forearms across the front, hands meeting over the waist; the
        // walk adds a small swing, a run opens the clasp into a pumping run.
        const c = 1 - runW;
        arm.rotation.set(
          mix(-0.32 + swing * 0.35, swing - 0.25, runW),
          sgn * 0.18 * c,
          sgn * mix(0.1, st.armOut + 0.12, runW),
          "ZXY",
        );
        fore.rotation.set(mix(-1.2, -1.25, runW), sgn * -0.55 * c, 0);
        hand.rotation.set(-0.1, sgn * -0.3 * c, sgn * 0.1);
      } else {
        arm.rotation.set(swing, 0, sgn * (st.armOut + 0.12 * runW + breath * 0.01 * idleW), "ZXY");
        fore.rotation.set(-(0.12 + 0.18 * Math.max(0, -sw) * walkW) - 1.15 * runW, 0, 0);
        hand.rotation.set(-0.08 - 0.15 * runW, 0, sgn * 0.05);
      }
    }

    // ---------------------------------------------------------------- springs
    const wx = s.windX ?? 0;
    const wz = s.windZ ?? 0;
    for (const c of this.chains) {
      const sp = c.spec;
      const drive: ChainDrive = {
        accZ: acc * 0.6,
        accX: -this.hipVX * 2 * (sp.hipSway ?? 0.3),
        velZ: this.speed - wz * 0.4,
        pushX: wx * 0.4 + (sp.hipSway ?? 0) * Math.sin(this.phase * Math.PI * 2) * walkW * 0.8,
        gainAcc: sp.gainAcc * ampK,
        gainVel: sp.gainVel * ampK,
        rest: sp.rest ?? 0,
        limit: sp.limit ?? 1.2,
      };
      const k = rm ? 1.6 : 1;
      c.ch.k = sp.k * k;
      chainStep(c.ch, drive, dt, c.p, c.r);
      for (let i = 0; i < sp.bones.length; i++) {
        const bone = this.b[sp.bones[i] as string];
        if (!bone) continue;
        // Chain convention: negative pitch = "back". A hanging bone swings back with +x; an upright one with −x.
        const p = c.p[i] as number;
        const r = c.r[i] as number;
        if (sp.dir === "down") bone.rotation.set(-p, 0, r);
        else bone.rotation.set(p, 0, -r);
      }
    }

    // ---------------------------------------------------------------- face
    this.inst.setFace(this.faceCell(dt, s.expression, rm));
  }

  private faceCell(dt: number, e: Expression, rm: boolean) {
    if (e === "neutral") return 0;
    if (e === "blink") return 1;
    if (e === "smile") return 2;
    // Auto: blink every 2.5–5.5 s (a three-frame blink: half, closed, half).
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkTimer = (rm ? 4 : 2.5) + Math.random() * 3;
    }
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const k = this.blinkT;
      if (k > 0.16) this.blinkT = -1;
      else return k < 0.04 || k > 0.12 ? 3 : 1;
    }
    return 0;
  }
}
