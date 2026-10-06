import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { atlasV, WHITE_UV } from "./arcade-merge";
import { CULL_BANDS, cullDistance, PHONE_CULL } from "./detail-cull";
import { flattenToonGroup, mergeColored, vertexToon } from "./merge-colors";

describe("mergeColored", () => {
  test("bakes linear colors and matrices into one non-indexed geometry", () => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const red = new THREE.Color("#c0392b");
    const blue = new THREE.Color("#2a4d8f");
    const g = mergeColored([
      { geometry: box, color: red },
      { geometry: box, color: blue, matrix: new THREE.Matrix4().makeTranslation(5, 0, 0) },
    ])!;
    expect(g.index).toBeNull();
    const pos = g.getAttribute("position");
    const col = g.getAttribute("color");
    expect(pos.count).toBe(72);
    expect(col.getX(0)).toBeCloseTo(red.r, 6);
    expect(col.getZ(71)).toBeCloseTo(blue.b, 6);
    expect(pos.getX(71)).toBeGreaterThan(4);
    expect(box.getAttribute("color")).toBeUndefined();
  });

  test("flattenToonGroup folds plain toon meshes and leaves maps and glows alone", () => {
    const grp = new THREE.Group();
    grp.name = "kit";
    const geo = () => new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    grp.add(new THREE.Mesh(geo(), new THREE.MeshToonMaterial({ color: "#ff0000" })));
    grp.add(new THREE.Mesh(geo(), new THREE.MeshToonMaterial({ color: "#00ff00" })));
    grp.add(new THREE.Mesh(geo(), new THREE.MeshToonMaterial({ color: "#0000ff", emissive: "#ffaa00" })));
    const mat = vertexToon();
    const m = flattenToonGroup(grp, mat)!;
    expect(m.name).toBe("kit:vc");
    expect(grp.children.length).toBe(2);
    expect(m.geometry.getAttribute("position").count).toBe(72);
    mat.dispose();
  });
});

describe("cabinet atlas", () => {
  test("stone rows map inside the atlas, away from the white texel", () => {
    expect(atlasV(1)).toBe(1);
    expect(atlasV(0)).toBeGreaterThan(WHITE_UV.v + 0.5 / 18);
  });
});

describe("cullDistance", () => {
  test("phone factor scales every band, big meshes are never culled", () => {
    for (const [r, d] of CULL_BANDS) expect(cullDistance(r, PHONE_CULL)).toBeCloseTo(d * PHONE_CULL, 6);
    expect(cullDistance(0.2)).toBe(CULL_BANDS[0]![1]);
    expect(cullDistance(50, PHONE_CULL)).toBe(Number.POSITIVE_INFINITY);
  });
});
