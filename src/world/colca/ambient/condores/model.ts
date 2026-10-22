/**
 * Andean condors for the Kuntisuyu (../condores.ts riding the thermals and perched on the rim, ../cruz.ts the
 * finale's rising flock) on the shared animals: one herd of the "condor" species (../../../characters/animals,
 * a continuous skinned body with lofted, fingered wings, one instanced draw per LOD however many birds fly).
 *
 * The world's flight sims stay as they are (./logic.ts: thermals, low passes, perches, the finale's spiral):
 * each frame the owner sets a bird's position, heading, bank and a few flags, and this turns them into the bird
 * animator's state. Speed and climb come from the bird's own motion between frames, so the flight state
 * machine (soar, glide, flap) reads the real flight; the bank becomes the turn the body leans into; a few deep
 * wingbeats (`flap`) are a short climb at low speed, which is when a condor flaps; a perched bird is grounded,
 * its head turning by `look`.
 */
import type * as THREE from "three";
import type { BirdState } from "../../../characters/animals/anim-bird";
import type { AnimalState } from "../../../characters/animals/anim-quad";
import { createHerd, type Herd } from "../../../characters/animals/crowd";

export interface CondorPose {
  x: number;
  y: number;
  z: number;
  /** Heading (the bird faces +Z at yaw 0). */
  yaw: number;
  /** Roll into the turn (radians, + right wing down). */
  bank: number;
  /** A few deep wingbeats now. */
  flap?: boolean;
  /** On its perch (wings folded, standing). */
  perched?: boolean;
  /** Perched and opening its wings to the sun (honoured once the bird animator has a spread pose). */
  sunning?: boolean;
  /** Head turn relative to the body (radians), perched birds. */
  look?: number;
}

/** The bird animator leans the body by turn × 0.35 in the air (anim-bird.ts): the turn that gives `bank`. */
const BANK_PER_TURN = 0.35;

interface Track {
  id: number;
  x: number;
  y: number;
  z: number;
  seen: boolean;
}

export class CondorFlock {
  readonly herd: Herd;
  readonly group: THREE.Group;
  private tracks: Track[];
  private dt = 1 / 60;

  /** `variants`: coat palettes (the white condor's leucistic one); every bird takes the first. */
  constructor(
    name: string,
    readonly n: number,
    private rm = false,
    variants?: ReadonlyArray<readonly string[]>,
  ) {
    this.herd = createHerd("condor", { max: n, ...(variants ? { variants } : {}) });
    this.group = this.herd.group;
    this.group.name = name;
    this.tracks = Array.from({ length: n }, (_, i) => ({
      id: this.herd.add({ seed: 7 + i * 13 }),
      x: 0,
      y: 0,
      z: 0,
      seen: false,
    }));
  }

  /** Call once per frame before the `set`s (the speeds are measured over this step). */
  begin(dt: number) {
    this.dt = Math.max(1e-3, dt);
  }

  set(i: number, p: CondorPose) {
    const tr = this.tracks[i];
    if (!tr) return;
    const dt = this.dt;
    let speed = 0;
    let vy = 0;
    if (tr.seen) {
      speed = Math.hypot(p.x - tr.x, p.z - tr.z) / dt;
      vy = (p.y - tr.y) / dt;
      // A teleport (a new pass, a jump of the clock) is not a speed.
      if (speed > 40) speed = 0;
      if (Math.abs(vy) > 20) vy = 0;
    }
    tr.x = p.x;
    tr.y = p.y;
    tr.z = p.z;
    tr.seen = true;
    // A fresh state object per bird: the herd keeps the reference until its update.
    const s: AnimalState & Partial<BirdState> & { spread?: number } = { speed: 0, rm: this.rm };
    if (p.perched) {
      s.grounded = true;
      s.speed = 0;
      s.vy = 0;
      s.height = 0;
      s.look = p.look;
      s.spread = p.sunning ? 1 : 0;
    } else {
      s.grounded = false;
      // Flapping: a condor beats its wings climbing slowly (the flight machine's "flap" for a soarer).
      s.speed = p.flap ? Math.min(speed, 2.5) : Math.max(speed, 3.2);
      s.vy = p.flap ? Math.max(vy, 1) : vy;
      s.height = 60;
      s.turn = p.bank / BANK_PER_TURN;
    }
    this.herd.set(tr.id, p.x, p.y, p.z, p.yaw, s);
  }

  hide(i: number) {
    const tr = this.tracks[i];
    if (!tr) return;
    tr.seen = false;
    this.herd.hide(tr.id);
  }

  update(dt: number, t: number, camera: THREE.Camera) {
    this.herd.update(dt, t, camera);
  }

  dispose() {
    this.herd.dispose();
  }
}
