/**
 * Toon materials for vegetation and birds that deform in the vertex shader (wind sway, wing/head rig)
 * and still get a correct ink outline.
 *
 * The ink pass (outline.ts) renders a normal + depth prepass with `scene.overrideMaterial`
 * (a plain MeshNormalMaterial): animated vertices would be inked at their rest pose and the lines
 * would "swim" off the shapes. So these materials opt out of the override (`allowOverride = false`) and,
 * while the prepass is drawing (detected per draw in `onBeforeRender`), write the packed view normal
 * themselves — same output as MeshNormalMaterial, but with the animated geometry.
 *
 * Never patches the shared `toon.toon(color)` cache (other systems use those materials).
 * Ground cover and trees now ride the shared wind of the cel pintado andino style (style-gl.ts `windSway`,
 * whose ink-aware output replaces the per-mesh flag below for them); the bird rig keeps its own flag.
 */
import * as THREE from "three";
import { paintStrength, windSway } from "../style-gl";

/** Shared flag: 1 while the outline prepass draws. Set by `inkAware` meshes right before their draw. */
const INK = { value: 0 };

/** Makes a mesh using one of these materials ink-correct (call once per mesh). */
export function inkAware(mesh: THREE.Mesh) {
  mesh.onBeforeRender = (_r, scene) => {
    INK.value = (scene as THREE.Scene).overrideMaterial ? 1 : 0;
  };
}

const INK_FRAG_PARS = "#include <common>\nuniform float uInkPass;";
const INK_FRAG_OUT = `#include <dithering_fragment>
  if (uInkPass > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);`;

function baseToon(gradientMap: THREE.Texture | null, side: THREE.Side) {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap, side });
  m.allowOverride = false;
  return m;
}

/**
 * Vertex-colored toon material for ground cover (ichu, lupine, daisies) on the shared wind (../wind.ts,
 * ../wind-glsl.ts mode "grass"): each vertex bends by its `flex` attribute × instance height scale along the
 * world's drifting wind, with per-instance phase, the gust fronts rolling across the slope, and bodies near
 * the traveler parting it. Ink-aware through style-gl.ts (the prepass draws it displaced). Reduced motion is
 * handled by the wind state (slow, constant sway, no gusts).
 */
export function swayMaterial(gradientMap: THREE.Texture | null, side: THREE.Side = THREE.FrontSide) {
  return windSway(baseToon(gradientMap, side), { mode: "grass", flex: true });
}

/** Tree height (object units) the trunk bend is measured against: the sierra trees stand 3–7 u. */
const TREE_H = 5;

/**
 * Vertex-colored toon material for instanced trees on the shared wind (mode "tree": trunk bend with
 * height², branch sway, leaf flutter, spring kicks when the traveler brushes a small one). Ink-aware.
 */
export function treeMaterial(gradientMap: THREE.Texture | null, side: THREE.Side = THREE.FrontSide) {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap, side });
  return windSway(m, { mode: "tree", height: TREE_H, amp: 0.8 });
}

/** Vertex-colored toon material for static instanced meshes; the regular ink prepass handles them. */
export function staticMaterial(gradientMap: THREE.Texture | null, side: THREE.Side = THREE.FrontSide) {
  return new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap, side });
}

export interface RigUniforms {
  /** |x|, y, z of the right shoulder (wing pivot); the left one mirrors x. */
  uShoulder: { value: THREE.Vector3 };
  /** Neck pivot (head turns/pitches around it). */
  uNeck: { value: THREE.Vector3 };
}

/**
 * Bird rig in the vertex shader. Geometry attribute `rig` (x = wing side −1/0/1, y = head 0/1);
 * per-instance attribute `pose` = (wing roll, head yaw, head pitch, wing fold 0..1).
 * Wings first fold back along the body (yaw about the shoulder), then roll (flap) about the body axis.
 * Normals get the same rotation, so the toon bands and the ink follow the flapping wings.
 */
export function rigMaterial(gradientMap: THREE.Texture | null, u: RigUniforms, key: string) {
  const m = baseToon(gradientMap, THREE.DoubleSide);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uShoulder = u.uShoulder;
    shader.uniforms.uNeck = u.uNeck;
    shader.uniforms.uInkPass = INK;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute vec2 rig;
        attribute vec4 pose;
        uniform vec3 uShoulder, uNeck;
        mat3 kwRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
        mat3 kwRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
        mat3 kwRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        mat3 kwRig = mat3(1.0);
        vec3 kwPivot = vec3(0.0);
        if (abs(rig.x) > 0.5) {
          kwRig = kwRotZ(rig.x * pose.x) * kwRotY(rig.x * pose.w * 1.45);
          kwPivot = vec3(uShoulder.x * rig.x, uShoulder.y, uShoulder.z);
        } else if (rig.y > 0.5) {
          kwRig = kwRotY(pose.y) * kwRotX(pose.z);
          kwPivot = uNeck;
        }
        objectNormal = kwRig * objectNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n        transformed = kwRig * (transformed - kwPivot) + kwPivot;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", INK_FRAG_PARS)
      .replace("#include <dithering_fragment>", INK_FRAG_OUT);
  };
  m.customProgramCacheKey = () => `kw-bird-rig-${key}`;
  // Birds move: world-space painted blotches would slide over them.
  return paintStrength(m, 0);
}
