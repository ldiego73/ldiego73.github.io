/**
 * Kené: the line designs of the Shipibo-Konibo people of the Ucayali (declared cultural heritage of Peru in
 * 2008), painted on cloth, ceramics, wood and skin. In their tradition the designs come from the skin of Ronin,
 * the cosmic anaconda. This module generates a kené-like design procedurally (pure: no DOM, no three.js);
 * kene/model.ts strokes it into canvas textures. It follows what makes kené read as kené, without copying any
 * one piece:
 *
 *   - a bold "skeleton" ("thick"): stair-stepped lozenges on an offset lattice, each with a small cross at its
 *     centre, linked tip to tip by straight bars that cross where four lozenges meet, so the bold line runs on
 *     as one labyrinth;
 *   - fine lines ("thin") that echo the bold ones at a fixed spacing until they meet the echoes of a
 *     neighbour, so the whole field is filled with parallel lines. They are the contours of the Manhattan
 *     distance to the skeleton on a cell grid (cell edges between distance k and k + 1), which is what makes
 *     them follow every stair and corner of the bold line;
 *   - a small square where echoes close in on a point ("dots").
 *
 * Everything is computed on a cols × rows torus, so a field whose size is a multiple of PERIOD wraps seamlessly
 * round a pole or a jar. The lattice and the lozenge are mirror symmetric (kené is drawn with mirror symmetry).
 * Units are cells; points are cell coordinates (a cell's centre is at i + 0.5).
 */

export type Pt = [number, number];
export type Polyline = Pt[];

export interface KeneDesign {
  /** Width and height of the field in cells. */
  cols: number;
  rows: number;
  /** Bold polylines through cell centres; they may run past the field's edges (draw them wrapped). */
  thick: Polyline[];
  /** Fine unit segments on cell edges, inside the field (already wrapped). */
  thin: Array<[Pt, Pt]>;
  /** Centres of small filled squares. */
  dots: Pt[];
}

/** Horizontal (and vertical) repeat of the lattice, in cells. */
export const PERIOD = 16;
const HALF = PERIOD / 2;
/** L1 radius (cells) of a lozenge's stair outline. */
const RING = 5;
/** 4-neighbourhood: Manhattan contours of a stair are stairs, of a bar are straight lines. */
const STEPS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Small seeded PRNG (mulberry32), so a seed always gives the same design. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Cells (relative to the lozenge centre) of a closed, 4-connected stair ring of L1 radius r, clockwise from the
 * top tip: right one, down one, … to the right tip, then mirrored round. Mirror symmetric in x and y.
 */
export function stairRing(r: number): Pt[] {
  const ne: Pt[] = [[0, -r]];
  let x = 0;
  let y = -r;
  for (let k = 0; k < r; k++) {
    x++;
    ne.push([x, y]);
    y++;
    ne.push([x, y]);
  }
  // ne runs from the top tip (0, −r) to the right tip (r, 0); mirror it down to the bottom tip, then left.
  const se = ne
    .slice(0, -1)
    .reverse()
    .map(([a, b]): Pt => [a, -b]);
  const right = [...ne, ...se];
  const left = right
    .slice(1, -1)
    .reverse()
    .map(([a, b]): Pt => [-a, b]);
  return [...right, ...left];
}

export interface KeneOptions {
  /** Width in cells (a multiple of PERIOD wraps seamlessly). */
  cols: number;
  /** Height in cells (a multiple of PERIOD wraps seamlessly). */
  rows: number;
  seed?: number;
  /** How many fine echo lines may run beside a bold line (default 3). */
  echoes?: number;
  /** Bars linking the lozenges into one labyrinth (default: by seed, usually on). */
  bars?: boolean;
}

/** The kené design for a cols × rows field. */
export function keneDesign(o: KeneOptions): KeneDesign {
  const { cols, rows } = o;
  const rand = prng(o.seed ?? 1);
  const echoes = o.echoes ?? 3;
  // Variation by seed: bars between lozenges (labyrinth) or free-standing lozenges; a centre cross or a
  // centre square.
  const bars = o.bars ?? rand() < 0.8;
  const cross = rand() < 0.7;
  const bold = new Uint8Array(cols * rows);
  const wrap = (i: number, n: number) => ((i % n) + n) % n;
  const mark = (x: number, y: number) => {
    bold[wrap(y, rows) * cols + wrap(x, cols)] = 1;
  };
  const thick: Polyline[] = [];
  const dots: Pt[] = [];
  const line = (cells: Pt[], closed = false) => {
    for (const [x, y] of cells) mark(x, y);
    const pl = cells.map(([x, y]) => [x + 0.5, y + 0.5] as Pt);
    if (closed && pl[0]) pl.push([...pl[0]] as Pt);
    thick.push(pl);
  };
  const ring = stairRing(RING);
  // Lattice: rows of lozenges every HALF cells, odd rows shifted by HALF (centres at cell indices).
  for (let cy = 0; cy < rows; cy += HALF) {
    const shift = (cy / HALF) % 2 === 0 ? 0 : HALF;
    for (let cx = shift; cx < cols; cx += PERIOD) {
      line(
        ring.map(([x, y]) => [cx + x, cy + y]),
        true,
      );
      if (cross) {
        line([
          [cx - 1, cy],
          [cx, cy],
          [cx + 1, cy],
        ]);
        line([
          [cx, cy - 1],
          [cx, cy + 1],
        ]);
      } else {
        mark(cx, cy);
        dots.push([cx + 0.5, cy + 0.5]);
      }
      if (bars) {
        // Bar from the right tip to the next lozenge's left tip, and a crossing bar between the tips of the
        // lozenges above and below that point (they meet in a "+").
        const bx: Pt[] = [];
        for (let x = cx + RING; x <= cx + PERIOD - RING; x++) bx.push([x, cy]);
        line(bx);
        const by: Pt[] = [];
        for (let y = cy - HALF + RING; y <= cy + HALF - RING; y++) by.push([cx + HALF, y]);
        line(by);
      }
    }
  }

  // Manhattan distance to the skeleton on the torus (multi-source BFS, 4 neighbours).
  const dist = new Int16Array(cols * rows).fill(-1);
  let queue: number[] = [];
  for (let i = 0; i < bold.length; i++)
    if (bold[i]) {
      dist[i] = 0;
      queue.push(i);
    }
  while (queue.length) {
    const next: number[] = [];
    for (const i of queue) {
      const x = i % cols;
      const y = (i - x) / cols;
      const d = (dist[i] as number) + 1;
      for (const [dx, dy] of STEPS) {
        const j = wrap(y + dy, rows) * cols + wrap(x + dx, cols);
        if (dist[j] === -1) {
          dist[j] = d;
          next.push(j);
        }
      }
    }
    queue = next;
  }

  // Fine lines: cell edges where the distance steps from k to k + 1 (1 ≤ k ≤ echoes).
  const thin: Array<[Pt, Pt]> = [];
  const level = (d: number) => d >= 1 && d <= echoes;
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++) {
      const a = dist[y * cols + x] as number;
      const r = dist[y * cols + wrap(x + 1, cols)] as number;
      const b = dist[wrap(y + 1, rows) * cols + x] as number;
      if (a !== r && level(Math.min(a, r)))
        thin.push([
          [x + 1, y],
          [x + 1, y + 1],
        ]);
      if (a !== b && level(Math.min(a, b)))
        thin.push([
          [x, y + 1],
          [x + 1, y + 1],
        ]);
      // A point where the echoes close in (a local maximum past the last echo): a small dot.
      if (a > echoes + 1) {
        let peak = true;
        for (let dy = -1; dy <= 1 && peak; dy++)
          for (let dx = -1; dx <= 1; dx++)
            if ((dist[wrap(y + dy, rows) * cols + wrap(x + dx, cols)] as number) > a) {
              peak = false;
              break;
            }
        if (peak) dots.push([x + 0.5, y + 0.5]);
      }
    }
  return { cols, rows, thick, thin, dots };
}
