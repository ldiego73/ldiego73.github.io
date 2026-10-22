/**
 * Mountain-only gestures the shared action catalogue (characters/poses.ts) does not have yet, written on top
 * of what the animator posed: an arcade player's hands on the controls, a seated child raising a hand, a
 * reader tracing a khipu cord, holding a tablet in front, a stretch, setting a stone on the apacheta, tugging
 * a kite string. A behaviour plays the nearest catalogue action (`npc.anim.act(…)`) for the legs and the
 * body, calls `npc.commit(ctx)`, then `overlay(npc, (b) => …)` rewrites a few bones and re-commits them to
 * the crowd's bone texture. Same conventions as poses.ts (`arm(b, side, pitch, out, elbow, twist, hand)`:
 * negative pitch lifts the arm forward, `out` raises it sideways, negative elbow bends it).
 *
 * This is a stopgap until these gestures live in poses.ts (requested): it writes a handful of rotations per
 * person and frame, only for people in view doing one of these things.
 */
import * as THREE from "three";
import type { CrowdMember } from "../../characters/crowd";
import { liveWind } from "../../wind";
import type { Npc, NpcFrame } from "../people/npc";

type Bones = Record<string, THREE.Bone>;
export type Side = "L" | "R";

const local = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * `npc.commit(f)` with the head turned toward a world point of our choosing (a storyteller, the khipu cords,
 * the fire) instead of the traveler: `Npc.commit` only knows the traveler (requested: a look target on Npc).
 * Same steps: place, look, animate from the ground speed and the wind, upload the bones.
 */
export function commitLooking(p: Npc, f: NpcFrame, at: THREE.Vector3 | null) {
  const m = p.member;
  m.place(p.x, p.y + p.lift, p.z, p.yaw);
  if (m.lod === 2 && m.dist > 40 && Math.floor(f.clock * 20 + p.seed) % 3 !== 0) return;
  if (at) {
    local.set(at.x - p.x, at.y - p.y, at.z - p.z).applyAxisAngle(UP, -p.yaw);
    p.anim.look(local);
  } else p.anim.look(null);
  const w = liveWind.sample(p.x, p.z);
  const c = Math.cos(p.yaw);
  const s = Math.sin(p.yaw);
  p.anim.update(f.dt, f.clock, {
    speed: p.speed / p.scale,
    rm: f.rm,
    expression: "auto",
    windX: c * w.x - s * w.z,
    windZ: s * w.x + c * w.z,
  });
  m.commit();
}

/** Play an action only when it changes (re-playing restarts its crossfade). */
export function play(p: Npc, a: Parameters<Npc["anim"]["act"]>[0], o?: Parameters<Npc["anim"]["act"]>[1]) {
  if (p.anim.action !== a) p.anim.act(a, o);
}

/** Arm helper (poses.ts convention): shoulder pitch, sideways lift, elbow bend, twist, wrist pitch. */
export function arm(b: Bones, sd: Side, pitch: number, out: number, elbow: number, twist = 0, hand = 0) {
  const s = sd === "L" ? 1 : -1;
  b[`arm${sd}`]?.rotation.set(pitch, twist * s, out * s, "ZXY");
  b[`fore${sd}`]?.rotation.set(elbow, 0, 0, "XYZ");
  b[`hand${sd}`]?.rotation.set(hand, 0, 0, "XYZ");
}

/** Rewrite some bones after the animator (and the person's commit), then upload them again. */
export function overlay(m: CrowdMember, fn: (b: Bones) => void) {
  if (!m.shown) return;
  fn(m.bones);
  m.commit();
}

const sstep = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** Both hands in front of the chest holding something flat (a tablet), looking down at it. */
export function holdFront(b: Bones, bob: number) {
  arm(b, "L", -0.42, 0.12, -1.35 + bob, -0.35, 0.1);
  arm(b, "R", -0.42, 0.12, -1.35 + bob, -0.35, 0.1);
  b.head?.rotation.set(0.32, 0, 0, "ZXY");
}

/** One forearm raised in front (a tablet or a khipu shown in that hand). */
export function holdUp(b: Bones, sd: Side) {
  arm(b, sd, -0.35, 0.1, -1.45, -0.3, 0.15);
}

/** A seated child's raised hand, waving a little (`w` −1..1). */
export function raiseHand(b: Bones, sd: Side, w: number) {
  arm(b, sd, -2.75, 0.18 + w * 0.12, -0.25, 0, 0);
}

/** Tracing a cord: the arm reaches up to the knots (k 0) and down the cord (k 1); the head follows. */
export function traceCord(b: Bones, sd: Side, k: number) {
  const other: Side = sd === "L" ? "R" : "L";
  arm(b, sd, -1.95 + k * 0.7, 0.35, -0.35, 0, 0);
  arm(b, other, -0.3, 0.12, -0.4, 0, 0);
  b.head?.rotation.set(-0.3 + k * 0.42, sd === "L" ? 0.18 : -0.18, 0, "ZXY");
  b.chest?.rotation.set(0.04 + k * 0.08, 0, 0, "ZXY");
}

/** Hands on an arcade cabinet's controls: joystick circles on the left, button taps on the right. */
export function arcadePlay(b: Bones, clock: number, seed: number, rm: boolean) {
  const jx = rm ? 0 : Math.cos(clock * 6.3 + seed) * 0.06;
  const jz = rm ? 0 : Math.sin(clock * 6.3 + seed) * 0.05;
  const tap = rm ? 0 : Math.max(0, Math.sin(clock * 10.5 + seed * 2.1)) ** 3 * 0.12;
  arm(b, "L", -1.05 + jx, 0.12 + jz, -0.75, -0.2, 0.2);
  arm(b, "R", -1.05 + tap, 0.1, -0.75 - tap, -0.2, 0.25);
  b.chest?.rotation.set(0.14, rm ? 0 : Math.sin(clock * 1.7 + seed * 0.5) * 0.05, 0, "ZXY");
  b.head?.rotation.set(0.12, 0, rm ? 0 : Math.sin(clock * 0.9 + seed) * -0.04, "ZXY");
}

/** A win on the screen: both arms up and pumping (`k` 0..1 over the celebration). */
export function cheer(b: Bones, clock: number, k: number, rm: boolean) {
  const up = sstep(k * 4) * sstep((1 - k) * 4);
  const pump = rm ? 0 : Math.sin(clock * 11) * 0.2 * up;
  arm(b, "L", -1.05 - 1.75 * up + pump, 0.12 + 0.35 * up, -0.75 * (1 - up) - 0.2, 0, 0);
  arm(b, "R", -1.05 - 1.75 * up - pump, 0.1 + 0.35 * up, -0.75 * (1 - up) - 0.2, 0, 0);
  b.chest?.rotation.set(0.14 - 0.3 * up, 0, 0, "ZXY");
  b.head?.rotation.set(0.12 - 0.35 * up, 0, 0, "ZXY");
}

/** A child peeking over a player's shoulder (lean toward `side`, +1 = their left); `ex` 0..1 excited. */
export function peek(b: Bones, side: number, ex: number, clock: number, rm: boolean) {
  const sd = side > 0 ? 1 : -1;
  b.chest?.rotation.set(0.1, 0, -sd * 0.1 * (1 - ex), "ZXY");
  b.head?.rotation.set(-0.12, 0, -sd * 0.12, "ZXY");
  if (ex > 0.05) {
    const pump = rm ? 0 : Math.sin(clock * 10) * 0.15;
    arm(b, "L", -0.6 - 2.1 * ex + pump, 0.25, -0.3, 0, 0);
    arm(b, "R", -0.6 - 2.1 * ex - pump, 0.25, -0.3, 0, 0);
  }
}

/** Seated with a cup in the right hand, lifting it to sip now and then (`sip` 0..1; poses.ts "drink"). */
export function sipSeated(b: Bones, sipK: number) {
  arm(b, "R", -0.5 - 0.6 * sipK, 0.2, -1.1 - 1.0 * sipK, -0.3, 0);
  arm(b, "L", -0.45, 0.25, -0.9, -0.2, 0);
  b.head?.rotation.set(-0.15 * sipK, 0, 0, "ZXY");
}

/** Seated, both hands held out to the fire (`w` a small sway). */
export function warmHands(b: Bones, w: number) {
  arm(b, "L", -1.15 + w, 0.18, -0.35, 0, -0.3);
  arm(b, "R", -1.15 - w, 0.18, -0.35, 0, -0.3);
  b.chest?.rotation.set(0.16, 0, 0, "ZXY");
}

/** Arms overhead in a slow stretch (k 0..1 over it), a lean back and a twist. */
export function stretch(b: Bones, k: number, rm: boolean) {
  const up = Math.sin(Math.min(1, k * 1.25) * Math.PI);
  arm(b, "L", -2.95 * up, 0.25 * up + 0.08, -0.2 * up, 0, 0);
  arm(b, "R", -2.95 * up, 0.25 * up + 0.08, -0.2 * up, 0, 0);
  b.chest?.rotation.set(-0.18 * up, rm ? 0 : Math.sin(k * Math.PI * 2) * 0.25 * up, 0, "ZXY");
  b.head?.rotation.set(-0.3 * up, 0, 0, "ZXY");
}

/** Stooping to set a stone on the cairn (k 0..1). */
export function placeStone(b: Bones, k: number) {
  const bend = Math.sin(Math.min(1, k * 1.4) * Math.PI);
  b.spine?.rotation.set(0.35 * bend, 0, 0, "ZXY");
  b.chest?.rotation.set(0.25 * bend, 0, 0, "ZXY");
  arm(b, "R", -0.55 - 0.7 * bend, 0.12, -0.35, 0, 0);
  arm(b, "L", -0.3 * bend, 0.15, -0.3, 0, 0);
  b.head?.rotation.set(0.25 * bend, 0, 0, "ZXY");
}

/** Holding a kite string up and tugging it (tug 0..1). */
export function kiteTug(b: Bones, tug: number) {
  arm(b, "R", -1.95 + tug * 0.3, 0.2, -0.35, 0, 0);
  arm(b, "L", -1.75 + tug * 0.2, 0.25, -0.5, 0, 0);
  b.chest?.rotation.set(-0.1 - tug * 0.2, 0, 0, "ZXY");
  b.head?.rotation.set(-0.45, 0, 0, "ZXY");
}

/** Pointing up at something in the sky (a kite) with the right arm. */
export function pointUp(b: Bones) {
  arm(b, "R", -2.7, 0.1, -0.1, 0, 0);
  b.head?.rotation.set(-0.5, 0, 0, "ZXY");
}

/** Both arms up, cheering (a child jumping for the kite). */
export function armsUp(b: Bones) {
  arm(b, "L", -2.8, 0.3, -0.2, 0, 0);
  arm(b, "R", -2.8, 0.3, -0.2, 0, 0);
  b.head?.rotation.set(-0.45, 0, 0, "ZXY");
}
