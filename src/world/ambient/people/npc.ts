/**
 * One person on the new characters (../../characters): a crowd member (skinned, instanced, LOD by distance)
 * driven by the human animation controller, plus a creatures Body and the same locomotion helpers the old
 * `Person` (./person.ts) offers: seek with early avoidance, a separation push, facing, places in and out of the
 * world. Behaviours set the speed and an action (`npc.anim.act("sit-ground")`, "wave", "carry-back"…), then
 * call `commit(ctx)` once per frame; the walk cycle follows the real ground speed.
 *
 * Migration from `Person`: the locomotion API is the same (`seek`, `resolve`, `face`, `place`, `setActive`,
 * `hide`, `x/z/y/yaw/speed/state/timer/u/v/tx/tz`); instead of writing bone rotations (`p.bones.armR.rotation`)
 * play an action, and instead of `p.gait()` + `p.commit()` call `npc.commit(ctx)`.
 */
import * as THREE from "three";
import { HumanAnimator } from "../../characters/anim-human";
import type { HumanSpec } from "../../characters/archetype";
import type { CrowdMember, HumanCrowd } from "../../characters/crowd";
import type { HeldProps, PropHandle, PropKind } from "../../characters/props";
import type { Dress } from "../../characters/slots";
import { type Body, creatures } from "../../creatures";
import { liveWind } from "../../wind";
import { steer } from "./logic";
import { angleDamp, damp } from "./person";

const near: Body[] = [];
const push = { x: 0, z: 0 };
const dir = { x: 0, z: 0 };
const local = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export interface NpcOpts {
  kind: string;
  crowd: HumanCrowd;
  spec: HumanSpec;
  palette: Dress | readonly string[];
  /** Height jitter (instance scale). */
  scale?: number;
  radius: number;
  seed: number;
}

/** What `commit` needs each frame (the people ambients' Ctx satisfies it). */
export interface NpcFrame {
  dt: number;
  clock: number;
  rm: boolean;
  avatar: THREE.Vector3;
}

export class Npc {
  readonly member: CrowdMember;
  readonly anim: HumanAnimator;
  readonly body: Body;
  readonly seed: number;
  readonly scale: number;
  x = 0;
  z = 0;
  y = 0;
  yaw = 0;
  speed = 0;
  active = false;
  timer = 0;
  state = "";
  u = 0;
  v = 0;
  tx = 0;
  tz = 0;
  /** Extra vertical offset (swimming, a seat surface the feet do not reach). */
  lift = 0;
  /** Look at the traveler within this distance (0 = never). */
  lookRange = 6;
  /** Look at this world point instead of the traveler (the storyteller, the fire, a kite); null = the traveler. */
  lookAt: THREE.Vector3 | null = null;
  private props: PropHandle[] = [];

  constructor(o: NpcOpts) {
    this.seed = o.seed;
    this.scale = o.scale ?? 1;
    this.member = o.crowd.add(o.spec, o.palette, { scale: this.scale });
    this.member.show(false);
    this.anim = new HumanAnimator(this.member, this.member.meta.style, { seed: o.seed });
    this.body = creatures.add(o.kind, o.radius, { solid: false, x: 1e5, z: 1e5 });
  }

  /** Give the person a prop to hold or carry (shown while active). */
  hold(props: HeldProps, kind: PropKind | (string & {}), tint?: THREE.ColorRepresentation): PropHandle {
    const h = props.attach(this.member, kind, tint);
    h.show(this.active);
    this.props.push(h);
    return h;
  }

  setActive(on: boolean) {
    if (this.active === on) return;
    this.active = on;
    this.body.solid = on;
    if (!on) {
      this.body.x = 1e5;
      this.body.z = 1e5;
    }
    this.member.show(on);
    for (const p of this.props) p.show(on);
  }

  /** Out of view (site far away): drawn nowhere, still in the world. `show()` or the next `commit` undo it. */
  hide() {
    this.member.show(false);
    for (const p of this.props) p.show(false);
  }

  /** Back in view after `hide()` (only while active: an inactive person stays out of the world). */
  show() {
    if (!this.active) return;
    this.member.show(true);
    for (const p of this.props) p.show(true);
  }

  place(x: number, z: number, yaw = this.yaw) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.body.x = x;
    this.body.z = z;
  }

  /** Walk toward (tx, tz) at `speed`, bending around bodies ahead, then resolving overlaps. Distance left. */
  seek(tx: number, tz: number, speed: number, dt: number, rate = 4) {
    const dx = tx - this.x;
    const dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    const want = d < 0.25 ? 0 : speed * Math.min(1, d / 0.8);
    this.speed = damp(this.speed, want, rate, dt);
    if (d > 1e-4 && this.speed > 0.01) {
      creatures.near(this.x, this.z, 2.2, near, this.body);
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

  /** Animate (walk cycle from the speed, the current action, a glance at the traveler) and draw. */
  commit(f: NpcFrame) {
    const m = this.member;
    // A person hidden while their group was out of view comes back as soon as it is committed again.
    if (this.active && !m.shown) this.show();
    m.place(this.x, this.y + this.lift, this.z, this.yaw);
    // Far people animate at a lower rate (the bone texture still uploads once per frame for everyone).
    if (m.lod === 2 && m.dist > 40 && Math.floor(f.clock * 20 + this.seed) % 3 !== 0) return;
    const ax = f.avatar.x - this.x;
    const az = f.avatar.z - this.z;
    if (this.lookAt) {
      local.set(this.lookAt.x - this.x, this.lookAt.y - this.y, this.lookAt.z - this.z).applyAxisAngle(UP, -this.yaw);
      this.anim.look(local);
    } else if (this.lookRange > 0 && ax * ax + az * az < this.lookRange * this.lookRange) {
      local.set(ax, f.avatar.y + 1.4 - this.y, az).applyAxisAngle(UP, -this.yaw);
      this.anim.look(local);
    } else this.anim.look(null);
    const w = liveWind.sample(this.x, this.z);
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    this.anim.update(f.dt, f.clock, {
      speed: this.speed / this.scale,
      rm: f.rm,
      expression: "auto",
      windX: c * w.x - s * w.z,
      windZ: s * w.x + c * w.z,
    });
    m.commit();
  }

  dispose() {
    creatures.remove(this.body);
    for (const p of this.props) p.detach();
  }
}
