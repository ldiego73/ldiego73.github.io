/**
 * Plan of the Kuntisuyu world (the Colca canyon and the Nazca pampa): pure numbers and tables shared by the
 * layout, the scenery, the ambients, the map and the text mode. No three.js, no DOM (lib/passport.ts imports
 * the station table, so this file must stay light).
 *
 * World frame: +x east, −z north (the mountain's convention), y up. Yaw: models face +Z, facing +X is π/2.
 *
 *              hills ─────────────────────────────────────────── north
 *      Cahuachi ·      Nazca pampa (y ≈ −24): the geoglyphs round the mirador tower
 *               ╲            ╱
 *        climb  ╲          ╱ descent
 *   Cruz del     ╲  rim plateau (y ≈ 2): village, colcas cliff, the road along the rim  ← punku (Cusco)
 *   Cóndor ●──────────────────────────────────────────────────── north rim of the canyon (s = 0)
 *                 andenes (terraces) ↘   river (s = 150, y ≈ −172)   ↙ andenes
 *                                    south rim (s = 300) ── volcanoes (Mismi, Sabancaya)
 *
 * The road (ROAD_CTRL, a Catmull-Rom spline) starts at the punku at the east end of the rim, runs west along
 * the canyon's north rim past the village and the colcas cliff, turns north and goes down onto the pampa past
 * the mirador and Cahuachi, then climbs back south-west to the rim and ends at the Cruz del Cóndor viewpoint.
 * Real geography is compressed: the Colca and Nazca are ~300 km apart; here one road joins them.
 *
 * Canyon coordinates: `s = z − rimZ(x)` is the distance south of the north rim line; the profile (layout.ts
 * canyonY) is a function of s with CANYON numbers below.
 */
import type { L } from "../contract";
import type { SuyuStation } from "../suyu/contract";

export type P2 = readonly [number, number];

/** Half size of the walkable heightfield square (the canyon mesh and the backdrop reach further). */
export const HALF = 600;
/** Half width of the road band (same as the jungle's). */
export const ROAD_HALF = 2.6;

/** North rim line of the canyon: z of the rim edge at x (the canyon lies south of it, +z). */
export function rimZ(x: number): number {
  // Past the walkable square the canyon bends away south, so its far ends never show as a cut.
  const bend = 0.0016 * Math.max(0, Math.abs(x) - 650) ** 2;
  return 22 + 16 * Math.sin(x / 170 + 0.7) + 7 * Math.sin(x / 61 + 2) + bend;
}

/** Canyon cross-section (distances in s from the north rim, heights in world y). */
export const CANYON = {
  /** Plateau height at the rim (the profile starts from the plateau height there). */
  rimY: 2,
  /** A sheer rock lip below each rim (so the traveler on the rim sees down past it), then the terraces. */
  cliffEnd: 16,
  cliffDrop: 30,
  /** North side: terraces below the cliff (wide treads, low stone walls), then the steep lower wall. */
  terraceEnd: 80,
  terraceDrop: 36,
  /** Foot of the steep lower wall. */
  wallFoot: 122,
  /** South side (facing the road): wider, gentler terraces, then its own rock lip under the south rim. */
  southTerraces: 78,
  southDrop: 46,
  /** River centre, its half width and its surface height. */
  river: 150,
  riverHalf: 7,
  riverY: -172,
  /** South rim (s) and its height; the south side rises to it with its own terraces. */
  south: 300,
  southY: 12,
} as const;

/** Distance south of the north rim (canyon coordinate). */
export const canyonS = (x: number, z: number) => z - rimZ(x);

/** The pampa: everything north of PAMPA.z1 is the low desert (eased in between PAMPA.z0 and PAMPA.z1). */
export const PAMPA = { z0: -110, z1: -195, y: -24 } as const;

/** Where the road passes the mirador on the pampa (the tower itself is TOWER, placed from the road below). */
const NAZCA_ANCHOR: P2 = [-238, -262];

/** The colcas: a crag rising north of the road on the rim; the granaries sit on its south face. */
export const CRAG = { x: 112, r: 34, h: 22 } as const;

/** Village plaza centre offset north of the road at x (the church faces south over the plaza to the road). */
export const VILLAGE = { x: 312, off: 24 } as const;

/** How far north of the rim line the rim stretch of the road runs. */
export const RIM_ROAD = 8;
/** The colcas' cliff foot: a line 16 u north of the road at the crag. */
export const CRAG_LINE_Z = rimZ(CRAG.x) - RIM_ROAD - 16;

const R = (x: number, dz = -RIM_ROAD): P2 => [x, rimZ(x) + dz];

/**
 * Road control points, punku (t 0) → Cruz del Cóndor (t 1). The rim stretch keeps 8 u north of the rim line
 * (the canyon right beside it); the pampa loop passes the tower ~9 u from its frame.
 */
export const ROAD_CTRL: ReadonlyArray<P2> = [
  R(452),
  R(410),
  R(360),
  R(310),
  R(260),
  R(210),
  R(160),
  R(110),
  R(60),
  R(10),
  R(-36, -18),
  [-80, -24],
  [-112, -70],
  [-136, -130],
  [-164, -190],
  [-204, -238],
  [-252, -280],
  [-306, -308],
  [-362, -314],
  [-414, -282],
  [-446, -220],
  [-462, -152],
  [-470, -84],
  R(-472, -38),
  R(-474, -20),
];

// ---------------------------------------------------------------- pure road sampler (no three.js)

function cr(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/** Uniform Catmull-Rom through ROAD_CTRL, densely sampled, then resampled at equal arc length (~1 u). */
function sampleRoad(ctrl: ReadonlyArray<P2>): { pts: P2[]; length: number } {
  const dense: P2[] = [];
  const n = ctrl.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)] as P2;
    const p1 = ctrl[i] as P2;
    const p2 = ctrl[i + 1] as P2;
    const p3 = ctrl[Math.min(n - 1, i + 2)] as P2;
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      dense.push([cr(p0[0], p1[0], p2[0], p3[0], t), cr(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  dense.push(ctrl[n - 1] as P2);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1] as P2;
    const b = dense[i] as P2;
    cum.push((cum[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const length = cum[cum.length - 1] as number;
  const count = Math.ceil(length);
  const pts: P2[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const d = (k / count) * length;
    while (j < dense.length - 2 && (cum[j + 1] as number) < d) j++;
    const a = dense[j] as P2;
    const b = dense[j + 1] as P2;
    const span = (cum[j + 1] as number) - (cum[j] as number) || 1;
    const u = (d - (cum[j] as number)) / span;
    pts.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return { pts, length };
}

/** The road centreline, resampled every ~1 u (index / (pts.length − 1) = t). */
export const ROAD = sampleRoad(ROAD_CTRL);

/** Point on the road at t (linear between samples). */
export function roadAt(t: number): { x: number; z: number; dx: number; dz: number } {
  const pts = ROAD.pts;
  const k = Math.max(0, Math.min(1, t)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(k));
  const a = pts[i] as P2;
  const b = pts[i + 1] as P2;
  const u = k - i;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, dx: (b[0] - a[0]) / len, dz: (b[1] - a[1]) / len };
}

/** Nearest road t of a point (brute force over the samples: fine for the plan's few lookups and tests). */
export function roadT(x: number, z: number): number {
  const pts = ROAD.pts;
  let best = Infinity;
  let bi = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i] as P2;
    const d = (p[0] - x) ** 2 + (p[1] - z) ** 2;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  return bi / (pts.length - 1);
}

/** Point `off` u to the side of the road at t (side +1 = right of the walking direction). */
export function roadSide(t: number, side: -1 | 1, off: number): { x: number; z: number } {
  const r = roadAt(t);
  // Right of (dx, dz) in this frame (x east, z south) is (−dz, dx).
  return { x: r.x - r.dz * side * off, z: r.z + r.dx * side * off };
}

// ---------------------------------------------------------------- stations

/** t of the stations (by anchors in the world, so moving a control point keeps them in place). */
export const STATION_T = {
  punku: 0,
  pueblo: roadT(VILLAGE.x, rimZ(VILLAGE.x) - RIM_ROAD),
  colcas: roadT(CRAG.x, rimZ(CRAG.x) - RIM_ROAD),
  nazca: roadT(NAZCA_ANCHOR[0], NAZCA_ANCHOR[1]),
  cahuachi: roadT(-418, -300),
  cruz: 1,
} as const;

/**
 * Where each station's plaza sits relative to the road: side (+1 right of the walking direction, which on
 * the rim heading west is north), offset from the centreline and radius.
 */
export const STATION_SPOT: Record<keyof typeof STATION_T, { side: -1 | 1; off: number; r: number }> = {
  punku: { side: 1, off: 0, r: 4 },
  pueblo: { side: 1, off: VILLAGE.off, r: 14 },
  colcas: { side: 1, off: 9.5, r: 6.5 },
  nazca: { side: 1, off: 9, r: 5.5 },
  cahuachi: { side: -1, off: 16, r: 6 },
  cruz: { side: 1, off: 0, r: 8.5 },
};

/**
 * The mirador tower on the pampa: a 7 × 7 frame (half 3.5) with a deck TOWER.top up, beyond the lookout's
 * plaza (road → plaza → tower). Frame yaw (../decks.ts obox convention): local +x points away from the road,
 * so the stair starts on the tower's local −x face, toward the plaza.
 */
export const TOWER = (() => {
  const t = STATION_T.nazca;
  const r = roadAt(t);
  const off = STATION_SPOT.nazca.off + STATION_SPOT.nazca.r + 3.6;
  const p = roadSide(t, 1, off);
  const nx = -r.dz;
  const nz = r.dx;
  return { x: p.x, z: p.z, yaw: Math.atan2(-nz, nx), half: 3.5, top: 14 } as const;
})();

/**
 * Stations of the Kuntisuyu road. Passport: `colca:station:<id>`; the village, the colcas, the Nazca mirador
 * and the Cruz del Cóndor are required (kind "station"), Cahuachi is a bonus find ("egg"), the punku stamps
 * nothing. The finale (ambient/cruz.ts) also stamps `colca:summit`.
 */
export const COLCA_STATIONS: ReadonlyArray<SuyuStation> = [
  {
    id: "punku",
    kind: "gate",
    t: STATION_T.punku,
    side: 1,
    offset: 0,
    label: { es: "Punku · camino a Qusqu", en: "Punku · road to Qusqu" },
    stamp: false,
  },
  {
    id: "pueblo",
    kind: "village",
    t: STATION_T.pueblo,
    side: 1,
    offset: STATION_SPOT.pueblo.off,
    label: { es: "Pueblo collagua · iglesia y plaza", en: "Collagua village · church and plaza" },
  },
  {
    id: "colcas",
    kind: "colcas",
    t: STATION_T.colcas,
    side: 1,
    offset: STATION_SPOT.colcas.off,
    label: { es: "Colcas · los logros de cada etapa", en: "Colcas · the achievements of each stage" },
  },
  {
    id: "nazca",
    kind: "mirador",
    t: STATION_T.nazca,
    side: 1,
    offset: STATION_SPOT.nazca.off,
    label: { es: "Mirador de Nasca · los artefactos", en: "Nazca lookout · the artifacts" },
  },
  {
    id: "cahuachi",
    kind: "pyramid",
    t: STATION_T.cahuachi,
    side: -1,
    offset: STATION_SPOT.cahuachi.off,
    label: { es: "Cahuachi · pirámide de adobe", en: "Cahuachi · adobe pyramid" },
    stamp: "egg",
  },
  {
    id: "cruz",
    kind: "finale",
    t: STATION_T.cruz,
    side: 1,
    offset: 0,
    label: { es: "Cruz del Cóndor · mirador", en: "Cruz del Cóndor · viewpoint" },
  },
];

/** The finale's own stamp (ambient/cruz.ts). */
export const SUMMIT_STAMP = "colca:summit";

/** Bonus wildlife stamps (`colca:fauna:<id>`), in field-guide order. */
export const FAUNA: ReadonlyArray<{ id: string; label: L }> = [
  { id: "condor", label: { es: "Cóndor andino", en: "Andean condor" } },
  { id: "vicuna", label: { es: "Vicuña", en: "Vicuña" } },
  { id: "vizcacha", label: { es: "Vizcacha", en: "Viscacha" } },
  { id: "picaflor", label: { es: "Picaflor gigante", en: "Giant hummingbird" } },
  { id: "zorro", label: { es: "Zorro andino", en: "Andean fox" } },
];

/** Arrival from the punku: this far down the road, facing along it (out of the punku's prompt). */
export const ARRIVE_T = 10 / ROAD.length;
