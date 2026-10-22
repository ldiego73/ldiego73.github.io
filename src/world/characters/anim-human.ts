/**
 * The human animation controller, procedural (no keyframe files), for the traveler and every NPC:
 *
 *  - locomotion from the ground speed (or a treadmill `mode` in the harness): idle (breathing, weight shift,
 *    look-around, blink), walk and run (foot path + two-bone leg IK so stance feet stay planted at a person's
 *    natural speeds, pelvis bounce / sway / hip drop / yaw, counter-rotating chest, counter arm swing with elbow
 *    bend, foot roll), a jump tuck in the air, and feet that follow the slope (`feetY`);
 *  - an action layer (./poses.ts, crossfaded by ./actions.ts): sitting, waving, carrying, dancing, children's
 *    games, crafts, fishing, paddling, riding… `act("wave")`, `act("none")` to go back to locomotion;
 *  - a head turn toward a point (`look`), e.g. the traveler walking past;
 *  - the secondary motion of whatever hangs off the body: spring chains for the chullo's tip and tassels,
 *    braids, long hair, the backpack and the cloth hems' pivot bones (the cloth itself also rides the wind);
 *  - the face: automatic blinks, or the expression an action asks for.
 *
 * Reduced motion: no bounce, smaller swings, slower idle, no look-around, stiffer springs, calmer actions.
 */
import * as THREE from "three";
import { ActionMixer, type PlayOpts } from "./actions";
import { advancePhase, cadence, footPath, legIK, pelvis, strideHalf } from "./gait";
import { type Action, actionPose, emptyPose, type Pose, type PoseCtx } from "./poses";
import type { Rig } from "./rig";
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
  /** Cycle length (two steps, body units) of a natural walk and run, and the speeds they are made for. */
  walkCycle: number;
  runCycle: number;
  walkSpeed: number;
  runSpeed: number;
  /** Arm swing (radians at full stride) and resting arm abduction. */
  armSwing: number;
  armOut: number;
  /** Hip sway multiplier (the women sway more under the pollera). */
  hipSway: number;
  /** Foot spacing from the centre line. */
  stance: number;
  /**
   * Arms at rest: hanging ("hang") or forearms forward with the hands together in front of the waist ("clasp",
   * the highland women's rest: hands above the pollera's bell instead of inside it).
   */
  arms?: "hang" | "clasp";
  /** Forward stoop of the upper back at rest (elders), radians. */
  stoop?: number;
  hangs: HangSpec[];
}

export interface HumanState {
  /** Treadmill (harness): the style's walk or run speed, feet sliding back under a body that stays put. */
  mode?: Mode;
  /** Real ground speed (m/s): overrides `mode`. */
  speed?: number;
  /** Running (the traveler's run key); default: from the speed. */
  running?: boolean;
  /** On the ground (false while jumping or falling: the legs tuck). */
  grounded?: boolean;
  rm: boolean;
  expression: Expression;
  /** Wind at the character in its own frame (x left, z forward), from liveWind. */
  windX?: number;
  windZ?: number;
  /** Ground height under the left and right foot relative to the feet origin (slopes, steps), m. */
  feetY?: readonly [number, number];
}

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const ss = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const eA = new THREE.Euler(0, 0, 0, "ZXY");
const v3 = new THREE.Vector3();
const vHips = new THREE.Vector3();
const qHips = new THREE.Quaternion();

export class HumanAnimator {
  phase = 0;
  walkW = 0;
  runW = 0;
  airW = 0;
  /** Freeze the cycle at a phase (screenshots of a walk strip); null = run freely. */
  hold: number | null = null;
  readonly mixer = new ActionMixer();
  /** Per-person time offset so a group's idle and actions do not move in lockstep. */
  seed: number;
  /** Body scale (rest hips height over the traveler's 0.8). */
  readonly k: number;
  private speed = 0;
  private lastSpeed = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookTarget = 0;
  private lookTimer = 1.5;
  private lookAt: THREE.Vector3 | null = null;
  private blinkTimer = 2;
  private blinkT = -1;
  private chains: Array<{ spec: HangSpec; ch: Chain; p: number[]; r: number[] }>;
  private lastHipX = 0;
  private hipVX = 0;
  private pose: Pose = emptyPose();
  private pctx: PoseCtx = { t: 0, phase: 0, speed: 0, rm: false, side: 1, seat: 0, seed: 0 };
  private curDefines = new Set<string>();
  private skirtW = 0;
  readonly b: Record<string, THREE.Bone>;
  private rest: Record<string, THREE.Vector3>;

  constructor(
    private rig: Rig,
    private st: HumanStyle,
    o: { seed?: number } = {},
  ) {
    this.b = rig.bones;
    this.rest = rig.rest;
    this.seed = o.seed ?? 0;
    this.k = (this.rest.hips?.y ?? 0.8) / 0.8;
    this.lookTimer = 1 + (this.seed % 3);
    for (const n of ["thighL", "thighR", "armL", "armR", "footL", "footR", "hips", "spine", "chest", "head", "neck"])
      if (this.b[n]) (this.b[n] as THREE.Bone).rotation.order = "ZXY";
    this.chains = st.hangs
      .filter((spec) => spec.bones.every((n) => this.b[n]))
      .map((spec) => ({
        spec,
        ch: chain(spec.bones.length, spec.k, spec.zeta),
        p: new Array(spec.bones.length).fill(0),
        r: new Array(spec.bones.length).fill(0),
      }));
  }

  /** Play a pose action (crossfaded); "none" returns to plain locomotion. */
  act(a: Action, o?: PlayOpts) {
    this.mixer.play(a, o);
  }

  get action(): Action {
    return this.mixer.action;
  }

  /** Turn the head toward a point in the character's own frame (x left, y up, z forward), or stop (null). */
  look(local: THREE.Vector3 | null) {
    if (!local) this.lookAt = null;
    else {
      this.lookAt ??= new THREE.Vector3();
      this.lookAt.copy(local);
    }
  }

  update(dt: number, t: number, s: HumanState) {
    dt = Math.min(dt, 0.05);
    const st = this.st;
    const rm = s.rm;
    const k = this.k;
    this.mixer.step(dt);
    // ---------------------------------------------------------------- locomotion weights and cadence
    const virtual = s.speed === undefined;
    const target = virtual ? (s.mode === "run" ? st.runSpeed : s.mode === "walk" ? st.walkSpeed : 0) : s.speed;
    const speed = Math.max(0, target ?? 0);
    const running = s.running ?? (virtual ? s.mode === "run" : speed > st.walkSpeed * 1.6);
    this.walkW = damp(this.walkW, ss(0.04, Math.min(0.6, st.walkSpeed * 0.5), speed), 8, dt);
    this.runW = damp(this.runW, running && speed > 0.5 ? 1 : 0, 5, dt);
    this.airW = damp(this.airW, s.grounded === false ? 1 : 0, 14, dt);
    const walkW = this.walkW * (1 - this.airW);
    const runW = this.runW * walkW;
    this.speed = speed;
    const cycle = mix(st.walkCycle, st.runCycle, this.runW);
    const cad = cadence(speed, cycle, this.runW);
    if (this.hold !== null) this.phase = this.hold;
    else if (virtual) this.phase = advancePhase(this.phase, dt, Math.max(speed, 0.0001), cycle);
    else this.phase = (this.phase + dt * cad) % 1;
    const acc = dt > 0 ? (this.speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = this.speed;
    const ampK = rm ? 0.6 : 1;

    // ---------------------------------------------------------------- pelvis
    // Faster than a person can stride (the traveler's game speeds), shorter stance and the longest reachable
    // stride keep the stance foot sliding as little as possible without speeding the legs into a blur.
    const hurry = virtual
      ? 0
      : ss(st.walkSpeed * 1.2, st.walkSpeed * 2.8, speed) * (1 - this.runW) +
        ss(st.runSpeed, st.runSpeed * 2, speed) * this.runW;
    const duty = mix(mix(0.6, 0.38, this.runW), mix(0.52, 0.32, this.runW), hurry);
    const half = virtual
      ? (duty * cycle) / 2
      : strideHalf(speed, Math.max(cad, 1e-3), duty, mix(0.31, 0.33, this.runW) * k);
    const pv = pelvis(this.phase, walkW * (1 - this.runW), runW);
    const breath = Math.sin(t * (rm ? 1.4 : 2.1) + this.seed);
    const idleW = 1 - this.walkW;
    const shift = (rm ? 0.008 : 0.016) * Math.sin(t * 0.55 + this.seed) * idleW * k;
    const hipRest = this.rest.hips as THREE.Vector3;
    // Slopes: the lower foot pulls the hips down so both feet reach the ground.
    const fl = s.feetY?.[0] ?? 0;
    const fr = s.feetY?.[1] ?? 0;
    const slopeDrop = Math.min(0.25 * k, Math.max(0, -Math.min(fl, fr)));
    const drop = (0.03 * walkW + 0.012 * runW) * k + slopeDrop;
    const hips = this.b.hips as THREE.Bone;
    hips.position.set(
      shift + pv.x * st.hipSway * ampK * k,
      hipRest.y - drop + (rm ? 0 : pv.y * k) + this.airW * 0.04 * k,
      0,
    );
    hips.rotation.set(0.03 * runW, pv.yaw * ampK, pv.roll * st.hipSway * ampK - shift * 1.6);
    hips.updateMatrix();
    this.hipVX = dt > 0 ? (hips.position.x - this.lastHipX) / dt : 0;
    this.lastHipX = hips.position.x;

    // ---------------------------------------------------------------- legs (IK)
    const lift = mix(0.075, 0.17, this.runW) * ampK * k;
    for (const [side, ph] of [
      ["L", this.phase],
      ["R", this.phase + 0.5],
    ] as const) {
      const sgn = side === "L" ? 1 : -1;
      const f = footPath(ph, duty, half * ampK, lift, mix(0.45, 0.55, this.runW));
      const idleZ = (sgn > 0 ? 0.025 : -0.015) * k;
      const fz = mix(idleZ, f.z, walkW);
      const roll = Math.max(0, -f.pitch * walkW);
      const ground = side === "L" ? fl : fr;
      const fy =
        (this.rest[`foot${side}`] as THREE.Vector3).y +
        f.y * walkW +
        Math.sin(roll) * 0.09 * k +
        ground * (1 - this.airW);
      const fx = sgn * st.stance;
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
      // In the air: knees up, the trailing leg back (a jump's tuck).
      const air = this.airW;
      const pitch = mix(ik.pitch, side === "L" ? -0.75 : -0.25, air);
      const knee = mix(ik.knee, side === "L" ? 1.1 : 0.7, air);
      qA.setFromEuler(eA.set(pitch, 0, ik.roll * (1 - air), "ZXY"));
      qB.copy(hips.quaternion).invert().multiply(qA);
      (this.b[`thigh${side}`] as THREE.Bone).quaternion.copy(qB);
      (this.b[`shin${side}`] as THREE.Bone).rotation.set(knee, 0, 0);
      const footPitch = f.pitch * walkW;
      const world = pitch + knee;
      (this.b[`foot${side}`] as THREE.Bone).rotation.set(-footPitch - world, 0, -ik.roll * (1 - air));
    }

    // ---------------------------------------------------------------- torso, head
    const stoop = st.stoop ?? 0;
    const lean = 0.04 * walkW + 0.11 * runW - this.airW * 0.06;
    const spine = this.b.spine as THREE.Bone;
    spine.rotation.set(
      lean * 0.5 + stoop * 0.5 + breath * 0.008 * idleW,
      -pv.yaw * 0.55 * ampK,
      -pv.roll * 0.5 * st.hipSway,
    );
    const chest = this.b.chest as THREE.Bone;
    chest.rotation.set(lean * 0.5 + stoop * 0.5 - breath * 0.012 * idleW, -pv.yaw * 0.45 * ampK, shift * 1.2);
    (this.b.clavL as THREE.Bone).rotation.z = breath * 0.025 * idleW;
    (this.b.clavR as THREE.Bone).rotation.z = -breath * 0.025 * idleW;
    if (!rm) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = idleW > 0.6 ? (Math.random() - 0.5) * 1.0 : 0;
        this.lookTimer = 2 + Math.random() * 3;
      }
    } else this.lookTarget = 0;
    const neck = this.b.neck as THREE.Bone;
    const head = this.b.head as THREE.Bone;
    neck.rotation.set(-lean * 0.4 - stoop * 0.5, pv.yaw * 0.3, 0);
    head.rotation.set(-lean * 0.5 - stoop * 0.4 + breath * 0.01 * idleW, pv.yaw * 0.4 * ampK, -shift * 0.8);

    // ---------------------------------------------------------------- arms (counter swing)
    for (const [side, ph] of [
      ["L", this.phase + 0.5],
      ["R", this.phase],
    ] as const) {
      const sgn = side === "L" ? 1 : -1;
      const f = footPath(ph, duty, 1, 0);
      const sw = f.z * walkW * ampK;
      const arm = this.b[`arm${side}`] as THREE.Bone;
      const swing = -sw * mix(st.armSwing, st.armSwing * 1.4, this.runW) - 0.22 * runW;
      const fore = this.b[`fore${side}`] as THREE.Bone;
      const hand = this.b[`hand${side}`] as THREE.Bone;
      const up = this.airW;
      if (st.arms === "clasp" && runW < 0.5) {
        const c = 1 - runW;
        arm.rotation.set(
          mix(-0.32 + swing * 0.35, swing - 0.25, runW),
          sgn * 0.18 * c,
          sgn * mix(0.1, st.armOut + 0.12, runW),
          "ZXY",
        );
        fore.rotation.set(-1.25, sgn * -0.85 * c, 0, "YXZ");
        hand.rotation.set(-0.1, sgn * -0.3 * c, sgn * 0.1);
      } else {
        arm.rotation.set(
          swing * (1 - up) - 0.3 * up,
          0,
          sgn * (st.armOut + 0.1 * runW + breath * 0.01 * idleW + 0.7 * up),
          "ZXY",
        );
        fore.rotation.set(-(0.12 + 0.18 * Math.max(0, -sw) * walkW) - 1.0 * runW - 0.3 * up, 0, 0, "XYZ");
        hand.rotation.set(-0.08 - 0.15 * runW, 0, sgn * 0.05);
      }
    }

    // ---------------------------------------------------------------- action layers
    let headOwned = false;
    let legsW = 0;
    let face: Pose["face"] = null;
    const layers = this.mixer.layers();
    const pc = this.pctx;
    pc.phase = this.phase;
    pc.speed = speed;
    pc.rm = rm;
    pc.seed = this.seed;
    // What the current action defines: a fading-out action yields those bones entirely to it.
    const curDefines = this.curDefines;
    curDefines.clear();
    let curHips = false;
    const last = layers[layers.length - 1] as (typeof layers)[number];
    if (layers.length > 1 && last.action !== "none") {
      pc.t = last.t;
      pc.side = last.side;
      pc.seat = last.seat;
      actionPose(last.action, pc, this.pose);
      for (const n of Object.keys(this.pose.rot)) curDefines.add(n);
      curHips = !!this.pose.hips;
    }
    for (const l of layers) {
      if (l.action === "none") continue;
      pc.t = l.t;
      pc.side = l.side;
      pc.seat = l.seat;
      const p = actionPose(l.action, pc, this.pose);
      const isCur = l === last;
      for (const name of Object.keys(p.rot)) {
        const r = p.rot[name] as NonNullable<Pose["rot"][string]>;
        const bone = this.b[name];
        if (!bone) continue;
        const w = isCur ? l.weight : curDefines.has(name) ? 1 : l.weight;
        if (w <= 0.001) continue;
        eA.set(r.x, r.y, r.z, r.o ?? bone.rotation.order);
        qA.setFromEuler(eA);
        bone.quaternion.slerp(qA, w);
      }
      if (p.hips) {
        const w = isCur ? l.weight : curHips ? 1 : l.weight;
        const h = p.hips;
        vHips.set(h.x * k, hipRest.y + h.y * k, h.z * k);
        hips.position.lerp(vHips, w);
        qHips.setFromEuler(eA.set(h.rx, h.ry, h.rz, "ZXY"));
        hips.quaternion.slerp(qHips, w);
      }
      if (p.legs) legsW += l.weight;
      if (p.head && l.weight > 0.5) headOwned = true;
      if (p.face && l.weight > 0.5) face = p.face;
    }

    // ---------------------------------------------------------------- look at a point
    let wantYaw = this.walkW > 0.4 ? 0 : this.lookTarget;
    let wantPitch = 0;
    if (this.lookAt) {
      const lx = this.lookAt.x;
      const lz = this.lookAt.z;
      const d = Math.hypot(lx, lz);
      const a = Math.atan2(lx, lz);
      // Behind the shoulder: give up rather than wring the neck.
      wantYaw = Math.abs(a) > 2.1 ? 0 : Math.max(-1.15, Math.min(1.15, a));
      wantPitch = Math.max(-0.4, Math.min(0.35, -Math.atan2(this.lookAt.y - 1.45 * k, Math.max(0.3, d))));
    }
    if (headOwned) {
      wantYaw = 0;
      wantPitch = 0;
    }
    this.lookYaw = damp(this.lookYaw, wantYaw, this.lookAt ? 5 : 3, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, 5, dt);
    if (Math.abs(this.lookYaw) > 1e-4 || Math.abs(this.lookPitch) > 1e-4) {
      qA.setFromEuler(eA.set(this.lookPitch * 0.35, this.lookYaw * 0.35, 0, "YXZ"));
      neck.quaternion.multiply(qA);
      qA.setFromEuler(eA.set(this.lookPitch * 0.65, this.lookYaw * 0.65, 0, "YXZ"));
      head.quaternion.multiply(qA);
    }

    // ---------------------------------------------------------------- springs
    const wx = s.windX ?? 0;
    const wz = s.windZ ?? 0;
    for (const c of this.chains) {
      const sp = c.spec;
      const drive: ChainDrive = {
        accZ: acc * 0.6,
        accX: -this.hipVX * 2 * (sp.hipSway ?? 0.3),
        velZ: Math.min(this.speed, 4) - wz * 0.4,
        pushX: wx * 0.4 + (sp.hipSway ?? 0) * Math.sin(this.phase * Math.PI * 2) * walkW * 0.8,
        gainAcc: sp.gainAcc * ampK,
        gainVel: sp.gainVel * ampK,
        rest: sp.rest ?? 0,
        limit: sp.limit ?? 1.2,
      };
      c.ch.k = sp.k * (rm ? 1.6 : 1);
      chainStep(c.ch, drive, dt, c.p, c.r);
      for (let i = 0; i < sp.bones.length; i++) {
        const bone = this.b[sp.bones[i] as string];
        if (!bone) continue;
        const p = c.p[i] as number;
        const r = c.r[i] as number;
        if (sp.dir === "down") bone.rotation.set(-p, 0, r);
        else bone.rotation.set(p, 0, -r);
      }
    }

    // ---------------------------------------------------------------- skirts over posed legs
    // Sitting, kneeling, paddling: the skirt (pollera, cushma, wrap skirt) leans forward over the thighs and
    // opens a little, so the knees stay under the cloth instead of poking through it.
    const skirt = this.b.skirt;
    if (skirt) {
      const want = Math.min(1, legsW);
      this.skirtW = damp(this.skirtW, want, 8, dt);
      if (this.skirtW > 0.001) {
        let fwd = 0;
        let spread = 0;
        for (const n of ["thighL", "thighR"]) {
          const th = this.b[n];
          if (!th) continue;
          v3.set(0, -1, 0).applyQuaternion(th.quaternion);
          fwd += Math.atan2(v3.z, Math.max(1e-3, -v3.y)) * 0.5;
          spread += Math.abs(v3.x) * 0.5;
        }
        const w = this.skirtW;
        qA.setFromEuler(eA.set(-Math.max(0, fwd) * 0.55 * w, 0, 0, "XYZ"));
        skirt.quaternion.premultiply(qA);
        const open = 1 + w * (0.12 + 0.35 * Math.min(1, Math.max(0, fwd) / 1.4) + 0.4 * spread);
        skirt.scale.set(open, 1 - w * 0.12 * Math.min(1, Math.max(0, fwd) / 1.4), open);
      } else skirt.scale.set(1, 1, 1);
    }

    // ---------------------------------------------------------------- face
    const expr: Expression = s.expression === "auto" && face ? face : s.expression;
    this.rig.setFace(this.faceCell(dt, expr, rm));
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
      const q = this.blinkT;
      if (q > 0.16) this.blinkT = -1;
      else return q < 0.04 || q > 0.12 ? 3 : 1;
    }
    return 0;
  }
}
