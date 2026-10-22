import { describe, expect, test } from "bun:test";
import { bodyPaint, composeHuman, type HumanSpec, hangsOf, rigOf, specKey } from "./archetype";
import { buildArchetype, type FaceMap, type GeoData, projectFace } from "./build";
import { PEOPLE, TRAVELER } from "./presets";
import { DEFAULT_DRESS, dress, HS, PALETTE_SIZE } from "./slots";

const all: Array<[string, HumanSpec]> = [
  ...Object.entries(TRAVELER).map(([k, v]) => [`traveler-${k}`, v] as [string, HumanSpec]),
  ...(Object.entries(PEOPLE) as Array<[string, HumanSpec]>),
];

function sound(geo: GeoData, nBones: number) {
  const nv = geo.position.length / 3;
  expect(nv).toBeGreaterThan(30);
  for (let i = 0; i < geo.position.length; i++) expect(Number.isFinite(geo.position[i])).toBe(true);
  for (let v = 0; v < nv; v++) {
    const w = geo.skinWeight;
    expect(w[v * 4]! + w[v * 4 + 1]! + w[v * 4 + 2]! + w[v * 4 + 3]!).toBeCloseTo(1, 4);
    for (let k = 0; k < 4; k++) expect(geo.skinIndex[v * 4 + k]!).toBeLessThan(nBones);
    expect(geo.slots[v * 2]!).toBeLessThan(PALETTE_SIZE);
    expect(geo.slots[v * 2 + 1]!).toBeLessThan(PALETTE_SIZE);
  }
  for (let i = 0; i < geo.index.length; i++) expect(geo.index[i]!).toBeLessThan(nv);
}

describe("every preset builds into sound skinned geometry", () => {
  for (const [name, spec] of all)
    test(`${name} (far LOD)`, () => {
      const c = composeHuman(spec, 2);
      const built = buildArchetype(c.bones, c.pieces);
      expect(c.bones.length).toBeLessThanOrEqual(32);
      sound(built.body, c.bones.length);
      // Far: cloth folds into the body draw, and stays cheap.
      expect(built.cloth).toBeNull();
      expect(built.stats.bodyTris).toBeLessThan(5000);
    });
  for (const name of ["traveler-andean", "traveler-beach", "campesina", "comunero", "wawaGirl"]) {
    const spec = all.find((a) => a[0] === name)?.[1] as HumanSpec;
    test(`${name} (near LOD)`, () => {
      const c = composeHuman(spec, 0);
      const built = buildArchetype(c.bones, c.pieces);
      sound(built.body, c.bones.length);
      if (built.cloth) sound(built.cloth, c.bones.length);
      // One hero character (two draw calls): keep it under ~40k triangles.
      expect(built.stats.bodyTris + built.stats.clothTris).toBeLessThan(40000);
    });
  }
});

describe("archetype API", () => {
  test("the skeleton does not depend on the LOD (one rig, geometry swaps)", () => {
    const spec = PEOPLE.campesina as HumanSpec;
    const r = rigOf(spec);
    for (const lod of [0, 1, 2] as const) {
      const c = composeHuman(spec, lod);
      expect(c.bones.map((b) => b.name)).toEqual(r.bones.map((b) => b.name));
    }
  });
  test("spring chains name existing bones", () => {
    for (const [, spec] of all) {
      const names = new Set(rigOf(spec).bones.map((b) => b.name));
      for (const h of hangsOf(spec)) for (const b of h.bones) expect(names.has(b)).toBe(true);
    }
  });
  test("spec keys ignore property order", () => {
    const a: HumanSpec = { sex: "f", hair: "bun", top: "tee", bottom: "shorts", feet: "bare" };
    const b = { feet: "bare", bottom: "shorts", top: "tee", hair: "bun", sex: "f" } as HumanSpec;
    expect(specKey(a)).toBe(specKey(b));
    expect(specKey(a)).not.toBe(specKey({ ...a, hat: "cap" }));
  });
  test("body bands have increasing stops and one more slot than stops", () => {
    for (const [, spec] of all) {
      const p = bodyPaint(spec);
      for (const b of [p.waist, p.chest, p.arm, p.leg]) {
        expect(b.slots.length).toBe(b.stops.length + 1);
        for (let i = 1; i < b.stops.length; i++) expect(b.stops[i]!).toBeGreaterThan(b.stops[i - 1]!);
      }
    }
  });
  test("children are smaller with larger heads; elders stoop", () => {
    const kid = rigOf(PEOPLE.wawaBoy as HumanSpec);
    const man = rigOf(PEOPLE.campesino as HumanSpec);
    expect(kid.opts.scale).toBeLessThan(0.7);
    expect(kid.opts.head ?? 1).toBeGreaterThan(1.1);
    expect(rigOf(PEOPLE.amauta as HumanSpec).style.stoop ?? 0).toBeGreaterThan(0);
    expect(man.style.stoop ?? 0).toBe(0);
  });
  test("dress fills every slot over the defaults", () => {
    const p = dress({ skin: "#123456" });
    expect(p.length).toBe(PALETTE_SIZE);
    expect(p[HS.skin]).toBe("#123456");
    expect(p[HS.hair]).toBe(DEFAULT_DRESS.hair);
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
    const m: FaceMap = {
      origin: [0.08, 0, 0],
      right: [0, 0, 1],
      up: [0, 1, 0],
      fwd: [1, 0, 0],
      w: 0.1,
      h: 0.1,
      mirror: true,
    };
    const pos = new Float32Array([0.08, 0.01, 0.02, -0.08, 0.01, 0.02]);
    const nrm = new Float32Array([1, 0, 0, -1, 0, 0]);
    const out = new Float32Array(6);
    projectFace(m, pos, nrm, out);
    expect(Array.from(out.slice(0, 3))).toEqual(Array.from(out.slice(3, 6)));
    expect(out[2]).toBeCloseTo(1);
  });
});
