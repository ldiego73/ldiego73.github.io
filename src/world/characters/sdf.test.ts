import { describe, expect, test } from "bun:test";
import { type Band, bandAt, paintVertices } from "./paint";
import { fieldAt, mirrorX, prepare, primDistance, rotZ, smin } from "./sdf";
import { polygonise } from "./surface-nets";

describe("field", () => {
  test("smooth min equals min far apart and dips below it inside the blend", () => {
    expect(smin(0.5, 0.1, 0.05)).toBeCloseTo(0.1);
    expect(smin(0.1, 0.1, 0.1)).toBeLessThan(0.1);
  });
  test("round cone distance on its axis and at its ends", () => {
    const [p] = prepare([
      { shape: { kind: "cone", a: [0, 0, 0], b: [0, 1, 0], ra: 0.2, rb: 0.1 }, bone: 0, blend: 0, slot: 0 },
    ]);
    expect(primDistance(p!, 0, -0.5, 0)).toBeCloseTo(0.3, 4);
    expect(primDistance(p!, 0, 1.5, 0)).toBeCloseTo(0.4, 4);
    expect(primDistance(p!, 0, 0.5, 0)).toBeLessThan(0);
  });
  test("mirroring keeps distances symmetric (rotated box)", () => {
    const a = {
      shape: {
        kind: "box" as const,
        c: [0.2, 0, 0] as [number, number, number],
        h: [0.1, 0.05, 0.05] as [number, number, number],
        round: 0.01,
        rot: rotZ(0.4),
      },
      bone: 1,
      blend: 0,
      slot: 0,
    };
    const [pa, pb] = prepare([a, mirrorX(a, 2)]);
    expect(primDistance(pa!, 0.25, 0.03, 0.01)).toBeCloseTo(primDistance(pb!, -0.25, 0.03, 0.01), 6);
  });
});

describe("surface nets", () => {
  test("a sphere polygonises onto its radius with outward normals", () => {
    const prims = prepare([
      { shape: { kind: "ellipsoid", c: [0, 0, 0], r: [0.3, 0.3, 0.3] }, bone: 0, blend: 0, slot: 0 },
    ]);
    const m = polygonise(prims, 0.03);
    const nv = m.positions.length / 3;
    expect(nv).toBeGreaterThan(100);
    expect(m.indices.length % 3).toBe(0);
    for (let v = 0; v < nv; v++) {
      const x = m.positions[v * 3]!;
      const y = m.positions[v * 3 + 1]!;
      const z = m.positions[v * 3 + 2]!;
      const r = Math.hypot(x, y, z);
      expect(Math.abs(r - 0.3)).toBeLessThan(0.003);
      expect((x * m.normals[v * 3]! + y * m.normals[v * 3 + 1]! + z * m.normals[v * 3 + 2]!) / r).toBeGreaterThan(0.95);
    }
    // Winding agrees with the outward normals.
    const [a, b, c] = [m.indices[0]!, m.indices[1]!, m.indices[2]!];
    const P = (i: number) => [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    const pa = P(a);
    const e1 = P(b).map((q, k) => q - pa[k]!);
    const e2 = P(c).map((q, k) => q - pa[k]!);
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    expect(n[0]! * pa[0]! + n[1]! * pa[1]! + n[2]! * pa[2]!).toBeGreaterThan(0);
  });
  test("two blended capsules make one closed surface (every edge shared by two triangles)", () => {
    const prims = prepare([
      { shape: { kind: "cone", a: [0, 0, 0], b: [0, 0.4, 0], ra: 0.08, rb: 0.06 }, bone: 0, blend: 0.04, slot: 0 },
      { shape: { kind: "cone", a: [0, 0.4, 0], b: [0.3, 0.5, 0], ra: 0.06, rb: 0.05 }, bone: 1, blend: 0.04, slot: 1 },
    ]);
    const m = polygonise(prims, 0.02);
    const edges = new Map<string, number>();
    for (let t = 0; t < m.indices.length; t += 3)
      for (let e = 0; e < 3; e++) {
        const a = m.indices[t + e]!;
        const b = m.indices[t + ((e + 1) % 3)]!;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    for (const n of edges.values()) expect(n).toBe(2);
    // Nearest primitive lists are sorted.
    for (let v = 0; v < m.positions.length / 3; v++)
      expect(m.nearD[v * m.k]!).toBeLessThanOrEqual(m.nearD[v * m.k + 1]!);
    expect(fieldAt(prims, [0, 1], 0, 0.4, 0)).toBeLessThan(0);
  });
});

describe("paint bands", () => {
  test("picks the slots either side of the nearest stop and the signed distance", () => {
    expect(bandAt([0.2, 0.5], [1, 2, 3], 0.1)).toEqual([1, 2, expect.closeTo(-0.1)]);
    expect(bandAt([0.2, 0.5], [1, 2, 3], 0.45)).toEqual([2, 3, expect.closeTo(-0.05)]);
    expect(bandAt([0.2, 0.5], [1, 2, 3], 0.6)).toEqual([2, 3, expect.closeTo(0.1)]);
    expect(bandAt([], [4], 0)).toEqual([4, 4, 1]);
  });
  test("far from every stop a vertex carries only its own slot", () => {
    expect(bandAt([0.2, 0.5], [1, 2, 3], 0.05, 0.03)).toEqual([1, 1, expect.closeTo(-0.15)]);
    expect(bandAt([0.2, 0.5], [1, 2, 3], 0.9, 0.03)).toEqual([3, 3, expect.closeTo(0.4)]);
    expect(bandAt([0.2, 0.5], [1, 2, 3], 0.21, 0.03)).toEqual([1, 2, expect.closeTo(0.01)]);
  });
  test("vertices outside every band take their primitive's slot", () => {
    const band: Band = { prims: [0], at: (p) => p[1], stops: [0.5], slots: [5, 6] };
    const pos = new Float32Array([0, 0.4, 0, 0, 0.7, 0, 1, 1, 1]);
    const out = paintVertices(pos, (v) => (v < 2 ? 0 : 1), [9, 7], [band], Infinity);
    expect(Array.from(out.slots)).toEqual([5, 6, 5, 6, 7, 7]);
    expect(out.cut[0]).toBeCloseTo(-0.1);
    expect(out.cut[1]).toBeCloseTo(0.2);
    expect(out.cut[2]).toBe(1);
  });
});
