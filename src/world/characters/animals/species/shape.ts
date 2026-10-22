/**
 * A higher-level way to describe a four-legged body: a handful of proportions (barrel height and size, neck
 * length and angle, head and muzzle, ears, tail, legs) → a full ../plan-quad.ts QuadPlan. Most presets
 * (equids, cats, the fox, the bear, rodents, the peccary, the tapir, deer, the monkey, the sloth, reptiles)
 * start here and add their own touches through `extra`.
 *
 * Pure (no DOM, no Three).
 */
import type { Vec3 } from "../../sdf";
import type { Coat } from "../kit";
import type { FootKind, QuadPlan } from "../plan-quad";

export interface QuadShape {
  /** Barrel centre height, half widths (x, y) and half length (front to back leg tops). */
  bodyY: number;
  bodyR: [number, number];
  half: number;
  /** Rump raised (+) or lowered (−) relative to the barrel; chest likewise. */
  rumpUp?: number;
  chestUp?: number;
  /** Chest / rump size relative to the barrel. */
  chestK?: number;
  rumpK?: number;
  neck: { len: number; angle: number; r: [number, number]; arch?: number };
  head: { r: Vec3; muzzle: number; mr: [number, number]; drop?: number; up?: number };
  ears?: { len: number; w: number; kind: "pointed" | "round" | "long" | "flat"; tilt?: number; back?: number };
  tail?: { len: number; r: [number, number]; angle: number; segs?: number; curl?: number; tuft?: Vec3 };
  legs: {
    r: [number, number, number, number];
    hind?: [number, number, number, number];
    /** Knee and hock heights as fractions of the leg top height, hock pushed back (units). */
    knee?: number;
    hock?: number;
    hockBack?: number;
    /** Leg tops spread (fraction of the barrel half width). */
    spread?: number;
    /** Sprawled reptile legs: how far out the knee sits. */
    sprawl?: number;
    mass?: number;
  };
  foot: FootKind;
  coat: Coat;
  short?: Coat;
  eye: { dir: Vec3; w: number };
  hoofY?: number;
  pointsY?: number;
  bellyY?: number;
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

export function shapePlan(s: QuadShape, h: number): QuadPlan {
  const [rx, ry] = s.bodyR;
  const by = s.bodyY;
  const half = s.half;
  const ck = s.chestK ?? 1;
  const rk = s.rumpK ?? 0.95;
  const body = { c: [0, by, 0] as Vec3, r: [rx, ry, half * 0.7] as Vec3 };
  const chest = {
    c: [0, by + (s.chestUp ?? 0.03 * ry), half * 0.62] as Vec3,
    r: [rx * 0.95 * ck, ry * 1.02 * ck, half * 0.45] as Vec3,
  };
  const rump = {
    c: [0, by + (s.rumpUp ?? 0), -half * 0.62] as Vec3,
    r: [rx * 0.96 * rk, ry * 0.96 * rk, half * 0.44] as Vec3,
  };
  // Neck: from the top front of the chest, `angle` from vertical, arching forward.
  const n = s.neck;
  const na: Vec3 = [0, by + ry * 0.4, half * 0.88];
  const nb: Vec3 = add(na, [0, Math.cos(n.angle) * n.len, Math.sin(n.angle) * n.len]);
  const arch = n.arch ?? 0.12;
  const nc: Vec3 = add(
    [0, (na[1] + nb[1]) / 2, (na[2] + nb[2]) / 2],
    [0, n.len * arch * Math.sin(n.angle), -n.len * arch * Math.cos(n.angle) * 0.4],
  );
  // Head: the skull just in front of / above the neck top, the muzzle reaching forward and down.
  const hd = s.head;
  const hc: Vec3 = add(nb, [0, hd.r[1] * (0.25 + (hd.up ?? 0)), hd.r[2] * 0.35]);
  const drop = hd.drop ?? 0.35;
  const ma: Vec3 = add(hc, [0, -hd.r[1] * 0.15, hd.r[2] * 0.45]);
  const mb: Vec3 = add(ma, [0, -Math.sin(drop) * hd.muzzle, Math.cos(drop) * hd.muzzle]);
  const jawC: Vec3 = add([0, (ma[1] + mb[1]) / 2, (ma[2] + mb[2]) / 2], [0, -hd.mr[0] * 0.55, -hd.muzzle * 0.05]);
  // Legs.
  const lg = s.legs;
  const spread = (lg.spread ?? 0.55) * rx;
  const ft: Vec3 = [spread, by - ry * 0.25, half * 0.62];
  const ht: Vec3 = [spread, by - ry * 0.2, -half * 0.62];
  const sprawl = lg.sprawl ?? 0;
  const [r0, r1, r2, r3] = lg.r;
  const hr = lg.hind ?? lg.r;
  const footH = Math.max(r3 * 1.6, r2 * 1.4);
  let front: QuadPlan["front"];
  let hind: QuadPlan["hind"];
  if (sprawl) {
    const kx = spread + sprawl;
    front = {
      top: ft,
      knee: [kx, ft[1] - r1, ft[2] + r1] as Vec3,
      ankle: [kx, footH, ft[2] + r1 * 1.5] as Vec3,
      r: lg.r,
    };
    hind = { top: ht, knee: [kx, ht[1] - r1, ht[2] - r1] as Vec3, ankle: [kx, footH, ht[2] - r1 * 0.5] as Vec3, r: hr };
  } else {
    const kneeY = ft[1] * (lg.knee ?? 0.45);
    const hockY = ht[1] * (lg.hock ?? 0.4);
    const hb = lg.hockBack ?? r1 * 1.4;
    front = {
      top: ft,
      knee: [spread, kneeY, ft[2] + r1 * 0.3] as Vec3,
      ankle: [spread, footH, ft[2] + r1 * 0.3] as Vec3,
      r: lg.r,
    };
    hind = {
      top: ht,
      knee: [spread, hockY, ht[2] - hb] as Vec3,
      ankle: [spread, footH, ht[2] - hb * 0.55] as Vec3,
      r: hr,
    };
    if (lg.mass) {
      (front as QuadPlan["front"]).mass = {
        c: [spread, ft[1] - (ft[1] - kneeY) * 0.3, ft[2] + r0 * 0.1],
        r: [r0 * lg.mass * 0.85, (ft[1] - kneeY) * 0.45, r0 * lg.mass],
      };
      (hind as QuadPlan["hind"]).mass = {
        c: [spread, ht[1] - (ht[1] - hockY) * 0.25, ht[2] - hb * 0.2],
        r: [r0 * lg.mass * 0.9, (ht[1] - hockY) * 0.5, r0 * lg.mass * 1.15],
      };
    }
  }
  // Ears.
  let ears: QuadPlan["ears"];
  if (s.ears) {
    const e = s.ears;
    const base: Vec3 = add(hc, [hd.r[0] * 0.55, hd.r[1] * 0.7, -hd.r[2] * 0.25]);
    const tilt = e.tilt ?? 0.3;
    const back = e.back ?? 0.2;
    const dir: Vec3 = [Math.sin(tilt), Math.cos(tilt) * Math.cos(back), -Math.sin(back)];
    const tip = add(base, [dir[0] * e.len, dir[1] * e.len, dir[2] * e.len]);
    const mid = add(base, [dir[0] * e.len * 0.5, dir[1] * e.len * 0.5, dir[2] * e.len * 0.5]);
    const w = e.w;
    if (e.kind === "round" || e.kind === "flat")
      ears = { a: base, mid, b: tip, r: [w * 0.6, w, w * 0.5], flat: e.kind === "flat" ? 0.28 : 0.4 };
    else if (e.kind === "long") ears = { a: base, mid, b: tip, r: [w * 0.55, w * 0.62, w * 0.22] };
    else ears = { a: base, mid, b: tip, r: [w * 0.6, w * 0.45, w * 0.06] };
  }
  // Tail.
  let tail: QuadPlan["tail"];
  if (s.tail) {
    const t = s.tail;
    const segs = t.segs ?? 2;
    const base: Vec3 = [0, rump.c[1] + rump.r[1] * 0.45, rump.c[2] - rump.r[2] * 0.85];
    const pts: Vec3[] = [base];
    const r: number[] = [t.r[0]];
    let ang = t.angle;
    let p = base;
    for (let i = 1; i <= segs; i++) {
      ang += t.curl ?? 0;
      const l = t.len / segs;
      p = add(p, [0, Math.sin(ang) * l, -Math.cos(ang) * l]);
      pts.push(p);
      r.push(t.r[0] + ((t.r[1] - t.r[0]) * i) / segs);
    }
    tail = { pts, r, ...(t.tuft ? { tuft: { r: t.tuft } } : {}) };
  }
  const ed = s.eye.dir;
  return {
    h,
    coat: s.coat,
    ...(s.short ? { short: s.short } : {}),
    body,
    chest,
    rump,
    neck: { a: na, ctrl: nc, b: nb, r: n.r },
    head: { c: hc, r: hd.r },
    muzzle: { a: ma, b: mb, r: hd.mr, noseAt: hd.muzzle + hd.mr[1] * 0.55 },
    jaw: {
      c: jawC,
      r: [hd.mr[0] * 0.62, hd.mr[0] * 0.38, hd.muzzle * 0.5],
      pivot: add(ma, [0, -hd.mr[0] * 0.4, -hd.muzzle * 0.15]),
    },
    ...(ears ? { ears } : {}),
    ...(tail ? { tail } : {}),
    front,
    hind,
    foot: s.foot,
    ...(s.hoofY !== undefined ? { hoofY: s.hoofY } : {}),
    ...(s.pointsY !== undefined ? { pointsY: s.pointsY } : {}),
    ...(s.bellyY !== undefined ? { bellyY: s.bellyY } : {}),
    eye: { dir: ed, w: s.eye.w },
  };
}
