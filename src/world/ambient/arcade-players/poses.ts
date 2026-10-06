/**
 * Arcade poses on top of the shared people rig (people/person.ts rest() first, then these):
 *  - play: leaning in, left hand on the joystick (small circles), right hand tapping the buttons, a little bob;
 *  - cheer: both arms up, a hop and a lean back (a win on the screen);
 *  - watch (kids): on tiptoe, peeking over the player's shoulder, hands clasped; they jump when the player wins.
 */
import type { Person } from "../people/person";

/** Hands on the controls (the deck is at ~1.04 u; players stand ~0.72 u from the cabinet center). */
export function playPose(p: Person, clock: number, rm: boolean) {
  const b = p.bones;
  const s = p.seed;
  b.torso.rotation.x = 0.16;
  b.head.rotation.x = 0.08;
  b.armL.rotation.set(-1.5, 0, -0.16);
  b.armR.rotation.set(-1.5, 0, 0.16);
  if (rm) return;
  // Joystick: small circles; buttons: quick taps.
  b.armL.rotation.x += Math.cos(clock * 6.3 + s) * 0.06;
  b.armL.rotation.z += Math.sin(clock * 6.3 + s) * 0.05;
  const tap = Math.max(0, Math.sin(clock * 10.5 + s * 2.1));
  b.armR.rotation.x += tap * tap * tap * 0.1;
  // Bob and lean into the game.
  b.hips.position.y += Math.abs(Math.sin(clock * 2.4 + s)) * 0.014;
  b.torso.rotation.z = Math.sin(clock * 0.9 + s) * 0.05;
  b.torso.rotation.y = Math.sin(clock * 1.7 + s * 0.5) * 0.04;
  b.head.rotation.z = -b.torso.rotation.z * 0.6;
}

/** A win: arms up and a hop. `k` 0..1 over the celebration. */
export function cheerPose(p: Person, clock: number, k: number, rm: boolean) {
  const b = p.bones;
  const up = Math.sin(Math.min(1, k * 4) * Math.PI * 0.5) * Math.sin(Math.min(1, (1 - k) * 4) * Math.PI * 0.5);
  b.torso.rotation.x = 0.16 - 0.3 * up;
  b.head.rotation.x = 0.08 - 0.35 * up;
  const pump = rm ? 0 : Math.sin(clock * 11) * 0.2;
  b.armL.rotation.set(-1.5 - 1.4 * up + pump * up, 0, -0.16 + 0.5 * up);
  b.armR.rotation.set(-1.5 - 1.4 * up - pump * up, 0, 0.16 - 0.5 * up);
  if (!rm) b.hips.position.y += Math.abs(Math.sin(clock * 9)) * 0.07 * up;
}

/** A kid looking over the player's shoulder; leans toward local `side` x (+1: the kid's left). */
export function watchPose(p: Person, clock: number, side: number, excited: number, rm: boolean) {
  const b = p.bones;
  b.hips.position.y += 0.03;
  b.torso.rotation.x = 0.12;
  b.torso.rotation.z = -side * 0.1;
  b.head.rotation.z = -side * 0.12;
  b.head.rotation.x = -0.1;
  b.armL.rotation.set(-0.55, 0, -0.35);
  b.armR.rotation.set(-0.55, 0, 0.35);
  if (rm) return;
  b.hips.position.y += Math.abs(Math.sin(clock * 1.6 + p.seed)) * 0.02;
  if (excited > 0) {
    b.hips.position.y += Math.abs(Math.sin(clock * 10)) * 0.12 * excited;
    b.armL.rotation.set(-0.55 - 2.2 * excited, 0, 0.3 * excited);
    b.armR.rotation.set(-0.55 - 2.2 * excited, 0, -0.3 * excited);
    b.torso.rotation.z *= 1 - excited;
  }
}
