import { describe, expect, test } from "bun:test";
import type { Difficulty } from "../core/types";
import {
  type Board,
  boardFor,
  createBoard,
  cveFor,
  DIFFICULTY,
  finalScore,
  generate,
  layoutFor,
  liveScore,
  neighbors,
  pentest,
  scan,
  seeded,
  toggleFlag,
} from "./state";

const count = (a: boolean[]) => a.filter(Boolean).length;
const LEVELS: Difficulty[] = ["easy", "normal", "hard"];

/** Plays a perfect run: flags every vuln, scans every safe tile. */
const winRun = (b: Board, seed: number) => {
  const n = b.cols * b.rows;
  scan(b, Math.floor(n / 2), seeded(seed));
  for (let i = 0; i < n; i++) if (b.vuln[i]) toggleFlag(b, i);
  for (let i = 0; i < n && b.status === "playing"; i++) if (!b.vuln[i]) scan(b, i, seeded(seed));
};

describe("difficulty", () => {
  test("table matches the spec for every level and orientation", () => {
    expect(layoutFor("easy", false)).toEqual({ cols: 9, rows: 9, vulns: 10 });
    expect(layoutFor("easy", true)).toEqual({ cols: 9, rows: 9, vulns: 10 });
    expect(layoutFor("normal", false)).toEqual({ cols: 12, rows: 10, vulns: 18 });
    expect(layoutFor("normal", true)).toEqual({ cols: 9, rows: 12, vulns: 14 });
    expect(layoutFor("hard", false)).toEqual({ cols: 16, rows: 12, vulns: 36 });
    expect(layoutFor("hard", true)).toEqual({ cols: 10, rows: 16, vulns: 30 });
  });

  test("density, multiplier and pentest cost rise with difficulty", () => {
    const density = (d: Difficulty) => {
      const L = layoutFor(d, false);
      return L.vulns / (L.cols * L.rows);
    };
    expect(density("easy")).toBeLessThan(density("normal"));
    expect(density("normal")).toBeLessThan(density("hard"));
    expect(DIFFICULTY.easy.mult).toBeLessThan(DIFFICULTY.normal.mult);
    expect(DIFFICULTY.normal.mult).toBeLessThan(DIFFICULTY.hard.mult);
    expect(DIFFICULTY.easy.assistCost).toBeLessThan(DIFFICULTY.hard.assistCost);
  });

  for (const d of LEVELS)
    for (const portrait of [false, true]) {
      test(`${d}/${portrait ? "tall" : "wide"}: scripted runs reach gameover and win`, () => {
        const L = layoutFor(d, portrait);
        const lose = boardFor(d, portrait);
        expect(lose.vuln.length).toBe(L.cols * L.rows);
        scan(lose, 0, seeded(9));
        expect(count(lose.vuln)).toBe(L.vulns);
        const v = lose.vuln.indexOf(true);
        expect(scan(lose, v, seeded(9))).toEqual([v]);
        expect(lose.status).toBe("lost");

        const win = boardFor(d, portrait);
        winRun(win, 4);
        expect(win.status).toBe("won");
        expect(liveScore(win)).toBe(Math.round((L.cols * L.rows - L.vulns) * 10 * DIFFICULTY[d].mult));
      });
    }
});

describe("generation", () => {
  test("places exactly the requested vulnerabilities, deterministic per seed", () => {
    for (const d of LEVELS) {
      const L = layoutFor(d, false);
      const a = createBoard(L.cols, L.rows, L.vulns);
      const b = createBoard(L.cols, L.rows, L.vulns);
      generate(a, 0, seeded(7));
      generate(b, 0, seeded(7));
      expect(count(a.vuln)).toBe(L.vulns);
      expect(a.vuln).toEqual(b.vuln);
    }
  });

  test("adjacency counts match vulnerabilities", () => {
    const b = createBoard(12, 10, 18);
    generate(b, 50, seeded(3));
    for (let i = 0; i < 120; i++) expect(b.adj[i]).toBe(neighbors(b, i).filter((j) => b.vuln[j]).length);
  });

  test("injected rng controls placement", () => {
    const b = createBoard(4, 4, 3);
    generate(b, 15, () => 0); // Fisher-Yates with rng 0 keeps pool order
    expect(b.vuln.slice(0, 4)).toEqual([true, true, true, false]);
  });
});

describe("first scan", () => {
  test("is always safe and opens an area, on every level", () => {
    for (const d of LEVELS)
      for (let seed = 1; seed <= 100; seed++) {
        const b = boardFor(d, seed % 2 === 0);
        const n = b.cols * b.rows;
        const i = (seed * 7) % n;
        const out = scan(b, i, seeded(seed));
        expect(b.status).not.toBe("lost");
        expect(b.vuln[i]).toBe(false);
        expect(b.adj[i]).toBe(0);
        for (const j of neighbors(b, i)) expect(b.vuln[j]).toBe(false);
        expect(out.length).toBeGreaterThan(neighbors(b, i).length);
      }
  });
});

describe("flood fill", () => {
  test("zero cells expand to their numbered border, never into vulnerabilities", () => {
    const b = createBoard(5, 5, 1);
    generate(b, 0, () => 0.9999); // last pool cell = index 24
    expect(b.vuln[24]).toBe(true);
    const out = scan(b, 0, seeded(1));
    expect(out.length).toBe(24);
    expect(b.scanned[24]).toBe(false);
    expect(b.status).toBe("won");
  });

  test("numbered cell only reveals itself; flags block flood", () => {
    const b = createBoard(5, 5, 1);
    generate(b, 0, () => 0.9999);
    toggleFlag(b, 2);
    expect(scan(b, 18, seeded(1))).toEqual([18]); // adjacent to 24
    const out = scan(b, 0, seeded(1));
    expect(out).not.toContain(2);
    expect(b.flagged[2]).toBe(true);
    expect(b.status).toBe("playing");
  });
});

describe("rules", () => {
  test("flags toggle, cannot flag scanned cells", () => {
    const b = createBoard(5, 5, 1);
    generate(b, 0, () => 0.9999);
    expect(toggleFlag(b, 24)).toBe(true);
    expect(b.flags).toBe(1);
    expect(scan(b, 24, seeded(1))).toEqual([]); // flagged cells cannot be scanned
    toggleFlag(b, 24);
    expect(b.flags).toBe(0);
    scan(b, 18, seeded(1));
    expect(toggleFlag(b, 18)).toBe(false);
  });

  test("scripted run reaches gameover on exploit", () => {
    const b = createBoard(12, 10, 18);
    scan(b, 0, seeded(11));
    const v = b.vuln.indexOf(true);
    expect(scan(b, v, seeded(11))).toEqual([v]);
    expect(b.status).toBe("lost");
    expect(b.exploit).toBe(v);
    expect(scan(b, 5, seeded(11))).toEqual([]);
  });

  test("scripted run reaches win; score floors and flag bonus", () => {
    const b = createBoard(9, 12, 14);
    winRun(b, 5);
    expect(b.status).toBe("won");
    expect(liveScore(b)).toBe(94 * 10);
    expect(finalScore(b, 30)).toBe(10000 - 600 + 14 * 100);
    expect(finalScore(b, 9999)).toBe(1000 + 1400);
  });

  test("hard multiplies the final score", () => {
    const b = boardFor("hard", false);
    winRun(b, 2);
    expect(finalScore(b, 30)).toBe(Math.round((10000 - 600 + 36 * 100) * 2.5));
  });
});

describe("pentest assist", () => {
  test("no-op before the first scan", () => {
    const b = boardFor("normal", false);
    expect(pentest(b, seeded(1))).toEqual([]);
    expect(b.assistUsed).toBe(false);
    expect(b.penalty).toBe(0);
  });

  test("reveals a safe tile once, never a vuln, and costs points", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const b = boardFor("hard", false);
      scan(b, 0, seeded(seed));
      if (b.status !== "playing") continue;
      const before = liveScore(b) + b.penalty;
      const out = pentest(b, seeded(seed + 1000));
      expect(out.length).toBeGreaterThan(0);
      for (const i of out) expect(b.vuln[i]).toBe(false);
      expect(b.status).not.toBe("lost");
      expect(b.assistUsed).toBe(true);
      expect(b.penalty).toBe(DIFFICULTY.hard.assistCost);
      expect(liveScore(b)).toBe(Math.max(0, before + Math.round(out.length * 10 * b.mult) - b.penalty));
      expect(pentest(b, seeded(seed))).toEqual([]);
      expect(b.penalty).toBe(DIFFICULTY.hard.assistCost);
    }
  });

  test("prefers the scanned frontier", () => {
    const b = boardFor("normal", false);
    scan(b, 60, seeded(3));
    const [first] = pentest(b, seeded(8));
    expect(neighbors(b, first).some((j) => b.scanned[j] && j !== first)).toBe(true);
  });

  test("ignores flagged tiles and can finish a win", () => {
    const b = boardFor("easy", false);
    const n = b.cols * b.rows;
    scan(b, 40, seeded(6));
    for (let i = 0; i < n; i++) if (b.vuln[i]) toggleFlag(b, i);
    // Scan all but one safe tile, then let pentest finish it.
    const remaining = () => b.scanned.map((s, i) => (!s && !b.vuln[i] ? i : -1)).filter((i) => i >= 0);
    while (remaining().length > 1) scan(b, remaining()[0], seeded(6));
    if (b.status === "playing") {
      const last = remaining()[0];
      expect(pentest(b, seeded(1))).toEqual([last]);
    }
    expect(b.status).toBe("won");
    expect(finalScore(b, 10)).toBe(10000 - 200 + 1000 - DIFFICULTY.easy.assistCost);
  });

  test("score never goes negative", () => {
    const b = createBoard(5, 5, 1, 1, 5000);
    generate(b, 0, () => 0.9999);
    toggleFlag(b, 2);
    scan(b, 18, seeded(1));
    pentest(b, seeded(1));
    expect(liveScore(b)).toBe(0);
  });
});

describe("cve flavor", () => {
  test("fictional id format and plausible CVSS, deterministic", () => {
    for (let s = 1; s <= 200; s++) {
      const c = cveFor(seeded(s));
      expect(c.id).toMatch(/^CVE-2026-[A-Z]{2}\d{3}$/);
      const v = Number(c.cvss);
      expect(v).toBeGreaterThanOrEqual(7);
      expect(v).toBeLessThanOrEqual(10);
      expect(c.cvss).toMatch(/^\d{1,2}\.\d$/);
    }
    expect(cveFor(seeded(5))).toEqual(cveFor(seeded(5)));
  });
});

describe("input boundaries and terminal states", () => {
  test("a flagged first click leaves generation deferred until a safe scan", () => {
    const b = boardFor("normal", false);
    toggleFlag(b, 0);
    expect(scan(b, 0, seeded(1))).toEqual([]);
    expect(b.status).toBe("ready");
    expect(count(b.vuln)).toBe(0);
    scan(b, 70, seeded(2));
    expect(b.vuln[70]).toBe(false);
    expect(b.adj[70]).toBe(0);
    expect(count(b.vuln)).toBe(18);
  });

  test("invalid indices never change the board", () => {
    const b = boardFor("easy", false);
    const before = structuredClone(b);
    for (const i of [-1, b.vuln.length, 0.5, NaN]) {
      expect(scan(b, i, seeded(1))).toEqual([]);
      expect(toggleFlag(b, i)).toBe(false);
    }
    expect(b).toEqual(before);
  });

  for (const end of ["won", "lost"] as const)
    test(`${end} blocks all subsequent actions`, () => {
      const b = boardFor("normal", false);
      if (end === "won") winRun(b, 5);
      else {
        scan(b, 0, seeded(5));
        scan(b, b.vuln.indexOf(true), seeded(5));
      }
      const before = structuredClone(b);
      for (let i = 0; i < b.vuln.length; i++) {
        expect(scan(b, i, seeded(1))).toEqual([]);
        expect(toggleFlag(b, i)).toBe(false);
      }
      expect(pentest(b, seeded(1))).toEqual([]);
      expect(b).toEqual(before);
    });
});
