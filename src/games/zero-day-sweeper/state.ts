/** Pure rules for Zero-Day Sweeper. No DOM, no three. Deterministic with an injected RNG. */

import type { Difficulty } from "../core/types";

export type Rng = () => number;
export type Status = "ready" | "playing" | "lost" | "won";

export interface Layout {
  cols: number;
  rows: number;
  vulns: number;
}

export interface Board extends Layout {
  /** true where a vulnerability sits (empty until the first scan). */
  vuln: boolean[];
  /** Adjacent vulnerability count per cell. */
  adj: number[];
  scanned: boolean[];
  flagged: boolean[];
  status: Status;
  scannedSafe: number;
  flags: number;
  /** Cell that triggered the exploit, or -1. */
  exploit: number;
  /** Points per scanned tile and final-score multiplier. */
  mult: number;
  /** One-time Pentest assist: whether it was used and what it costs. */
  assistUsed: boolean;
  assistCost: number;
  /** Points deducted so far (the Pentest cost once used). */
  penalty: number;
}

/**
 * Difficulty table: board size and density per orientation, score multiplier
 * and Pentest cost. `wide` for landscape screens, `tall` for portrait.
 */
export const DIFFICULTY: Record<Difficulty, { wide: Layout; tall: Layout; mult: number; assistCost: number }> = {
  easy: { wide: { cols: 9, rows: 9, vulns: 10 }, tall: { cols: 9, rows: 9, vulns: 10 }, mult: 1, assistCost: 300 },
  normal: {
    wide: { cols: 12, rows: 10, vulns: 18 },
    tall: { cols: 9, rows: 12, vulns: 14 },
    mult: 1.5,
    assistCost: 500,
  },
  hard: {
    wide: { cols: 16, rows: 12, vulns: 36 },
    tall: { cols: 10, rows: 16, vulns: 30 },
    mult: 2.5,
    assistCost: 900,
  },
};

export const layoutFor = (d: Difficulty, portrait: boolean): Layout => DIFFICULTY[d][portrait ? "tall" : "wide"];

export function createBoard(cols: number, rows: number, vulns: number, mult = 1, assistCost = 500): Board {
  const n = cols * rows;
  return {
    cols,
    rows,
    vulns,
    vuln: new Array(n).fill(false),
    adj: new Array(n).fill(0),
    scanned: new Array(n).fill(false),
    flagged: new Array(n).fill(false),
    status: "ready",
    scannedSafe: 0,
    flags: 0,
    exploit: -1,
    mult,
    assistUsed: false,
    assistCost,
    penalty: 0,
  };
}

export function boardFor(d: Difficulty, portrait: boolean): Board {
  const L = layoutFor(d, portrait);
  return createBoard(L.cols, L.rows, L.vulns, DIFFICULTY[d].mult, DIFFICULTY[d].assistCost);
}

export function neighbors(b: Board, i: number): number[] {
  const c = i % b.cols;
  const r = (i - c) / b.cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const cc = c + dc;
      const rr = r + dr;
      if (cc >= 0 && rr >= 0 && cc < b.cols && rr < b.rows) out.push(rr * b.cols + cc);
    }
  return out;
}

/** Places vulnerabilities away from `safe` and its neighbors (so the first scan opens an area). */
export function generate(b: Board, safe: number, rng: Rng): void {
  const n = b.cols * b.rows;
  const keep = new Set([safe, ...neighbors(b, safe)]);
  // Small boards: fall back to excluding only the clicked cell.
  if (n - keep.size < b.vulns) {
    keep.clear();
    keep.add(safe);
  }
  const pool: number[] = [];
  for (let i = 0; i < n; i++) if (!keep.has(i)) pool.push(i);
  for (let k = 0; k < b.vulns && pool.length; k++) {
    const j = k + Math.floor(rng() * (pool.length - k));
    [pool[k], pool[j]] = [pool[j], pool[k]];
    b.vuln[pool[k]] = true;
  }
  for (let i = 0; i < n; i++) b.adj[i] = neighbors(b, i).filter((j) => b.vuln[j]).length;
  b.status = "playing";
}

export const safeTotal = (b: Board) => b.cols * b.rows - b.vulns;

/**
 * Scans a cell. Returns the newly scanned cells in flood order (empty if nothing happened).
 * Hitting a vulnerability sets status "lost"; clearing every safe cell sets "won".
 */
export function scan(b: Board, i: number, rng: Rng): number[] {
  if (!Number.isInteger(i) || i < 0 || i >= b.vuln.length) return [];
  if (b.status === "lost" || b.status === "won" || b.scanned[i] || b.flagged[i]) return [];
  if (b.status === "ready") generate(b, i, rng);
  if (b.vuln[i]) {
    b.scanned[i] = true;
    b.exploit = i;
    b.status = "lost";
    return [i];
  }
  const out: number[] = [];
  const queue = [i];
  b.scanned[i] = true;
  while (queue.length) {
    const k = queue.shift() as number;
    out.push(k);
    if (b.adj[k] !== 0) continue;
    for (const j of neighbors(b, k)) {
      if (b.scanned[j] || b.flagged[j] || b.vuln[j]) continue;
      b.scanned[j] = true;
      queue.push(j);
    }
  }
  b.scannedSafe += out.length;
  if (b.scannedSafe === safeTotal(b)) b.status = "won";
  return out;
}

/** Toggles a CVE flag on an unscanned cell. Returns true if something changed. */
export function toggleFlag(b: Board, i: number): boolean {
  if (!Number.isInteger(i) || i < 0 || i >= b.vuln.length) return false;
  if (b.status === "lost" || b.status === "won" || b.scanned[i]) return false;
  b.flagged[i] = !b.flagged[i];
  b.flags += b.flagged[i] ? 1 : -1;
  return true;
}

/**
 * One-time Pentest assist: scans a guaranteed-safe tile, preferring tiles on the scanned frontier
 * (the useful ones). Only after the first scan. Costs `assistCost` points.
 * Returns the scanned cells (empty when unavailable).
 */
export function pentest(b: Board, rng: Rng): number[] {
  if (b.status !== "playing" || b.assistUsed) return [];
  const safe: number[] = [];
  const frontier: number[] = [];
  for (let i = 0; i < b.vuln.length; i++) {
    if (b.vuln[i] || b.scanned[i] || b.flagged[i]) continue;
    safe.push(i);
    if (neighbors(b, i).some((j) => b.scanned[j])) frontier.push(i);
  }
  const pool = frontier.length ? frontier : safe;
  if (!pool.length) return [];
  b.assistUsed = true;
  b.penalty += b.assistCost;
  return scan(b, pool[Math.floor(rng() * pool.length)], rng);
}

export const correctFlags = (b: Board) => b.flagged.filter((f, i) => f && b.vuln[i]).length;

export const liveScore = (b: Board) => Math.max(0, Math.round(b.scannedSafe * 10 * b.mult) - b.penalty);

export function finalScore(b: Board, seconds: number): number {
  const base = Math.max(1000, 10000 - Math.floor(seconds) * 20) + 100 * correctFlags(b);
  return Math.max(0, Math.round(base * b.mult) - b.penalty);
}

/**
 * Fictional CVE flavor for the exploit that ended the run. The suffix mixes letters
 * (real CVE ids are numeric only), so it can never collide with a real advisory.
 */
export function cveFor(rng: Rng): { id: string; cvss: string } {
  const L = "ZXQKVJ";
  const id = `CVE-2026-${L[Math.floor(rng() * L.length)]}${L[Math.floor(rng() * L.length)]}${String(Math.floor(rng() * 1000)).padStart(3, "0")}`;
  const cvss = (7 + Math.floor(rng() * 31) / 10).toFixed(1);
  return { id, cvss };
}

/** Small seeded RNG (mulberry32) for tests and the idle demo board. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
