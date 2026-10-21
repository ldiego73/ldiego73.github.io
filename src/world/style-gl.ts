/**
 * The GPU half of the "cel pintado andino" style (./style.ts holds the profiles, ./style-runtime.ts drives it
 * per frame). It patches three's shader chunks ONCE per page (`installStyleShaders`, called by engine.ts), so
 * every material the worlds already build gets the look with no per-world work:
 *
 * - cel light (MeshToonMaterial only, `#define TOON`): `lights_toon_pars_fragment` computes a crisp
 *   two-tone terminator plus a thin highlight band from uniforms instead of the gradient texture, and keeps a
 *   lit mask; `aomap_fragment` mixes the world's shadow tint into the shaded side and cast shadows (never
 *   grey) and adds an optional rim;
 * - painted blotches (TOON): `color_fragment` modulates the albedo with posterized world-space value noise
 *   (vertex/instance-coloured materials strong, flat ones weak, opt-outs via `KW_PAINT`);
 * - aerial perspective (every fogged material, built-in or custom): `fog_fragment` first hazes the colour
 *   toward a bluer, lighter tint by distance and height, then applies three's fog as before;
 * - wind (opt-in per material, `windSway`): `project_vertex` moves the vertex in world space (wind-glsl.ts);
 * - ink-aware output (opt-in, `KW_INKAWARE`): while the outline prepass draws, such a material writes its
 *   own (displaced) view normal, so the ink follows swaying geometry.
 *
 * The per-frame values live in three shared Float32Arrays (`KW_U`, `KW_PUSH`, `KW_KICK`). They are added
 * to every `THREE.ShaderLib` entry: `UniformsUtils.clone` copies typed arrays BY REFERENCE (only Three math
 * objects and plain arrays are cloned), so every built-in material's uniform object points at the same
 * arrays and one write per frame reaches them all (style-gl.test.ts guards this assumption). Custom
 * ShaderMaterials opt in with `...styleUniforms()`.
 *
 * All values zero (before the first `update`, or a custom shader without the uniforms) = three's own look.
 */
import * as THREE from "three";
import { KW_SLOTS, SLOT } from "./style";
import { MAX_KICKS, MAX_PUSHERS } from "./wind";
import { WIND_PARS_GLSL, WIND_PROJECT_GLSL } from "./wind-glsl";

/** Shared uniform arrays (see the header). Written by style-runtime.ts, read by every patched shader. */
export const KW_U = new Float32Array(KW_SLOTS * 4);
export const KW_PUSH = new Float32Array(MAX_PUSHERS * 4);
export const KW_KICK = new Float32Array(MAX_KICKS * 4);

/** Uniforms a custom ShaderMaterial spreads into its own to read the style and the wind. */
export function styleUniforms() {
  return { cpaU: { value: KW_U }, cpaPush: { value: KW_PUSH }, cpaKick: { value: KW_KICK } };
}

const U = (slot: number) => `cpaU[${slot}]`;

/**
 * Header chunk (`#include <cpa_pars>`): uniforms, noise, and the style and wind functions. Include-guarded,
 * so it is safe in `common` and in the fog/light pars at once. Custom shaders call these functions:
 *   cpaWorldFromView(viewPos)          world position from a view-space position (fragment or vertex)
 *   cpaPaint(rgb, worldPos, amount)    painted blotches (amount 1 = the profile's full swing)
 *   cpaShadeTint(lit)                  multiply your lit colour by this (lit 0 shade … 1 light)
 *   cpaCel(normal, lightDir)           (irradiance, lit) of the cel ramp
 *   cpaHaze(rgb, viewDepth, worldY)    aerial perspective (before your fog)
 *   cpaWindOffset(...) / cpaGust(xz)    wind (wind-glsl.ts)
 */
export const CPA_PARS_GLSL = /* glsl */ `
#ifndef CPA_PARS
#define CPA_PARS
uniform vec4 cpaU[${KW_SLOTS}];
uniform vec4 cpaPush[${MAX_PUSHERS}];
uniform vec4 cpaKick[${MAX_KICKS}];
#if defined( KW_WIND_FLEX ) && defined( attribute )
attribute float flex;
#endif
vec3 cpaWorldFromView(vec3 v) { return (v - viewMatrix[3].xyz) * mat3(viewMatrix); }
float cpaHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float cpaNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cpaHash(i), cpaHash(i + vec2(1.0, 0.0)), u.x), mix(cpaHash(i + vec2(0.0, 1.0)), cpaHash(i + 1.0), u.x), u.y);
}
// Fragment-only helpers (fwidth): three's vertex prefix defines \`attribute\`, the fragment one does not.
#ifndef attribute
vec3 cpaPaint(vec3 c, vec3 wp, float amount) {
  vec2 q = (wp.xz + vec2(wp.y * 0.61, -wp.y * 0.43)) * ${U(SLOT.PAINT0)}.y;
  float n = cpaNoise(q) * 0.62 + cpaNoise(q * 2.13 + vec2(17.1, 3.7)) * 0.38;
  float e = max(${U(SLOT.PAINT1)}.w, fwidth(n) * 1.5);
  // Posterized into three soft-edged levels: darker / as is / lighter (−1, 0, 0.6: tone mapping already
  // compresses the light end, so the light patches are gentler than the dark ones).
  float b = smoothstep(0.41 - e, 0.41 + e, n) + smoothstep(0.59 - e, 0.59 + e, n) * 0.6 - 1.0;
  return c * (1.0 + b * amount * ${U(SLOT.PAINT0)}.x * (1.0 + ${U(SLOT.PAINT1)}.rgb));
}
vec2 cpaCel(vec3 n, vec3 l) {
  float d = dot(n, l) * 0.5 + 0.5;
  float w = max(${U(SLOT.CEL0)}.z, fwidth(d) * 0.75);
  float lit = smoothstep(${U(SLOT.CEL0)}.y - w, ${U(SLOT.CEL0)}.y + w, d);
  float hl = smoothstep(${U(SLOT.CEL2)}.x - w, ${U(SLOT.CEL2)}.x + w, d) * ${U(SLOT.CEL2)}.y;
  return vec2(mix(${U(SLOT.CEL0)}.w, ${U(SLOT.CEL0)}.x, lit) + hl, lit);
}
#endif
vec3 cpaShadeTint(float lit) { return mix(vec3(1.0), ${U(SLOT.CEL1)}.rgb, ${U(SLOT.CEL1)}.a * (1.0 - lit)); }
vec3 cpaHaze(vec3 c, float depth, float y) {
  float s = ${U(SLOT.ATMO0)}.a;
  if (s <= 0.0) return c;
  float d = smoothstep(${U(SLOT.ATMO1)}.x, ${U(SLOT.ATMO1)}.y, depth);
  float layers = ${U(SLOT.ATMO2)}.x;
  if (layers > 0.5) {
    // Soft painted planes: flatter inside a step, quicker between steps.
    float x = d * layers;
    d = mix(d, (floor(x) + smoothstep(0.3, 0.7, fract(x))) / layers, 0.55);
  }
  float hk = exp(-max(y - ${U(SLOT.ATMO1)}.z, 0.0) * ${U(SLOT.ATMO1)}.w);
  return mix(c, ${U(SLOT.ATMO0)}.rgb, d * mix(1.0, hk, ${U(SLOT.ATMO2)}.y) * s);
}
${WIND_PARS_GLSL}
#endif
`;

const FOG_PARS_VERTEX = /* glsl */ `
#include <cpa_pars>
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vCpaFogW;
#endif
`;
const FOG_VERTEX = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vCpaFogW = cpaWorldFromView( mvPosition.xyz );
#endif
`;
const FOG_PARS_FRAGMENT = /* glsl */ `
#include <cpa_pars>
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vCpaFogW;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = cpaHaze( gl_FragColor.rgb, vFogDepth, vCpaFogW.y );
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif
`;
const LIGHTS_TOON_PARS = /* glsl */ `
#include <cpa_pars>
varying vec3 vViewPosition;
struct ToonMaterial {
  vec3 diffuseColor;
};
// Sum of (lit × light strength) over the direct lights: / keyRef = how lit this fragment is (cast shadows
// included, since three has already multiplied the shadow into directLight.color).
float cpaLitAcc = 0.0;
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 g = getGradientIrradiance( geometryNormal, directLight.direction );
  float lit = g.r;
  if ( ${U(SLOT.CEL0)}.x > 0.5 ) {
    vec2 c = cpaCel( geometryNormal, directLight.direction );
    g = vec3( c.x );
    lit = c.y;
  }
  cpaLitAcc += lit * max( max( directLight.color.r, directLight.color.g ), directLight.color.b );
  reflectedLight.directDiffuse += g * directLight.color * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
  reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct RE_Direct_Toon
#define RE_IndirectDiffuse RE_IndirectDiffuse_Toon
`;
const PAINT_FRAGMENT = /* glsl */ `
#ifdef TOON
  {
    float cpaK = ${U(SLOT.PAINT0)}.z;
    #if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
      cpaK = ${U(SLOT.PAINT0)}.w;
    #endif
    #ifdef KW_PAINT
      cpaK *= float( KW_PAINT );
    #endif
    // Fades out with distance (no noise shimmer far away; the haze takes over there).
    cpaK *= 1.0 - smoothstep( 160.0, 420.0, length( vViewPosition ) );
    if ( cpaK * ${U(SLOT.PAINT0)}.x > 0.0 ) diffuseColor.rgb = cpaPaint( diffuseColor.rgb, cpaWorldFromView( - vViewPosition ), cpaK );
  }
#endif
`;
const SHADE_FRAGMENT = /* glsl */ `
#ifdef TOON
  {
    float cpaLit = clamp( cpaLitAcc / max( ${U(SLOT.CEL2)}.z, 1e-4 ), 0.0, 1.0 );
    vec3 cpaTint = cpaShadeTint( cpaLit );
    reflectedLight.directDiffuse *= cpaTint;
    reflectedLight.indirectDiffuse *= cpaTint;
    if ( ${U(SLOT.CEL2)}.w > 0.0 ) {
      float cpaR = 1.0 - clamp( dot( normal, normalize( vViewPosition ) ), 0.0, 1.0 );
      float cpaRim = smoothstep( 0.55, 0.6, pow( cpaR, ${U(SLOT.CEL3)}.w ) * 2.0 );
      reflectedLight.directDiffuse += ${U(SLOT.CEL3)}.rgb * cpaRim * ${U(SLOT.CEL2)}.w * cpaLit * material.diffuseColor;
    }
  }
#endif
`;
// Ink-aware early out: right after the normal is known, before the lighting (cheap prepass draws).
const INK_FRAGMENT = /* glsl */ `
#if defined( KW_INKAWARE ) && defined( TOON )
  if ( ${U(SLOT.FLAGS)}.x > 0.5 ) {
    gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, 1.0 );
    return;
  }
#endif
`;

let installed = false;

/** Patches three's chunks and ShaderLib uniforms (idempotent; before any world material compiles). */
export function installStyleShaders() {
  if (installed) return;
  installed = true;
  const C = THREE.ShaderChunk as unknown as Record<string, string>;
  C.cpa_pars = CPA_PARS_GLSL;
  C.common = `${C.common}\n#include <cpa_pars>\n`;
  C.fog_pars_vertex = FOG_PARS_VERTEX;
  C.fog_vertex = FOG_VERTEX;
  C.fog_pars_fragment = FOG_PARS_FRAGMENT;
  C.fog_fragment = FOG_FRAGMENT;
  C.lights_toon_pars_fragment = LIGHTS_TOON_PARS;
  C.color_fragment = `${C.color_fragment}\n${PAINT_FRAGMENT}`;
  C.aomap_fragment = `${C.aomap_fragment}\n${SHADE_FRAGMENT}`;
  C.normal_fragment_begin = `${C.normal_fragment_begin}\n${INK_FRAGMENT}`;
  C.project_vertex = WIND_PROJECT_GLSL;
  const shared = styleUniforms();
  for (const lib of Object.values(THREE.ShaderLib)) Object.assign(lib.uniforms, shared);
}

/** True once the chunks are patched (tests, dev). */
export const styleInstalled = () => installed;

/** 1 while the outline prepass draws (outline.ts): ink-aware materials then write their view normal. */
export function setInkPass(on: boolean) {
  KW_U[SLOT.FLAGS * 4] = on ? 1 : 0;
}

// ---------------------------------------------------------------- material opt-ins

export interface WindSwayOptions {
  /** grass/reeds/flowers, trees/bushes, or cloth (banners, aguayos, sails). */
  mode: "grass" | "tree" | "cloth";
  /** Read the geometry's `flex` attribute as the weight (grass: bend at the tip; cloth: 0 pinned → 1 free). */
  flex?: boolean;
  /** Reference height in object units for the height² weight when there is no `flex` (default 1). */
  height?: number;
  /** Amplitude multiplier (default 1). */
  amp?: number;
}

const MODE = { grass: 1, tree: 2, cloth: 3 } as const;
/** The material's defines object (created when missing). */
const defs = (m: THREE.Material) => {
  if (!m.defines) m.defines = {};
  return m.defines as Record<string, string | number>;
};
const num = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));

/**
 * Makes a material sway with the shared wind (any built-in material with a vertex `project_vertex`; toon
 * gets the ink-aware output too). Sets defines and `allowOverride = false` (the outline prepass then draws
 * it with its own, displaced shader). Returns the material. Call before its first render, or it recompiles.
 */
export function windSway<M extends THREE.Material>(material: M, o: WindSwayOptions): M {
  const d = defs(material);
  d.KW_WIND = MODE[o.mode];
  if (o.flex) d.KW_WIND_FLEX = "";
  if (o.height !== undefined) d.KW_WIND_H = num(o.height);
  if (o.amp !== undefined) d.KW_WIND_AMP = num(o.amp);
  inkAwareMaterial(material);
  material.needsUpdate = true;
  return material;
}

/**
 * A toon material whose vertices move in its own vertex shader (wind, a rig) and that still wants a
 * correct ink outline: drawn by itself in the prepass (no override), writing its view normal there.
 */
export function inkAwareMaterial<M extends THREE.Material>(material: M): M {
  const d = defs(material);
  d.KW_INKAWARE = "";
  (material as THREE.Material & { allowOverride: boolean }).allowOverride = false;
  material.needsUpdate = true;
  return material;
}

/** Paint strength multiplier for one material (0 = off, e.g. characters; 1 = its class default). */
export function paintStrength<M extends THREE.Material>(material: M, k: number): M {
  const d = defs(material);
  d.KW_PAINT = num(k);
  material.needsUpdate = true;
  return material;
}

const noPaintTwins = new WeakMap<THREE.Material, THREE.Material>();

/**
 * Turns the painted blotches off on everything under `obj` (the avatar, people, animals: world-space
 * blotches would slide over a body as it moves). Materials shared through the toon cache
 * (`userData.kwShared`) are swapped for a cached no-paint twin (one per colour, so draw calls and sharing
 * stay the same); owned materials get the define in place.
 */
export function noPaint(obj: THREE.Object3D) {
  const swap = (m: THREE.Material): THREE.Material => {
    if (!m.userData.kwShared) return paintStrength(m, 0);
    let twin = noPaintTwins.get(m);
    if (!twin) {
      twin = paintStrength(m.clone(), 0);
      twin.userData = { ...m.userData, kwShared: false, kwTwinOf: m.uuid };
      noPaintTwins.set(m, twin);
      m.addEventListener("dispose", () => twin?.dispose());
    }
    return twin;
  };
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
  });
}

/**
 * Writes a `flex` attribute for cloth (0 at the pinned edge → 1 at the free edge) along an object-space axis:
 * e.g. a banner hanging from a pole at x = 0 that flies to x = 1.2 → `clothFlex(geo, "x", 0, 1.2)`. Then
 * `windSway(mat, { mode: "cloth", flex: true })`.
 */
export function clothFlex(geo: THREE.BufferGeometry, axis: "x" | "y" | "z", pinned: number, free: number) {
  const pos = geo.getAttribute("position");
  const out = new Float32Array(pos.count);
  const span = free - pinned || 1;
  for (let i = 0; i < pos.count; i++) {
    const v = axis === "x" ? pos.getX(i) : axis === "y" ? pos.getY(i) : pos.getZ(i);
    out[i] = Math.min(1, Math.max(0, (v - pinned) / span));
  }
  geo.setAttribute("flex", new THREE.BufferAttribute(out, 1));
  return geo;
}
