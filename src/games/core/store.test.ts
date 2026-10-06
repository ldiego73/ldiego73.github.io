import { describe, expect, test } from "bun:test";
import {
  activeSkin,
  arcadeUnlockedCount,
  CHULLO_AT,
  chulloUnlocked,
  emptyState,
  evaluate,
  grantWorldPassport,
  leaderboard,
  load,
  recordEnd,
  recordStart,
  recordStat,
  save,
  setSkin,
  WALKER_ID,
  WORLD_GAME,
} from "./store";
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

describe("cross rewards", () => {
  const walker: Achievement = {
    id: WALKER_ID,
    title: t,
    description: t,
    rule: { kind: "stat", game: WORLD_GAME, key: "passport", gte: 1 },
  };
  test("world passport unlocks the walker once, without touching losses or played-all", () => {
    const s = emptyState();
    expect(grantWorldPassport(s)).toBe(true);
    expect(grantWorldPassport(s)).toBe(false);
    expect(evaluate(s, [walker, ...achievements], ["bug"]).map((a) => a.id)).toEqual([WALKER_ID]);
    expect(s.games.world?.losses).toBe(0);
  });
  test("chullo counts arcade achievements but not the walker", () => {
    const s = emptyState();
    const ids = [WALKER_ID, "a", "b", "c", "d", "e", "f"];
    for (const id of ids.slice(0, 6)) s.unlocked[id] = 1;
    expect(arcadeUnlockedCount(s, ids)).toBe(5);
    expect(chulloUnlocked(s, ids)).toBe(false);
    s.unlocked.f = 1;
    expect(chulloUnlocked(s, ids)).toBe(true);
    expect(CHULLO_AT).toBe(6);
  });
  test("skin only applies once unlocked and survives a save/load round trip", () => {
    const mem = new Map<string, string>();
    const g = globalThis as unknown as { localStorage?: unknown };
    const prev = g.localStorage;
    g.localStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
    };
    try {
      const s = emptyState();
      setSkin(s, "aguayo");
      expect(activeSkin(s)).toBe("neon");
      s.unlocked[WALKER_ID] = 1;
      setSkin(s, "aguayo");
      expect(activeSkin(s)).toBe("aguayo");
      save(s);
      expect(load().skin).toBe("aguayo");
      // Older saves (no skin) and junk values load as the default.
      mem.set("ldiego73-arcade-v1", JSON.stringify({ games: {}, unlocked: {} }));
      expect(load()).toEqual({ games: {}, unlocked: {} });
      mem.set("ldiego73-arcade-v1", JSON.stringify({ games: {}, unlocked: {}, skin: "gold" }));
      expect(load().skin).toBeUndefined();
    } finally {
      g.localStorage = prev;
    }
  });
});
