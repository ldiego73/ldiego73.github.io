/**
 * Materials of the crowd renderer (./crowd.ts): the same cel-shaded body and cloth as ./material.ts, but every
 * per-person value comes from textures indexed by the BatchedMesh instance id, so ONE draw call renders every
 * person of every archetype and LOD in a crowd:
 *
 *   chBones  RGBA32F, one row per person: 32 bones × 3 texels (the rows of each bone's 3×4 skinning matrix,
 *            bone pose × inverse bind, in the person's own space; the instance matrix places the person).
 *   chPalT   RGBA32F, one row per person: PALETTE_SIZE colour texels (linear), then one info texel
 *            (face cell, face row, face on).
 *   chFace   the crowd's face atlas (./face.ts `crowdFaceAtlas`): rows = face styles, 4 expression cells.
 *
 * GPU skinning replaces three's skinning chunks (USE_SKINNING stays off: the bone matrices are fetched here,
 * not uploaded as uniforms). The shadow depth material gets the same skinning. Both colour materials are
 * ink-aware (the outline prepass draws them with their own shader, so the ink follows the pose) and paint-free
 * (world-space blotches would slide over moving bodies). Cloth sways on the shared wind (`windSway` cloth).
 */
import * as THREE from "three";
import { inkAwareMaterial, paintStrength, windSway } from "../style-gl";
import { gradientMap } from "../toon";
import { withNightRim } from "./animals/night";
import { PALETTE_SIZE } from "./slots";

export const MAX_BONES = 32;
/** Texels per bone (3 rows of a 3×4 matrix). */
export const BONE_TEXELS = 3;
/** Palette texture width: the palette, then the info texel. */
export const PAL_W = PALETTE_SIZE + 1;

export interface CrowdUniforms {
  chBones: { value: THREE.DataTexture };
  chPalT: { value: THREE.DataTexture };
  chFace: { value: THREE.Texture | null };
  /** x = 1 / cells, y = 1 / rows of the face atlas. */
  chFaceGrid: { value: THREE.Vector2 };
  chCloth: { value: THREE.Texture | null };
}

const SKIN_PARS = /* glsl */ `
uniform highp sampler2D chBones;
attribute vec4 skinIndex;
attribute vec4 skinWeight;
flat varying float chRow;
mat4 chBone( const in int row, const in float i ) {
  int x = int( i ) * ${BONE_TEXELS};
  vec4 a = texelFetch( chBones, ivec2( x, row ), 0 );
  vec4 b = texelFetch( chBones, ivec2( x + 1, row ), 0 );
  vec4 c = texelFetch( chBones, ivec2( x + 2, row ), 0 );
  return mat4( a.x, b.x, c.x, 0.0, a.y, b.y, c.y, 0.0, a.z, b.z, c.z, 0.0, a.w, b.w, c.w, 1.0 );
}
`;

const SKIN_BASE = /* glsl */ `
#ifdef USE_BATCHING
  int chRowI = int( getIndirectIndex( gl_DrawID ) );
#else
  int chRowI = gl_InstanceID;
#endif
chRow = float( chRowI );
mat4 boneMatX = chBone( chRowI, skinIndex.x );
mat4 boneMatY = chBone( chRowI, skinIndex.y );
mat4 boneMatZ = chBone( chRowI, skinIndex.z );
mat4 boneMatW = chBone( chRowI, skinIndex.w );
`;

const SKIN_NORMAL = /* glsl */ `
{
  mat4 chSkinM = boneMatX * skinWeight.x + boneMatY * skinWeight.y + boneMatZ * skinWeight.z + boneMatW * skinWeight.w;
  objectNormal = ( chSkinM * vec4( objectNormal, 0.0 ) ).xyz;
}
`;

const SKIN_VERTEX = /* glsl */ `
{
  vec4 chV = vec4( transformed, 1.0 );
  transformed = ( boneMatX * chV * skinWeight.x + boneMatY * chV * skinWeight.y
    + boneMatZ * chV * skinWeight.z + boneMatW * chV * skinWeight.w ).xyz;
}
`;

const VERT_PARS = /* glsl */ `
attribute vec2 aSlots;
attribute float aCut;
attribute vec3 aFace;
flat varying vec2 chSlots;
varying float chCut;
varying vec3 chFaceV;
#ifdef CH_CLOTH
attribute vec4 aCloth;
flat varying vec4 chClothS;
varying vec2 chUv;
#endif
`;
const VERT_MAIN = /* glsl */ `
chSlots = aSlots;
chCut = aCut;
chFaceV = aFace;
#ifdef CH_CLOTH
chClothS = aCloth;
chUv = uv;
#endif
`;

const FRAG_PARS = /* glsl */ `
uniform highp sampler2D chPalT;
uniform sampler2D chFace;
uniform vec2 chFaceGrid;
flat varying float chRow;
flat varying vec2 chSlots;
varying float chCut;
varying vec3 chFaceV;
vec3 chPal( const in float slot ) { return texelFetch( chPalT, ivec2( int( slot + 0.5 ), int( chRow + 0.5 ) ), 0 ).rgb; }
#ifdef CH_CLOTH
uniform sampler2D chCloth;
flat varying vec4 chClothS;
varying vec2 chUv;
#endif
`;
const FRAG_COLOR = /* glsl */ `
{
  vec3 chC = chPal( chCut < 0.0 ? chSlots.x : chSlots.y );
#ifdef CH_CLOTH
  vec4 chM = texture2D( chCloth, chUv );
  float chW = min( chM.r, min( chM.g, chM.b ) );
  chC = mix( chC, chPal( chClothS.x ), clamp( chM.r - chW, 0.0, 1.0 ) );
  chC = mix( chC, chPal( chClothS.y ), clamp( chM.g - chW, 0.0, 1.0 ) );
  chC = mix( chC, chPal( chClothS.z ), clamp( chM.b - chW, 0.0, 1.0 ) );
  chC = mix( chC, chPal( chClothS.w ), chW );
  if ( !gl_FrontFacing ) chC *= 0.74;
#endif
  diffuseColor.rgb *= chC;
#ifndef CH_CLOTH
  vec4 chInfo = texelFetch( chPalT, ivec2( ${PALETTE_SIZE}, int( chRow + 0.5 ) ), 0 );
  if ( chInfo.z > 0.5 && chFaceV.z > 0.001 && chFaceV.x > 0.0 && chFaceV.x < 1.0 && chFaceV.y > 0.0 && chFaceV.y < 1.0 ) {
    vec2 chFuv = vec2( ( chInfo.x + chFaceV.x ) * chFaceGrid.x, 1.0 - ( chInfo.y + 1.0 - chFaceV.y ) * chFaceGrid.y );
    vec4 chF = texture2D( chFace, chFuv );
    diffuseColor.rgb = mix( diffuseColor.rgb, chF.rgb, chF.a * chFaceV.z );
  }
#endif
}
`;

/** Shared GPU skinning patch (colour and depth materials). */
function skinPatch(vs: string): string {
  return vs
    .replace("#include <common>", `#include <common>\n${SKIN_PARS}`)
    .replace("#include <skinbase_vertex>", SKIN_BASE)
    .replace("#include <skinnormal_vertex>", SKIN_NORMAL)
    .replace("#include <skinning_vertex>", SKIN_VERTEX);
}

export function crowdUniforms(capacity: number): CrowdUniforms {
  const rows = Math.max(1, capacity);
  const bones = new THREE.DataTexture(
    new Float32Array(MAX_BONES * BONE_TEXELS * rows * 4),
    MAX_BONES * BONE_TEXELS,
    rows,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  bones.needsUpdate = true;
  const pal = new THREE.DataTexture(new Float32Array(PAL_W * rows * 4), PAL_W, rows, THREE.RGBAFormat, THREE.FloatType);
  pal.needsUpdate = true;
  return {
    chBones: { value: bones },
    chPalT: { value: pal },
    chFace: { value: null },
    chFaceGrid: { value: new THREE.Vector2(0.25, 1) },
    chCloth: { value: null },
  };
}

function patchColour(mat: THREE.MeshToonMaterial, u: CrowdUniforms, key: string) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = skinPatch(sh.vertexShader)
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <color_vertex>", `#include <color_vertex>\n${VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`);
  };
  mat.customProgramCacheKey = () => key;
}

/** Opaque body (palette + cuts + face decal), skinned from the bone texture. */
export function crowdBodyMaterial(u: CrowdUniforms): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: gradientMap() });
  patchColour(m, u, "ch-crowd-body");
  paintStrength(m, 0);
  return withNightRim(inkAwareMaterial(m), "ch-night");
}

/** Double-sided cloth on the shared wind, patterned from the cloth atlas. */
export function crowdClothMaterial(u: CrowdUniforms, pattern: THREE.Texture, amp = 0.32): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
    gradientMap: gradientMap(),
    side: THREE.DoubleSide,
  });
  m.defines = { ...(m.defines ?? {}), CH_CLOTH: "" };
  patchColour(m, { ...u, chCloth: { value: pattern } }, "ch-crowd-cloth");
  paintStrength(m, 0);
  return withNightRim(windSway(m, { mode: "cloth", flex: true, amp }), "ch-night");
}

/** Shadow depth with the same skinning (and the same wind for cloth). */
export function crowdDepthMaterial(u: CrowdUniforms, cloth = false, amp = 0.32): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = skinPatch(sh.vertexShader);
  };
  m.customProgramCacheKey = () => (cloth ? "ch-crowd-depth-cloth" : "ch-crowd-depth");
  if (cloth) {
    m.side = THREE.DoubleSide;
    windSway(m, { mode: "cloth", flex: true, amp });
  }
  return m;
}
