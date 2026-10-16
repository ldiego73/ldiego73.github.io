/**
 * Pure helpers for the Antisuyu community (no DOM, no three.js): who is out at what hour, how many people a
 * device gets, the boats' far-half river lane, the jump arc and swim loop of the children at the river, the
 * cast net's timeline, the stretches of road the travellers use and where a traveller out of sight comes back
 * into play, when a walker on the road gives way to the traveler, and the greetings. Unit-tested.
 */
import type { L } from "../../../contract";

/** Is `time` (0..1, 0.25 sunrise, 0.75 sunset) within the [from, to] window (wrapping past midnight)? */
export function within(time: number, from: number, to: number) {
  const t = ((time % 1) + 1) % 1;
  return from <= to ? t >= from && t <= to : t >= from || t <= to;
}

/** Hours of each activity (fractions of the day). Children play in the middle of the day, like the mountain. */
export const HOURS = {
  play: [0.3, 0.7] as const,
  swim: [0.32, 0.68] as const,
  craft: [0.28, 0.72] as const,
  road: [0.27, 0.74] as const,
  fish: [0.26, 0.7] as const,
  boat: [0.27, 0.73] as const,
  /** The elder's evening fire outside the maloca. */
  fire: [0.76, 0.18] as const,
};
export type Activity = keyof typeof HOURS;
export const isOut = (a: Activity, time: number) => within(time, HOURS[a][0], HOURS[a][1]);

/**
 * People per group: phones and the low tier get fewer (the crowd is one instanced mesh per part either way).
 *  - walkers: travellers on the road (parties of one to three, ./road.ts ROAD_PARTIES);
 *  - raftPlayers / raftKids / raftWatcher: on the floating arcade (./raft.ts);
 *  - finale: the gathering in the kené totem's clearing at the end of the road (./finale.ts).
 */
export function headcount(quality: "low" | "high", phone: boolean) {
  const base = { boat: true, fisher: true };
  if (phone)
    return {
      ...base,
      plazaKids: 3,
      swimmers: 2,
      walkers: 5,
      crafts: 2,
      raftPlayers: 1,
      raftKids: 1,
      raftWatcher: false,
      finale: 4,
    };
  if (quality === "low")
    return {
      ...base,
      plazaKids: 4,
      swimmers: 2,
      walkers: 5,
      crafts: 3,
      raftPlayers: 1,
      raftKids: 1,
      raftWatcher: false,
      finale: 4,
    };
  return {
    ...base,
    plazaKids: 5,
    swimmers: 3,
    walkers: 9,
    crafts: 3,
    raftPlayers: 2,
    raftKids: 1,
    raftWatcher: true,
    finale: 7,
  };
}

// ---------------------------------------------------------------- river lane

export type P2 = readonly [number, number];

/**
 * The boats' lane on the far half of the river (away from the road), so they never share the near half with
 * the canoe ride's landings. For each centerline point the offset toward the far bank starts at `frac`·half
 * width and steps back toward (and, only if it must, past) the centerline until `ok` accepts the point (open
 * water, no sandbar), then the lane is smoothed (moving average) so the boats do not zigzag.
 *  - `pts`, `halfWidth`: the river (layout.river);
 *  - `roadDist(x, z)`: distance to the road, to tell the far side from the near one.
 */
export function riverLane(
  pts: ReadonlyArray<P2>,
  halfWidth: ReadonlyArray<number>,
  roadDist: (x: number, z: number) => number,
  ok: (x: number, z: number) => boolean,
  frac = 0.5,
): P2[] {
  const raw: Array<[number, number]> = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)] as P2;
    const b = pts[Math.min(pts.length - 1, i + 1)] as P2;
    const c = pts[i] as P2;
    let nx = b[1] - a[1];
    let nz = -(b[0] - a[0]);
    const l = Math.hypot(nx, nz) || 1;
    nx /= l;
    nz /= l;
    // Point away from the road.
    if (roadDist(c[0] + nx, c[1] + nz) < roadDist(c[0] - nx, c[1] - nz)) {
      nx = -nx;
      nz = -nz;
    }
    const w = halfWidth[i] ?? 10;
    let placed: [number, number] = [c[0], c[1]];
    // Far side first; past the centerline only where the far side is blocked (a sandbar, the swimmers).
    for (let k = frac; k >= -0.45; k -= 0.1) {
      const x = c[0] + nx * w * k;
      const z = c[1] + nz * w * k;
      if (ok(x, z)) {
        placed = [x, z];
        break;
      }
    }
    raw.push(placed);
  }
  const out: P2[] = [];
  for (let i = 0; i < raw.length; i++) {
    let sx = 0;
    let sz = 0;
    let n = 0;
    for (let k = -2; k <= 2; k++) {
      const p = raw[i + k];
      if (!p) continue;
      sx += p[0];
      sz += p[1];
      n++;
    }
    out.push([sx / n, sz / n]);
  }
  return out;
}

// ---------------------------------------------------------------- swimming

/** Point on a jump: from (a) to (b) in a parabola peaking `peak` above the straight line, u 0..1. */
export function jumpArc(
  u: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  peak: number,
  out: { x: number; y: number; z: number },
) {
  const k = Math.max(0, Math.min(1, u));
  out.x = ax + (bx - ax) * k;
  out.z = az + (bz - az) * k;
  out.y = ay + (by - ay) * k + peak * 4 * k * (1 - k);
  return out;
}

/**
 * The swim loop of one child at the river, as stages with their durations (s): walk out along the log,
 * wait on the tip, jump, under (a moment below the surface), swim back to the bank, climb up to the log base.
 * `walk` and `swim` durations come from the distances; the rest are fixed.
 */
export type SwimStage = "log" | "tip" | "jump" | "under" | "swim" | "climb" | "wait";
export const SWIM_TIMES = { tip: 1.1, jump: 0.75, under: 0.45 } as const;
export const SWIM_SPEED = { log: 0.9, swim: 0.85, climb: 0.8 } as const;

export function nextStage(s: SwimStage): SwimStage {
  switch (s) {
    case "wait":
      return "log";
    case "log":
      return "tip";
    case "tip":
      return "jump";
    case "jump":
      return "under";
    case "under":
      return "swim";
    case "swim":
      return "climb";
    default:
      return "wait";
  }
}

// ---------------------------------------------------------------- the cast net

export type CastStage = "coil" | "swing" | "fly" | "sink" | "haul" | "rest";
/** Stage durations (s) of one cast of the tarrafa. */
export const CAST: ReadonlyArray<readonly [CastStage, number]> = [
  ["coil", 2.6],
  ["swing", 0.9],
  ["fly", 0.8],
  ["sink", 2.2],
  ["haul", 3.2],
  ["rest", 3.5],
];
export const CAST_CYCLE = CAST.reduce((s, [, d]) => s + d, 0);

/** Where in the cast a clock time falls: the stage and its progress u 0..1. */
export function castAt(clock: number): { stage: CastStage; u: number } {
  let t = ((clock % CAST_CYCLE) + CAST_CYCLE) % CAST_CYCLE;
  for (const [stage, d] of CAST) {
    if (t < d) return { stage, u: t / d };
    t -= d;
  }
  return { stage: "rest", u: 1 };
}

/**
 * The net's shape for a cast stage: `open` 0 (a bundle in the hands) … 1 (a full disc), `out` 0 (at the hand)
 * … 1 (at the landing spot), `lift` above the water while flying, `sink` below the surface.
 */
export function netShape(stage: CastStage, u: number) {
  switch (stage) {
    case "fly":
      return {
        open: 0.25 + 0.75 * Math.sin((u * Math.PI) / 2),
        out: u,
        lift: 1.3 * 4 * u * (1 - u) + 1.4 * (1 - u),
        sink: 0,
      };
    case "sink":
      return { open: 1, out: 1, lift: 0, sink: Math.min(1, u * 1.5) };
    case "haul":
      return { open: 1 - u * 0.85, out: 1 - u, lift: u * 1.0, sink: (1 - u) * 0.6 };
    default:
      return { open: 0.12, out: 0, lift: 0, sink: 0 };
  }
}

// ---------------------------------------------------------------- the road

/**
 * A walker gives way when the traveler is close in front (within `ahead` units along the walking direction
 * and `wide` across it) or simply very close; they keep standing aside until the traveler is `clear` away.
 */
export function shouldGiveWay(
  px: number,
  pz: number,
  dx: number,
  dz: number,
  ax: number,
  az: number,
  yielding: boolean,
  ahead = 6,
  wide = 2.4,
  clear = 3.6,
): boolean {
  const rx = ax - px;
  const rz = az - pz;
  const d = Math.hypot(rx, rz);
  if (yielding) return d < clear;
  if (d < 2.2) return true;
  const along = rx * dx + rz * dz;
  const across = Math.abs(rx * -dz + rz * dx);
  return along > 0 && along < ahead && across < wide;
}

/**
 * Stretches of road (t) the travellers walk: the whole road except the first steps by the punku, the canopy
 * walkway (CANOPY_T 0.83–0.9: hanging bridges, no room to pass) and the last steps before the totem's
 * clearing. A traveller reaching the end of a stretch stops a moment and turns back.
 */
export const ROAD_SPANS: ReadonlyArray<readonly [number, number]> = [
  [0.04, 0.82],
  [0.905, 0.99],
];

/**
 * The road's parties, in order of appearance (each a few people walking together):
 *  couple (bananas + basket) · mother with a basket and her child · a man alone with a bunch ·
 *  couple · two young men (one with a bunch). A device's walkers take the first parties that fit.
 */
export const PARTIES: ReadonlyArray<ReadonlyArray<"man" | "woman" | "child" | "youth">> = [
  ["man", "woman"],
  ["woman", "child"],
  ["man"],
  ["woman", "man"],
  ["youth", "youth"],
];
/** The parties for `n` walkers (whole parties only, in order). */
export function partiesFor(n: number) {
  const out: Array<ReadonlyArray<"man" | "woman" | "child" | "youth">> = [];
  let left = n;
  for (const p of PARTIES) {
    if (p.length > left) break;
    out.push(p);
    left -= p.length;
  }
  return out;
}

/** Index of the stretch holding t, or −1 (on the canopy walkway or past an end). */
export function spanAt(t: number): number {
  return ROAD_SPANS.findIndex(([a, b]) => t >= a && t <= b);
}

/**
 * Has a traveller walking `dir` at `t` reached the end of its stretch? `span` is the stretch it walks
 * (spanAt when it was placed).
 */
export function atSpanEnd(t: number, dir: 1 | -1, span: number): boolean {
  const s = ROAD_SPANS[span] ?? ROAD_SPANS[0];
  if (!s) return false;
  return dir === 1 ? t >= s[1] : t <= s[0];
}

/**
 * Where a traveller who has drifted far out of sight comes back into play: a road t `gap` (in t units, just
 * past the people's view distance) ahead (`side` +1, toward the totem) or behind (−1) the traveler. When that
 * falls on the canopy walkway it moves on to the far end of the walkway (still further from the traveler);
 * past either end of the road it tries the other side. null when neither side has room (it then stays put).
 * The traveller then walks toward the traveler (`dir` = −side), so the road ahead fills with people coming
 * the other way and, behind, the ones overtaken stay out of sight.
 */
export function respawnT(avatarT: number, gap: number, side: 1 | -1): { t: number; span: number; dir: 1 | -1 } | null {
  for (const s of [side, -side as 1 | -1]) {
    let t = avatarT + s * gap;
    if (spanAt(t) < 0) {
      // Inside a gap between stretches: jump to the far edge of that gap (away from the traveler).
      for (let i = 0; i + 1 < ROAD_SPANS.length; i++) {
        const a = (ROAD_SPANS[i] as readonly [number, number])[1];
        const b = (ROAD_SPANS[i + 1] as readonly [number, number])[0];
        if (t > a && t < b) t = s === 1 ? b : a;
      }
    }
    const span = spanAt(t);
    if (span >= 0) return { t, span, dir: s === 1 ? -1 : 1 };
  }
  return null;
}

/**
 * Lateral offset of a walker going `dir` (+1 east / −1 west), measured along the road's side +1 normal
 * (−tangent.z, tangent.x), which is on the right hand when walking east: everyone keeps to their right.
 */
export const laneOf = (dir: 1 | -1, k = 0) => dir * (0.9 + k * 0.6);
/** Where a walker stands aside: near the edge of the road on their right (the road's half width is 2.6). */
export const asideOf = (dir: 1 | -1) => dir * 2.15;

// ---------------------------------------------------------------- greetings (generic, about the place)

export type Role = "weaver" | "potter" | "elder" | "walker" | "fire" | "painter" | "traveller" | "camp";
export const GREET: Record<Role, L[]> = {
  weaver: [
    {
      es: "¡Buenas, caminante! Tejo en telar de cintura: la tela se tensa con mi propio cuerpo.",
      en: "Hello, traveler! I weave on a backstrap loom: my own body keeps the warp tight.",
    },
    {
      es: "Este kené lo aprendí de mi abuela. Cada diseño es distinto.",
      en: "I learned this kené from my grandmother. No two designs are the same.",
    },
  ],
  potter: [
    {
      es: "¡Buenas! Pinto el kené en las vasijas con un pincel muy fino, a pulso.",
      en: "Hello! I paint the kené on the pots freehand, with a very fine brush.",
    },
    {
      es: "El barro lo sacamos de la orilla del río, cuando baja el agua.",
      en: "We dig the clay from the riverbank when the water goes down.",
    },
  ],
  elder: [
    {
      es: "Siéntate un rato, caminante. El río trae y lleva de todo, hasta las noticias.",
      en: "Sit a while, traveler. The river brings and takes everything, even the news.",
    },
    {
      es: "Con la creciente el río sube hasta los horcones de las casas; por eso son palafitos.",
      en: "In the flood season the river rises to the house posts; that is why they stand on stilts.",
    },
  ],
  walker: [
    {
      es: "¡Buenas! Llevamos plátanos al embarcadero. Buen camino.",
      en: "Hello! We're taking plantains to the landing. Safe travels.",
    },
    {
      es: "¡Pase nomás! El camino es de todos.",
      en: "Go ahead! The road belongs to everyone.",
    },
  ],
  fire: [
    {
      es: "Ya es de noche y los niños duermen. Escucha: la selva no se calla nunca.",
      en: "It's night and the children are asleep. Listen: the forest is never quiet.",
    },
  ],
  painter: [
    {
      es: "Pintamos el kené en la tela con tinte de huito y barro. Se pinta de memoria, sin borrador.",
      en: "We paint the kené on the cloth with huito dye and mud. It is painted from memory, with no sketch.",
    },
    {
      es: "Cada línea del kené se une con otra: es un camino que no se corta.",
      en: "Every kené line joins another: it is a path that never breaks.",
    },
  ],
  traveller: [
    {
      es: "Vamos al pueblo de río arriba; descansamos aquí antes de seguir.",
      en: "We're headed to the village upriver; we're resting here before going on.",
    },
    {
      es: "¡Llegaste al final del camino! Siéntate, que el sol pica.",
      en: "You made it to the end of the road! Sit down, the sun is fierce.",
    },
  ],
  camp: [
    {
      es: "De noche no se camina por la selva. Mañana temprano seguimos.",
      en: "Nobody walks the forest at night. We'll go on early tomorrow.",
    },
  ],
};

/** The n-th greeting of a role (cycles). */
export const greeting = (role: Role, n: number): L => {
  const list = GREET[role];
  return list[((n % list.length) + list.length) % list.length] as L;
};
