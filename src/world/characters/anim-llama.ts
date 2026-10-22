/**
 * Procedural animation of the new llama: idle (breathing, a slow neck sway and look-around, chewing in bursts,
 * ear flicks, blinks, a tail that settles) and the llama's gait — a lateral-sequence walk (left hind, left
 * fore, right hind, right fore), and for "run" the pace llamas fall into (both legs of a side together). Each
 * foot follows ./gait.ts footPath and a two-bone IK (front knees bend forward like ours, hind hocks backward),
 * the pad stays flat, the body rides the steps with a small bob and roll, and the neck counters the bob so the
 * head glides. Walks in place (treadmill) like the human animator.
 *
 * Reduced motion: no bob, calmer neck, no ear flicks, slower chewing.
 */
import * as THREE from "three";
import type { Mode } from "./anim-human";
import type { CharacterInstance } from "./character";
import { advancePhase, footPath, LLAMA_WALK, legIK, legPhase } from "./gait";
import { type Chain, chain, chainStep } from "./spring";

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

const LEGS = [
  { key: "fL", up: "fUpL", lo: "fLoL", ft: "fFtL", front: true },
  { key: "fR", up: "fUpR", lo: "fLoR", ft: "fFtR", front: true },
  { key: "hL", up: "hUpL", lo: "hLoL", ft: "hFtL", front: false },
  { key: "hR", up: "hUpR", lo: "hLoR", ft: "hFtR", front: false },
] as const;
const WALK_OFFS: Record<string, number> = {
  fL: LLAMA_WALK.lf,
  fR: LLAMA_WALK.rf,
  hL: LLAMA_WALK.lh,
  hR: LLAMA_WALK.rh,
};
const PACE_OFFS: Record<string, number> = { fL: 0.02, fR: 0.52, hL: 0, hR: 0.5 };

const v3 = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();
const qC = new THREE.Quaternion();
const eA = new THREE.Euler(0, 0, 0, "ZXY");

export class LlamaAnimator {
  phase = 0;
  hold: number | null = null;
  private walkW = 0;
  private runW = 0;
  private speed = 0;
  private lastSpeed = 0;
  private chew = 0;
  private chewTimer = 1;
  private chewOn = false;
  private earTimer = [2, 3.5];
  private earFlick = [0, 0];
  private look = 0;
  private lookTarget = 0;
  private lookTimer = 2;
  private blinkTimer = 2;
  private blinkT = -1;
  private tail: Chain = chain(1, 40, 0.3);
  private ears: Chain[] = [chain(1, 70, 0.25), chain(1, 70, 0.25)];
  private out = [0];
  private outR = [0];
  private b: Record<string, THREE.Bone>;
  private rest: Record<string, THREE.Vector3>;

  constructor(private inst: CharacterInstance) {
    this.b = inst.bones;
    this.rest = inst.rest;
    for (const l of LEGS) (this.b[l.up] as THREE.Bone).rotation.order = "ZXY";
  }

  update(dt: number, t: number, s: { mode: Mode; rm: boolean; windX?: number }) {
    dt = Math.min(dt, 0.05);
    const rm = s.rm;
    this.walkW = damp(this.walkW, s.mode === "idle" ? 0 : 1, 4, dt);
    this.runW = damp(this.runW, s.mode === "run" ? 1 : 0, 3, dt);
    const walkW = this.walkW;
    const runW = this.runW * walkW;
    this.speed = walkW * mix(1.0, 2.4, this.runW);
    const cycle = mix(1.45, 2.1, this.runW);
    if (this.hold !== null) this.phase = this.hold;
    else this.phase = advancePhase(this.phase, dt, Math.max(this.speed, 1e-4), cycle);
    const acc = dt > 0 ? (this.speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = this.speed;
    const amp = rm ? 0.6 : 1;
    const idle = 1 - walkW;
    const breath = Math.sin(t * (rm ? 1.1 : 1.6));

    // ---------------------------------------------------------------- body
    const body = this.b.body as THREE.Bone;
    const restBody = this.rest.body as THREE.Vector3;
    const a = this.phase * Math.PI * 2;
    const bob = rm ? 0 : (Math.cos(a * 2) * 0.012 * (1 - this.runW) + Math.abs(Math.sin(a)) * 0.03 * this.runW) * walkW;
    // A pace rolls the body side to side (both legs of a side swing together).
    const roll = Math.sin(a) * (0.025 * walkW + 0.05 * runW) * amp;
    body.position.set(0, restBody.y + bob + breath * 0.004 * idle, restBody.z);
    body.rotation.set(Math.sin(a * 2 + 0.6) * 0.012 * walkW * amp, 0, roll);
    const chest = this.b.chest as THREE.Bone;
    chest.rotation.set(-breath * 0.008 * idle, 0, -roll * 0.4);
    body.updateMatrixWorld(true);

    // ---------------------------------------------------------------- legs (IK, pads flat)
    const duty = mix(0.68, 0.48, this.runW);
    const half = (duty * cycle) / 2;
    for (const l of LEGS) {
      const off = mix(WALK_OFFS[l.key] as number, PACE_OFFS[l.key] as number, this.runW);
      const f = footPath(legPhase(this.phase, off), duty, half * amp, mix(0.09, 0.15, this.runW) * amp, 0.35);
      const up = this.b[l.up] as THREE.Bone;
      const restUp = this.rest[l.up] as THREE.Vector3;
      const restLo = this.rest[l.lo] as THREE.Vector3;
      const restFt = this.rest[l.ft] as THREE.Vector3;
      // Top joint in root space (follows the body's bob and roll).
      (up.parent as THREE.Object3D).updateMatrixWorld(true);
      up.parent?.localToWorld(v3.set(up.position.x, up.position.y, up.position.z));
      this.inst.group.worldToLocal(v3);
      const top: [number, number, number] = [v3.x, v3.y, v3.z];
      const ankle: [number, number, number] = [restFt.x, restFt.y + f.y * walkW, restFt.z + f.z * walkW];
      const l1 = restLo.distanceTo(restUp);
      const l2 = restFt.distanceTo(restLo);
      const ik = legIK(top, ankle, l1, l2, l.front ? 1 : -1);
      // The rest pose is not straight (hocks angle back): the IK angles are measured from straight down, so
      // subtract the bind angles of the segments.
      const bind1 = Math.atan2(restLo.z - restUp.z, restUp.y - restLo.y);
      const bind2 = Math.atan2(restFt.z - restLo.z, restLo.y - restFt.y);
      qA.setFromEuler(eA.set(ik.pitch + bind1, 0, ik.roll, "ZXY"));
      (up.parent as THREE.Object3D).getWorldQuaternion(qB);
      this.inst.group.getWorldQuaternion(qC);
      qB.premultiply(qC.invert());
      up.quaternion.copy(qB.invert().multiply(qA));
      (this.b[l.lo] as THREE.Bone).rotation.set(ik.knee - bind1 + bind2, 0, 0);
      const legPitch = ik.pitch + ik.knee;
      const parentPitch = body.rotation.x + (l.front ? chest.rotation.x : 0);
      (this.b[l.ft] as THREE.Bone).rotation.set(-f.pitch * walkW - legPitch - bind2 - parentPitch, 0, -ik.roll);
    }

    // ---------------------------------------------------------------- neck, head, jaw, ears, tail
    if (!rm) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = idle > 0.6 ? (Math.random() - 0.5) * 1.1 : 0;
        this.lookTimer = 2.5 + Math.random() * 3.5;
      }
    } else this.lookTarget = 0;
    this.look = damp(this.look, this.lookTarget, 2, dt);
    const sway = rm ? 0 : Math.sin(t * 0.45) * 0.05 * idle;
    // The neck counters the body's bob (the head glides) and nods a little with each front step.
    const nod = Math.sin(a * 2 + 1.2) * 0.035 * walkW * amp;
    (this.b.neck0 as THREE.Bone).rotation.set(0.04 * runW + nod * 0.5, this.look * 0.25, sway * 0.4);
    (this.b.neck1 as THREE.Bone).rotation.set(-nod * 0.3 + breath * 0.01 * idle, this.look * 0.35, sway * 0.3);
    (this.b.neck2 as THREE.Bone).rotation.set(-nod * 0.4, this.look * 0.4, sway * 0.2);
    const head = this.b.head as THREE.Bone;
    head.rotation.set(-0.05 * runW - nod * 0.2, 0, 0);
    // Chewing in bursts (the jaw grinds sideways).
    this.chewTimer -= dt;
    if (this.chewTimer <= 0) {
      this.chewOn = !this.chewOn && idle > 0.5;
      this.chewTimer = this.chewOn ? 2 + Math.random() * 3 : 1.5 + Math.random() * 3;
    }
    this.chew = damp(this.chew, this.chewOn ? 1 : 0, 6, dt);
    const cf = t * (rm ? 4 : 7);
    (this.b.jaw as THREE.Bone).rotation.set(
      0.06 * this.chew * (0.5 + 0.5 * Math.sin(cf * 2)),
      Math.sin(cf) * 0.09 * this.chew,
      0,
    );
    // Ear flicks: one ear twitches back now and then; both ears ride a spring on the head's motion.
    for (let i = 0; i < 2; i++) {
      if (!rm) {
        this.earTimer[i] = (this.earTimer[i] as number) - dt;
        if ((this.earTimer[i] as number) <= 0) {
          this.earFlick[i] = 1;
          this.earTimer[i] = 2.5 + Math.random() * 5;
        }
      }
      this.earFlick[i] = damp(this.earFlick[i] as number, 0, 7, dt);
      const ch = this.ears[i] as Chain;
      chainStep(
        ch,
        {
          accZ: acc * 0.5,
          accX: 0,
          velZ: this.speed,
          pushX: (s.windX ?? 0) * 0.3,
          gainAcc: 0.02,
          gainVel: 0.05,
          rest: 0,
          limit: 0.4,
        },
        dt,
        this.out,
        this.outR,
      );
      const side = i === 0 ? 1 : -1;
      const ear = this.b[i === 0 ? "earL" : "earR"] as THREE.Bone;
      ear.rotation.set(
        this.out[0] as number,
        0,
        side * (0.08 - 0.55 * (this.earFlick[i] as number)) - (this.outR[0] as number),
      );
    }
    chainStep(
      this.tail,
      {
        accZ: acc,
        accX: 0,
        velZ: this.speed,
        pushX: (s.windX ?? 0) * 0.4,
        gainAcc: 0.03,
        gainVel: 0.1,
        rest: 0,
        limit: 0.5,
      },
      dt,
      this.out,
      this.outR,
    );
    (this.b.tail as THREE.Bone).rotation.set(
      0.2 - (this.out[0] as number) + Math.sin(t * 1.3) * 0.05 * idle * amp,
      Math.sin(t * 0.9) * 0.15 * amp,
      0,
    );

    // ---------------------------------------------------------------- blink
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
    this.inst.setFace(cell);
  }
}
