/**
 * The amauta's walking staff, kept in his left fist whatever the torso does.
 *
 * The staff rides the `tool` bone, a child of the hips, while the hand hangs from the torso: when he turns his
 * shoulders to point at the cords (torso yaw) a fixed tool pose would leave the staff behind. `staffInHand`
 * places the tool from the current torso + left-arm pose instead: the shaft keeps its lean (yawed with the
 * shoulders), passes through the fist and stands on the ground (hips y = 0); its foot swings with the turn.
 * Call it after the torso and the left arm are posed for the frame. No allocations.
 */
import * as THREE from "three";
import type { Bones } from "../people/rig";

/** Left arm while holding the staff (shoulder forward, elbow slightly out). */
export const HOLD_ARM_X = -0.62;
export const HOLD_ARM_Z = 0.05;
/** Staff lean (toward the front and outward), applied under the shoulders' yaw. */
const LEAN_X = 0.04;
const LEAN_Z = -0.05;
/** Centre of the fist in the arm's frame (people/models.ts manArm hand sphere), a touch forward. */
export const GRIP = new THREE.Vector3(0, -0.37, 0.02);

const hand = new THREE.Vector3();
const axis = new THREE.Vector3();

/** Pose the left arm on the staff and put the staff through the fist (bones in the hips frame). */
export function staffInHand(b: Bones) {
  b.armL.rotation.set(HOLD_ARM_X, 0, HOLD_ARM_Z);
  b.torso.updateMatrix();
  b.armL.updateMatrix();
  hand.copy(GRIP).applyMatrix4(b.armL.matrix).applyMatrix4(b.torso.matrix);
  const t = b.tool;
  t.rotation.set(LEAN_X, b.torso.rotation.y, LEAN_Z, "YXZ");
  axis.set(0, 1, 0).applyEuler(t.rotation);
  // Slide down the shaft from the fist to the ground.
  const g = hand.y / axis.y;
  t.position.set(hand.x - axis.x * g, 0, hand.z - axis.z * g);
}
