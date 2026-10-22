/**
 * Procedural animation of swimmers (sea lions, the bufeo, fish). In water a wave travels down the spine
 * (./swim.ts spineWave: side to side for fish, up and down for dolphins and sea lions), stronger with speed,
 * the head counter-steers so it stays on course, the fins scull; dolphins arc up to breathe (`porpoise`). On
 * land (sea lions) the body lollops (front flippers planted, a hump travelling back), and at rest it looks
 * around, barks (the "yawn" idle opens the mouth), scratches with a hind flipper or sleeps flat out.
 *
 * Reduced motion: smaller waves, no porpoising arcs, calm idles only.
 */
import type * as THREE from "three";
import type { BirdState } from "./anim-bird";
import type { AnimalState, Rig } from "./anim-quad";
import { type IdleAction, IdleScheduler } from "./behaviour";
import type { SwimMotion } from "./spec";
import { lollop, porpoise, spineWave } from "./swim";

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

export class SwimAnimator {
  hold: number | null = null;
  features: Record<string, boolean> = {};
  readonly idle: IdleScheduler;
  private phase = 0;
  private wt = 0;
  private speedS = 0;
  private landW = 0;
  private look = 0;
  private lookTarget = 0;
  private lookTimer = 2;
  private blinkTimer = 2;
  private blinkT = -1;
  private wave: number[] = [];
  private tails: THREE.Bone[] = [];
  private b: Record<string, THREE.Bone>;
  private rest: Record<string, THREE.Vector3>;

  constructor(
    private rig: Rig,
    private m: SwimMotion,
    seed = 1,
  ) {
    this.b = rig.bones;
    this.rest = rig.rest;
    this.idle = new IdleScheduler(m.idles, seed);
    for (let i = 0; this.b[`tail${i}`]; i++) this.tails.push(this.b[`tail${i}`] as THREE.Bone);
    this.wt = seed * 0.71;
  }

  play(a: Exclude<IdleAction, "none">, seconds?: number) {
    this.idle.play(a, seconds);
  }

  update(dt: number, t: number, s: AnimalState & Partial<BirdState>) {
    dt = Math.min(dt, 0.05);
    const m = this.m;
    const rm = s.rm;
    const amp = rm ? 0.5 : 1;
    this.speedS = damp(this.speedS, Math.max(0, s.speed), 4, dt);
    const speed = this.speedS;
    const onLand = !!m.land && (s.grounded ?? false) && !s.water;
    this.landW = damp(this.landW, onLand ? 1 : 0, 5, dt);
    const land = this.landW;
    const moving = speed > 0.05;
    const idle = this.idle.step(dt, { moving, rm, quiet: s.quiet });
    const act = (a: IdleAction) => (idle.action === a ? idle.w : 0);
    // Wave speed: idle sculling when still, faster beats with speed.
    const k = Math.min(1.6, 0.3 + speed / 1.5);
    this.wt += dt * m.wave.hz * (0.4 + 0.6 * k);
    if (this.hold !== null) this.wt = this.hold;
    const root = this.b.root as THREE.Bone;
    const body = this.b.body as THREE.Bone;
    const rb = this.rest.body as THREE.Vector3;
    const n = this.tails.length;
    spineWave(n + 1, this.wt / m.wave.hz, { ...m.wave, amp: m.wave.amp * k * amp * (1 - land) }, this.wave);

    // ---------------------------------------------------------------- body: porpoise arcs in water, lollop on land
    let y = rb.y;
    let pitch = 0;
    if (m.porpoise && !rm && moving && land < 0.5) {
      const p = porpoise(t, 7, 2.2, rb.y * 1.6);
      y += p.y;
      pitch = -p.pitch;
    }
    let arch = 0;
    let lift = 0;
    let fore = 0;
    let hind = 0;
    if (land > 0.01) {
      if (moving) this.phase = (this.phase + dt * Math.max(0.8, speed * 1.4)) % 1;
      const l = lollop(this.phase);
      const mw = moving ? 1 : 0;
      arch = l.arch * mw * land;
      lift = l.lift * mw * land;
      fore = l.fore * mw * land;
      hind = l.hind * mw * land;
    }
    const sleep = act("sleep");
    root.position.set(0, 0, 0);
    body.position.set(0, y + lift * rb.y * 2 - sleep * rb.y * 0.2, rb.z);
    const axis = m.axis;
    const w0 = this.wave[0] ?? 0;
    if (axis === "yaw") body.rotation.set(pitch, -w0 * 0.5, 0);
    else body.rotation.set(pitch - w0 * 0.3 - arch * 0.5, 0, 0);
    const chest = this.b.chest as THREE.Bone;
    chest.rotation.set(arch * 0.8 - land * 0.25 * (1 - sleep), axis === "yaw" ? w0 * 0.3 : 0, 0);
    for (let i = 0; i < n; i++) {
      const a = this.wave[i + 1] ?? 0;
      const tb = this.tails[i] as THREE.Bone;
      if (axis === "yaw") tb.rotation.set(0, a, 0);
      else tb.rotation.set(a + (i === 0 ? arch : 0) + (i === 0 ? land * 0.1 : 0), 0, 0);
    }

    // ---------------------------------------------------------------- head and neck
    if (!rm) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = moving ? 0 : (Math.random() - 0.5) * 1.2;
        this.lookTimer = 1.5 + Math.random() * 3;
      }
    }
    this.look = damp(this.look, s.look ?? this.lookTarget, 3, dt);
    const bark = act("yawn");
    const neck = this.b.neck as THREE.Bone;
    // On land the sea lion holds its head up high; asleep it lies flat.
    neck.rotation.set(
      -land * 0.55 * (1 - sleep) + sleep * 0.3 - bark * 0.25,
      this.look * 0.5 - (axis === "yaw" ? w0 * 0.3 : 0),
      0,
    );
    (this.b.head as THREE.Bone).rotation.set(
      land * 0.35 * (1 - sleep) - (axis === "pitch" ? w0 * 0.25 : 0) - bark * 0.2,
      this.look * 0.4,
      0,
    );
    (this.b.jaw as THREE.Bone).rotation.set(bark * Math.abs(Math.sin(t * 7)) * 0.5, 0, 0);

    // ---------------------------------------------------------------- flippers
    const scull = Math.sin(this.wt * Math.PI * 2 * 0.5) * 0.25 * amp * (1 - land);
    for (const [side, sg] of [
      ["L", 1],
      ["R", -1],
    ] as const) {
      const fin = this.b[`fin${side}`] as THREE.Bone;
      // Land: flippers planted forward and down (propping the chest); water: sculling, swept back when fast.
      fin.rotation.set(
        -fore * 0.8 + land * -0.2,
        (speed > 0.8 ? 0.4 : 0) * sg * (1 - land),
        sg * (scull - land * 0.5 * (1 - sleep)),
      );
      const hf = this.b[`hfin${side}`];
      if (hf) hf.rotation.set(hind * 0.8 - land * 1.0 + act("scratch") * Math.sin(t * 20) * 0.3, 0, sg * land * 0.3);
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
    if (sleep > 0.5) cell = 1;
    this.rig.setFace(cell);
  }
}
