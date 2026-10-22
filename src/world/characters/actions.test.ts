import { describe, expect, test } from "bun:test";
import { ActionMixer, ONE_SHOT } from "./actions";
import { ACTIONS, actionPose, emptyPose, ownsLegs, type PoseCtx } from "./poses";

const ctx = (t: number, o: Partial<PoseCtx> = {}): PoseCtx => ({
  t,
  phase: 0,
  speed: 0,
  rm: false,
  side: 1,
  seed: 0,
  seat: 0,
  ...o,
});

describe("action mixer", () => {
  test("crossfades: weights always sum to 1 and settle on the new action", () => {
    const m = new ActionMixer();
    m.play("wave", { fade: 0.4 });
    for (let i = 0; i < 30; i++) {
      m.step(0.02);
      const sum = m.layers().reduce((s, l) => s + l.weight, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
    expect(m.layers().length).toBe(1);
    expect(m.action).toBe("wave");
  });
  test("playing the same action again does not restart it (unless asked)", () => {
    const m = new ActionMixer();
    m.play("talk", { fade: 0 });
    m.step(1);
    m.play("talk");
    expect(m.cur.t).toBeCloseTo(1);
    m.play("talk", { restart: true, fade: 0 });
    expect(m.cur.t).toBe(0);
  });
  test("one-shot actions hand over to what follows", () => {
    const m = new ActionMixer();
    m.play("kick", { fade: 0, next: "hop" });
    for (let t = 0; t < (ONE_SHOT.kick ?? 1) + 0.1; t += 0.05) m.step(0.05);
    expect(m.action).toBe("hop");
  });
  test("an interrupted crossfade keeps the stronger layer as the one to leave", () => {
    const m = new ActionMixer();
    m.play("sit-bench", { fade: 0 });
    m.play("wave", { fade: 1 });
    m.step(0.2);
    m.play("talk", { fade: 1 });
    // "wave" was only 20% in: the layer faded out is still the bench.
    expect(m.prev?.action).toBe("sit-bench");
  });
});

describe("poses", () => {
  test("every action yields finite rotations at any time", () => {
    for (const a of ACTIONS)
      for (const t of [0, 0.37, 1.2, 7.9]) {
        const p = actionPose(a, ctx(t), emptyPose());
        for (const r of Object.values(p.rot)) {
          expect(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.z)).toBe(true);
        }
        if (p.hips) for (const v of Object.values(p.hips)) expect(Number.isFinite(v)).toBe(true);
      }
  });
  test("sitting owns the legs and lowers the hips to the seat", () => {
    expect(ownsLegs("sit-bench")).toBe(true);
    expect(ownsLegs("wave")).toBe(false);
    const p = actionPose("sit-bench", ctx(0, { seat: 0.45 }), emptyPose());
    // Thigh underside (joint at 0.76 + dy, radius 0.083) rests on the seat.
    expect(0.76 + (p.hips?.y ?? 0) - 0.083).toBeCloseTo(0.45, 3);
  });
  test("one-handed actions mirror with the side", () => {
    const r = actionPose("wave", ctx(0.3, { side: 1 }), emptyPose());
    const l = actionPose("wave", ctx(0.3, { side: -1 }), emptyPose());
    expect(r.rot.armR).toBeDefined();
    expect(l.rot.armL).toBeDefined();
  });
  test("reduced motion calms repeating motions", () => {
    const swing = (rm: boolean) => {
      let max = 0;
      for (let t = 0; t < 3; t += 0.05) {
        const p = actionPose("dance", ctx(t, { rm }), emptyPose());
        max = Math.max(max, Math.abs(p.hips?.y ?? 0));
      }
      return max;
    };
    expect(swing(true)).toBeLessThan(swing(false) * 0.6);
  });
  test("phase B poses: kneeling ones own the legs, hand gestures leave them to the walk or a seat", () => {
    const added = [
      "photo",
      "cheer",
      "balance",
      "play-arcade",
      "raise-hand",
      "read-cord",
      "hold-front",
      "hold-up",
      "stretch",
      "place",
      "tug",
      "point-up",
      "bind",
      "kneel-offer",
      "pray",
      "whip-circle",
    ] as const;
    for (const a of added) expect(ACTIONS).toContain(a);
    for (const a of ["bind", "kneel-offer", "place"] as const) expect(ownsLegs(a)).toBe(true);
    // These compose over a seated pose through the arms layer (HumanAnimator.actArms).
    for (const a of ["photo", "raise-hand", "read-cord", "hold-front", "point-up", "pray", "whip-circle"] as const) {
      expect(ownsLegs(a)).toBe(false);
      const p = actionPose(a, ctx(0.5), emptyPose());
      expect(Object.keys(p.rot).some((b) => b.startsWith("arm") || b.startsWith("fore"))).toBe(true);
    }
  });
});
