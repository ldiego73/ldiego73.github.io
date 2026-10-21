import { describe, expect, test } from "bun:test";
import { buildArchetype, type FaceMap, projectFace } from "./build";
import { CAMPESINA_PALETTE, campesinaBones, campesinaPieces } from "./campesina";
import { LLAMA_PALETTE, llamaBones, llamaPieces } from "./llama";
import { TRAVELER_PALETTE, travelerBones, travelerPieces } from "./traveler";

const cases = [
  { name: "traveler", bones: travelerBones, pieces: travelerPieces, palette: TRAVELER_PALETTE, cloth: true },
  { name: "campesina", bones: campesinaBones, pieces: campesinaPieces, palette: CAMPESINA_PALETTE, cloth: true },
  { name: "llama", bones: llamaBones, pieces: llamaPieces, palette: LLAMA_PALETTE, cloth: false },
];

describe("archetypes build into sound skinned geometry", () => {
  for (const c of cases)
    test(c.name, () => {
      const bones = c.bones();
      const built = buildArchetype(bones, c.pieces(bones));
      expect(bones.length).toBeLessThanOrEqual(32);
      for (const geo of [built.body, built.cloth]) {
        if (!geo) continue;
        const nv = geo.position.length / 3;
        expect(nv).toBeGreaterThan(100);
        for (let i = 0; i < geo.position.length; i++) expect(Number.isFinite(geo.position[i])).toBe(true);
        for (let v = 0; v < nv; v++) {
          const w = geo.skinWeight;
          expect(w[v * 4]! + w[v * 4 + 1]! + w[v * 4 + 2]! + w[v * 4 + 3]!).toBeCloseTo(1, 4);
          for (let k = 0; k < 4; k++) expect(geo.skinIndex[v * 4 + k]!).toBeLessThan(bones.length);
          expect(geo.slots[v * 2]!).toBeLessThan(c.palette.length);
          expect(geo.slots[v * 2 + 1]!).toBeLessThan(c.palette.length);
        }
        for (let i = 0; i < geo.index.length; i++) expect(geo.index[i]!).toBeLessThan(nv);
      }
      expect(!!built.cloth).toBe(c.cloth);
      // Budget for one hero character (two draw calls): keep it under ~40k triangles.
      expect(built.stats.bodyTris + built.stats.clothTris).toBeLessThan(40000);
    });
});

describe("face decal projection", () => {
  const f: FaceMap = { origin: [0, 0, 0.2], right: [1, 0, 0], up: [0, 1, 0], fwd: [0, 0, 1], w: 0.3, h: 0.3 };
  test("front-facing points near the plane are masked in, the back of the head and the neck are not", () => {
    const pos = new Float32Array([0, 0, 0.2, 0, 0, -0.2, 0, -0.1, 0.05]);
    const nrm = new Float32Array([0, 0, 1, 0, 0, -1, 0, 0, 1]);
    const out = new Float32Array(9);
    projectFace(f, pos, nrm, out);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[2]).toBeCloseTo(1);
    expect(out[5]).toBe(0);
    expect(out[8]).toBe(0);
  });
  test("mirrored decals read the same on both sides", () => {
    const m: FaceMap = { origin: [0.08, 0, 0], right: [0, 0, 1], up: [0, 1, 0], fwd: [1, 0, 0], w: 0.1, h: 0.1, mirror: true };
    const pos = new Float32Array([0.08, 0.01, 0.02, -0.08, 0.01, 0.02]);
    const nrm = new Float32Array([1, 0, 0, -1, 0, 0]);
    const out = new Float32Array(6);
    projectFace(m, pos, nrm, out);
    expect(Array.from(out.slice(0, 3))).toEqual(Array.from(out.slice(3, 6)));
    expect(out[2]).toBeCloseTo(1);
  });
});
