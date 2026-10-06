/**
 * One person: bones + a creatures Body + locomotion (seek with early avoidance, then a separation push)
 * and the procedural poses shared by every behaviour (walk/run gait, hoe, sow, carry, sit, wave, dance).
 */
import * as THREE from "three";
import { type Body, creatures } from "../../creatures";
import { steer } from "./logic";
import type { PartName } from "./models";
import { type Bones, type Crowd, makeBones, type Palette } from "./rig";

export const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
export const angleDamp = (cur: number, target: number, rate: number, dt: number) => {
  let d = target - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + d * (1 - Math.exp(-rate * dt));
};

const near: Body[] = [];
const push = { x: 0, z: 0 };
const dir = { x: 0, z: 0 };

export interface PersonOpts {
  kind: string;
  crowd: Crowd;
  idx: number;
  wear: readonly PartName[];
  palette: Palette;
  scale: number;
  headScale?: number;
  girth?: number;
  radius: number;
  seed: number;
}

export class Person {
  readonly bones: Bones;
  readonly body: Body;
  readonly crowd: Crowd;
  readonly idx: number;
  readonly scale: number;
  readonly seed: number;
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  speed = 0;
  phase = 0;
  /** 0..1 walk / run blend for the gait. */
  walkW = 0;
  runW = 0;
  active = false;
  /** Drawn this frame (inside the view distance). */
  shown = false;
  timer = 0;
  state = "";
  /** Behaviour-specific scratch values. */
  u = 0;
  v = 0;
  tx = 0;
  tz = 0;
  constructor(o: PersonOpts) {
    this.crowd = o.crowd;
    this.idx = o.idx;
    this.scale = o.scale;
    this.seed = o.seed;
    this.bones = makeBones(o.scale, o.headScale ?? 1, o.girth ?? 1);
    o.crowd.wear(o.idx, o.wear, o.palette);
    this.body = creatures.add(o.kind, o.radius, { solid: false, x: 1e5, z: 1e5 });
  }

  /** Put the person in the world (solid) or take them out (home, night, low quality). */
  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    this.body.solid = on;
    if (!on) {
      this.body.x = 1e5;
      this.body.z = 1e5;
      this.crowd.show(this.idx, null);
    }
  }

  /** Out of view (site far away): drawn nowhere, still in the world. */
  hide() {
    this.crowd.show(this.idx, null);
  }

  place(x: number, z: number, yaw = this.yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.body.x = x;
    this.body.z = z;
  }

  /**
   * Walk toward (tx, tz) at `speed`, bending around bodies ahead (look-ahead with `near()`), then resolving
   * any remaining overlap with `separate()`. Returns the distance left.
   */
  seek(tx: number, tz: number, speed: number, dt: number, rate = 4) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const want = d < 0.25 ? 0 : speed * Math.min(1, d / 0.8);
    this.speed = damp(this.speed, want, rate, dt);
    if (d > 1e-4 && this.speed > 0.01) {
      creatures.near(this.x, this.z, 2.2, near, this.body);
      // Ignore non-solid bodies (birds in flight, people at home).
      let n = 0;
      for (let i = 0; i < near.length; i++) if ((near[i] as Body).solid) near[n++] = near[i] as Body;
      near.length = n;
      steer(this.x, this.z, dx / d, dz / d, this.body.r, near, 1.8, dir);
      const step = Math.min(d, this.speed * dt);
      this.x += dir.x * step;
      this.z += dir.z * step;
      this.yaw = angleDamp(this.yaw, Math.atan2(dir.x, dir.z), 7, dt);
    }
    this.resolve();
    return d;
  }

  /** Push out of overlaps with other solid bodies (also when standing still). */
  resolve(k = 1) {
    this.body.x = this.x;
    this.body.z = this.z;
    if (!this.body.solid) return;
    creatures.separate(this.body, push);
    this.x += push.x * k;
    this.z += push.z * k;
    this.body.x = this.x;
    this.body.z = this.z;
  }

  face(x: number, z: number, dt: number, rate = 5) {
    this.yaw = angleDamp(this.yaw, Math.atan2(x - this.x, z - this.z), rate, dt);
  }

  // ------------------------------------------------------------ poses

  /** Reset to a neutral standing pose with breathing. */
  rest(clock: number, rm: boolean) {
    const b = this.bones;
    b.hips.position.set(0, 0, 0);
    b.hips.rotation.set(0, 0, 0);
    b.torso.rotation.set(0, 0, 0);
    b.torso.position.y = 0.55;
    b.head.rotation.set(0, 0, 0);
    b.armL.rotation.set(0, 0, 0.08);
    b.armR.rotation.set(0, 0, -0.08);
    b.legL.rotation.set(0, 0, 0);
    b.legR.rotation.set(0, 0, 0);
    b.tool.position.set(0, 0, 0);
    b.tool.rotation.set(0, 0, 0);
    if (!rm) b.torso.position.y = 0.55 + Math.sin(clock * 1.9 + this.seed) * 0.006;
  }

  /** Walking / running gait from the current speed. */
  gait(dt: number, rm: boolean, armSwing = 1) {
    const b = this.bones;
    const sp = this.speed / this.scale;
    this.walkW = damp(this.walkW, Math.min(1, sp / 1.0), 8, dt);
    this.runW = damp(this.runW, sp > 2.4 ? 1 : 0, 6, dt);
    const stride = 0.6 + this.runW * 0.45;
    this.phase += (dt * sp * Math.PI) / stride;
    const amp = rm ? 0.5 : 1;
    const sw = Math.sin(this.phase);
    const leg = (0.5 * this.walkW + 0.45 * this.runW) * amp;
    b.legL.rotation.x = sw * leg;
    b.legR.rotation.x = -sw * leg;
    const arm = (0.35 * this.walkW + 0.5 * this.runW) * amp * armSwing;
    b.armL.rotation.x = -sw * arm - 0.3 * this.runW;
    b.armR.rotation.x = sw * arm - 0.3 * this.runW;
    b.armL.rotation.z = 0.08 + 0.15 * this.runW;
    b.armR.rotation.z = -0.08 - 0.15 * this.runW;
    b.hips.position.y = Math.abs(Math.cos(this.phase)) * (0.03 * this.walkW + 0.08 * this.runW) * amp;
    b.torso.rotation.x = 0.04 * this.walkW + 0.22 * this.runW;
    b.torso.rotation.y = sw * 0.06 * this.walkW * amp;
    b.head.rotation.x = -b.torso.rotation.x * 0.6;
  }

  /** Seated on the ground, legs forward (rest, by the fire). */
  sit(clock: number, rm: boolean, lean = 0.12) {
    const b = this.bones;
    b.hips.position.y = -0.47;
    b.legL.rotation.set(-1.45, 0, 0.12);
    b.legR.rotation.set(-1.45, 0, -0.12);
    b.torso.rotation.x = -lean;
    b.armL.rotation.set(-0.5, 0, 0.25);
    b.armR.rotation.set(-0.5, 0, -0.25);
    if (!rm) b.head.rotation.y = Math.sin(clock * 0.3 + this.seed) * 0.35;
  }

  /** Write the pose into the crowd's instanced meshes. */
  commit() {
    const b = this.bones;
    b.root.position.set(this.x, this.y, this.z);
    b.root.rotation.y = this.yaw;
    b.root.updateMatrixWorld(true);
    this.crowd.show(this.idx, b);
  }

  dispose() {
    creatures.remove(this.body);
  }
}

/** Scratch vector for behaviours (never stored). */
export const V = new THREE.Vector3();
