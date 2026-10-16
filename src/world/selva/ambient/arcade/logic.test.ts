import { describe, expect, test } from "bun:test";
import { GAMES } from "../../../../games/registry";
import { CAB_Z, cabColor, cabPose, gameHref, RAFT, RAFT_CABINETS, raftGames } from "./logic";

describe("floating arcade", () => {
  test("picks distinct real games spread over the catalog", () => {
    const g = raftGames(GAMES);
    expect(g.length).toBe(Math.min(RAFT_CABINETS, GAMES.length));
    expect(new Set(g.map((x) => x.slug)).size).toBe(g.length);
    expect(g[0]).toBe(GAMES[0]!);
    expect(g[g.length - 1]).toBe(GAMES[GAMES.length - 1]!);
  });
  test("small catalogs are taken whole", () => {
    expect(raftGames(GAMES.slice(0, 3)).length).toBe(3);
  });
  test("colors and links", () => {
    expect(cabColor("nope")).toMatch(/^#/);
    expect(gameHref("en", "snake")).toBe("/en/arcade/snake/");
  });
  test("cabinet arc: symmetric, on the raft, outer ones turned inward", () => {
    const n = RAFT_CABINETS;
    const mid = cabPose(2, n);
    expect(mid.x).toBeCloseTo(0);
    expect(mid.z).toBeCloseTo(CAB_Z);
    expect(mid.yaw).toBeCloseTo(0);
    const a = cabPose(0, n);
    const b = cabPose(n - 1, n);
    expect(a.x).toBeCloseTo(-b.x);
    expect(a.yaw).toBeGreaterThan(0);
    expect(b.yaw).toBeCloseTo(-a.yaw);
    for (let i = 0; i < n; i++) {
      const c = cabPose(i, n);
      expect(c.x).toBeGreaterThan(RAFT.x0);
      expect(c.x).toBeLessThan(RAFT.x1);
      expect(c.z).toBeGreaterThan(RAFT.z0);
    }
    expect(cabPose(0, 1).x).toBe(0);
  });
});
