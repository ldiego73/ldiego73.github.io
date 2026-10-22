/**
 * Parametric bird: one numbers-only description (`BirdPlan`) → skeleton and pieces of a bird in the
 * continuous-surface construction.
 *
 *   body     torso, breast, neck (three bones along a curve, an S for herons), head, upper bill on the head and
 *            the lower bill on the jaw bone (hard union between them, so the bill opens cleanly), the tail fan
 *            as a few flattened feathers on the tail bone; feather ruffle = small high-frequency lumps on the
 *            field (the jagged rim of plumage in silhouette)
 *   wings    TWO versions on separate bones, shown one at a time by bone scale (an animator trick that keeps a
 *            perched bird's folded wing tidy and a flying bird's wing a clean airfoil):
 *              open   a lofted airfoil (span rows × chord ring) skinned to arm → fore → hand (→ tip for the
 *                     fingered primaries of condors), with scalloped trailing feathers and painted coverts
 *              folded a soft tear-drop along each flank on a `fold` bone (coverts in front, primaries behind)
 *   legs     a separate fine piece (thin tarsi need a finer voxel): feathered thigh, bare tarsus, toes (webbed
 *            as a paddle for ducks, penguins, pelicans, cormorants)
 *
 * Conventions: faces +Z, left is +X, origin at the feet, units ≈ metres; all LEFT-side points.
 * Pure (no DOM, no Three).
 */
import type { FaceMap, GridPiece, Pick } from "../build";
import { grid } from "../loft";
import type { Prim, Vec3 } from "../sdf";
import { type Coat, Kit, lerp3, norm3, quad3, SMOOTH } from "./kit";
import { eyeDecal, onEllipsoid } from "./plan-quad";

/** Canonical bird palette slots (./spec.ts). */
export const B = {
  back: 0,
  head: 1,
  bill: 2,
  legs: 3,
  belly: 4,
  coverts: 5,
  flight: 6,
  tail: 7,
  face: 8,
  collar: 9,
  accent: 10,
  mouth: 11,
  x1: 12,
  x2: 13,
  x3: 14,
  x4: 15,
} as const;

export interface WingPlan {
  /** Shoulder (left) and half span (shoulder → tip, units). */
  shoulder: Vec3;
  span: number;
  /** Chord at the arm, the widest chord (at the wrist) and at the tip. */
  chord: [number, number, number];
  /** Fractions of the span at the elbow and the wrist. */
  elbow: number;
  wrist: number;
  /** Sweep back of the tip (units along −z at the tip). */
  sweep: number;
  /** Thickness at the root (the airfoil thins toward the tip). */
  thick: number;
  /** Fingered primaries (condors): count and length (fraction of span). */
  fingers?: { n: number; len: number };
  /** Trailing-edge scallops (feather tips): count along the span and depth (fraction of chord). */
  notch?: { n: number; k: number };
  /** Upper-surface colour regions by chord fraction: coverts in front of `covert`, flight feathers behind. */
  covert?: number;
  /** An upper patch (the condor's white secondaries): span range, chord fraction from which it starts. */
  patch?: { t0: number; t1: number; from: number; slot: number };
  /** Outer primaries in another colour beyond this span fraction (macaw blue tips, toucan black). */
  tips?: { from: number; slot: number };
  /** Underwing slot (default flight). */
  under?: number;
  /** Flippers (penguins): a stiff paddle, no feathers, no fold. */
  flipper?: boolean;
}

export interface BirdPlan {
  h: number;
  coat: Coat;
  body: { c: Vec3; r: Vec3; pitch?: number };
  breast: { c: Vec3; r: Vec3 };
  neck: { a: Vec3; ctrl: Vec3; b: Vec3; r: [number, number]; coat?: Coat };
  head: { c: Vec3; r: Vec3 };
  bill: {
    /** Base centre of the upper bill and its tip. */
    a: Vec3;
    b: Vec3;
    /** Depth at the base (height), width, and how much the tip hooks down (units). */
    depth: number;
    width: number;
    hook?: number;
    /** Lower bill depth as a share of the upper (0.4 typical; pelicans carry a pouch). */
    lower?: number;
    /** Flat spatula (ducks). */
    flat?: boolean;
    /** Pouch under the lower bill (pelicans). */
    pouch?: number;
    /** Slot of the lower bill (default the bill's). */
    lowerSlot?: number;
    /** Bill colour regions along its length: [t, slot] stops (toucan, guanay tip, flamingo black tip). */
    bands?: Array<[number, number]>;
  };
  eye: { dir: Vec3; w: number };
  wing: WingPlan;
  /** Folded wing on the flank: from near the shoulder back to `back` (z), its half height and thickness. */
  fold: { front: Vec3; back: Vec3; r: [number, number] };
  tail: { base: Vec3; len: number; width: number; pitch?: number; n?: number; slot?: number };
  legs: {
    hip: Vec3;
    ankle: Vec3;
    foot: Vec3;
    r: [number, number];
    toe: number;
    webbed?: boolean;
    /** Feathered thighs reaching the ankle (condor "trousers", tinamous). */
    thigh?: number;
  };
  /** Region slots (defaults: back on the torso, head on head and neck, belly on the breast). */
  slots?: Partial<Record<"body" | "breast" | "neck" | "head", number>>;
  /** Lofted wing resolution (1 = full; the far LODs pass less). */
  res?: number;
  /** Species extras (crest, collar, wattle, casque). */
  extra?: (k: Kit, p: BirdPlan) => void;
}

const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

export function birdKit(p: BirdPlan): Kit {
  const k = new Kit();
  const S = { body: B.back, breast: B.belly, neck: B.head, head: B.head, ...p.slots };
  const n1 = quad3(p.neck.a, p.neck.ctrl, p.neck.b, 1 / 3);
  const n2 = quad3(p.neck.a, p.neck.ctrl, p.neck.b, 2 / 3);
  const w = p.wing;
  const span = (t: number): Vec3 => wingLE(w, t);

  // ---------------------------------------------------------------- skeleton
  k.bone("root", null, [0, 0, 0]);
  k.bone("body", "root", p.body.c);
  k.bone("neck0", "body", p.neck.a);
  k.bone("neck1", "neck0", n1);
  k.bone("neck2", "neck1", n2);
  k.bone("head", "neck2", p.neck.b);
  k.bone("jaw", "head", p.bill.a);
  k.bone("tail", "body", p.tail.base);
  for (const s of ["L", "R"] as const) {
    const m = (v: Vec3) => (s === "L" ? v : mirror(v));
    k.bone(`arm${s}`, "body", m(w.shoulder));
    k.bone(`fore${s}`, `arm${s}`, m(span(w.elbow)));
    k.bone(`hand${s}`, `fore${s}`, m(span(w.wrist)));
    k.bone(`tip${s}`, `hand${s}`, m(span((w.wrist + 1) / 2)));
    // The folded wing collapses to a point inside the body when hidden.
    k.bone(`fold${s}`, "body", m(lerp3(p.fold.front, p.body.c, 0.55)));
    k.bone(`thigh${s}`, "body", m(p.legs.hip));
    k.bone(`shin${s}`, `thigh${s}`, m(p.legs.ankle));
    k.bone(`foot${s}`, `shin${s}`, m(p.legs.foot));
  }

  // ---------------------------------------------------------------- body
  const ruff = p.coat;
  const pitch = p.body.pitch ?? 0;
  const rot = pitch ? rotXm(pitch) : undefined;
  k.add(k.ell(p.body.c, p.body.r, "body", 0, S.body, ruff, rot), "torso");
  k.add(k.ell(p.breast.c, p.breast.r, "body", Math.min(...p.breast.r) * 0.5, S.breast, ruff), "breast");
  const nc = p.neck.coat ?? ruff;
  const [r0, r1] = p.neck.r;
  k.add(k.cone(p.neck.a, n1, r0, lerp(r0, r1, 1 / 3), "neck0", r0 * 0.7, S.neck, nc), "neck");
  k.add(k.cone(n1, n2, lerp(r0, r1, 1 / 3), lerp(r0, r1, 2 / 3), "neck1", r0 * 0.4, S.neck, nc), "neck");
  k.add(k.cone(n2, p.neck.b, lerp(r0, r1, 2 / 3), r1, "neck2", r1 * 0.5, S.neck, nc), "neck");
  k.add(k.ell(p.head.c, p.head.r, "head", Math.min(...p.head.r) * 0.45, S.head, scaleCoat(ruff, 0.6)), "head");

  // ---------------------------------------------------------------- bill (upper on the head, lower on the jaw)
  bill(k, p);

  // ---------------------------------------------------------------- tail fan
  const tn = p.tail.n ?? 5;
  const tp = p.tail.pitch ?? 0;
  for (let i = 0; i < tn; i++) {
    const u = tn > 1 ? i / (tn - 1) - 0.5 : 0;
    const ang = u * 0.7;
    const len = p.tail.len * (1 - Math.abs(u) * 0.25);
    const dir: Vec3 = [Math.sin(ang), -Math.sin(tp), -Math.cos(ang) * Math.cos(tp)];
    const c: Vec3 = [
      p.tail.base[0] + dir[0] * len * 0.5,
      p.tail.base[1] + dir[1] * len * 0.5,
      p.tail.base[2] + dir[2] * len * 0.5,
    ];
    const th = Math.max(p.h * 1.1, p.tail.width * 0.09);
    k.add(
      k.ell(
        c,
        [p.tail.width / (tn * 0.55), th, len * 0.5],
        "tail",
        p.tail.width * 0.12,
        p.tail.slot ?? B.tail,
        SMOOTH,
        rotTo(dir),
      ),
      "tail",
    );
  }

  // ---------------------------------------------------------------- eyes
  const e = onEllipsoid(p.head.c, p.head.r, p.eye.dir);
  k.faces.push(eyeDecal(e.p, e.n, p.eye.w, p.eye.w * 0.4) as FaceMap);

  // ---------------------------------------------------------------- open wings (lofted), folded wings (field)
  for (const s of ["L", "R"] as const) {
    k.extra.push(openWing(k, p, s));
    if (!w.flipper) k.extra.push(foldWing(k, p, s));
  }

  // ---------------------------------------------------------------- legs (own finer piece)
  k.extra.push(legsPiece(k, p));

  // ---------------------------------------------------------------- mouth inside
  const ba = p.bill.a;
  const bb = p.bill.b;
  k.extra.push({
    kind: "field",
    name: "mouth",
    prims: [
      {
        shape: {
          kind: "cone",
          a: lerp3(ba, bb, 0.05),
          b: lerp3(ba, bb, 0.6),
          ra: p.bill.width * 0.32,
          rb: p.bill.width * 0.15,
        },
        bone: k.b("head"),
        blend: 0,
        slot: B.mouth,
      },
    ],
    h: Math.max(p.h * 0.6, p.bill.width * 0.15),
    rigid: k.b("head"),
  });

  p.extra?.(k, p);
  return k;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const scaleCoat = (c: Coat, s: number): Coat => (c.wool ? { wool: c.wool * s, freq: c.freq } : c);

function rotXm(a: number): [number, number, number, number, number, number, number, number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}
function rotYm(a: number): [number, number, number, number, number, number, number, number, number] {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}
type M3 = [number, number, number, number, number, number, number, number, number];
function mulRot(a: M3, b: M3): M3 {
  const o = new Array(9).fill(0) as M3;
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let i = 0; i < 3; i++) s += (a[r * 3 + i] as number) * (b[i * 3 + c] as number);
      o[r * 3 + c] = s;
    }
  return o;
}
/** Rotation taking +z to `d` (yaw then pitch), for oriented ellipsoids along a direction. */
export function rotTo(d: Vec3): M3 {
  const n = norm3(d);
  const yaw = Math.atan2(n[0], n[2]);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, n[1])));
  return mulRot(rotYm(yaw), rotXm(pitch));
}

// ---------------------------------------------------------------- bill

function bill(k: Kit, p: BirdPlan) {
  const bl = p.bill;
  const a = bl.a;
  const b = bl.b;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const hook = bl.hook ?? 0;
  const lower = bl.lower ?? 0.42;
  const upper: number[] = [];
  const low: number[] = [];
  if (bl.flat) {
    // Spatula: a flattened, rounded slab, slightly wider at the tip.
    const c = lerp3(a, b, 0.5);
    upper.push(
      k.add(
        k.ell(
          c,
          [bl.width * 0.5, bl.depth * 0.32, len * 0.55],
          "head",
          bl.depth * 0.3,
          B.bill,
          SMOOTH,
          rotTo([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
        ),
      ),
    );
    low.push(
      k.add(
        k.ell(
          [c[0], c[1] - bl.depth * 0.28, c[2] - len * 0.03],
          [bl.width * 0.42, bl.depth * 0.2, len * 0.5],
          "jaw",
          0,
          B.bill,
          SMOOTH,
          rotTo([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
        ),
      ),
    );
  } else {
    // Upper bill: a tapering cone from the base to near the tip, then the hooked tip curving down.
    const mid = lerp3(a, b, 0.72);
    const tip: Vec3 = [b[0], b[1] - hook, b[2] - hook * 0.35];
    upper.push(
      k.add(
        k.cone(
          [a[0], a[1] + bl.depth * 0.12, a[2]],
          mid,
          bl.depth * 0.5,
          bl.depth * 0.3,
          "head",
          bl.depth * 0.25,
          B.bill,
        ),
      ),
    );
    upper.push(
      k.add(k.cone(mid, tip, bl.depth * 0.3, Math.max(p.h * 0.6, bl.depth * 0.08), "head", bl.depth * 0.12, B.bill)),
    );
    // Lower bill: shorter and shallower, on the jaw (hard union: the gape opens cleanly).
    const la: Vec3 = [a[0], a[1] - bl.depth * 0.28, a[2] - len * 0.02];
    const lb: Vec3 = lerp3(
      [a[0], a[1] - bl.depth * 0.32, a[2]],
      [b[0], b[1] - bl.depth * 0.3 * lower - hook * 0.4, b[2] - hook * 0.4],
      0.88,
    );
    low.push(
      k.add(
        k.cone(
          la,
          lb,
          bl.depth * 0.42 * lower + p.h * 0.3,
          Math.max(p.h * 0.5, bl.depth * 0.08),
          "jaw",
          0,
          bl.lowerSlot ?? B.bill,
        ),
      ),
    );
    if (bl.pouch) {
      low.push(
        k.add(
          k.ell(
            lerp3(la, lb, 0.45),
            [bl.width * 0.42, bl.pouch, len * 0.36],
            "jaw",
            bl.pouch * 0.5,
            B.accent,
            SMOOTH,
            rotTo([b[0] - a[0], b[1] - a[1], b[2] - a[2]]),
          ),
        ),
      );
    }
  }
  if (bl.bands?.length) {
    const ax = norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const stops = bl.bands.slice(1).map((x) => x[0] * len);
    const slots = bl.bands.map((x) => x[1]);
    k.bands.push({
      prims: [...upper, ...low],
      at: (q) => (q[0] - a[0]) * ax[0] + (q[1] - a[1]) * ax[1] + (q[2] - a[2]) * ax[2],
      stops,
      slots,
    });
  }
}

// ---------------------------------------------------------------- wings

/** Leading edge point at span fraction t (shoulder → elbow → wrist → tip, swept back). */
export function wingLE(w: WingPlan, t: number): Vec3 {
  const s = w.shoulder;
  // The arm points out and slightly forward, the hand sweeps back.
  const x = s[0] + w.span * t;
  const fwd = Math.sin(Math.min(1, t / Math.max(1e-3, w.wrist)) * Math.PI) * w.chord[1] * 0.12;
  const back = t > w.wrist ? ((t - w.wrist) / (1 - w.wrist)) ** 1.4 * w.sweep : 0;
  return [x, s[1] + t * w.span * 0.04, s[2] + fwd - back];
}

/** Chord at span fraction t (before scallops). */
export function wingChord(w: WingPlan, t: number) {
  const [c0, c1, c2] = w.chord;
  if (t < w.wrist) {
    const u = t / w.wrist;
    return c0 + (c1 - c0) * Math.sin((u * Math.PI) / 2);
  }
  const u = (t - w.wrist) / (1 - w.wrist);
  // Rounded tip: stays wide, then closes in a quarter ellipse.
  return c2 + (c1 - c2) * Math.sqrt(Math.max(0, 1 - u * u));
}

function openWing(k: Kit, p: BirdPlan, s: "L" | "R"): GridPiece {
  const w = p.wing;
  const res = p.res ?? 1;
  const R = Math.max(8, Math.round(34 * res));
  const C = Math.max(6, Math.round(12 * res));
  const side = s === "L" ? 1 : -1;
  const fingers = w.fingers;
  // With fingers, the airfoil stops at the start of the fingers and the fingers carry the tip.
  const tEnd = fingers ? 1 - fingers.len * 0.6 : 1;
  const nb = (n: string) => k.b(`${n}${s}`);
  const g = grid(
    R,
    C,
    (r, c) => {
      const t = (r / (R - 1)) * tEnd;
      const le = wingLE(w, t);
      let ch = wingChord(w, t);
      if (w.notch && !w.flipper) {
        const f = (t * w.notch.n) % 1;
        ch *= 1 - w.notch.k * (1 - Math.abs(f * 2 - 1)) ** 2;
      }
      if (fingers) ch = Math.max(ch, w.chord[1] * 0.8 * (t > w.wrist ? 1 : 1));
      const a = (c / C) * Math.PI * 2;
      const x = (1 - Math.cos(a)) / 2;
      const th = w.thick * (1 - 0.65 * t) * (r === R - 1 && !fingers ? 0.15 : 1);
      // Cambered airfoil: rounded leading edge, thin trailing edge, a flatter underside.
      const prof = Math.sqrt(Math.max(0, 1 - x)) * (0.35 + 0.65 * Math.sin(Math.min(1, x * 3) * (Math.PI / 2)));
      const y = Math.sin(a) >= 0 ? th * prof : -th * prof * 0.45;
      const closeTip = !fingers && r === R - 1 ? 0.15 : 1;
      const px = le[0];
      const pz = le[2] - ch * x * closeTip;
      return [px * side, le[1] + y + Math.sin(a) * 0, pz];
    },
    { closed: true, flip: s === "R" },
  );
  const cc = C + 1;
  const elbowB = nb("arm");
  const foreB = nb("fore");
  const handB = nb("hand");
  const tipB = nb("tip");
  const tOf = (v: number) => (Math.floor(v / cc) / (R - 1)) * tEnd;
  const xOf = (v: number) => {
    const a = ((v % cc) / C) * Math.PI * 2;
    return { x: (1 - Math.cos(a)) / 2, top: Math.sin(a) >= -1e-6 };
  };
  const tipStart = (w.wrist + 1) / 2;
  const piece: GridPiece = {
    kind: "grid",
    name: `wing${s}`,
    grid: g,
    layer: "body",
    skin: (_q, v) => wingSkin(tOf(v), w, elbowB, foreB, handB, tipB, tipStart),
    paint: (_q, v) => {
      const t = tOf(v);
      const { x, top } = xOf(v);
      const under = w.under ?? B.flight;
      if (!top) return [under, under, 1];
      // Upper surface: coverts in front, flight feathers behind; a patch and coloured tips where set.
      let back: number = B.flight;
      if (w.tips && t > w.tips.from) back = w.tips.slot;
      const cov = w.covert ?? 0.45;
      if (w.patch && t > w.patch.t0 && t < w.patch.t1) {
        return [B.coverts, w.patch.slot, x - w.patch.from];
      }
      return [B.coverts, back, x - cov];
    },
  };
  if (!fingers) return piece;
  // Fingered primaries: separate flattened feathers fanning out from the hand (merged into the wing grid).
  const parts = [g];
  const n = fingers.n;
  const t0 = tEnd;
  const base = wingLE(w, t0);
  const ch = w.chord[1] * 0.8;
  for (let i = 0; i < n; i++) {
    const u = n > 1 ? i / (n - 1) : 0;
    const startZ = base[2] - ch * (0.05 + u * 0.75);
    const start: Vec3 = [base[0] - ch * 0.05, base[1], startZ];
    const len = w.span * fingers.len * (1.05 - Math.abs(u - 0.25) * 0.45);
    const ang = 0.1 - u * 0.7;
    const end: Vec3 = [
      start[0] + Math.cos(ang) * len,
      start[1] + len * 0.02,
      start[2] + Math.sin(ang) * len - w.sweep * 0.2,
    ];
    const rows = Math.max(3, Math.round(7 * res));
    const cols = Math.max(4, Math.round(8 * res));
    const fw = ch * 0.11;
    const fg = grid(
      rows,
      cols,
      (r, c) => {
        const t = r / (rows - 1);
        const q = lerp3(start, end, t);
        const a = (c / cols) * Math.PI * 2;
        const rad = fw * (1 - t * 0.55) * (r === rows - 1 ? 0.2 : 1);
        const thick = w.thick * 0.35 * (1 - t * 0.6);
        // Flat in the wing plane: width across (perpendicular to the feather in xz), thin in y.
        const dx = end[0] - start[0];
        const dz = end[2] - start[2];
        const l = Math.hypot(dx, dz) || 1;
        const px = -dz / l;
        const pz = dx / l;
        return [
          (q[0] + px * Math.cos(a) * rad) * side,
          q[1] + Math.sin(a) * thick + t * t * 0.0,
          q[2] + pz * Math.cos(a) * rad,
        ];
      },
      { closed: true, flip: s === "R" },
    );
    parts.push(fg);
  }
  const joined = join(parts);
  const fingerFrom = g.positions.length / 3;
  return {
    ...piece,
    grid: joined,
    skin: (q, v) => (v < fingerFrom ? piece.skin(q, v) : [[tipB, 1]]),
    paint: (q, v) =>
      v < fingerFrom
        ? (piece.paint as (q: Vec3, v: number) => [number, number, number])(q, v)
        : [B.flight, B.flight, 1],
  };
}

function wingSkin(
  t: number,
  w: WingPlan,
  arm: number,
  fore: number,
  hand: number,
  tip: number,
  tipStart: number,
): Pick {
  const blend = (x: number, e: number, width: number) => Math.min(1, Math.max(0, (x - (e - width)) / (2 * width)));
  const a = blend(t, w.elbow, 0.06);
  const b = blend(t, w.wrist, 0.06);
  const c = blend(t, tipStart, 0.08);
  return [
    [arm, 1 - a],
    [fore, a * (1 - b)],
    [hand, b * (1 - c)],
    [tip, c],
  ];
}

function join(list: ReturnType<typeof grid>[]) {
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.positions.length / 3;
    ni += g.indices.length;
  }
  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const uvs = new Float32Array(nv * 2);
  const indices = new Uint32Array(ni);
  let v = 0;
  let i = 0;
  for (const g of list) {
    positions.set(g.positions, v * 3);
    normals.set(g.normals, v * 3);
    uvs.set(g.uvs, v * 2);
    for (let j = 0; j < g.indices.length; j++) indices[i + j] = (g.indices[j] as number) + v;
    v += g.positions.length / 3;
    i += g.indices.length;
  }
  return { positions, normals, uvs, indices, rows: 0, cols: 0 };
}

function foldWing(k: Kit, p: BirdPlan, s: "L" | "R") {
  const m = (v: Vec3) => (s === "L" ? v : mirror(v));
  const bone = k.b(`fold${s}`);
  const f = p.fold;
  const [hh, th] = f.r;
  const mid = lerp3(f.front, f.back, 0.4);
  const prims: Prim[] = [
    {
      shape: {
        kind: "ellipsoid",
        c: m(mid),
        r: [th, hh, Math.hypot(f.back[2] - f.front[2], f.back[1] - f.front[1]) * 0.42],
        rot: rotTo([0, f.back[1] - f.front[1], f.back[2] - f.front[2]]),
      },
      bone,
      blend: 0,
      slot: B.coverts,
    },
    {
      shape: { kind: "cone", a: m(lerp3(f.front, f.back, 0.55)), b: m(f.back), ra: hh * 0.75, rb: th * 0.5 },
      bone,
      blend: hh * 0.4,
      slot: B.flight,
    },
  ];
  // Flatten the cone: it is a soft blade of primaries (thinner than wide).
  const w = p.wing;
  const tips = w.tips?.slot;
  return {
    kind: "field" as const,
    name: `fold${s}`,
    prims,
    h: p.h * 0.9,
    rigid: bone,
    bands: [
      {
        prims: [0, 1],
        at: (q: Vec3) => (f.front[2] - q[2]) / Math.max(1e-3, f.front[2] - f.back[2]),
        stops: tips !== undefined ? [0.45, 0.8] : [0.5],
        slots: tips !== undefined ? [B.coverts, B.flight, tips] : [B.coverts, B.flight],
      },
    ],
    ...(p.coat.wool ? {} : {}),
  };
}

function legsPiece(k: Kit, p: BirdPlan) {
  const L = p.legs;
  const prims: Prim[] = [];
  for (const s of ["L", "R"] as const) {
    const m = (v: Vec3) => (s === "L" ? v : mirror(v));
    const thigh = k.b(`thigh${s}`);
    const shin = k.b(`shin${s}`);
    const foot = k.b(`foot${s}`);
    const [rt, rs] = L.r;
    // Feathered thigh (hidden mostly in the belly), bare tarsus, toes.
    prims.push({
      shape: { kind: "cone", a: m(L.hip), b: m(lerp3(L.hip, L.ankle, L.thigh ?? 0.75)), ra: rt, rb: rt * 0.65 },
      bone: thigh,
      blend: 0,
      slot: L.thigh ? B.belly : B.legs,
    });
    prims.push({
      shape: { kind: "cone", a: m(L.ankle), b: m(L.foot), ra: rs * 1.15, rb: rs },
      bone: shin,
      blend: rs * 0.8,
      slot: B.legs,
    });
    const fp = L.foot;
    const toes: Array<[number, number]> = L.webbed
      ? [
          [-0.5, 1],
          [0, 1.1],
          [0.5, 1],
        ]
      : [
          [-0.45, 1],
          [0, 1.15],
          [0.45, 1],
          [Math.PI, 0.55],
        ];
    for (const [ang, len] of toes) {
      const tl = L.toe * len;
      const end: Vec3 = [fp[0] + Math.sin(ang) * tl, Math.max(rs * 0.5, fp[1] - rs * 1.5), fp[2] + Math.cos(ang) * tl];
      prims.push({
        shape: { kind: "cone", a: m([fp[0], Math.max(rs, fp[1]), fp[2]]), b: m(end), ra: rs * 0.85, rb: rs * 0.55 },
        bone: foot,
        blend: rs * 0.6,
        slot: B.legs,
      });
    }
    if (L.webbed) {
      // The web: a thin flat paddle between the toes.
      prims.push({
        shape: {
          kind: "box",
          c: m([fp[0], rs * 0.6, fp[2] + L.toe * 0.55]),
          h: [L.toe * 0.45, Math.max(rs * 0.45, p.h * 0.35), L.toe * 0.42],
          round: rs * 0.4,
        },
        bone: foot,
        blend: rs * 0.5,
        slot: B.legs,
      });
    }
  }
  const hl = Math.max(0.0035, Math.min(p.h, L.r[1] * 0.8));
  return { kind: "field" as const, name: "legs", prims, h: hl, relax: 1 };
}
