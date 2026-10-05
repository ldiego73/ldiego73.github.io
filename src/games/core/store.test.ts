import { describe, expect, test } from "bun:test";
import { emptyState, evaluate, leaderboard, recordEnd, recordStart, recordStat } from "./store";
import type { Achievement } from "./types";

const t = { es: "x", en: "x" };
const achievements: Achievement[] = [
  { id: "hunter", title: t, description: t, rule: { kind: "stat", game: "bug", key: "bugs", gte: 3 } },
  { id: "loser", title: t, description: t, rule: { kind: "losses-total", gte: 2 } },
  { id: "all", title: t, description: t, rule: { kind: "played-all" } },
];

describe("arcade store", () => {
  test("stats accumulate and unlock once", () => {
    const s = emptyState();
    recordStat(s, "bug", "bugs", 2);
    expect(evaluate(s, achievements, ["bug"]).map((a) => a.id)).toEqual([]);
    recordStat(s, "bug", "bugs", 1);
    expect(evaluate(s, achievements, ["bug"]).map((a) => a.id)).toEqual(["hunter"]);
    expect(evaluate(s, achievements, ["bug"])).toEqual([]);
  });

  test("losses across games and played-all", () => {
    const s = emptyState();
    recordStart(s, "a");
    recordEnd(s, "a", 10, false);
    recordStart(s, "b");
    recordEnd(s, "b", 5, false);
    const ids = evaluate(s, achievements, ["a", "b"]).map((a) => a.id);
    expect(ids).toContain("loser");
    expect(ids).toContain("all");
  });

  test("best score and leaderboard order", () => {
    const s = emptyState();
    expect(recordEnd(s, "a", 10, true).newBest).toBe(true);
    expect(recordEnd(s, "a", 4, false).newBest).toBe(false);
    recordEnd(s, "b", 30, true);
    expect(leaderboard(s, ["a", "b", "c"])).toEqual([
      { game: "b", best: 30 },
      { game: "a", best: 10 },
      { game: "c", best: 0 },
    ]);
  });
});
