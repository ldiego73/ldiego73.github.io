/**
 * Procedural animation of every four-legged species (the approved llama animator made generic): the gait
 * comes from the species' gait list and the ground speed (./gaits.ts pickGait / blendGait), each foot follows
 * ../gait.ts footPath with a two-bone IK (front knees forward, hind hocks back) and stays flat, the body rides
 * the steps (bob per footfall, or one arc per stride with a flexing spine for canters, gallops and bounds), the
 * neck counters the bob so the head glides, ears and tail ride springs. Standing still, the idle scheduler
 * (./behaviour.ts) picks graze, chew, look, groom, scratch, yawn, shake, sit or sleep and this module poses
 * them. Walks in place (treadmill): the world moves the group, the stride matches the speed so feet do not
 * slide.
 *
 * Modes beyond walking: "sit", "sleep" (forced), "swim" (paddling, or legs folded back with the tail driving
 * for caimans), "climb" (the body turned up a trunk: primates, sloths, cats), "hang" (sloths, upside down
 * under a branch: the same gait, mirrored), and `lunge()` (a caiman's snap, a cat's pounce).
 *
 * Works on any rig with the plan's bone names (../character.ts instances and the crowd's shared template
 * skeleton alike); the IK runs in the root bone's frame, so the climbing and hanging turns carry it.
 *
 * Reduced motion: no bob, calmer neck, no flicks, slower chewing, only the calm idles.
 */
import * as THREE from "three";
import { footPath, legIK } from "../gait";
import { type Chain, chain, chainStep } from "../spring";
import { type IdleAction, IdleScheduler } from "./behaviour";
import { blendGait, bobAt, GAITS, type LegKey, legPhaseOf, pickGait, spineFlex } from "./gaits";
import type { QuadMotion } from "./spec";

export interface Rig {
  bones: Record<string, THREE.Bone>;
  rest: Record<string, THREE.Vector3>;
  setFace(cell: number): void;
}

export type AnimalMode = "auto" | "sit" | "sleep" | "swim" | "climb" | "hang";

export interface AnimalState {
  /** Ground speed (units/s). */
  speed: number;
  mode?: AnimalMode;
  /** Head turn target relative to the body (radians), or undefined to let the idles decide. */
  look?: number;
  rm: boolean;
  /** Wind across the body (its own frame, x left). */
  windX?: number;
  /** Sleep allowed (night, nobody near). */
  quiet?: boolean;
  /** Turn rate (radians/s, + left): the body leans into turns. */
  turn?: number;
}

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const LEGS = [
  { key: "lf" as LegKey, up: "fUpL", lo: "fLoL", ft: "fFtL", front: true, side: 1 },
  { key: "rf" as LegKey, up: "fUpR", lo: "fLoR", ft: "fFtR", front: true, side: -1 },
  { key: "lh" as LegKey, up: "hUpL", lo: "hLoL", ft: "hFtL", front: false, side: 1 },
  { key: "rh" as LegKey, up: "hUpR", lo: "hLoR", ft: "hFtR", front: false, side: -1 },
];

const v3 = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const eA = new THREE.Euler(0, 0, 0, "ZXY");

interface LegInfo {
  l1: number;
  l2: number;
  bind1: number;
  bind2: number;
  len: number;
}

export class QuadAnimator {
  phase = 0;
  hold: number | null = null;
  readonly idle: IdleScheduler;
  private speedS = 0;
  private lastSpeed = 0;
  private walkW = 0;
  private modeW: Record<"sit" | "sleep" | "swim" | "climb" | "hang", number> = {
    sit: 0,
    sleep: 0,
    swim: 0,
    climb: 0,
    hang: 0,
  };
  private look = 0;
  private chew = 0;
  private chewTimer = 1;
  private chewOn = false;
  private earTimer = [2, 3.5];
  private earFlick = [0, 0];
  private blinkTimer = 2;
  private blinkT = -1;
  private lungeT = -1;
  private tail: Chain;
  private ears: Chain[];
  private out: number[] = [0, 0, 0, 0];
  private outR: number[] = [0, 0, 0, 0];
  private tailBones: THREE.Bone[] = [];
  private legs: Record<string, LegInfo> = {};
  private b: Record<string, THREE.Bone>;
  private rest: Record<string, THREE.Vector3>;
  private legLen: number;
  /** Optional bones shown or hidden (scale 1 / 0): "tika", "pack". */
  features: Record<string, boolean> = {};

  constructor(
    private rig: Rig,
    private m: QuadMotion,
    seed = 1,
  ) {
    this.b = rig.bones;
    this.rest = rig.rest;
    this.idle = new IdleScheduler(m.idles, seed);
    for (let i = 0; this.b[`tail${i}`]; i++) this.tailBones.push(this.b[`tail${i}`] as THREE.Bone);
    this.tail = chain(Math.max(1, this.tailBones.length), m.tailK ?? 40, 0.3);
    this.ears = [chain(1, m.earK ?? 70, 0.25), chain(1, m.earK ?? 70, 0.25)];
    let total = 0;
    for (const l of LEGS) {
      (this.b[l.up] as THREE.Bone).rotation.order = "ZXY";
      const up = this.rest[l.up] as THREE.Vector3;
      const lo = this.rest[l.lo] as THREE.Vector3;
      const ft = this.rest[l.ft] as THREE.Vector3;
      const l1 = lo.distanceTo(up);
      const l2 = ft.distanceTo(lo);
      this.legs[l.key] = {
        l1,
        l2,
        bind1: Math.atan2(lo.z - up.z, up.y - lo.y),
        bind2: Math.atan2(ft.z - lo.z, lo.y - ft.y),
        len: up.y,
      };
      total += up.y;
    }
    this.legLen = total / 4;
    // Desynchronise herds.
    this.phase = (seed * 0.618) % 1;
    this.blinkTimer = 1 + ((seed * 1.37) % 3);
  }

  /** A quick snap or pounce (caiman lunge, a cat's jump at a moth). */
  lunge() {
    this.lungeT = 0;
  }

  /** Force an idle now (a world event: the fox yawns, the llama grazes). */
  play(a: Exclude<IdleAction, "none">, seconds?: number) {
    this.idle.play(a, seconds);
  }

  update(dt: number, t: number, s: AnimalState) {
    dt = Math.min(dt, 0.05);
    const m = this.m;
    const rm = s.rm;
    const amp = rm ? 0.6 : 1;
    const mode = s.mode ?? "auto";
    this.speedS = damp(this.speedS, Math.max(0, s.speed), 6, dt);
    const speed = this.speedS;
    const acc = dt > 0 ? (speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = speed;
    const moving = speed > 0.05;
    this.walkW = damp(this.walkW, moving ? 1 : 0, 5, dt);
    const walkW = this.walkW;
    const idle = this.idle.step(dt, { moving: moving || mode !== "auto", rm, quiet: s.quiet });
    const act = (a: IdleAction) => (idle.action === a ? idle.w : 0);
    for (const k of Object.keys(this.modeW) as Array<keyof typeof this.modeW>) {
      const want = mode === k || (k === "sleep" && act("sleep") > 0) || (k === "sit" && act("sit") > 0);
      const w =
        k === "sleep" || k === "sit" ? (mode === k ? 1 : k === "sleep" ? act("sleep") : act("sit")) : want ? 1 : 0;
      this.modeW[k] = damp(this.modeW[k], w, k === "sleep" || k === "sit" ? 2.5 : 4, dt);
    }
    const W = this.modeW;

    // ---------------------------------------------------------------- gait
    const pick = pickGait(m.gaits, speed);
    const g = blendGait(GAITS[pick.a.gait], GAITS[pick.b.gait], pick.t);
    if (this.hold !== null) this.phase = this.hold;
    else if (moving || walkW > 0.02) this.phase = (this.phase + (dt * Math.max(speed, 0.15)) / pick.stride) % 1;
    const ph = this.phase;
    const a = ph * Math.PI * 2;
    const L = this.legLen;
    const breath = Math.sin((t * Math.PI * 2) / (m.breath ?? 3.5));

    // ---------------------------------------------------------------- root (climb / hang turns the frame)
    const root = this.b.root as THREE.Bone;
    root.rotation.set(-W.climb * Math.PI * 0.5, 0, W.hang * Math.PI);

    // ---------------------------------------------------------------- body
    const body = this.b.body as THREE.Bone;
    const chest = this.b.chest as THREE.Bone;
    const restBody = this.rest.body as THREE.Vector3;
    const bob = rm ? 0 : (bobAt(ph, g) - 0.5) * 2 * g.bob * L * walkW;
    const flex = rm ? 0 : spineFlex(ph, g) * g.flex * walkW;
    const roll = Math.sin(a) * g.roll * walkW * amp;
    const crouch = (g.crouch ?? 0) * L * walkW;
    // Lying down: the body sinks to rest on the folded legs; sitting: the haunches drop and the chest rises.
    const lie = W.sleep * (1 - walkW) * L * 0.62;
    const sit = W.sit * (1 - walkW);
    const swimSink = 0;
    const lungeK = this.lungeT >= 0 ? Math.sin(Math.min(1, this.lungeT / 0.45) * Math.PI) : 0;
    const shake = act("shake");
    body.position.set(
      0,
      restBody.y + bob - crouch - lie - sit * L * 0.32 + breath * 0.004 * L * (1 - walkW) - swimSink,
      restBody.z + lungeK * L * 0.35 - sit * L * 0.12,
    );
    body.rotation.set(
      flex * 0.35 - sit * 0.5 + Math.sin(a * 2 + 0.6) * 0.012 * walkW * amp,
      m.sprawl ? Math.sin(a) * g.wave * 0.5 * walkW : 0,
      roll + (rm ? 0 : Math.sin(t * 38) * 0.1 * shake) + (s.turn ?? 0) * 0.04 * walkW,
    );
    chest.rotation.set(
      -flex * 0.8 - breath * 0.008 * (1 - walkW) + sit * 0.35,
      m.sprawl ? -Math.sin(a) * g.wave * walkW : 0,
      -roll * 0.4,
    );
    // Frogs jump: one arc per stride, hind legs kicking out behind, front legs reaching to land.
    const hopK = m.frog ? (ph < 0.6 ? Math.sin((ph / 0.6) * Math.PI) : 0) * walkW : 0;
    if (m.frog) body.position.y += hopK * L * 2.2;
    root.updateMatrixWorld(true);

    // ---------------------------------------------------------------- legs
    const half = Math.min(L * 0.55, (g.duty * pick.stride) / 2);
    for (const l of LEGS) {
      const info = this.legs[l.key] as LegInfo;
      const up = this.b[l.up] as THREE.Bone;
      const lo = this.b[l.lo] as THREE.Bone;
      const ft = this.b[l.ft] as THREE.Bone;
      const restFt = this.rest[l.ft] as THREE.Vector3;
      const f = footPath(legPhaseOf(ph, g.offs[l.key]), g.duty, half * amp, g.lift * L * amp, 0.35);
      let ay = restFt.y + f.y * walkW;
      let az = restFt.z + f.z * walkW;
      let ax =
        restFt.x +
        (l.front ? (g.termino ?? 0) * L * Math.sin(Math.PI * Math.min(1, f.s)) * (f.stance ? 0 : 1) * l.side : 0) *
          walkW;
      let pitchFoot = -f.pitch * walkW;
      // Paddling (swimming mammals): feet trace circles under the body, never touching ground.
      if (W.swim > 0.01 && m.swim !== "tail") {
        const pa = legPhaseOf(ph, GAITS.trot.offs[l.key]) * Math.PI * 2;
        ay = mix(ay, restFt.y + info.len * 0.25 + Math.sin(pa) * info.len * 0.12, W.swim);
        az = mix(az, restFt.z + Math.cos(pa) * info.len * 0.25, W.swim);
      }
      // Lying down: the legs fold under the body (front tucked forward, hind under the belly).
      if (lie > 0) {
        const k = W.sleep * (1 - walkW);
        ay = mix(ay, restFt.y + info.len * 0.12, k);
        az = mix(az, restFt.z + (l.front ? -0.1 : 0.32) * info.len, k);
        ax = mix(ax, restFt.x * 1.25, k);
      }
      if (sit > 0 && !l.front) {
        ay = mix(ay, restFt.y + 0.02, sit);
        az = mix(az, restFt.z + info.len * 0.55, sit);
      }
      // Scratch: one hind foot comes forward and up toward the neck, scratching fast.
      const scr = act("scratch");
      if (scr > 0 && !l.front && Math.sign(idle.side || 1) === l.side) {
        ay = mix(ay, restFt.y + info.len * 0.55 + Math.sin(t * 30) * info.len * 0.04, scr);
        az = mix(az, restFt.z + info.len * 0.75, scr);
      }
      if (m.frog) {
        const ext = l.front ? 0 : hopK;
        up.rotation.set(l.front ? -hopK * 0.7 : ext * 1.1, 0, 0);
        lo.rotation.set(l.front ? hopK * 0.3 : -ext * 1.3, 0, 0);
        ft.rotation.set(l.front ? 0 : ext * 0.8, 0, 0);
        continue;
      }
      up.parent?.localToWorld(v3.set(up.position.x, up.position.y, up.position.z));
      root.worldToLocal(v3);
      if (m.sprawl) {
        this.sprawlLeg(l, up, lo, ft, f, walkW, amp, W.swim);
        continue;
      }
      const ik = legIK([v3.x, v3.y, v3.z], [ax, ay, az], info.l1, info.l2, l.front ? 1 : -1);
      qA.setFromEuler(eA.set(ik.pitch + info.bind1, 0, ik.roll, "ZXY"));
      (up.parent as THREE.Object3D).getWorldQuaternion(qB);
      root.getWorldQuaternion(qC);
      qB.premultiply(qC.invert());
      up.quaternion.copy(qB.invert().multiply(qA));
      lo.rotation.set(ik.knee - info.bind1 + info.bind2, 0, 0);
      const legPitch = ik.pitch + ik.knee;
      const parentPitch = body.rotation.x + (l.front ? chest.rotation.x : 0);
      ft.rotation.set(pitchFoot - legPitch - info.bind2 - parentPitch, 0, -ik.roll);
      if (W.swim > 0.01 && m.swim === "tail") {
        // Caimans and turtles swimming: legs folded back along the body.
        up.rotation.set(mix(up.rotation.x, 1.1, W.swim), 0, mix(up.rotation.z, l.side * 0.3, W.swim));
        lo.rotation.set(mix(lo.rotation.x, l.front ? -0.4 : 0.4, W.swim), 0, 0);
      }
      pitchFoot = 0;
    }

    // ---------------------------------------------------------------- neck, head, jaw
    const ext = s.look;
    let lookT = ext ?? 0;
    if (ext === undefined && act("look") > 0) lookT = idle.side * 0.95 * act("look");
    const groom = act("groom");
    this.look = damp(this.look, lookT, rm ? 1.5 : 2.5, dt);
    const graze = act("graze") * (m.graze ?? 0.9) * (1 - walkW);
    const nibble = rm ? 0 : Math.sin(t * 5) * 0.04 * act("graze");
    const sway = rm ? 0 : Math.sin(t * 0.45) * 0.05 * (1 - walkW);
    const nod = Math.sin(a * 2 + 1.2) * (m.nod ?? 0.03) * walkW * amp;
    const carry = (m.carry ?? 0) + (W.swim > 0.01 ? -0.25 * W.swim : 0) + 0.04 * pick.t * walkW;
    const yawn = act("yawn");
    const groomYaw = groom * (idle.side >= 0 ? 1 : -1) * 1.1;
    const sleepNeck = W.sleep * 0.35;
    const lungeHead = lungeK * 0.25;
    (this.b.neck0 as THREE.Bone).rotation.set(
      carry * 0.5 + nod * 0.5 + graze * 0.4 + groom * 0.25 + sleepNeck * 0.5 - sit * 0.15,
      this.look * 0.25 + groomYaw * 0.4,
      sway * 0.4,
    );
    (this.b.neck1 as THREE.Bone).rotation.set(
      carry * 0.3 - nod * 0.3 + breath * 0.01 * (1 - walkW) + graze * 0.3 + sleepNeck * 0.3,
      this.look * 0.35 + groomYaw * 0.35,
      sway * 0.3,
    );
    (this.b.neck2 as THREE.Bone).rotation.set(
      carry * 0.2 - nod * 0.4 + graze * 0.15 - yawn * 0.25,
      this.look * 0.4 + groomYaw * 0.25,
      sway * 0.2,
    );
    const head = this.b.head as THREE.Bone;
    head.rotation.set(
      -0.05 * pick.t * walkW - nod * 0.2 + graze * 0.25 + nibble + groom * 0.45 - yawn * 0.35 - lungeHead + sit * 0.4,
      0,
      groom * 0.3 * (idle.side >= 0 ? 1 : -1),
    );
    // Chewing in bursts (the jaw grinds sideways), nibbling while grazing, yawning wide, the lunge's snap.
    this.chewTimer -= dt;
    if (this.chewTimer <= 0) {
      this.chewOn = !this.chewOn && !moving;
      this.chewTimer = this.chewOn ? 2 + Math.random() * 3 : 1.5 + Math.random() * 3;
    }
    const chewW = Math.max(act("chew"), this.chewOn && (m.idles.weights.chew ?? 0) > 0 ? 0.6 : 0, act("graze"));
    this.chew = damp(this.chew, chewW, 6, dt);
    const cf = t * (rm ? 4 : 7);
    const yawnOpen = yawn * Math.sin(Math.min(1, idle.t * 1.15) * Math.PI);
    (this.b.jaw as THREE.Bone).rotation.set(
      0.06 * this.chew * (0.5 + 0.5 * Math.sin(cf * 2)) + yawnOpen * 0.55 + lungeK * 0.6,
      Math.sin(cf) * 0.09 * this.chew,
      0,
    );

    // ---------------------------------------------------------------- ears
    for (let i = 0; i < 2; i++) {
      const ear = this.b[i === 0 ? "earL" : "earR"];
      if (!ear) break;
      if (!rm && (m.earFlick ?? 1) > 0) {
        this.earTimer[i] = (this.earTimer[i] as number) - dt;
        if ((this.earTimer[i] as number) <= 0) {
          this.earFlick[i] = 1;
          this.earTimer[i] = (2.5 + Math.random() * 5) / (m.earFlick ?? 1);
        }
      }
      this.earFlick[i] = damp(this.earFlick[i] as number, 0, 7, dt);
      chainStep(
        this.ears[i] as Chain,
        {
          accZ: acc * 0.5,
          accX: 0,
          velZ: speed,
          pushX: (s.windX ?? 0) * 0.3 + shake * Math.sin(t * 40) * 3,
          gainAcc: 0.02,
          gainVel: 0.05,
          rest: -W.sleep * 0.3,
          limit: 0.5,
        },
        dt,
        this.out,
        this.outR,
      );
      const side = i === 0 ? 1 : -1;
      ear.rotation.set(
        this.out[0] as number,
        0,
        side * (0.08 - 0.55 * (this.earFlick[i] as number) - W.sleep * 0.2) - (this.outR[0] as number),
      );
    }

    // ---------------------------------------------------------------- tail
    if (this.tailBones.length) {
      chainStep(
        this.tail,
        {
          accZ: acc,
          accX: 0,
          velZ: speed,
          pushX: (s.windX ?? 0) * 0.4,
          gainAcc: 0.03,
          gainVel: 0.1,
          rest: 0,
          limit: 0.6,
        },
        dt,
        this.out,
        this.outR,
      );
      const wag = m.tailWag ? Math.sin(t * 11) * m.tailWag * amp : 0;
      const swish = m.tailSwish && !rm ? Math.max(0, Math.sin(t * 0.7)) ** 6 * Math.sin(t * 7) * m.tailSwish : 0;
      const n = this.tailBones.length;
      for (let i = 0; i < n; i++) {
        const tb = this.tailBones[i] as THREE.Bone;
        const k = i / Math.max(1, n - 1);
        const wave = m.sprawl ? -Math.sin(a - i * 0.9) * g.wave * 0.8 * walkW : 0;
        const swim = W.swim > 0.01 && m.swim === "tail" ? Math.sin(t * 3.2 - i * 1.1) * 0.35 * W.swim * amp : 0;
        tb.rotation.set(
          (i === 0 ? (m.tailRest ?? 0.2) : 0) -
            (this.out[i] as number) +
            (i === 0 ? Math.sin(t * 1.3) * 0.05 * (1 - walkW) * amp : 0) -
            W.sleep * (i === 0 ? 0.3 : 0),
          (wag + swish) * (0.6 + 0.4 * k) + wave + swim + (i === 0 ? Math.sin(t * 0.9) * 0.12 * amp * (1 - walkW) : 0),
          -(this.outR[i] as number),
        );
      }
    }

    // ---------------------------------------------------------------- optional parts
    for (const [name, on] of Object.entries(this.features)) {
      for (const suffix of ["", "L", "R"]) {
        const bone = this.b[`${name}${suffix}`];
        if (bone) bone.scale.setScalar(on ? 1 : 0);
      }
    }

    // ---------------------------------------------------------------- lunge timer
    if (this.lungeT >= 0) {
      this.lungeT += dt;
      if (this.lungeT > 0.9) this.lungeT = -1;
    }

    // ---------------------------------------------------------------- eyes
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkTimer = 3 + Math.random() * 4;
    }
    let cell = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.2) this.blinkT = -1;
      else cell = this.blinkT < 0.05 || this.blinkT > 0.15 ? 3 : 1;
    }
    if (W.sleep > 0.5) cell = 1;
    else if (yawnOpen > 0.3) cell = 1;
    else if (cell === 0 && (this.chew > 0.5 || W.sleep > 0.2)) cell = 2;
    this.rig.setFace(cell);
  }

  /** Reptile leg: the upper leg sweeps forward and back in the horizontal plane, lifts to swing; the lower leg
   * stays near vertical, the foot flat. */
  private sprawlLeg(
    l: (typeof LEGS)[number],
    up: THREE.Bone,
    lo: THREE.Bone,
    ft: THREE.Bone,
    f: ReturnType<typeof footPath>,
    walkW: number,
    amp: number,
    swim: number,
  ) {
    const info = this.legs[l.key] as LegInfo;
    const sweep = (-f.z / Math.max(1e-3, info.len)) * 1.2 * walkW * amp;
    const lift = (f.y / Math.max(1e-3, info.len)) * 1.6 * walkW * amp;
    up.rotation.set(0, sweep * l.side * (l.front ? 1 : 1), lift * l.side);
    lo.rotation.set(0, 0, -lift * l.side * 0.6);
    ft.rotation.set(0, -sweep * l.side * 0.6, -lift * l.side * 0.4);
    if (swim > 0.01) {
      // Folded back along the body, paddling a little.
      up.rotation.set(0, mix(up.rotation.y, -l.side * 0.9, swim), mix(up.rotation.z, l.side * 0.15, swim));
    }
  }
}
