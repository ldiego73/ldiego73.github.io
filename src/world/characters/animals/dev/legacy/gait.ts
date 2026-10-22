// Dev-only snapshot of the pre-characters model (the harness shows it next to the new one). Not shipped.
/**
 * Procedural gait for the rideable four-legged mounts (mule, horse, llama): legs swing in pairs, the body
 * bobs and rolls, the neck nods, the tail swishes and hanging tack (stirrups, saddlebags, tassels) sways.
 * It turns a model's pivots into the `animate` hook that ./ride.ts calls every frame, so each animal only
 * describes its shape and a few amplitudes.
 *
 * Gaits: "trot" swings diagonal pairs together (mule, llama); "lateral" swings same-side pairs together,
 * the four-beat paso llano of the Peruvian Paso horse, which keeps the rider's back still (smaller bob).
 */
import type * as THREE from "three";

export interface QuadrupedParts {
  /** Bob/sway node (everything but the root). */
  body: THREE.Object3D;
  /** Front-left, front-right, back-left, back-right hip pivots. */
  legs: THREE.Object3D[];
  neck: THREE.Object3D;
  head: THREE.Object3D;
  tail: THREE.Object3D;
  /** Hanging tack that swings with the gait. */
  danglers: THREE.Object3D[];
}

export interface GaitOpts {
  gait?: "trot" | "lateral";
  /** Resting neck pitch (rotation.x) of the model. */
  neckLean?: number;
  /** Resting tail pitch. */
  tailLean?: number;
  legMax?: number;
  bob?: number;
  /** Occasional ear/head flick when idle (flies). */
  flick?: boolean;
}

export interface MountFrame {
  /** Ground speed (units/s, unsmoothed). */
  speed: number;
  /** Head-look target relative to the body, radians. */
  look: number;
  t: number;
  dt: number;
  rm: boolean;
}

export function quadrupedGait(p: QuadrupedParts, o: GaitOpts = {}): (f: MountFrame) => void {
  const lateral = o.gait === "lateral";
  const neckLean = o.neckLean ?? 0;
  const tailLean = o.tailLean ?? 0.25;
  const legMax = o.legMax ?? 0.5;
  const bob = o.bob ?? 0.045;
  let phase = 0;
  let speedS = 0;
  let trotW = 0;
  let idleT = 0;
  let headLook = 0;
  let earT = 0;
  return ({ speed, look, t, dt, rm }) => {
    speedS += (speed - speedS) * (1 - Math.exp(-dt * 8));
    trotW += ((speedS > 0.4 ? 1 : 0) - trotW) * (1 - Math.exp(-dt * 8));
    const amp = rm ? 0.45 : 1;
    phase += dt * (1.2 + speedS * 0.9) * Math.PI;
    const sw = Math.sin(phase);
    const legA = Math.min(legMax, 0.12 + speedS * 0.05) * trotW * amp;
    const [fl, fr, bl, br] = p.legs as [THREE.Object3D, THREE.Object3D, THREE.Object3D, THREE.Object3D];
    fl.rotation.x = sw * legA;
    fr.rotation.x = -sw * legA;
    // Trot: front-left with back-right. Lateral: front-left with back-left.
    (lateral ? bl : br).rotation.x = sw * legA;
    (lateral ? br : bl).rotation.x = -sw * legA;
    p.body.position.y = Math.abs(Math.cos(phase)) * bob * trotW * amp;
    // The lateral gait rocks the body side to side a touch more and bobs less (the bob amplitude is set low).
    p.body.rotation.z = Math.cos(phase) * (lateral ? 0.03 : 0.018) * trotW * amp;
    idleT += dt;
    headLook += (look - headLook) * (1 - Math.exp(-dt * 3));
    p.neck.rotation.y = headLook * 0.5;
    p.head.rotation.y = headLook * 0.4;
    p.neck.rotation.x =
      neckLean + Math.sin(phase * 2) * 0.06 * trotW * amp + (rm ? 0 : Math.sin(idleT * 1.3) * 0.03 * (1 - trotW));
    p.tail.rotation.x = tailLean + Math.sin(phase * 2) * 0.2 * trotW * amp;
    p.tail.rotation.z = rm ? 0 : Math.sin(t * 1.9) * 0.25 * (1 - trotW);
    for (let i = 0; i < p.danglers.length; i++) {
      const d = p.danglers[i]!;
      d.rotation.x = Math.sin(phase * 2 + i) * 0.12 * trotW * amp;
      d.rotation.z = Math.cos(phase + i) * 0.06 * trotW * amp;
    }
    if (o.flick && !rm) {
      earT -= dt;
      if (earT < -0.25) earT = 3 + Math.random() * 4;
      p.head.rotation.z = earT < 0 ? Math.sin(earT * 40) * 0.04 : 0;
    }
  };
}
