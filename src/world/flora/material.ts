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
 */
import * as THREE from "three";

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

export interface SwayUniforms {
  uTime: { value: number };
  /** Sway amplitude multiplier (0 = still, e.g. reduced motion). */
  uWind: { value: number };
}

/**
 * Vertex-colored toon material with wind sway: each vertex moves by `flex` (attribute) × instance height
 * scale along a slowly turning world wind direction, with per-instance phase (from the instance position)
 * and travelling gusts so a meadow ripples instead of pulsing in sync.
 */
export function swayMaterial(gradientMap: THREE.Texture | null, u: SwayUniforms, side: THREE.Side = THREE.FrontSide) {
  const m = baseToon(gradientMap, side);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uInkPass = INK;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float flex;\nuniform float uTime, uWind;")
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 ip = instanceMatrix[3].xz;
          float isc = length(instanceMatrix[1].xyz);
        #else
          vec2 ip = vec2(0.0);
          float isc = 1.0;
        #endif
        // Wind: a gentle prevailing direction that wanders, gusts rolling across the slope.
        vec2 wdir = normalize(vec2(0.8 + 0.3 * sin(uTime * 0.05), 0.55 + 0.3 * cos(uTime * 0.043)));
        float along = dot(ip, wdir);
        float gust = 0.55 + 0.45 * sin(along * 0.09 - uTime * 0.9) * sin(along * 0.023 + uTime * 0.31);
        float ph = uTime * 1.7 + ip.x * 0.37 + ip.y * 0.29;
        float sw = (0.6 + 0.4 * sin(ph) + 0.18 * sin(ph * 2.3 + 1.1)) * gust;
        float k = flex * isc * uWind;
        mvPosition.xz += wdir * sw * k + vec2(-wdir.y, wdir.x) * sin(ph * 1.3) * 0.25 * k;
        mvPosition.y -= sw * sw * k * 0.18;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", INK_FRAG_PARS)
      .replace("#include <dithering_fragment>", INK_FRAG_OUT);
  };
  m.customProgramCacheKey = () => "kw-flora-sway";
  return m;
}

/** Vertex-colored toon material for static instanced meshes (trees); the regular ink prepass handles them. */
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
  return m;
}
