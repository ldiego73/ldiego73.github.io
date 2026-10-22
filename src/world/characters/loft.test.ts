import { describe, expect, test } from "bun:test";
import { frames, grid, lathe, profile, taper, tube } from "./loft";

describe("radius profiles", () => {
  test("taper interpolates and clamps", () => {
    expect(taper(0, 0.1, 0.05)).toBeCloseTo(0.1);
    expect(taper(1, 0.1, 0.05)).toBeCloseTo(0.05);
    expect(taper(2, 0.1, 0.05)).toBeCloseTo(0.05);
    expect(taper(0.5, 0.1, 0, 2)).toBeGreaterThan(taper(0.5, 0.1, 0, 1));
  });
  test("profile passes through the keys and never overshoots them", () => {
    const f = profile([
      [0, 0.08],
      [0.3, 0.1],
      [0.6, 0.06],
      [1, 0.045],
    ]);
    expect(f(0)).toBeCloseTo(0.08);
    expect(f(0.3)).toBeCloseTo(0.1);
    expect(f(1)).toBeCloseTo(0.045);
    for (let t = 0; t <= 1; t += 0.01) {
      expect(f(t)).toBeLessThanOrEqual(0.1 + 1e-9);
      expect(f(t)).toBeGreaterThanOrEqual(0.045 - 1e-9);
    }
    // Monotone between keys.
    for (let t = 0.6; t < 1; t += 0.01) expect(f(t + 0.01)).toBeLessThanOrEqual(f(t) + 1e-9);
  });
});

describe("lofts", () => {
  test("tube normals point away from its axis and match the winding", () => {
    const path: Array<[number, number, number]> = [
      [0, 0, 0],
      [0, 0.5, 0],
      [0, 1, 0],
    ];
    const g = tube(path, () => 0.1, 8);
    for (let v = 0; v < 3 * 9; v++) {
      const x = g.positions[v * 3] as number;
      const z = g.positions[v * 3 + 2] as number;
      const d = x * (g.normals[v * 3] as number) + z * (g.normals[v * 3 + 2] as number);
      expect(d).toBeGreaterThan(0);
    }
    // First triangle's geometric normal agrees with its vertex normal.
    const [a, b, c] = [g.indices[0] as number, g.indices[1] as number, g.indices[2] as number];
    const P = (i: number) => [g.positions[i * 3], g.positions[i * 3 + 1], g.positions[i * 3 + 2]] as number[];
    const pa = P(a);
    const pb = P(b);
    const pc = P(c);
    const e1 = [pb[0]! - pa[0]!, pb[1]! - pa[1]!, pb[2]! - pa[2]!];
    const e2 = [pc[0]! - pa[0]!, pc[1]! - pa[1]!, pc[2]! - pa[2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const vn = [g.normals[a * 3], g.normals[a * 3 + 1], g.normals[a * 3 + 2]] as number[];
    expect(n[0]! * vn[0]! + n[1]! * vn[1]! + n[2]! * vn[2]!).toBeGreaterThan(0);
  });
  test("closed grids duplicate the seam column and share its normal (no shading seam)", () => {
    const g = lathe(
      [
        [0.1, 1],
        [0.2, 0.5],
        [0.2, 0],
      ],
      12,
    );
    expect(g.cols).toBe(13);
    for (let r = 0; r < 3; r++) {
      const a = r * 13;
      const b = a + 12;
      for (let k = 0; k < 3; k++) expect(g.normals[a * 3 + k]).toBeCloseTo(g.normals[b * 3 + k] as number, 5);
    }
    // Outer wall normal faces outward (+z at angle 0).
    expect(g.normals[13 * 3 + 2]).toBeGreaterThan(0.5);
  });
  test("parallel transport frames stay orthonormal along a curve", () => {
    const path: Array<[number, number, number]> = [];
    for (let i = 0; i < 20; i++) path.push([Math.sin(i * 0.3) * 0.2, -i * 0.05, Math.cos(i * 0.2) * 0.1]);
    const f = frames(path);
    for (let i = 0; i < 20; i++) {
      const t = f.T[i]!;
      const n = f.N[i]!;
      expect(Math.abs(t[0] * n[0] + t[1] * n[1] + t[2] * n[2])).toBeLessThan(1e-6);
      expect(Math.hypot(...n)).toBeCloseTo(1, 6);
    }
  });
  test("grid sizes", () => {
    const g = grid(4, 5, (r, c) => [c, r, 0]);
    expect(g.positions.length).toBe(4 * 5 * 3);
    expect(g.indices.length).toBe(3 * 4 * 6);
  });
});
