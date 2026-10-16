/**
 * A villager of the Antisuyu community: the mountain's Person (bones, creatures body, steering and the shared
 * poses: ../../../ambient/people/person.ts) dressed with the Amazonian parts of ./models.ts, plus the poses
 * only the jungle needs (swimming, paddling, carrying a load on the shoulder or a basket, a wave).
 */
import { Person, type PersonOpts } from "../../../ambient/people/person";
import type { AmazonPart } from "./models";

export function villager(o: Omit<PersonOpts, "wear"> & { wear: readonly AmazonPart[] }): Person {
  // PersonOpts names the mountain's part list; the crowd only matches names, so any part catalogue works.
  return new Person({ ...o, wear: o.wear as unknown as PersonOpts["wear"] });
}

/** Swimming (breaststroke-like crawl), body prone at the surface; `t` is the stroke clock. */
export function swimPose(p: Person, t: number, rm: boolean) {
  const b = p.bones;
  b.hips.rotation.x = 1.35;
  // Shift the prone body back so the person's position sits under the chest, not the feet.
  b.hips.position.set(0, 0.1, -0.75);
  const s = rm ? 0 : t;
  b.armL.rotation.set(-2.6 + Math.sin(s * 3.2) * 0.9, 0, 0.35);
  b.armR.rotation.set(-2.6 - Math.sin(s * 3.2) * 0.9, 0, -0.35);
  b.legL.rotation.set(Math.sin(s * 7) * 0.25, 0, 0.05);
  b.legR.rotation.set(-Math.sin(s * 7) * 0.25, 0, -0.05);
  b.head.rotation.x = -0.9;
}

/** Arms out for balance (walking the log). */
export function balancePose(p: Person, t: number, rm: boolean) {
  const b = p.bones;
  const w = rm ? 0 : Math.sin(t * 2.4 + p.seed) * 0.25;
  b.armL.rotation.set(-0.2, 0, 1.25 + w);
  b.armR.rotation.set(-0.2, 0, -1.25 + w);
}

/** A bunch carried on the right shoulder, steadied with the right hand. */
export function shoulderPose(p: Person) {
  p.bones.armR.rotation.set(-2.75, 0, 0.32);
}

/** Hands on the basket straps. */
export function strapPose(p: Person) {
  p.bones.armL.rotation.set(-0.55, 0, 0.32);
  p.bones.armR.rotation.set(-0.55, 0, -0.32);
}

/** Raised hand waving (left arm). */
export function wavePose(p: Person, t: number, rm: boolean) {
  p.bones.armL.rotation.set(-2.6, 0, 0.4 + (rm ? 0 : Math.sin(t * 12) * 0.25));
}
