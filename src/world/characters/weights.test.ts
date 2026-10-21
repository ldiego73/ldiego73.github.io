import { describe, expect, test } from "bun:test";
import { chainSkin, denseWeights, falloff, relaxWeights, rigidSkin, skinFromField, topFour } from "./weights";

const sums = (w: Float32Array) => {
  const out: number[] = [];
  for (let v = 0; v < w.length / 4; v++) out.push(w[v * 4]! + w[v * 4 + 1]! + w[v * 4 + 2]! + w[v * 4 + 3]!);
  return out;
};

describe("skin weights", () => {
  test("falloff is 1 at no gap, 0 past the width, smooth between", () => {
    expect(falloff(0, 0.05)).toBe(1);
    expect(falloff(0.06, 0.05)).toBe(0);
    expect(falloff(0.025, 0.05)).toBeCloseTo(0.5);
  });
  test("one primitive → its bone at weight 1", () => {
    const near = new Int16Array([0, -1]);
    const nearD = new Float32Array([0, 1e9]);
    const w = denseWeights(near, nearD, 2, 1, { primBone: [3], primWidth: [0.05], bones: 4 });
    const s = topFour(w, 1, 4);
    expect(s.index[0]).toBe(3);
    expect(s.weight[0]).toBeCloseTo(1);
  });
  test("a joint vertex equidistant from two bones splits evenly", () => {
    const near = new Int16Array([0, 1]);
    const nearD = new Float32Array([0.001, 0.001]);
    const s = topFour(denseWeights(near, nearD, 2, 1, { primBone: [1, 2], primWidth: [0.05, 0.05], bones: 3 }), 1, 3);
    expect(s.weight[0]).toBeCloseTo(0.5);
    expect(s.weight[1]).toBeCloseTo(0.5);
  });
  test("top four is normalised and keeps the strongest bones", () => {
    const nb = 6;
    const w = new Float32Array([0.1, 0.5, 0.05, 0.3, 0.2, 0.4]);
    const s = topFour(w, 1, nb);
    expect(Array.from(s.index)).toEqual([1, 5, 3, 4]);
    expect(sums(s.weight)[0]).toBeCloseTo(1, 6);
  });
  test("relaxing spreads a bend across neighbours and stays normalised", () => {
    // A strip of 4 vertices: bones 0 | 0 | 1 | 1.
    const nb = 2;
    const w = new Float32Array([1, 0, 1, 0, 0, 1, 0, 1]);
    const idx = [0, 1, 2, 1, 3, 2];
    const r = relaxWeights(w, 4, nb, idx, 2);
    expect(r[1 * nb + 1]).toBeGreaterThan(0);
    expect(r[2 * nb]).toBeGreaterThan(0);
    for (let v = 0; v < 4; v++) expect(r[v * nb]! + r[v * nb + 1]!).toBeCloseTo(1, 6);
  });
  test("full pipeline, rigid and chain skins all sum to one", () => {
    const near = new Int16Array([0, 1, 1, 0, 0, -1]);
    const nearD = new Float32Array([0, 0.02, 0, 0.01, 0, 1e9]);
    const s = skinFromField(near, nearD, 2, 3, [0, 1, 2], { primBone: [0, 1], primWidth: [0.05, 0.05], bones: 2 });
    for (const x of sums(s.weight)) expect(x).toBeCloseTo(1, 6);
    for (const x of sums(rigidSkin(5, 2).weight)) expect(x).toBeCloseTo(1, 6);
    const c = chainSkin(3, (v) => [
      [0, 1 - v / 2],
      [1, v / 2],
    ]);
    for (const x of sums(c.weight)) expect(x).toBeCloseTo(1, 6);
  });
});
