import { describe, expect, test } from "bun:test";
import { createCreatureRegistry } from "./creatures";
import {
  type Agent,
  type FlockParams,
  flockStep,
  type GroundRules,
  goodGround,
  herdSizes,
  moveAgent,
  mulberry,
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
  test("goodGround rejects keep-out zones (blocked hook)", () => {
    const reg = createCreatureRegistry();
    const r = { ...rules, blocked: (x: number, z: number) => reg.inKeepOut(x, z) };
    expect(goodGround(r, 10, 10)).toBe(true);
    const k = reg.keepOut(10, 10, 2);
    expect(goodGround(r, 10, 10)).toBe(false);
    expect(goodGround(r, 10, 13)).toBe(true);
    k.on = false;
    expect(goodGround(r, 10, 10)).toBe(true);
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
