import { describe, expect, test } from "bun:test";
import {
  angleDiff,
  type BearTree,
  copyPose,
  dampPose,
  isAwake,
  isGoodLook,
  POSES,
  rankTrees,
  shouldRelocate,
  trunkAxis,
} from "./logic";

const tree = (t: number, d: number): BearTree => ({ kind: "unca", x: 0, y: 0, z: 0, s: 1, sy: 1, yaw: 0, t, d });

describe("bear logic", () => {
  test("rankTrees keeps the trail window and sorts closest first", () => {
    const out = rankTrees([tree(0.1, 5), tree(0.3, 20), tree(0.4, 12), tree(0.5, 40)], 0.15, 0.6, 30);
    expect(out.map((t) => t.d)).toEqual([12, 20]);
  });

  test("relocation never happens while watched or cooling down", () => {
    const base = { hidden: false, dist: 100, inView: false, cooldown: 0, far: 70, behind: false };
    expect(shouldRelocate(base)).toBe(true);
    expect(shouldRelocate({ ...base, inView: true })).toBe(false);
    expect(shouldRelocate({ ...base, cooldown: 2 })).toBe(false);
    expect(shouldRelocate({ ...base, dist: 20 })).toBe(false);
    expect(shouldRelocate({ ...base, dist: 20, behind: true })).toBe(true);
    expect(shouldRelocate({ ...base, dist: 5, inView: true, hidden: true })).toBe(true);
  });

  test("good look needs view and distance", () => {
    expect(isGoodLook(8, true)).toBe(true);
    expect(isGoodLook(8, false)).toBe(false);
    expect(isGoodLook(20, true)).toBe(false);
  });

  test("awake by day and into dusk, asleep at night", () => {
    expect(isAwake(0.5)).toBe(true);
    expect(isAwake(0.78)).toBe(true);
    expect(isAwake(0.9)).toBe(false);
    expect(isAwake(0.1)).toBe(false);
  });

  test("angleDiff wraps to the short way round", () => {
    expect(angleDiff(3, -3)).toBeCloseTo(2 * Math.PI - 6, 6);
    expect(angleDiff(0, 1)).toBeCloseTo(1, 6);
  });

  test("dampPose converges and is frame-rate independent", () => {
    const a = copyPose({} as never, POSES.walk);
    const b = copyPose({} as never, POSES.walk);
    for (let i = 0; i < 60; i++) dampPose(a, POSES.stand, 4, 1 / 60);
    for (let i = 0; i < 30; i++) dampPose(b, POSES.stand, 4, 1 / 30);
    expect(a.torsoP).toBeCloseTo(b.torsoP, 6);
    for (let i = 0; i < 600; i++) dampPose(a, POSES.stand, 4, 1 / 60);
    expect(a.torsoP).toBeCloseTo(POSES.stand.torsoP, 4);
  });

  test("standing bear is upright, sitting bear holds the bromeliad", () => {
    expect(POSES.stand.torsoP).toBeLessThan(-1.1);
    expect(POSES.sit.prop).toBe(1);
    expect(POSES.walk.prop).toBe(0);
  });

  test("trunk axis follows the crooked unca and the straight aliso", () => {
    const o = { x: 0, y: 0, z: 0 };
    trunkAxis("aliso", 1.5, o);
    expect([o.x, o.y, o.z]).toEqual([0, 1.5, 0]);
    trunkAxis("unca", 1.7, o);
    expect(o.x).toBeCloseTo(Math.sin(0.5 * 3.2) * 0.35, 6);
    expect(o.y).toBe(1.7);
  });
});
