import { describe, expect, test } from "bun:test";
import type { Collider } from "../../contract";
import { STATIONS } from "../../contract";
import { buildLayout } from "../../layout";
import { ARRIVALS, arrivalFrom, PUNKU, SELVA_BRANCH, WASI } from "../../trailhead";
import { llamaHome } from "../mount/logic";
import { WALK, WALK_R } from "../wasi/plan";
import {
  arrowYaw,
  BAND,
  BAND_R,
  distToPath,
  GATE_PLAZA,
  inTravelRange,
  jambColliders,
  PUNKU_DIR,
  PUNKU_FRONT,
  PUNKU_KEEP_OUT_R,
  pathCircles,
  punkuLocal,
  punkuWorld,
  SIGN,
} from "./logic";

const FOOTPRINT: Record<string, number> = Object.fromEntries(
  STATIONS.map((s) => [s.id, s.kind === "gate" ? 4.5 : s.kind === "bridge" ? 0 : 6]),
);
const inside = (c: Collider, x: number, z: number, pad = 0) =>
  c.kind === "circle"
    ? Math.hypot(x - c.x, z - c.z) <= c.r + pad
    : x >= c.x0 - pad && x <= c.x1 + pad && z >= c.z0 - pad && z <= c.z1 + pad;

describe("tinkuy plan", () => {
  test("the band starts inside the walkable plaza and ends at the doorstep", () => {
    const [sx, sz] = BAND[0]!;
    expect(Math.hypot(sx - GATE_PLAZA.x, sz - GATE_PLAZA.z)).toBeLessThan(GATE_PLAZA.r - 0.3 - 0.5);
    expect(BAND.slice(1, 1 + SELVA_BRANCH.length)).toEqual([...SELVA_BRANCH]);
    expect(BAND[BAND.length - 1]).toEqual(PUNKU_FRONT);
  });

  test("band discs overlap all the way (no gaps)", () => {
    const discs = pathCircles(BAND, BAND_R);
    for (let i = 1; i < discs.length; i++) {
      const a = discs[i - 1]!;
      const b = discs[i]!;
      if (a.kind !== "circle" || b.kind !== "circle") throw new Error("discs");
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(BAND_R);
    }
  });

  test("the punku faces back up the branch", () => {
    const [bx, bz] = SELVA_BRANCH[SELVA_BRANCH.length - 1]!;
    const d = Math.hypot(bx - PUNKU.x, bz - PUNKU.z);
    expect(PUNKU_DIR.x * ((bx - PUNKU.x) / d) + PUNKU_DIR.z * ((bz - PUNKU.z) / d)).toBeGreaterThan(0.95);
    const l = punkuLocal(...([PUNKU_FRONT[0], PUNKU_FRONT[1]] as const));
    expect(l.x).toBeCloseTo(0, 6);
    expect(l.z).toBeGreaterThan(0);
    const w = punkuWorld(l.x, l.z);
    expect(w.x).toBeCloseTo(PUNKU_FRONT[0], 6);
    expect(w.z).toBeCloseTo(PUNKU_FRONT[1], 6);
  });

  test("travel range: in front of the doorway only", () => {
    expect(inTravelRange(PUNKU_FRONT[0], PUNKU_FRONT[1])).toBe(true);
    const behind = punkuWorld(0, -2);
    expect(inTravelRange(behind.x, behind.z)).toBe(false);
    const far = punkuWorld(0, 4);
    expect(inTravelRange(far.x, far.z)).toBe(false);
  });

  test("the doorway between the jambs stays open", () => {
    const front = punkuWorld(0, 0.3);
    for (const c of jambColliders()) expect(inside(c, front.x, front.z, 0.42)).toBe(false);
  });

  test("the signpost arrows point at their places", () => {
    // Board +X → world (cos yaw, −sin yaw).
    const yaw = arrowYaw(WASI.x - SIGN.x, WASI.z - SIGN.z);
    expect(Math.cos(yaw)).toBeLessThan(-0.9);
  });

  test("arrival from the jungle: inside the band, facing up the branch", () => {
    const a = ARRIVALS.selva;
    expect(arrivalFrom("?from=selva")).toEqual(a);
    expect(arrivalFrom("?from=nowhere")).toBeNull();
    expect(distToPath(BAND, a.x, a.z)).toBeLessThan(BAND_R - 0.5);
    const discs = pathCircles(BAND, BAND_R);
    expect(discs.some((c) => inside(c, a.x, a.z))).toBe(true);
    // Up-branch direction where it stands (toward the plaza).
    const [ax, az] = SELVA_BRANCH[SELVA_BRANCH.length - 2]!;
    const [bx, bz] = SELVA_BRANCH[SELVA_BRANCH.length - 1]!;
    const up = Math.atan2(ax - bx, az - bz);
    let d = a.yaw - up;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    expect(Math.abs(d)).toBeLessThan(0.15);
    // Not already at the doorway (no prompt the moment you arrive).
    expect(inTravelRange(a.x, a.z)).toBe(false);
  });
});

describe("tinkuy on the real trailhead", () => {
  for (const cells of [280, 190, 160]) {
    const L = buildLayout({ cells, footprint: FOOTPRINT });

    test(`gate plaza matches the layout (${cells} cells)`, () => {
      const pl = L.plazas.find((p) => p.id === "gate")!;
      expect(Math.hypot(pl.x - GATE_PLAZA.x, pl.z - GATE_PLAZA.z)).toBeLessThan(0.05);
      expect(pl.r).toBeCloseTo(GATE_PLAZA.r, 3);
      expect(L.walkable(BAND[0]![0], BAND[0]![1])).toBe(true);
    });

    test(`arrival is walkable once the band is registered (${cells} cells)`, () => {
      const a = ARRIVALS.selva;
      expect(L.walkable(a.x, a.z)).toBe(false);
      for (const c of pathCircles(BAND, BAND_R)) L.addWalkable(c);
      expect(L.walkable(a.x, a.z)).toBe(true);
      // Gentle enough to walk: no step over core's MAX_STEP (0.9) between band samples.
      const pts = pathCircles(BAND, BAND_R, 0.3);
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1]!;
        const q = pts[i]!;
        if (p.kind !== "circle" || q.kind !== "circle") continue;
        expect(Math.abs(L.groundAt(p.x, p.z) - L.groundAt(q.x, q.z))).toBeLessThan(0.9);
      }
    });

    test(`signpost: off the paved trail and clear of the Wasi walk, the arch and the llama (${cells} cells)`, () => {
      expect(L.trailQuery(SIGN.x, SIGN.z).d).toBeGreaterThan(L.trail.halfWidth + SIGN.r);
      expect(distToPath(WALK, SIGN.x, SIGN.z)).toBeGreaterThan(WALK_R + SIGN.r);
      const gate = STATIONS.find((s) => s.id === "gate")!;
      const p = L.trail.pointAt(gate.t);
      expect(Math.hypot(SIGN.x - p.x, SIGN.z - p.z)).toBeGreaterThan(L.trail.halfWidth + 2);
      const h = llamaHome({
        ...L,
        extra: { trailDistance: (x, z) => ({ d: L.trailQuery(x, z).d, t: L.trailQuery(x, z).t }) },
      });
      expect(Math.hypot(h.x - SIGN.x, h.z - SIGN.z)).toBeGreaterThan(3);
      expect(Math.hypot(h.x - PUNKU.x, h.z - PUNKU.z)).toBeGreaterThan(PUNKU_KEEP_OUT_R + 3);
      expect(distToPath(BAND, h.x, h.z)).toBeGreaterThan(BAND_R);
    });
  }
});
