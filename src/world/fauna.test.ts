import { describe, expect, test } from "bun:test";
import {
  type Agent,
  BOUND,
  type FlockParams,
  flockStep,
  type GroundRules,
  gaitAmp,
  gaitPhase,
  goodGround,
  herdSizes,
  hopArc,
  legSwing,
  moveAgent,
  mulberry,
  PACE,
  pointHash,
  shouldStep,
  turnToward,
  wrapAngle,
} from "./fauna-sim";

const P: FlockParams = { speed: 1, fleeSpeed: 5, separation: 1.5, cohesion: 2, wary: 10, panic: 4, agility: 3 };
const agent = (x: number, z: number): Agent => ({ x, z, vx: 0, vz: 0 });
const run = (
  agents: Agent[],
  goal: { x: number; z: number } | null,
  threat: Parameters<typeof flockStep>[2],
  s: number,
) => {
  let alarm: number[] = [];
  for (let i = 0; i < s; i++) {
    alarm = flockStep(agents, goal, threat, P, 1 / 30);
    for (const a of agents) moveAgent(a, 1 / 30, () => true);
  }
  return alarm;
};

describe("angles", () => {
  test("wrapAngle keeps [-π, π)", () => {
    expect(Math.abs(wrapAngle(3 * Math.PI))).toBeCloseTo(Math.PI, 6);
    expect(wrapAngle(-Math.PI / 2 - 4 * Math.PI)).toBeCloseTo(-Math.PI / 2, 6);
  });
  test("turnToward takes the short way and clamps the step", () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1, 6);
    expect(turnToward(0, 0.05, 0.1)).toBe(0.05);
  });
});

describe("flockStep", () => {
  test("leader walks to the goal; followers keep up but keep their distance", () => {
    const herd = [agent(0, 0), agent(-1, -1), agent(1, -1), agent(0, -2)];
    run(herd, { x: 0, z: 20 }, null, 30 * 25);
    const lead = herd[0] as Agent;
    expect(Math.hypot(lead.x, lead.z - 20)).toBeLessThan(1);
    for (const f of herd.slice(1)) expect(Math.hypot(f.x - lead.x, f.z - lead.z)).toBeLessThan(6);
    for (let i = 0; i < herd.length; i++)
      for (let j = i + 1; j < herd.length; j++) {
        const a = herd[i] as Agent;
        const b = herd[j] as Agent;
        expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0.6);
      }
  });

  test("a resting herd stays put", () => {
    const herd = [agent(0, 0), agent(3, 0)];
    run(herd, null, null, 60);
    expect(Math.hypot(herd[0]!.vx, herd[0]!.vz)).toBeLessThan(0.05);
  });

  test("animals drift from a walking traveler and bolt from a running one", () => {
    const calm = [agent(0, 0)];
    const a1 = run(calm, null, { x: 6, z: 0, running: false }, 30);
    expect(a1[0]).toBeGreaterThan(0);
    expect(a1[0]).toBeLessThan(1);
    expect(calm[0]!.vx).toBeLessThan(0);
    const bolted = [agent(0, 0)];
    const a2 = run(bolted, null, { x: 6, z: 0, running: true }, 30);
    expect(a2[0]).toBe(1);
    expect(Math.hypot(bolted[0]!.vx, bolted[0]!.vz)).toBeGreaterThan(Math.hypot(calm[0]!.vx, calm[0]!.vz));
  });

  test("domestic herds ignore a walking traveler but scatter from a runner", () => {
    const calm = { ...P, onlyRunners: true };
    const a = [agent(0, 0)];
    expect(flockStep(a, null, { x: 2, z: 0, running: false }, calm, 1 / 30)[0]).toBe(0);
    expect(flockStep(a, null, { x: 2, z: 0, running: true }, calm, 1 / 30)[0]).toBe(1);
  });

  test("moveAgent refuses bad ground and slides along the free axis", () => {
    const a = { x: 0, z: 0, vx: 1, vz: 1 };
    moveAgent(a, 1, (x) => x <= 0); // wall at x > 0
    expect(a.x).toBe(0);
    expect(a.z).toBe(1);
  });
});

describe("gait", () => {
  test("phase advances one cycle per stride and wraps to [0,1)", () => {
    expect(gaitPhase(0, 2, 0.25, 1)).toBeCloseTo(0.5, 6);
    expect(gaitPhase(0.9, 2, 0.1, 1)).toBeCloseTo(0.1, 6);
    expect(gaitPhase(0.3, 0, 1, 1)).toBe(0.3);
  });
  test("amplitude is zero at rest and scales with speed up to max", () => {
    expect(gaitAmp(0, 1.2, 0.5)).toBe(0);
    expect(gaitAmp(0.6, 1.2, 0.5)).toBeCloseTo(0.25, 6);
    expect(gaitAmp(9, 1.2, 0.5)).toBe(0.5);
    expect(legSwing(0.37, 2, 0)).toBe(0);
  });
  test("camelids pace: same-side legs swing together, opposite sides opposed", () => {
    for (const ph of [0.1, 0.33, 0.72]) {
      const fl = legSwing(ph, 0, 1, PACE);
      const fr = legSwing(ph, 1, 1, PACE);
      const hl = legSwing(ph, 2, 1, PACE);
      expect(Math.sign(fl) * Math.sign(fr)).toBeLessThanOrEqual(0);
      expect(Math.abs(fl - hl)).toBeLessThan(0.45);
    }
  });
  test("bound pairs the front legs and the hind legs", () => {
    const f = legSwing(0.2, 0, 1, BOUND);
    const h = legSwing(0.2, 2, 1, BOUND);
    expect(Math.abs(f - legSwing(0.2, 1, 1, BOUND))).toBeLessThan(0.5);
    expect(Math.sign(f)).toBe(-Math.sign(h));
  });
  test("hop arc lands where it starts and peaks mid-air", () => {
    expect(hopArc(0, 1).y).toBe(0);
    expect(hopArc(1, 1).y).toBeCloseTo(0, 6);
    expect(hopArc(0.5, 0.3).y).toBeCloseTo(0.3, 6);
    expect(hopArc(0.5, 0.3).squash).toBeGreaterThan(1);
  });
});

describe("ground + budget", () => {
  const rules: GroundRules = {
    heightAt: (x) => x * 0.1 + 5,
    walkable: (_x, z) => Math.abs(z) < 3,
    inside: (x, z) => Math.hypot(x, z) < 100,
    minY: 2,
    maxY: 20,
    maxSlope: 0.6,
  };
  test("goodGround rejects the trail band, out-of-bounds, heights and steep slopes", () => {
    expect(goodGround(rules, 10, 10)).toBe(true);
    expect(goodGround(rules, 10, 0)).toBe(false);
    expect(goodGround(rules, 99, 99)).toBe(false);
    expect(goodGround(rules, 200, 10)).toBe(false);
    expect(goodGround({ ...rules, heightAt: (x) => x * 2 }, 5, 10)).toBe(false);
  });
  test("herd sizes stay in range and are deterministic; budget stays under ~60", () => {
    const a = herdSizes(4, 3, 6, mulberry(1));
    expect(a).toEqual(herdSizes(4, 3, 6, mulberry(1)));
    for (const n of a) expect(n >= 3 && n <= 6).toBe(true);
    // Worst case on high: 3 vicuña herds ≤7, 4 alpaca herds ≤5, 4 colonies ≤5, 3 condors, 3 llamas.
    expect(3 * 7 + 4 * 5 + 4 * 5 + 3 + 3).toBeLessThanOrEqual(67);
  });
  test("far animals step at a low rate", () => {
    expect(shouldStep(0.016, 50, 120, 0.25)).toBe(true);
    expect(shouldStep(0.1, 200, 120, 0.25)).toBe(false);
    expect(shouldStep(0.26, 200, 120, 0.25)).toBe(true);
  });
  test("pointHash measures distance near the points and gives up far away", () => {
    const pts: Array<[number, number]> = Array.from({ length: 41 }, (_, i) => [i, 0]);
    const d = pointHash(pts, 8);
    expect(d(10.2, 3)).toBeCloseTo(Math.hypot(0.2, 3), 6);
    expect(d(20, -5)).toBeCloseTo(5, 6);
    expect(d(20, 60)).toBe(Infinity);
  });
});
