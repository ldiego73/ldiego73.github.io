import { describe, expect, test } from "bun:test";
import { buildAnimal } from "./build";
import { SPECIES } from "./species";

describe("every species builds into sound skinned geometry", () => {
  for (const sp of Object.values(SPECIES))
    test(sp.key, () => {
      const b = buildAnimal(sp, 2);
      expect(b.bones.length).toBeLessThanOrEqual(32);
      expect(sp.name.es.length).toBeGreaterThan(0);
      expect(sp.name.en.length).toBeGreaterThan(0);
      const g = b.body;
      const nv = g.position.length / 3;
      expect(nv).toBeGreaterThan(100);
      for (let i = 0; i < g.position.length; i++) expect(Number.isFinite(g.position[i])).toBe(true);
      for (let v = 0; v < nv; v += 7) {
        const w = g.skinWeight;
        expect(
          (w[v * 4] as number) + (w[v * 4 + 1] as number) + (w[v * 4 + 2] as number) + (w[v * 4 + 3] as number),
        ).toBeCloseTo(1, 4);
        for (let k = 0; k < 4; k++) expect(g.skinIndex[v * 4 + k] as number).toBeLessThan(b.bones.length);
        expect(g.slots[v * 2] as number).toBeLessThan(sp.palette.length);
        expect(g.slots[v * 2 + 1] as number).toBeLessThan(sp.palette.length);
      }
      for (const pal of Object.values(sp.variants ?? {})) expect(pal.length).toBe(sp.palette.length);
      // The bind pose stands on the ground (feet near y = 0), nothing far below it.
      let minY = Infinity;
      for (let v = 0; v < nv; v++) minY = Math.min(minY, g.position[v * 3 + 1] as number);
      expect(minY).toBeGreaterThan(-Math.max(0.05 * sp.size, 0.03));
    });

  test("finer LODs have more triangles (llama, horse, condor)", () => {
    for (const k of ["llama", "horse", "condor"] as const) {
      const a = buildAnimal(SPECIES[k], 0).stats.bodyTris;
      const c = buildAnimal(SPECIES[k], 2).stats.bodyTris;
      expect(a).toBeGreaterThan(c * 3);
      // Hero budget (one draw call).
      expect(a).toBeLessThan(40000);
    }
  });
});
