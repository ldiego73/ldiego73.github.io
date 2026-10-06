import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { rigMaterial, swayMaterial } from "./material";
import {
  alisoModel,
  chusqueaModel,
  ichuModel,
  lupineModel,
  pisonayModel,
  quenuaModel,
  uncaModel,
  yellowFlowerModel,
} from "./models";

const size = (g: THREE.BufferGeometry) => {
  g.computeBoundingBox();
  const b = g.boundingBox as THREE.Box3;
  return { w: Math.max(b.max.x - b.min.x, b.max.z - b.min.z), h: b.max.y, bottom: b.min.y };
};
const finite = (g: THREE.BufferGeometry) =>
  Array.from((g.attributes.position as THREE.BufferAttribute).array).every(Number.isFinite) &&
  Array.from((g.attributes.normal as THREE.BufferAttribute).array).every(Number.isFinite);

describe("flora models (proportions vs a 1.7 u traveler)", () => {
  test("ichu tufts: knee-to-waist high, with sway weights", () => {
    for (const k of ["tall", "short", "dry"] as const) {
      const g = ichuModel(k, false);
      const s = size(g);
      expect(finite(g)).toBe(true);
      expect(g.attributes.flex).toBeDefined();
      expect(g.attributes.color).toBeDefined();
      expect(s.h).toBeGreaterThan(0.4);
      expect(s.h).toBeLessThan(1.9);
      expect(s.bottom).toBeGreaterThan(-0.1);
      expect(ichuModel(k, true).attributes.position!.count).toBeLessThan(g.attributes.position!.count);
    }
  });
  test("trees: queñua 3–5, aliso tallest, pisonay broad", () => {
    const q = size(quenuaModel().geo);
    const a = size(alisoModel().geo);
    const u = size(uncaModel().geo);
    const p = size(pisonayModel().geo);
    const c = size(chusqueaModel(false).geo);
    expect(q.h).toBeGreaterThan(3);
    expect(q.h).toBeLessThan(4.6);
    expect(a.h).toBeGreaterThan(6.5);
    expect(a.h).toBeGreaterThan(u.h);
    expect(a.w / a.h).toBeLessThan(0.6); // conical
    expect(p.w).toBeGreaterThan(7);
    expect(p.w / p.h).toBeGreaterThan(1);
    expect(c.h).toBeLessThan(3.6);
    for (const m of [quenuaModel(), alisoModel(), uncaModel(), pisonayModel(), chusqueaModel(false)]) {
      expect(finite(m.geo)).toBe(true);
      expect(m.perches.length).toBeGreaterThan(2);
      for (const [, y] of m.perches) expect(y).toBeGreaterThan(1);
    }
    expect(uncaModel().flowers.length).toBeGreaterThan(2);
    expect(pisonayModel().flowers.length).toBeGreaterThan(5);
  });
  test("flowers stay small", () => {
    expect(size(lupineModel(false).geo).h).toBeLessThan(0.9);
    expect(size(yellowFlowerModel(false).geo).h).toBeLessThan(0.5);
  });
});

/** Runs a material's onBeforeCompile on the real toon shader source: every hook must exist in this three build. */
function compile(m: THREE.Material) {
  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: THREE.ShaderLib.toon.vertexShader,
    fragmentShader: THREE.ShaderLib.toon.fragmentShader,
  };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
  return shader;
}

describe("vertex-shader materials", () => {
  test("sway material patches the projection and the ink output", () => {
    const m = swayMaterial(null, { uTime: { value: 0 }, uWind: { value: 1 } });
    const s = compile(m);
    expect(m.allowOverride).toBe(false);
    expect(s.vertexShader).toContain("attribute float flex");
    expect(s.vertexShader).not.toContain("#include <project_vertex>");
    expect(s.vertexShader).toContain("gl_Position = projectionMatrix * mvPosition");
    expect(s.fragmentShader).toContain("uInkPass > 0.5");
    expect(s.uniforms.uTime).toBeDefined();
  });
  test("rig material rotates wings/heads (positions and normals)", () => {
    const m = rigMaterial(
      null,
      { uShoulder: { value: new THREE.Vector3() }, uNeck: { value: new THREE.Vector3() } },
      "t",
    );
    const s = compile(m);
    expect(s.vertexShader).toContain("objectNormal = kwRig * objectNormal");
    expect(s.vertexShader).toContain("transformed = kwRig * (transformed - kwPivot) + kwPivot");
    expect(s.vertexShader.indexOf("kwRig * objectNormal")).toBeLessThan(
      s.vertexShader.indexOf("#include <defaultnormal_vertex>"),
    );
    expect(s.fragmentShader).toContain("uInkPass > 0.5");
  });
});
