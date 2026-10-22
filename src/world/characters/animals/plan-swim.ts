/**
 * Parametric swimmer: sea lions, the pink river dolphin (bufeo) and fish. A chain of body sections from the
 * head to the tail on a spine of bones (head → neck → chest → body → tail0…tailN), pectoral fins or front
 * flippers, optional hind flippers (sea lions walk on them), a fluke (dolphins, horizontal) or a caudal fin
 * (fish, vertical), a dorsal fin or hump, and countershading (a pale belly under a dark back) as a crisp band.
 *
 * Conventions: faces +Z, left is +X, origin under the body (where it rests on the ground or the riverbed),
 * units ≈ metres; LEFT-side points.
 * Pure (no DOM, no Three).
 */
import type { Prim, Vec3 } from "../sdf";
import { type Coat, Kit, lerp3, SMOOTH } from "./kit";
import { rotTo } from "./plan-bird";
import { eyeDecal, onEllipsoid } from "./plan-quad";

/** Swimmer palette slots (./spec.ts). */
export const F = { back: 0, flank: 1, belly: 2, fin: 3, snout: 4, accent: 5, spot: 6, mouth: 11 } as const;

export interface FinPlan {
  /** Root (left side) and tip of the fin, its chord (width along the body) and thickness. */
  at: Vec3;
  tip: Vec3;
  chord: number;
  thick: number;
}

export interface SwimPlan {
  h: number;
  coat: Coat;
  head: { c: Vec3; r: Vec3 };
  snout: { a: Vec3; b: Vec3; r: [number, number] };
  jaw?: { c: Vec3; r: Vec3; pivot?: Vec3 };
  /** Dolphin melon (the rounded forehead). */
  melon?: { c: Vec3; r: Vec3 };
  neck: { c: Vec3; r: Vec3 };
  chest: { c: Vec3; r: Vec3 };
  body: { c: Vec3; r: Vec3 };
  tail: { pts: Vec3[]; r: number[] };
  /** Horizontal flukes (dolphins) or a vertical caudal fin (fish) at the tail end: half span and chord. */
  fluke?: { span: number; chord: number; vertical?: boolean };
  fins: FinPlan;
  hind?: FinPlan;
  dorsal?: { at: Vec3; h: number; chord: number; hump?: boolean };
  /** Small ears (sea lions). */
  ears?: { at: Vec3; r: number };
  eye: { dir: Vec3; w: number };
  /** Countershading: belly slot below this height offset from the spine line. */
  belly?: number;
  /** Spots on the flank (fish). */
  extra?: (k: Kit, p: SwimPlan) => void;
}

const mirror = (p: Vec3): Vec3 => [-p[0], p[1], p[2]];

export function swimKit(p: SwimPlan): Kit {
  const k = new Kit();
  const pts = p.tail.pts;
  k.bone("root", null, [0, 0, 0]);
  k.bone("body", "root", p.body.c);
  k.bone("chest", "body", p.chest.c);
  k.bone("neck", "chest", p.neck.c);
  k.bone("head", "neck", p.head.c);
  k.bone("jaw", "head", p.jaw?.pivot ?? lerp3(p.snout.a, p.snout.b, 0.1));
  for (let i = 0; i < pts.length - 1; i++) k.bone(`tail${i}`, i ? `tail${i - 1}` : "body", pts[i] as Vec3);
  k.bone("finL", "chest", p.fins.at);
  k.bone("finR", "chest", mirror(p.fins.at));
  if (p.hind) {
    k.bone("hfinL", "tail0", p.hind.at);
    k.bone("hfinR", "tail0", mirror(p.hind.at));
  }

  const c = p.coat;
  k.add(k.ell(p.body.c, p.body.r, "body", 0, F.back, c), "trunk");
  k.add(k.ell(p.chest.c, p.chest.r, "chest", Math.min(...p.chest.r) * 0.6, F.back, c), "trunk");
  k.add(k.ell(p.neck.c, p.neck.r, "neck", Math.min(...p.neck.r) * 0.6, F.back, c), "trunk");
  k.add(k.ell(p.head.c, p.head.r, "head", Math.min(...p.head.r) * 0.5, F.back, c), "trunk");
  if (p.melon) k.add(k.ell(p.melon.c, p.melon.r, "head", Math.min(...p.melon.r) * 0.5, F.back, c), "trunk");
  const sn = k.add(
    k.cone(p.snout.a, p.snout.b, p.snout.r[0], p.snout.r[1], "head", p.snout.r[0] * 0.5, F.snout, SMOOTH),
    "snout",
  );
  if (p.jaw) k.add(k.ell(p.jaw.c, p.jaw.r, "jaw", 0, F.snout, SMOOTH), "snout");
  void sn;
  for (let i = 0; i < pts.length - 1; i++) {
    const ra = p.tail.r[i] ?? 0.05;
    const rb = p.tail.r[i + 1] ?? ra * 0.6;
    k.add(
      k.cone(
        pts[i] as Vec3,
        pts[i + 1] as Vec3,
        ra,
        rb,
        `tail${i}`,
        i ? ra * 0.5 : Math.min(...p.body.r) * 0.5,
        F.back,
        c,
      ),
      "trunk",
    );
  }
  const last = `tail${pts.length - 2}`;
  const end = pts[pts.length - 1] as Vec3;
  if (p.fluke) {
    const f = p.fluke;
    if (f.vertical) {
      k.add(
        k.ell(
          [end[0], end[1], end[2] - f.chord * 0.3],
          [p.h * 0.9, f.span, f.chord * 0.6],
          last,
          f.chord * 0.2,
          F.fin,
          SMOOTH,
        ),
        "fins",
      );
    } else {
      for (const sx of [1, -1]) {
        const tip: Vec3 = [sx * f.span, end[1], end[2] - f.chord * 0.6];
        const mid = lerp3(end, tip, 0.5);
        k.add(
          k.ell(
            mid,
            [f.chord * 0.45, Math.max(p.h * 0.9, f.chord * 0.12), f.span * 0.55],
            last,
            f.chord * 0.25,
            F.fin,
            SMOOTH,
            rotTo([tip[0] - end[0], 0, tip[2] - end[2]]),
          ),
          "fins",
        );
      }
    }
  }
  const fin = (fp: FinPlan, bone: string, slot: number): Prim => {
    const mid = lerp3(fp.at, fp.tip, 0.5);
    const len = Math.hypot(fp.tip[0] - fp.at[0], fp.tip[1] - fp.at[1], fp.tip[2] - fp.at[2]);
    return k.ell(
      mid,
      [fp.chord * 0.5, fp.thick, len * 0.55],
      bone,
      fp.chord * 0.3,
      slot,
      SMOOTH,
      rotTo([fp.tip[0] - fp.at[0], fp.tip[1] - fp.at[1], fp.tip[2] - fp.at[2]]),
    );
  };
  k.addPair(fin(p.fins, "finL", F.fin), "finR", "fins");
  if (p.hind) k.addPair(fin(p.hind, "hfinL", F.fin), "hfinR", "fins");
  if (p.dorsal) {
    const d = p.dorsal;
    k.add(
      d.hump
        ? k.ell(d.at, [d.chord * 0.18, d.h, d.chord * 0.5], "body", d.chord * 0.3, F.back, c)
        : k.ell(
            [d.at[0], d.at[1] + d.h * 0.5, d.at[2]],
            [Math.max(p.h, d.chord * 0.06), d.h * 0.6, d.chord * 0.5],
            "body",
            d.chord * 0.2,
            F.fin,
            SMOOTH,
          ),
      "fins",
    );
  }
  if (p.ears)
    k.addPair(k.ell(p.ears.at, [p.ears.r * 0.5, p.ears.r, p.ears.r * 0.6], "head", p.ears.r * 0.4, F.back), "head");
  if (p.belly !== undefined) {
    // Countershading follows the spine: the cut is the height relative to a line from the head to the tail.
    const h0 = p.head.c;
    const h1 = end;
    const off = p.belly;
    k.bands.push({
      prims: [...k.group("trunk"), ...k.group("snout")],
      at: (q) => {
        const t = Math.min(1, Math.max(0, (h0[2] - q[2]) / Math.max(1e-3, h0[2] - h1[2])));
        return q[1] - (h0[1] + (h1[1] - h0[1]) * t) - off;
      },
      stops: [0],
      slots: [F.belly, F.back],
    });
  }
  const e = onEllipsoid(p.head.c, p.head.r, p.eye.dir);
  k.faces.push(eyeDecal(e.p, e.n, p.eye.w, p.eye.w * 0.4));
  // Mouth inside.
  const r = Math.min(p.snout.r[0], p.snout.r[1]);
  k.extra.push({
    kind: "field",
    name: "mouth",
    prims: [
      {
        shape: {
          kind: "cone",
          a: lerp3(p.snout.a, p.snout.b, 0.1),
          b: lerp3(p.snout.a, p.snout.b, 0.85),
          ra: r * 0.6,
          rb: r * 0.45,
        },
        bone: k.b("head"),
        blend: 0,
        slot: F.mouth,
      },
    ],
    h: Math.max(p.h * 0.7, r * 0.3),
    rigid: k.b("head"),
  });
  p.extra?.(k, p);
  return k;
}
