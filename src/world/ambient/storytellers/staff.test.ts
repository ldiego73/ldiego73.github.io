import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { makeBones } from "../people/rig";
import { GRIP, staffInHand } from "./staff";

/** Distance (xz) between the fist and the shaft at the fist's height. */
function gap(twist: number, tilt: number) {
  const b = makeBones(0.98, 1, 1.04);
  b.torso.rotation.set(tilt, twist, 0);
  staffInHand(b);
  b.root.updateMatrixWorld(true);
  const fist = GRIP.clone().applyMatrix4(b.armL.matrixWorld);
  const foot = new THREE.Vector3().applyMatrix4(b.tool.matrixWorld);
  // Point on the shaft at the fist's height (tool +y axis in world).
  const up = new THREE.Vector3(0, 1, 0).transformDirection(b.tool.matrixWorld);
  const onShaft = foot.clone().addScaledVector(up, (fist.y - foot.y) / up.y);
  return { d: Math.hypot(fist.x - onShaft.x, fist.z - onShaft.z), foot, b };
}

describe("staff in hand", () => {
  test("the shaft goes through the fist across the whole turn (talk → point → back)", () => {
    for (let twist = -0.8; twist <= 0.8; twist += 0.05)
      for (const tilt of [0, 0.04, 0.1]) {
        const { d, foot } = gap(twist, tilt);
        expect(d).toBeLessThan(1e-6);
        expect(foot.y).toBeCloseTo(0, 6);
      }
  });
  test("at rest it stands where it used to (beside the left foot, a bit forward)", () => {
    const { b } = gap(0, 0.1);
    expect(b.tool.position.x).toBeGreaterThan(0.2);
    expect(b.tool.position.x).toBeLessThan(0.4);
    expect(b.tool.position.z).toBeGreaterThan(0.15);
    expect(b.tool.position.z).toBeLessThan(0.4);
    expect(b.tool.rotation.y).toBe(0);
  });
  test("turns with the shoulders", () => {
    const { b } = gap(0.6, 0.1);
    expect(b.tool.rotation.y).toBeCloseTo(0.6);
  });
});
