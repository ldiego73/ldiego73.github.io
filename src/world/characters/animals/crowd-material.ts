/**
 * Materials of an instanced animal crowd (./crowd.ts): the characters' toon body (palette slots + crisp cuts,
 * the eye decal, painted blotches off, cel light and ink like everything else) skinned on the GPU from a bone
 * texture instead of a three Skeleton, so one InstancedMesh draws a whole herd:
 *
 *   chBones    RGBA float texture, one row per instance, 4 texels per bone (the bone matrix columns)
 *   chPalTex   RGBA float texture, one row per coat variant, one texel per palette slot (linear colour)
 *   aRow       per instance: its bone row; aVar: its coat row; aCell: its eye cell (blink, sleep)
 *
 * The instance's world placement is three's own instanceMatrix (applied after skinning by the standard
 * chunks). Ink: the material is ink-aware (style-gl.ts), so the outline prepass draws it with this shader and
 * sees the skinned pose. Shadows: a depth material with the same skinning (`crowdDepthMaterial`).
 * Uniform and varying names use the `ch` prefix (`cpa` is reserved for the shared style chunk).
 */
import * as THREE from "three";
import { inkAwareMaterial, paintStrength } from "../../style-gl";
import { gradientMap } from "../../toon";
import { injectNightRim } from "./night";

export interface CrowdUniforms {
  chBones: { value: THREE.DataTexture };
  chPalTex: { value: THREE.DataTexture };
  chFace: { value: THREE.Texture | null };
  /** x = 1 / cells, y = 1 when an eye decal is drawn. */
  chFaceK: { value: THREE.Vector2 };
}

const SKIN_PARS = /* glsl */ `
uniform highp sampler2D chBones;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
attribute float aRow;
mat4 chBone(float i) {
  int x = int(i) * 4;
  int y = int(aRow);
  return mat4(
    texelFetch(chBones, ivec2(x, y), 0),
    texelFetch(chBones, ivec2(x + 1, y), 0),
    texelFetch(chBones, ivec2(x + 2, y), 0),
    texelFetch(chBones, ivec2(x + 3, y), 0));
}
mat4 chSkinMat() {
  return skinWeight.x * chBone(skinIndex.x) + skinWeight.y * chBone(skinIndex.y)
    + skinWeight.z * chBone(skinIndex.z) + skinWeight.w * chBone(skinIndex.w);
}
`;

const VERT_PARS = /* glsl */ `
${SKIN_PARS}
attribute vec2 aSlots;
attribute float aCut;
attribute vec3 aFace;
attribute float aVar;
attribute float aCell;
flat varying vec2 chSlots;
varying float chCut;
varying vec3 chFaceV;
flat varying float chVarV;
flat varying float chCellV;
`;

const FRAG_PARS = /* glsl */ `
uniform highp sampler2D chPalTex;
uniform sampler2D chFace;
uniform vec2 chFaceK;
flat varying vec2 chSlots;
varying float chCut;
varying vec3 chFaceV;
flat varying float chVarV;
flat varying float chCellV;
`;

const FRAG_COLOR = /* glsl */ `
{
  float chS = chCut < 0.0 ? chSlots.x : chSlots.y;
  vec3 chC = texelFetch(chPalTex, ivec2(int(chS + 0.5), int(chVarV + 0.5)), 0).rgb;
  diffuseColor.rgb *= chC;
  if (chFaceK.y > 0.5 && chFaceV.z > 0.001 && chFaceV.x > 0.0 && chFaceV.x < 1.0 && chFaceV.y > 0.0 && chFaceV.y < 1.0) {
    vec4 chF = texture2D(chFace, vec2((chCellV + chFaceV.x) * chFaceK.x, chFaceV.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, chF.rgb, chF.a * chFaceV.z);
  }
}
`;

/** Toon body material of a crowd LOD mesh. */
export function crowdMaterial(u: CrowdUniforms): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: gradientMap() });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace(
        "#include <beginnormal_vertex>",
        "#include <beginnormal_vertex>\nmat4 chSkinN = chSkinMat();\nobjectNormal = normalize(mat3(chSkinN) * objectNormal);",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed = (chSkinN * vec4(transformed, 1.0)).xyz;\nchSlots = aSlots;\nchCut = aCut;\nchFaceV = aFace;\nchVarV = aVar;\nchCellV = aCell;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`);
    injectNightRim(sh);
  };
  m.customProgramCacheKey = () => "ch-crowd";
  paintStrength(m, 0);
  return inkAwareMaterial(m);
}

/** Shadow depth with the same skinning. */
export function crowdDepthMaterial(u: CrowdUniforms): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${SKIN_PARS}`)
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\ntransformed = (chSkinMat() * vec4(transformed, 1.0)).xyz;",
      );
  };
  m.customProgramCacheKey = () => "ch-crowd-depth";
  return m;
}

/** Bone texture for `rows` instances of a skeleton of `bones` bones. */
export function boneTexture(bones: number, rows: number): THREE.DataTexture {
  const t = new THREE.DataTexture(
    new Float32Array(bones * 4 * rows * 4),
    bones * 4,
    rows,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Palette texture: one row per variant, 32 slots, linear colours. */
export function paletteTexture(palettes: ReadonlyArray<readonly string[]>): THREE.DataTexture {
  const W = 32;
  const data = new Float32Array(W * palettes.length * 4);
  const c = new THREE.Color();
  palettes.forEach((pal, row) => {
    for (let i = 0; i < W; i++) {
      c.set(pal[i] ?? "#ff00ff");
      data.set([c.r, c.g, c.b, 1], (row * W + i) * 4);
    }
  });
  const t = new THREE.DataTexture(data, W, palettes.length, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
