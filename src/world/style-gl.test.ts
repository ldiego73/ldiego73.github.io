import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { KW_SLOTS } from "./style";
import {
  clothFlex,
  installStyleShaders,
  KW_U,
  noPaint,
  paintStrength,
  setInkPass,
  styleUniforms,
  windSway,
} from "./style-gl";

installStyleShaders();
const C = THREE.ShaderChunk as unknown as Record<string, string>;

describe("chunk patches", () => {
  test("toon, fog and projection chunks carry the style and keep three's anchors", () => {
    expect(C.cpa_pars).toContain(`uniform vec4 cpaU[${KW_SLOTS}]`);
    expect(C.common).toContain("#include <cpa_pars>");
    expect(C.lights_toon_pars_fragment).toContain("RE_Direct_Toon");
    expect(C.lights_toon_pars_fragment).toContain("cpaLitAcc");
    expect(C.fog_fragment).toContain("cpaHaze");
    expect(C.fog_fragment).toContain("fogFactor");
    expect(C.project_vertex).toContain("#ifdef KW_WIND");
    expect(C.project_vertex).toContain("gl_Position = projectionMatrix * mvPosition");
    // Other modules replace these include lines: they must still be there in the shader libs.
    expect(THREE.ShaderLib.toon.fragmentShader).toContain("#include <color_fragment>");
    expect(THREE.ShaderLib.toon.vertexShader).toContain("#include <project_vertex>");
  });
  test("idempotent", () => {
    const before = C.common;
    installStyleShaders();
    expect(C.common).toBe(before);
  });
});

describe("shared uniforms", () => {
  test("built-in material uniforms share the arrays by reference after three's clone", () => {
    const cloned = THREE.UniformsUtils.clone(THREE.ShaderLib.toon.uniforms) as Record<string, { value: unknown }>;
    expect(cloned.cpaU?.value).toBe(KW_U);
    const basic = THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms) as Record<string, { value: unknown }>;
    expect(basic.cpaU?.value).toBe(KW_U);
    expect(styleUniforms().cpaU.value).toBe(KW_U);
  });
  test("ink pass flag", () => {
    setInkPass(true);
    expect(KW_U[12 * 4]).toBe(1);
    setInkPass(false);
    expect(KW_U[12 * 4]).toBe(0);
  });
});

describe("material opt-ins", () => {
  test("windSway sets the mode defines and makes the material ink-aware", () => {
    const m = windSway(new THREE.MeshToonMaterial(), { mode: "cloth", flex: true, amp: 2 });
    expect(m.defines?.KW_WIND).toBe(3);
    expect(m.defines).toHaveProperty("KW_WIND_FLEX");
    expect(m.defines?.KW_WIND_AMP).toBe("2.0");
    expect(m.defines).toHaveProperty("KW_INKAWARE");
    expect(m.allowOverride).toBe(false);
  });
  test("noPaint swaps shared materials for one twin per colour and edits owned ones", () => {
    const shared = new THREE.MeshToonMaterial();
    shared.userData.kwShared = true;
    const own = new THREE.MeshToonMaterial();
    const g = new THREE.Group();
    const a = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const b = new THREE.Mesh(new THREE.BoxGeometry(), shared);
    const c = new THREE.Mesh(new THREE.BoxGeometry(), own);
    g.add(a, b, c);
    noPaint(g);
    expect(a.material).not.toBe(shared);
    expect(a.material).toBe(b.material);
    expect((a.material as THREE.Material).defines?.KW_PAINT).toBe("0.0");
    expect(shared.defines?.KW_PAINT).toBeUndefined();
    expect(c.material).toBe(own);
    expect(own.defines?.KW_PAINT).toBe("0.0");
    expect(paintStrength(new THREE.MeshToonMaterial(), 0.5).defines?.KW_PAINT).toBe("0.5");
  });
  test("clothFlex runs 0 at the pinned edge to 1 at the free edge", () => {
    const g = clothFlex(new THREE.PlaneGeometry(2, 1, 2, 1).translate(1, 0, 0), "x", 0, 2);
    const f = g.getAttribute("flex");
    const xs = g.getAttribute("position");
    for (let i = 0; i < f.count; i++) expect(f.getX(i)).toBeCloseTo(xs.getX(i) / 2, 6);
  });
});
