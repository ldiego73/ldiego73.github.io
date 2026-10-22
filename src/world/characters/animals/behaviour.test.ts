import { describe, expect, test } from "bun:test";
import { type IdleAction, IdleScheduler } from "./behaviour";

const run = (s: IdleScheduler, secs: number, ctx: { moving: boolean; rm: boolean; quiet?: boolean }) => {
  const seen = new Set<IdleAction>();
  for (let t = 0; t < secs; t += 0.05) {
    const st = s.step(0.05, ctx);
    expect(st.w).toBeGreaterThanOrEqual(0);
    expect(st.w).toBeLessThanOrEqual(1);
    seen.add(st.action);
  }
  return seen;
};

describe("idle scheduler", () => {
  test("is deterministic per seed", () => {
    const a = new IdleScheduler({ weights: { graze: 1, look: 1, chew: 1 } }, 7);
    const b = new IdleScheduler({ weights: { graze: 1, look: 1, chew: 1 } }, 7);
    for (let i = 0; i < 400; i++) {
      const x = a.step(0.05, { moving: false, rm: false });
      const y = b.step(0.05, { moving: false, rm: false });
      expect(x.action).toBe(y.action);
    }
  });

  test("moving starts nothing; standing plays the weighted actions", () => {
    const s = new IdleScheduler({ weights: { graze: 1, look: 1 } }, 3);
    expect([...run(s, 30, { moving: true, rm: false })]).toEqual(["none"]);
    const seen = run(s, 120, { moving: false, rm: false });
    expect(seen.has("graze") || seen.has("look")).toBe(true);
  });

  test("reduced motion keeps only calm actions, sleep needs quiet", () => {
    const s = new IdleScheduler({ weights: { scratch: 5, shake: 5, yawn: 5, look: 1, sleep: 5 } }, 5);
    const seen = run(s, 300, { moving: false, rm: true });
    for (const a of ["scratch", "shake", "yawn", "sleep"] as IdleAction[]) expect(seen.has(a)).toBe(false);
    const q = new IdleScheduler({ weights: { sleep: 1 } }, 2);
    expect(run(q, 60, { moving: false, rm: false }).has("sleep")).toBe(false);
    expect(run(q, 60, { moving: false, rm: false, quiet: true }).has("sleep")).toBe(true);
  });

  test("an action fades out when the animal starts moving", () => {
    const s = new IdleScheduler({ weights: { graze: 1 } }, 1);
    s.play("graze", 10);
    for (let i = 0; i < 40; i++) s.step(0.05, { moving: false, rm: false });
    expect(s.state.w).toBeCloseTo(1);
    for (let i = 0; i < 40; i++) s.step(0.05, { moving: true, rm: false });
    expect(s.state.action).toBe("none");
  });
});
