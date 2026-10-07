import { describe, expect, test } from "bun:test";
import { GAMES } from "../../../../games/registry";
import { cabColor, gameHref, RAFT_CABINETS, raftGames } from "./logic";

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
});
