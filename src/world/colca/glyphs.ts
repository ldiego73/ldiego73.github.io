/**
 * The Nazca geoglyphs as simplified line drawings: each figure is a few polylines in a unit frame (x right,
 * y "up the drawing", about −1..1), traced after the real figures' silhouettes on the Nazca pampa (the
 * hummingbird with its long beak and comb-feathered wings, the monkey with its spiral tail and four- and
 * five-fingered hands, the spider with its long extended leg, the condor with spread wings, the "astronaut"
 * owl-man waving from a hillside). Pure data + a few curve helpers (tested in glyphs.test.ts); the ambient
 * lays them on the ground as ribbons.
 */
import type { L } from "../contract";

export type V2 = [number, number];
export type GlyphId = "colibri" | "mono" | "arana" | "condor" | "astronauta";

export interface Glyph {
  id: GlyphId;
  name: L;
  /** One line about the real figure (text mode, panel). */
  real: L;
  lines: V2[][];
}

/** Closed circle as a polyline (first point repeated at the end). */
export function circle(cx: number, cy: number, r: number, n = 14): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

/** Ellipse as a closed polyline. */
export function ellipse(cx: number, cy: number, rx: number, ry: number, n = 18): V2[] {
  return circle(0, 0, 1, n).map(([x, y]) => [cx + x * rx, cy + y * ry]);
}

/** Inward spiral (the monkey's tail): from radius r0 at angle a0, `turns` turns down to radius r1. */
export function spiral(cx: number, cy: number, r0: number, r1: number, a0: number, turns: number, n = 60): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const a = a0 - k * turns * Math.PI * 2;
    const r = r0 + (r1 - r0) * k;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

const mirror = (pts: V2[]): V2[] => pts.map(([x, y]) => [-x, y]);

/** Comb of fingers between two points on a hand (a zigzag of n fingers of length len pointing (dx, dy)). */
function fingers(ax: number, ay: number, bx: number, by: number, n: number, dx: number, dy: number): V2[] {
  const out: V2[] = [[ax, ay]];
  for (let i = 0; i < n; i++) {
    const k0 = (i + 0.15) / n;
    const k1 = (i + 0.5) / n;
    const k2 = (i + 0.85) / n;
    out.push([ax + (bx - ax) * k0, ay + (by - ay) * k0]);
    out.push([ax + (bx - ax) * k1 + dx, ay + (by - ay) * k1 + dy]);
    out.push([ax + (bx - ax) * k2, ay + (by - ay) * k2]);
  }
  out.push([bx, by]);
  return out;
}

function colibri(): V2[][] {
  const body: V2[] = [
    [-0.06, 0.42],
    [-0.1, 0.2],
    [-0.09, -0.12],
    [-0.05, -0.34],
    [0.05, -0.34],
    [0.09, -0.12],
    [0.1, 0.2],
    [0.06, 0.42],
  ];
  const tail: V2[] = [
    [-0.05, -0.34],
    [-0.17, -0.72],
    [-0.09, -0.6],
    [-0.06, -0.8],
    [0, -0.63],
    [0.06, -0.8],
    [0.09, -0.6],
    [0.17, -0.72],
    [0.05, -0.34],
  ];
  const wing: V2[] = [
    [-0.1, 0.22],
    [-0.94, 0.14],
    [-0.92, 0.01],
    [-0.8, 0.04],
    [-0.82, -0.08],
    [-0.68, -0.04],
    [-0.7, -0.17],
    [-0.54, -0.1],
    [-0.55, -0.23],
    [-0.4, -0.14],
    [-0.09, 0.02],
  ];
  return [
    [
      [0, 1],
      [0, 0.55],
    ],
    circle(0, 0.48, 0.075, 12),
    body,
    tail,
    wing,
    mirror(wing),
  ];
}

function mono(): V2[][] {
  const body: V2[] = [
    [-0.38, 0.32],
    [-0.08, 0.3],
    [0.14, 0.12],
    [0.2, -0.14],
    [0.06, -0.3],
    [-0.2, -0.26],
    [-0.33, -0.02],
    [-0.38, 0.32],
  ];
  const armL: V2[] = [
    [-0.38, 0.3],
    [-0.66, 0.44],
    [-0.76, 0.66],
  ];
  const handL = fingers(-0.84, 0.68, -0.64, 0.7, 4, 0.0, 0.17);
  const armR: V2[] = [
    [-0.08, 0.3],
    [0.14, 0.52],
    [0.24, 0.66],
  ];
  const handR = fingers(0.14, 0.68, 0.38, 0.7, 5, 0.02, 0.16);
  const legL: V2[] = [
    [-0.2, -0.26],
    [-0.34, -0.54],
    [-0.48, -0.6],
  ];
  const legR: V2[] = [
    [0.04, -0.3],
    [0.02, -0.6],
    [0.14, -0.68],
  ];
  const tail: V2[] = [[0.2, -0.14], [0.42, -0.14], ...spiral(0.62, -0.44, 0.3, 0.035, Math.PI * 0.62, 2.6)];
  return [circle(-0.34, 0.47, 0.13, 12), body, armL, handL, armR, handR, legL, legR, tail];
}

function arana(): V2[][] {
  const out: V2[][] = [
    ellipse(0, -0.2, 0.22, 0.32),
    ellipse(0, 0.3, 0.14, 0.17),
    [
      [0, 0.12],
      [0, 0.13],
    ],
  ];
  // Four legs a side: the front pairs reach forward (up), the back pairs backward.
  const legs: Array<[number, V2, V2]> = [
    [0.4, [0.42, 0.66], [0.56, 0.98]],
    [0.33, [0.5, 0.44], [0.82, 0.62]],
    [0.26, [0.5, 0.1], [0.84, -0.06]],
    [0.2, [0.4, -0.18], [0.6, -0.58]],
  ];
  for (const [y, knee, foot] of legs) {
    const leg: V2[] = [[0.12, y], knee, foot];
    out.push(leg, mirror(leg));
  }
  // The famous extended third leg on the right, reaching far out and ending in a small hook.
  out.push([
    [0.84, -0.06],
    [1.0, -0.14],
    [1.02, -0.22],
    [0.96, -0.2],
  ]);
  return out;
}

function condor(): V2[][] {
  const body: V2[] = [
    [-0.08, 0.58],
    [-0.16, 0.34],
    [-0.18, 0.0],
    [-0.12, -0.3],
    [0.12, -0.3],
    [0.18, 0.0],
    [0.16, 0.34],
    [0.08, 0.58],
  ];
  const wing: V2[] = [
    [-0.16, 0.34],
    [-0.98, 0.42],
    [-1.0, 0.3],
    [-0.88, 0.32],
    [-0.94, 0.2],
    [-0.82, 0.22],
    [-0.88, 0.1],
    [-0.74, 0.12],
    [-0.7, 0.02],
    [-0.18, 0.04],
  ];
  const tail: V2[] = [
    [-0.12, -0.3],
    [-0.24, -0.72],
    [-0.12, -0.62],
    [0, -0.78],
    [0.12, -0.62],
    [0.24, -0.72],
    [0.12, -0.3],
  ];
  const leg: V2[] = [
    [-0.1, -0.2],
    [-0.3, -0.42],
    [-0.36, -0.36],
    [-0.3, -0.42],
    [-0.34, -0.5],
  ];
  return [
    circle(0, 0.66, 0.08, 12),
    [
      [0.04, 0.72],
      [0.16, 0.8],
    ],
    body,
    wing,
    mirror(wing),
    tail,
    leg,
    mirror(leg),
  ];
}

function astronauta(): V2[][] {
  const body: V2[] = [
    [-0.2, 0.32],
    [-0.24, -0.3],
    [0.24, -0.3],
    [0.2, 0.32],
    [-0.2, 0.32],
  ];
  return [
    circle(0, 0.56, 0.22, 16),
    circle(-0.085, 0.6, 0.06, 8),
    circle(0.085, 0.6, 0.06, 8),
    body,
    [
      [0.2, 0.24],
      [0.46, 0.34],
      [0.52, 0.62],
      [0.46, 0.66],
      [0.56, 0.7],
      [0.6, 0.64],
      [0.52, 0.62],
    ],
    [
      [-0.2, 0.24],
      [-0.42, 0.04],
      [-0.46, -0.16],
    ],
    [
      [-0.12, -0.3],
      [-0.16, -0.8],
      [-0.32, -0.84],
    ],
    [
      [0.12, -0.3],
      [0.16, -0.8],
      [0.32, -0.84],
    ],
  ];
}

export const GLYPHS: Record<GlyphId, Glyph> = {
  colibri: {
    id: "colibri",
    name: { es: "Colibrí", en: "Hummingbird" },
    real: {
      es: "En Nasca mide unos 96 metros: pico largo, alas con plumas en peine y cola en abanico.",
      en: "At Nazca it is about 96 metres long: a long beak, comb-feathered wings and a fanned tail.",
    },
    lines: colibri(),
  },
  mono: {
    id: "mono",
    name: { es: "Mono", en: "Monkey" },
    real: {
      es: "Unos 93 metros, trazado de un solo trazo: manos de cuatro y cinco dedos y la cola en espiral.",
      en: "About 93 metres, drawn in a single line: hands with four and five fingers and a spiral tail.",
    },
    lines: mono(),
  },
  arana: {
    id: "arana",
    name: { es: "Araña", en: "Spider" },
    real: {
      es: "Unos 46 metros, con una pata alargada a un lado.",
      en: "About 46 metres, with one long, extended leg on one side.",
    },
    lines: arana(),
  },
  condor: {
    id: "condor",
    name: { es: "Cóndor", en: "Condor" },
    real: {
      es: "Unos 136 metros de punta a punta, con las alas abiertas y la cola en abanico.",
      en: "About 136 metres from end to end, wings spread and tail fanned.",
    },
    lines: condor(),
  },
  astronauta: {
    id: "astronauta",
    name: { es: "Astronauta", en: "Astronaut" },
    real: {
      es: "Unos 32 metros, en la ladera de un cerro: una figura de cabeza redonda y ojos grandes que saluda; también lo llaman hombre búho.",
      en: "About 32 metres, on a hillside: a round-headed, big-eyed figure waving; it is also called the owl-man.",
    },
    lines: astronauta(),
  },
};

/** Bounding box of a glyph's lines (unit frame). */
export function glyphBounds(g: Glyph): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const line of g.lines)
    for (const [x, y] of line) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return { x0, y0, x1, y1 };
}
