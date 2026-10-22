/**
 * Parametric quadruped: one numbers-only description (`QuadPlan`) → the skeleton and the primitives of a
 * four-legged body in the continuous-surface construction of the approved llama. Every mammal and reptile
 * preset in ./species/ is a QuadPlan plus, where it needs it, a few primitives of its own (`extra`: a mane, a
 * trunk, a shell, a mask band).
 *
 *   barrel   three ellipsoids: rump (body bone), barrel (body) and chest (chest bone), smooth-unioned
 *   neck     three tapering segments along a curve (neck0 → neck1 → neck2), then the head bone
 *   head     skull ellipsoid + muzzle cone on the head bone, lower lip / jaw on the jaw bone, ears on their
 *            own bones (springs), a mirrored eye decal, the inside of the mouth as a hidden dark piece (seen
 *            when the jaw opens: yawns, a caiman's lunge)
 *   legs     upper → knee / hock → ankle on Up, Lo and Ft bones (front knees bend forward like ours, hind hocks
 *            backward; ../gait.ts legIK), then a foot by kind: hoof, camelid toes, paw, hand, claws, reptile
 *            toes, trotter
 *   tail     two to four segments (tail0…), an optional tuft
 *
 * Fur and wool: a `Coat` (amplitude, frequency) on the field puffs the silhouette (fleece) or, at high
 * frequency and small amplitude, gives the jagged rim of short fur; `woolNormal` keeps the cel bands smooth.
 *
 * Conventions (as every character): faces +Z, left is +X, origin at the feet, units ≈ metres. All points in a
 * QuadPlan are on the LEFT side (x ≥ 0); the right side is mirrored.
 *
 * Pure (no DOM, no Three).
 */
import type { FaceMap } from "../build";
import type { Prim, Vec3 } from "../sdf";
import { type Coat, Kit, lerp3, norm3, quad3, SMOOTH, sstep } from "./kit";

/** Canonical palette slots of a quadruped (./spec.ts). */
export const Q = {
  coat: 0,
  hair: 1,
  hoof: 2,
  nose: 3,
  belly: 4,
  points: 5,
  spot: 6,
  spot2: 7,
  mask: 8,
  inner: 9,
  accent: 10,
  mouth: 11,
  t1: 12,
  t2: 13,
  t3: 14,
  t4: 15,
} as const;

export type FootKind = "camelid" | "hoof" | "paw" | "hand" | "claw" | "reptile" | "trotter" | "webbed";

export interface LegPlan {
  /** Bind positions (left side) of the Up, Lo and Ft bones. */
  top: Vec3;
  knee: Vec3;
  ankle: Vec3;
  /** Radii at the top, the knee, the ankle and the foot. */
  r: [number, number, number, number];
  /** A muscle mass on the upper leg (forearm, gaskin, a cat's haunch). */
  mass?: { c: Vec3; r: Vec3 };
}

export interface QuadPlan {
  h: number;
  coat: Coat;
  /** Coat on the legs and head (default: smooth short hair). */
  short?: Coat;
  body: { c: Vec3; r: Vec3 };
  chest: { c: Vec3; r: Vec3 };
  rump: { c: Vec3; r: Vec3 };
  /** Blend of the barrel pieces and the neck into them (default 0.09). */
  blend?: number;
  neck: { a: Vec3; ctrl: Vec3; b: Vec3; r: [number, number]; coat?: Coat };
  head: { c: Vec3; r: Vec3; pitch?: number };
  muzzle: { a: Vec3; b: Vec3; r: [number, number]; noseAt?: number };
  /** Lower lip / jaw (the jaw bone sits at its back). */
  jaw?: { c: Vec3; r: Vec3; pivot?: Vec3 };
  ears?: { a: Vec3; mid: Vec3; b: Vec3; r: [number, number, number]; flat?: number };
  tail?: { pts: Vec3[]; r: number[]; coat?: Coat; tuft?: { r: Vec3; coat?: Coat } };
  front: LegPlan;
  hind: LegPlan;
  foot: FootKind;
  /** Hoof / pad colour below this height (0 = none), dark points below this height (equids). */
  hoofY?: number;
  pointsY?: number;
  /** Paler belly below this height on the barrel (absent = none). */
  bellyY?: number;
  /** Spots / rosettes (noise iso-bands on the barrel and neck): frequency, ring band, centre band. */
  spots?: { freq: number; ring: [number, number]; centre?: boolean; seed?: number; legs?: boolean };
  /** Region slots (defaults: barrel, neck, tail on the coat; head, ears and legs on short hair). */
  slots?: Partial<Record<"body" | "neck" | "head" | "legs" | "tail" | "ears" | "muzzle", number>>;
  eye: { dir: Vec3; w: number; depth?: number; on?: "head" | "muzzle" };
  /** The hidden mouth interior (default on). */
  mouth?: boolean;
  /** Species extras, after the base body (same kit). */
  extra?: (k: Kit, p: QuadPlan) => void;
}

/** Point on an axis-aligned ellipsoid's surface in direction `d` from its centre, and the normal there. */
export function onEllipsoid(c: Vec3, r: Vec3, d: Vec3): { p: Vec3; n: Vec3 } {
  const u = norm3(d);
  const t = 1 / Math.sqrt((u[0] / r[0]) ** 2 + (u[1] / r[1]) ** 2 + (u[2] / r[2]) ** 2);
  const p: Vec3 = [c[0] + u[0] * t, c[1] + u[1] * t, c[2] + u[2] * t];
  const n = norm3([(p[0] - c[0]) / r[0] ** 2, (p[1] - c[1]) / r[1] ** 2, (p[2] - c[2]) / r[2] ** 2]);
  return { p, n };
}

/** A mirrored side-eye decal at a point with outward normal n (u grows toward the muzzle). */
export function eyeDecal(p: Vec3, n: Vec3, w: number, depth?: number): FaceMap {
  const right = norm3([-n[2], 0, n[0]]);
  // up = right × fwd
  const up = norm3([
    right[1] * n[2] - right[2] * n[1],
    right[2] * n[0] - right[0] * n[2],
    right[0] * n[1] - right[1] * n[0],
  ]);
  // A tiny inset so the decal plane sits just inside the surface (the mask needs the surface in front).
  const o: Vec3 = [p[0] - n[0] * 0.002, p[1] - n[1] * 0.002, p[2] - n[2] * 0.002];
  return { origin: o, right, up, fwd: n, w, h: w, depth: depth ?? w * 0.5, mirror: true };
}

/** Leg bone names. */
export const legBones = (front: boolean, s: "L" | "R") => {
  const f = front ? "f" : "h";
  return { up: `${f}Up${s}`, lo: `${f}Lo${s}`, ft: `${f}Ft${s}` };
};

const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

/** Build a quadruped kit from its plan. */
export function quadKit(p: QuadPlan): Kit {
  const k = new Kit();
  const blend = p.blend ?? 0.09;
  const short = p.short ?? SMOOTH;
  const S = {
    body: Q.coat,
    neck: Q.coat,
    tail: Q.coat,
    head: Q.hair,
    ears: Q.hair,
    legs: Q.hair,
    muzzle: Q.hair,
    ...p.slots,
  };

  // ---------------------------------------------------------------- skeleton
  const n1 = quad3(p.neck.a, p.neck.ctrl, p.neck.b, 1 / 3);
  const n2 = quad3(p.neck.a, p.neck.ctrl, p.neck.b, 2 / 3);
  k.bone("root", null, [0, 0, 0]);
  k.bone("body", "root", p.body.c);
  k.bone("chest", "body", p.chest.c);
  k.bone("neck0", "chest", p.neck.a);
  k.bone("neck1", "neck0", n1);
  k.bone("neck2", "neck1", n2);
  k.bone("head", "neck2", p.neck.b);
  const jawPivot = p.jaw?.pivot ?? lerp3(p.muzzle.a, p.muzzle.b, 0.15);
  k.bone("jaw", "head", jawPivot);
  if (p.ears) {
    k.bone("earL", "head", p.ears.a);
    k.bone("earR", "head", mirror(p.ears.a));
  }
  const tailPts = p.tail?.pts ?? [];
  for (let i = 0; i < tailPts.length - 1; i++) k.bone(`tail${i}`, i ? `tail${i - 1}` : "body", tailPts[i] as Vec3);
  for (const s of ["L", "R"] as const) {
    const m = (v: Vec3) => (s === "L" ? v : mirror(v));
    for (const front of [true, false]) {
      const lp = front ? p.front : p.hind;
      const b = legBones(front, s);
      k.bone(b.up, front ? "chest" : "body", m(lp.top));
      k.bone(b.lo, b.up, m(lp.knee));
      k.bone(b.ft, b.lo, m(lp.ankle));
    }
  }

  // ---------------------------------------------------------------- barrel
  k.add(k.ell(p.body.c, p.body.r, "body", 0, S.body, p.coat), "barrel");
  k.add(k.ell(p.chest.c, p.chest.r, "chest", blend, S.body, p.coat), "barrel");
  k.add(k.ell(p.rump.c, p.rump.r, "body", blend, S.body, p.coat), "barrel");

  // ---------------------------------------------------------------- neck
  const nc = p.neck.coat ?? p.coat;
  const [r0, r1] = p.neck.r;
  const rA = r0;
  const rB = r0 + (r1 - r0) / 3;
  const rC = r0 + ((r1 - r0) * 2) / 3;
  k.add(k.cone(p.neck.a, n1, rA, rB, "neck0", blend * 0.9, S.neck, nc), "neck");
  k.add(k.cone(n1, n2, rB, rC, "neck1", blend * 0.55, S.neck, scaleCoat(nc, 0.85)), "neck");
  k.add(k.cone(n2, p.neck.b, rC, r1, "neck2", blend * 0.45, S.neck, scaleCoat(nc, 0.6)), "neck");

  // ---------------------------------------------------------------- head
  const hb = Math.min(p.head.r[0], p.head.r[1]) * 0.45;
  k.add(k.ell(p.head.c, p.head.r, "head", hb, S.head, short), "head");
  const muz = k.add(
    k.cone(p.muzzle.a, p.muzzle.b, p.muzzle.r[0], p.muzzle.r[1], "head", hb * 0.9, S.muzzle, short),
    "muzzle",
  );
  let lip = -1;
  if (p.jaw) lip = k.add(k.ell(p.jaw.c, p.jaw.r, "jaw", p.jaw.r[1] * 0.6, S.muzzle, short), "muzzle");
  if (p.muzzle.noseAt !== undefined) {
    const a = p.muzzle.a;
    const ax = norm3([p.muzzle.b[0] - a[0], p.muzzle.b[1] - a[1], p.muzzle.b[2] - a[2]]);
    k.bands.push({
      prims: lip >= 0 ? [muz, lip] : [muz],
      at: (q) => (q[0] - a[0]) * ax[0] + (q[1] - a[1]) * ax[1] + (q[2] - a[2]) * ax[2],
      stops: [p.muzzle.noseAt],
      slots: [S.muzzle, Q.nose],
    });
  }
  if (p.ears) {
    const e = p.ears;
    const ec = scaleCoat(short, 0.5);
    const list: Prim[] = [
      k.cone(e.a, e.mid, e.r[0], e.r[1], "earL", e.r[0] * 0.6, S.ears, ec),
      k.cone(e.mid, e.b, e.r[1], e.r[2], "earL", e.r[1] * 0.5, S.ears, ec),
    ];
    if (e.flat) {
      // Flattened ears (cats, bears, rodents): a thin rotated ellipsoid instead of cones.
      list.length = 0;
      const c = lerp3(e.a, e.b, 0.55);
      list.push(
        k.ell(
          c,
          [e.r[1] * e.flat, Math.hypot(e.b[1] - e.a[1], e.b[0] - e.a[0]) * 0.55, e.r[1]],
          "earL",
          e.r[0] * 0.5,
          S.ears,
          ec,
        ),
      );
    }
    for (const pr of list) k.addPair(pr, "earR", "ears");
  }

  // ---------------------------------------------------------------- tail
  if (p.tail && tailPts.length >= 2) {
    const tc = p.tail.coat ?? p.coat;
    for (let i = 0; i < tailPts.length - 1; i++) {
      const ra = p.tail.r[i] ?? 0.03;
      const rb = p.tail.r[i + 1] ?? ra * 0.7;
      k.add(
        k.cone(tailPts[i] as Vec3, tailPts[i + 1] as Vec3, ra, rb, `tail${i}`, i ? ra * 0.6 : blend * 0.6, S.tail, tc),
        "tail",
      );
    }
    if (p.tail.tuft) {
      const last = tailPts.length - 2;
      const end = tailPts[tailPts.length - 1] as Vec3;
      k.add(k.ell(end, p.tail.tuft.r, `tail${last}`, p.tail.tuft.r[1] * 0.5, Q.points, p.tail.tuft.coat ?? tc), "tuft");
    }
  }

  // ---------------------------------------------------------------- legs
  for (const s of ["L", "R"] as const) {
    for (const front of [true, false]) leg(k, p, front, s, S.legs, short);
  }

  // ---------------------------------------------------------------- paint
  const legs = k.group("legs");
  if (p.hoofY || p.pointsY) {
    const stops: number[] = [];
    const slots: number[] = [];
    if (p.hoofY) {
      stops.push(p.hoofY);
      slots.push(Q.hoof);
    }
    if (p.pointsY) {
      stops.push(p.pointsY);
      slots.push(Q.points);
    }
    slots.push(S.legs);
    k.bands.push({ prims: legs, at: (q) => q[1], stops, slots });
  }
  const barrel = [...k.group("barrel"), ...k.group("neck")];
  if (p.spots) {
    const sp = p.spots;
    const seed = sp.seed ?? 3;
    const f = sp.freq;
    // Rosettes: a ring band of value noise ([ring0, ring1]) with an optional centre colour inside it; the belly
    // (when set) is blended in continuously so its line stays crisp (../paint.ts cuts on a continuous scalar).
    const stops = [-2.2, sp.ring[0], sp.ring[1]];
    const slots = [p.bellyY !== undefined ? Q.belly : S.body, S.body, Q.spot, sp.centre ? Q.spot2 : S.body];
    const by = p.bellyY;
    if (p.spots.legs)
      k.bands.push({
        prims: legs,
        at: (q) => spotNoise(q[0] * f + seed, q[1] * f, q[2] * f),
        stops: stops.slice(1),
        slots: slots.slice(1),
      });
    k.bands.push({
      prims: barrel,
      at: (q) => {
        const n = spotNoise(q[0] * f + seed, q[1] * f, q[2] * f);
        if (by === undefined) return n;
        const w = sstep(by + 0.03, by - 0.03, q[1]);
        return n * (1 - w) - 3.2 * w;
      },
      stops,
      slots,
    });
  } else if (p.bellyY !== undefined) {
    const by = p.bellyY;
    k.bands.push({ prims: barrel, at: (q) => q[1], stops: [by], slots: [Q.belly, S.body] });
  }

  // ---------------------------------------------------------------- eyes
  const on = p.eye.on === "muzzle" ? { c: lerp3(p.muzzle.a, p.muzzle.b, 0.25), r: p.head.r } : p.head;
  const e = onEllipsoid(on.c, on.r, p.eye.dir);
  k.faces.push(eyeDecal(e.p, e.n, p.eye.w, p.eye.depth));

  // ---------------------------------------------------------------- mouth inside (hidden until the jaw opens)
  if (p.mouth !== false) {
    const a = p.muzzle.a;
    const b = p.muzzle.b;
    const r = Math.min(p.muzzle.r[0], p.muzzle.r[1]);
    const c = lerp3(a, b, 0.55);
    k.extra.push({
      kind: "field",
      name: "mouth",
      prims: [
        {
          shape: { kind: "cone", a: lerp3(a, b, 0.15), b: lerp3(a, b, 0.85), ra: r * 0.62, rb: r * 0.5 },
          bone: k.b("head"),
          blend: 0,
          slot: Q.mouth,
        },
        {
          shape: { kind: "ellipsoid", c: [c[0], c[1] - r * 0.35, c[2]], r: [r * 0.5, r * 0.25, r * 0.8] },
          bone: k.b("jaw"),
          blend: r * 0.2,
          slot: Q.nose,
        },
      ],
      h: Math.max(p.h * 0.7, r * 0.3),
      relax: 1,
    });
  }

  p.extra?.(k, p);
  return k;
}

function leg(k: Kit, p: QuadPlan, front: boolean, s: "L" | "R", slot: number, short: Coat) {
  const lp = front ? p.front : p.hind;
  const b = legBones(front, s);
  const m = (v: Vec3): Vec3 => (s === "L" ? v : mirror(v));
  const [r0, r1, r2, r3] = lp.r;
  const coat = p.coat.wool > 0 ? { wool: p.coat.wool * 0.8, freq: p.coat.freq * 1.4 } : SMOOTH;
  const add = (pr: Prim) => k.add(pr, "legs");
  // Upper leg: from inside the barrel down to the knee / hock (fur or wool on it), with an optional muscle.
  add(k.cone(m(lerp3(lp.top, lp.knee, -0.12)), m(lp.knee), r0, r1, b.up, 0.06, slot, coat));
  if (lp.mass) add(k.ell(m(lp.mass.c), lp.mass.r, b.up, 0.05, slot, coat));
  add(k.ell(m(lp.knee), [r1 * 1.05, r1 * 1.1, r1 * 1.05], b.lo, r1 * 0.5, slot, short));
  add(k.cone(m(lp.knee), m(lp.ankle), r1 * 0.95, r2, b.lo, r1 * 0.45, slot, short));
  const a = lp.ankle;
  const x = a[0];
  const z = a[2];
  const ft = b.ft;
  switch (p.foot) {
    case "camelid": {
      add(k.ell(m(a), [r2 * 1.05, r2 * 1.05, r2 * 1.05], ft, 0.02, slot, short));
      add(k.cone(m(a), m([x, r3 * 1.1, z + r3 * 1.1]), r2 * 0.92, r3 * 0.9, ft, 0.02, slot, short));
      add(
        k.ell(m([x + r3 * 0.6, r3 * 0.75, z + r3 * 1.75]), [r3 * 0.68, r3 * 0.77, r3 * 1.35], ft, 0.012, slot, short),
      );
      add(
        k.ell(m([x - r3 * 0.6, r3 * 0.75, z + r3 * 1.75]), [r3 * 0.68, r3 * 0.77, r3 * 1.35], ft, 0.012, slot, short),
      );
      break;
    }
    case "hoof":
    case "trotter": {
      // Fetlock, a short sloping pastern, then the hoof: a flat-soled rounded box, wider at the ground.
      const hh = p.hoofY ? p.hoofY * 1.05 : r3 * 1.3;
      add(k.ell(m(a), [r2 * 1.12, r2 * 1.12, r2 * 1.15], ft, r2 * 0.4, slot, short));
      const toe: Vec3 = [x, hh + r3 * 0.4, z + r3 * 0.55];
      add(k.cone(m(a), m(toe), r2 * 0.95, r3 * 0.88, ft, r2 * 0.4, slot, short));
      add(k.box(m([x, hh * 0.5, z + r3 * 0.6]), [r3 * 0.98, hh * 0.5, r3 * 1.12], r3 * 0.55, ft, r3 * 0.35, slot));
      if (p.foot === "trotter") {
        // Split toes (peccaries): two small points at the front.
        for (const dx of [0.45, -0.45])
          add(k.ell(m([x + dx * r3, r3 * 0.45, z + r3 * 1.5]), [r3 * 0.5, r3 * 0.45, r3 * 0.7], ft, r3 * 0.2, slot));
      }
      break;
    }
    case "paw":
    case "webbed": {
      add(k.ell(m(a), [r2 * 1.02, r2 * 1.02, r2 * 1.02], ft, r2 * 0.4, slot, short));
      const c: Vec3 = [x, r3 * 0.62, z + r3 * 0.55];
      add(k.cone(m(a), m(c), r2 * 0.95, r3 * 0.85, ft, r2 * 0.35, slot, short));
      add(k.ell(m(c), [r3 * 1.02, r3 * 0.64, r3 * 1.22], ft, r3 * 0.35, slot, short));
      // Toe bumps along the front of the paw.
      for (const dx of [-0.55, -0.18, 0.18, 0.55])
        add(
          k.ell(
            m([x + dx * r3, r3 * 0.42, z + r3 * 1.42 - Math.abs(dx) * r3 * 0.3]),
            [r3 * 0.34, r3 * 0.38, r3 * 0.36],
            ft,
            r3 * 0.18,
            slot,
            short,
          ),
        );
      break;
    }
    case "hand": {
      // Primates: a long hand / foot on the ground with short fingers.
      add(k.ell(m(a), [r2, r2, r2], ft, r2 * 0.4, slot, short));
      const c: Vec3 = [x, r3 * 0.5, z + r3 * 1.4];
      add(k.cone(m(a), m(c), r2 * 0.9, r3 * 0.7, ft, r2 * 0.3, Q.hoof, short));
      for (const dx of [-0.5, 0, 0.5])
        add(k.cone(m(c), m([x + dx * r3, r3 * 0.3, z + r3 * 2.6]), r3 * 0.3, r3 * 0.22, ft, r3 * 0.15, Q.hoof));
      break;
    }
    case "claw": {
      // Sloths: a narrow hand ending in two or three long curved claws.
      add(k.ell(m(a), [r2, r2, r2], ft, r2 * 0.4, slot, short));
      const c: Vec3 = [x, r3 * 0.7, z + r3 * 0.6];
      add(k.cone(m(a), m(c), r2 * 0.9, r3 * 0.8, ft, r2 * 0.3, slot, short));
      for (const dx of front ? [-0.42, 0, 0.42] : [-0.42, 0.0, 0.42]) {
        const c0: Vec3 = [x + dx * r3, r3 * 0.7, z + r3 * 1.2];
        const c1: Vec3 = [x + dx * r3, r3 * 0.55, z + r3 * 3.2];
        const c2: Vec3 = [x + dx * r3, r3 * 0.05, z + r3 * 3.9];
        add(k.cone(m(c0), m(c1), r3 * 0.24, r3 * 0.17, ft, r3 * 0.12, Q.hoof));
        add(k.cone(m(c1), m(c2), r3 * 0.17, r3 * 0.05, ft, r3 * 0.06, Q.hoof));
      }
      break;
    }
    case "reptile": {
      // Splayed toes radiating forward and out from a flat foot.
      const c: Vec3 = [x + r3 * 0.3, r3 * 0.5, z + r3 * 0.4];
      add(k.ell(m(a), [r2, r2, r2], ft, r2 * 0.4, slot, short));
      add(k.ell(m(c), [r3 * 1.0, r3 * 0.5, r3 * 1.0], ft, r3 * 0.4, slot, short));
      const toes = front ? [-0.9, -0.3, 0.3, 0.9, 1.4] : [-0.8, -0.2, 0.4, 1.0];
      for (const ang of toes) {
        const dx = Math.sin(ang * 0.6);
        const dz = Math.cos(ang * 0.6);
        add(
          k.cone(
            m([c[0] + dx * r3 * 0.5, r3 * 0.35, c[2] + dz * r3 * 0.5]),
            m([c[0] + dx * r3 * 2.0, r3 * 0.22, c[2] + dz * r3 * 2.0]),
            r3 * 0.3,
            r3 * 0.18,
            ft,
            r3 * 0.12,
            slot,
          ),
        );
      }
      break;
    }
  }
}

const scaleCoat = (c: Coat, k: number): Coat => (c.wool ? { wool: c.wool * k, freq: c.freq } : c);

/** Noise for spots and rosettes (two octaves, in about [-1, 1]). */
function spotNoise(x: number, y: number, z: number) {
  return noise(x, y, z) * 0.75 + noise(x * 2.1 + 5.2, y * 2.1, z * 2.1) * 0.25;
}

// A local copy of the field's value noise (../sdf.ts noise3) keeps this module's bands independent of it.
const hash = (x: number, y: number, z: number) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(ix + dx, iy + dy, iz + dz);
  return (
    l(
      l(l(c(0, 0, 0), c(1, 0, 0), ux), l(c(0, 1, 0), c(1, 1, 0), ux), uy),
      l(l(c(0, 0, 1), c(1, 0, 1), ux), l(c(0, 1, 1), c(1, 1, 1), ux), uy),
      uz,
    ) *
      2 -
    1
  );
}
