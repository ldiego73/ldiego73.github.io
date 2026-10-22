/**
 * Procedural animation of birds. The world moves the bird; this reads the motion through the flight state
 * machine (./flight.ts) and poses the body:
 *
 *   wings   open (arm → fore → hand → tip, each lagging the one before: the follow-through that makes a beat
 *           look like a wing and not a paddle) or folded (the folded pieces shown, the open wing collapsed by
 *           bone scale, ./plan-bird.ts); soaring spreads and curls the primaries, landing brakes with the wings
 *           high and the tail fanned
 *   legs    tucked back in flight, reaching down to land; on the ground the bird walks (alternate steps; the
 *           head bobs for doves), hops (both feet, small birds) or waddles (penguins: a big side-to-side roll)
 *   head    looks around in short jerks (birds turn their heads, they do not glide them), pecks (graze),
 *           preens (groom) and tucks into the back to sleep; the bill opens to call (yawn)
 *   tail    fans and tips with the pitch; a flick when landing
 *
 * Swimming: wings folded, feet paddling; diving: penguins fly under water with their flippers.
 * Reduced motion: half flap amplitude, no head jerks (smooth looks), no shake.
 */
import type * as THREE from "three";
import type { AnimalState, Rig } from "./anim-quad";
import { type IdleAction, IdleScheduler } from "./behaviour";
import { type FlightFSM, flightFSM, flightStep, isAirborne, wingPose } from "./flight";
import type { BirdMotion } from "./spec";

export interface BirdState {
  /** On the ground or a perch (default true). */
  grounded: boolean;
  /** Vertical speed (units/s) and height above the ground or water (units). */
  vy: number;
  height: number;
  /** On the water surface; under water. */
  water?: boolean;
  under?: boolean;
  /** Perched with the wings held open (0..1): condors and cormorants sunning themselves in the morning. */
  spread?: number;
}

const damp = (cur: number, target: number, rate: number, dt: number) =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));
const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class BirdAnimator {
  hold: number | null = null;
  features: Record<string, boolean> = {};
  readonly fsm: FlightFSM = flightFSM();
  readonly idle: IdleScheduler;
  private clock = 0;
  private phase = 0;
  private fold = 1;
  private legs = 1;
  private fan = 0;
  private pitch = 0;
  private curl = 0;
  private airW = 0;
  private sunW = 0;
  private strW = 0;
  private flapS = 0;
  private lag1 = 0;
  private lag2 = 0;
  private look = 0;
  private lookTarget = 0;
  private lookTimer = 1;
  private blinkTimer = 2;
  private blinkT = -1;
  private b: Record<string, THREE.Bone>;
  private rest: Record<string, THREE.Vector3>;

  constructor(
    private rig: Rig,
    private m: BirdMotion,
    seed = 1,
  ) {
    this.b = rig.bones;
    this.rest = rig.rest;
    this.idle = new IdleScheduler(m.idles, seed);
    this.clock = seed * 0.37;
    this.phase = (seed * 0.618) % 1;
  }

  play(a: Exclude<IdleAction, "none">, seconds?: number) {
    this.idle.play(a, seconds);
  }

  update(dt: number, t: number, s: AnimalState & Partial<BirdState>) {
    dt = Math.min(dt, 0.05);
    this.clock += dt;
    const m = this.m;
    const rm = s.rm;
    const fp = m.flight;
    const grounded = s.grounded ?? !s.water;
    flightStep(
      this.fsm,
      fp,
      { grounded, water: s.water, under: s.under, speed: s.speed, vy: s.vy ?? 0, height: s.height ?? 0 },
      dt,
    );
    const st = this.fsm.state;
    const pose = wingPose(
      st,
      this.fsm.time,
      this.hold !== null ? this.hold / Math.max(1, fp.flapHz) : this.clock,
      fp,
      rm,
    );
    const air = isAirborne(st);
    const moving = s.speed > 0.05;
    const idle = this.idle.step(dt, { moving: moving || air || st === "swim" || st === "dive", rm, quiet: s.quiet });
    const act = (a: IdleAction) => (idle.action === a ? idle.w : 0);
    const rate = air ? 14 : 8;
    // Wings opened while perched: held out to the sun (`spread`) or raised high in a stretch (idle).
    const down = !air && st !== "swim" && st !== "dive";
    this.sunW = damp(this.sunW, down ? Math.min(1, Math.max(0, s.spread ?? 0)) : 0, 3, dt);
    this.strW = damp(this.strW, down ? act("stretch") : 0, 5, dt);
    const openW = Math.max(this.sunW, this.strW);
    this.fold = damp(this.fold, pose.fold * (1 - openW), rate, dt);
    this.legs = damp(this.legs, pose.legs, 6, dt);
    this.fan = damp(this.fan, pose.fan, 6, dt);
    this.pitch = damp(this.pitch, pose.pitch, 4, dt);
    this.curl = damp(this.curl, pose.curl, 3, dt);
    // In the air (and swimming or diving) the body levels out from its perched, upright build.
    this.airW = damp(this.airW, air || st === "dive" ? 1 : st === "swim" ? 0.6 : 0, 5, dt);
    // The flap itself is not smoothed (it is the beat); its lagged copies drive the forearm and hand.
    const flap = pose.flap + this.sunW * 0.06 + this.strW * 0.6;
    this.flapS = flap;
    this.lag1 = damp(this.lag1, flap, 22, dt);
    this.lag2 = damp(this.lag2, this.lag1, 18, dt);

    // ---------------------------------------------------------------- root and body
    const root = this.b.root as THREE.Bone;
    const body = this.b.body as THREE.Bone;
    const rb = this.rest.body as THREE.Vector3;
    let bodyY = rb.y;
    let bodyRoll = 0;
    const bodyPitch = -this.pitch - (m.pitch ?? 0) * this.airW;
    const ground = st === "walk" || st === "hop" || st === "perch";
    if (st === "hop") {
      // Both feet: a little arc per hop.
      this.phase = (this.phase + dt * Math.max(2.2, s.speed * 6)) % 1;
      bodyY += Math.sin(this.phase * Math.PI) * rb.y * 0.35;
    } else if (st === "walk") {
      this.phase = (this.phase + dt * Math.max(1.2, s.speed * (fp.ground === "waddle" ? 4.5 : 3.2))) % 1;
      if (fp.ground === "waddle") bodyRoll = Math.sin(this.phase * Math.PI * 2) * (rm ? 0.08 : 0.16);
      bodyY += Math.abs(Math.sin(this.phase * Math.PI * 2)) * rb.y * 0.04;
    }
    const peck = act("graze");
    const peckK = peck * Math.max(0, Math.sin(t * 7)) ** 3;
    const sleep = act("sleep");
    const shake = rm ? 0 : act("shake");
    body.position.set(0, bodyY - sleep * rb.y * 0.15, rb.z);
    body.rotation.set(
      bodyPitch + peck * 0.25 + (st === "swim" ? 0.05 : 0),
      0,
      bodyRoll + Math.sin(t * 40) * 0.08 * shake + (s.turn ?? 0) * (air ? -0.35 : 0),
    );
    root.rotation.set(0, 0, 0);

    // ---------------------------------------------------------------- wings: open or folded
    const open = sstep(0.62, 0.32, this.fold);
    for (const side of ["L", "R"] as const) {
      const sg = side === "L" ? 1 : -1;
      const arm = this.b[`arm${side}`] as THREE.Bone;
      const fore = this.b[`fore${side}`] as THREE.Bone;
      const hand = this.b[`hand${side}`] as THREE.Bone;
      const tip = this.b[`tip${side}`] as THREE.Bone;
      const fold = this.b[`fold${side}`];
      arm.scale.setScalar(Math.max(1e-3, open));
      // Elevation (flap) about z, sweep back about y as the wing folds, a little twist (pitch) on the downstroke.
      const sweep = this.fold * 1.1;
      // The wing was built level with the perched (pitched) body: keep it level when the body levels out.
      // Sunning: the open wing turns its face to the front (twisted about the span, trailing edge down).
      arm.rotation.set(
        (this.flapS - this.lag1) * 0.25 + (m.pitch ?? 0) * this.airW - 1.25 * this.sunW,
        sweep * sg,
        sg * this.flapS,
      );
      fore.rotation.set(0, sweep * 0.5 * sg, sg * (this.lag1 - this.flapS) * 0.55);
      hand.rotation.set(
        (this.lag1 - this.lag2) * 0.4,
        sweep * 0.4 * sg,
        sg * ((this.lag2 - this.lag1) * 0.7 + this.curl * 0.5),
      );
      tip.rotation.set(0, 0, sg * this.curl);
      if (fold) {
        const shown = 1 - open;
        fold.scale.setScalar(Math.max(1e-3, shown));
        // A folded wing droops a little when the bird is relaxed, twitches when it shakes.
        fold.rotation.set(0, 0, sg * (0.03 * sleep + Math.sin(t * 30) * 0.05 * shake));
      }
    }

    // ---------------------------------------------------------------- legs
    const legsDown = this.legs;
    for (const side of ["L", "R"] as const) {
      const sg = side === "L" ? 1 : -1;
      const thigh = this.b[`thigh${side}`] as THREE.Bone;
      const shin = this.b[`shin${side}`] as THREE.Bone;
      const foot = this.b[`foot${side}`] as THREE.Bone;
      let swing = 0;
      let lift = 0;
      if (st === "walk") {
        const a = (this.phase + (side === "L" ? 0 : 0.5)) * Math.PI * 2;
        swing = Math.sin(a) * (fp.ground === "waddle" ? 0.18 : 0.35);
        lift = Math.max(0, Math.cos(a)) * 0.35;
      }
      const oneLeg = m.oneLeg && st === "perch" && side === "R" && !moving ? 1 : 0;
      const tuck = 1 - legsDown;
      const paddle = pose.paddle ? Math.sin(t * 6 + (side === "L" ? 0 : Math.PI)) * 0.5 * pose.paddle : 0;
      thigh.rotation.set(swing + tuck * 1.25 + paddle + oneLeg * 0.6 - sleep * 0.3, 0, 0);
      shin.rotation.set(-lift - tuck * 0.6 - oneLeg * 1.5 + (ground ? -this.pitch * 0.3 : 0), 0, 0);
      foot.rotation.set(lift * 0.6 + tuck * 0.9 + oneLeg * 0.9 + paddle * 0.5, 0, 0);
      void sg;
    }

    // ---------------------------------------------------------------- neck and head
    if (!rm) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.lookTarget = (Math.random() - 0.5) * (air ? 0.4 : 1.6);
        this.lookTimer = 0.6 + Math.random() * 2.2;
      }
    }
    const lookT = s.look ?? this.lookTarget;
    // Birds jerk their heads to a new direction (fast), then hold.
    this.look = damp(this.look, lookT, rm ? 3 : 16, dt);
    const preen = act("groom");
    const call = act("yawn");
    const neckS = m.neckS ?? 0;
    const restS = air ? -neckS * 0.6 : neckS;
    const bob = m.headBob && st === "walk" ? Math.sin(this.phase * Math.PI * 4) * 0.25 : 0;
    const prSide = idle.side >= 0 ? 1 : -1;
    (this.b.neck0 as THREE.Bone).rotation.set(
      restS * 0.6 + peck * 0.5 + preen * 0.5 + sleep * 0.6 + (air ? 0.25 : 0) + this.pitch * 0.4,
      this.look * 0.3 + preen * prSide * 1.2 + sleep * 1.4 * prSide,
      0,
    );
    (this.b.neck1 as THREE.Bone).rotation.set(
      -restS * 0.9 + peck * 0.35 + bob * 0.5 + preen * 0.3,
      this.look * 0.3 + preen * prSide * 0.6,
      0,
    );
    (this.b.neck2 as THREE.Bone).rotation.set(restS * 0.3 + peckK * 0.4 - bob * 0.3, this.look * 0.4, 0);
    (this.b.head as THREE.Bone).rotation.set(
      peckK * 0.5 + preen * 0.6 - call * 0.4 + this.pitch * 0.5,
      0,
      (rm ? 0 : Math.sin(t * 0.8) * 0.06) + preen * 0.4 * prSide,
    );
    (this.b.jaw as THREE.Bone).rotation.set(call * Math.abs(Math.sin(t * 9)) * 0.5 + peckK * 0.15, 0, 0);

    // ---------------------------------------------------------------- tail
    const tail = this.b.tail as THREE.Bone;
    const flick = st === "land" ? Math.sin(Math.min(1, this.fsm.time / 0.3) * Math.PI) * 0.4 : 0;
    tail.rotation.set(
      -this.pitch * 0.4 - flick - (st === "walk" ? Math.sin(this.phase * Math.PI * 2) * 0.05 : 0),
      0,
      bodyRoll * -0.5,
    );
    tail.scale.set(1 + this.fan * 0.6, 1, 1);

    // ---------------------------------------------------------------- eyes
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.blinkTimer = 2 + Math.random() * 4;
    }
    let cell = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      if (this.blinkT > 0.16) this.blinkT = -1;
      else cell = this.blinkT < 0.04 || this.blinkT > 0.12 ? 3 : 1;
    }
    if (sleep > 0.5) cell = 1;
    this.rig.setFace(cell);
  }
}
