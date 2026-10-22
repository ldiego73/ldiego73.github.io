/**
 * GLSL side of the shared wind (./wind.ts is the CPU twin). Two pieces:
 *
 * - `WIND_PARS_GLSL`: functions, included once per shader through the `cpa_pars` chunk (./style-gl.ts), so
 *   any material, built-in or custom, can call them. `cpaGust(p)` is the exact twin of `gustAt` in wind.ts.
 * - `WIND_PROJECT_GLSL`: the body that replaces three's `project_vertex` chunk. Without `KW_WIND` it is
 *   three's own code; with it, the vertex is moved in WORLD space after the instance and model matrices, so
 *   wind direction, gust fronts and pushers are the same for every tuft whatever its yaw or scale.
 *
 * Opting a material in (see `windSway` in ./style-gl.ts, which sets these defines for you):
 *   KW_WIND 1  grass / reeds / flowers: bend downwind, sway, gusts, pushed by bodies
 *   KW_WIND 2  trees / bushes: trunk bend (height²), branch sway (mid), leaf flutter (high), spring kicks
 *   KW_WIND 3  cloth: banners, streamers, aguayos, sails: a wave running from the pinned edge to the free one
 *   KW_WIND_FLEX      read the per-vertex `flex` attribute as the sway weight (grass: world units of bend at the
 *                     tip; cloth: 0 at the pinned edge → 1 at the free edge, `clothFlex` writes it). Without
 *                     it the weight comes from the object-space height: (y / KW_WIND_H)².
 *   KW_WIND_H         reference height (object units) for the weight without `flex` (default 1.0)
 *   KW_WIND_AMP       amplitude multiplier (default 1.0)
 *
 * Height is measured from the object's (or instance's) origin, so non-instanced meshes need their origin at
 * the base of the plant, or a `flex` attribute (a merged meadow has no single base).
 */
import { WIND_SLOT } from "./wind";

const W0 = `cpaU[${WIND_SLOT.W0}]`;
const W1 = `cpaU[${WIND_SLOT.W1}]`;
const W2 = `cpaU[${WIND_SLOT.W2}]`;
const NEAR = `cpaU[${WIND_SLOT.NEAR}]`;

/** Wind functions (header level; needs `cpaU`, `cpaPush`, `cpaKick` declared before, see style-gl.ts). */
export const WIND_PARS_GLSL = /* glsl */ `
vec2 cpaWindDir() { return ${W0}.xy; }
float cpaWindTime() { return ${W0}.w; }
// Gust strength at a world xz point (0 … gustAmp). Twin of gustAt() in wind.ts.
float cpaGust(vec2 p) {
  vec2 d = ${W0}.xy;
  float along = dot(p, d);
  float cross = dot(p, vec2(-d.y, d.x));
  float k = ${W1}.y;
  float ph = (along - ${W0}.w * ${W1}.z) * k + 0.8 * sin(cross * k * 0.37 + ${W0}.w * 0.05);
  float b = max(0.5 + 0.5 * sin(ph), 1e-4);
  return ${W1}.x * pow(b, max(${W1}.w, 1.0)) * (0.75 + 0.25 * sin(cross * k * 0.21 - 0.7));
}
// Height band of the calm (1 = full wind).
float cpaCalm(float y) { return mix(${W2}.w, 1.0, smoothstep(${W2}.y, max(${W2}.z, ${W2}.y + 0.01), y)); }
// Bend away from the bodies near the traveler (creatures registry, packed by the style runtime).
// Plants outside the bounds of all pushers skip the loop.
vec3 cpaPushOffset(vec2 origin, float w) {
  vec3 o = vec3(0.0);
  if (length(origin - ${NEAR}.xy) > ${NEAR}.z) return o;
  for (int i = 0; i < 12; i++) {
    vec4 p = cpaPush[i];
    if (p.z <= 0.0) continue;
    vec2 d = origin - p.xy;
    float dist = length(d);
    float f = (1.0 - smoothstep(p.z * 0.2, p.z, dist)) * p.w;
    o.xz += d / max(dist, 1e-3) * f * w * 0.95;
    o.y -= f * w * 0.4;
  }
  return o;
}
// Damped spring kicks of the few small trees the traveler brushed (vec4: x, z, offset x, offset z).
vec2 cpaKickOffset(vec2 origin) {
  vec2 o = vec2(0.0);
  if (${NEAR}.w < 0.5) return o;
  for (int i = 0; i < 6; i++) {
    vec4 k = cpaKick[i];
    o += k.zw * (1.0 - smoothstep(0.25, 0.9, length(origin - k.xy)));
  }
  return o;
}
// World-space offset of one vertex. wp: vertex world position, origin: the plant's base (instance origin,
// or the vertex itself for merged meshes), hn: height above the base / reference height (0 base … 1 top),
// w: sway weight (world units of bend at full wind), nrm: world normal (cloth only).
vec3 cpaWindOffset(vec3 wp, vec3 origin, float hn, float w, vec3 nrm, float mode) {
  vec2 d = ${W0}.xy;
  vec2 side = vec2(-d.y, d.x);
  float t = ${W0}.w;
  float g = cpaGust(origin.xz);
  float s = ${W0}.z * cpaCalm(wp.y);
  float ph = t * 1.7 + origin.x * 0.37 + origin.z * 0.29;
  vec3 o = vec3(0.0);
  if (mode < 1.5) {
    // Grass: lean downwind, sway, and a visible wave when a gust front crosses.
    float sw = s * (0.5 + 0.32 * sin(ph) + 0.12 * sin(ph * 2.3 + 1.1)) + s * g * 1.5;
    o.xz = d * sw * w + side * sin(ph * 1.3) * 0.2 * s * w;
    o.y = -sw * sw * w * 0.16;
    o += cpaPushOffset(origin.xz, w);
    o.xz += cpaKickOffset(origin.xz) * w;
  } else if (mode < 2.5) {
    // Trees: trunk bend (slow, gust-driven), branches (mid), leaf flutter (fast, small).
    float trunk = s * (0.22 + 0.55 * g + 0.1 * sin(t * 0.9 + ph * 0.3));
    o.xz = d * trunk * w;
    float br = s * 0.06 * sin(t * 2.6 + ph * 1.7 + wp.y * 0.6);
    o.xz += (d * 0.6 + side) * br * clamp(hn, 0.0, 1.5);
    float fl = ${W2}.x * s * (0.6 + g) * 0.035 * smoothstep(0.35, 0.8, hn);
    o += fl * vec3(sin(t * 11.0 + dot(wp, vec3(3.1, 1.7, 2.3))), 0.5 * sin(t * 13.0 + dot(wp, vec3(1.9, 2.9, 1.3))),
      sin(t * 9.0 + dot(wp, vec3(2.7, 1.1, 3.7))));
    o.xz += cpaKickOffset(origin.xz) * w;
  } else {
    // Cloth: a wave from the pinned edge (w = 0) to the free edge (w = 1), pushed downwind.
    float wave = sin(w * 5.5 - t * (4.0 + 3.0 * s) + ph);
    float a = (0.35 + s + g) * w;
    o = nrm * wave * a * 0.1;
    o.xz += d * a * 0.07;
    o.y += sin(w * 3.0 - t * 3.1 + ph) * a * 0.025;
  }
  return o;
}
`;

/** Replacement body for three's `project_vertex` chunk (identical to three's without KW_WIND). */
export const WIND_PROJECT_GLSL = /* glsl */ `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef KW_WIND
  {
    #ifndef KW_WIND_H
      #define KW_WIND_H 1.0
    #endif
    #ifndef KW_WIND_AMP
      #define KW_WIND_AMP 1.0
    #endif
    #ifdef USE_INSTANCING
      vec4 cpaLocal = instanceMatrix * mvPosition;
      vec3 cpaOrigin = ( modelMatrix * vec4( instanceMatrix[ 3 ].xyz, 1.0 ) ).xyz;
      float cpaScale = length( instanceMatrix[ 1 ].xyz ) * length( modelMatrix[ 1 ].xyz );
      vec3 cpaN = normalize( mat3( modelMatrix ) * ( mat3( instanceMatrix ) * normal ) );
    #else
      vec4 cpaLocal = mvPosition;
      float cpaScale = length( modelMatrix[ 1 ].xyz );
      vec3 cpaN = normalize( mat3( modelMatrix ) * normal );
    #endif
    vec4 cpaW = modelMatrix * cpaLocal;
    #ifndef USE_INSTANCING
      // Merged meshes: every vertex is its own plant base (phase and pushers per vertex).
      vec3 cpaOrigin = vec3( cpaW.x, modelMatrix[ 3 ].y, cpaW.z );
    #endif
    // Height above the plant's base: in world units, then over the reference height (0 base … 1 top).
    float cpaH = max( transformed.y, 0.0 ) * cpaScale;
    float cpaHn = cpaH / ( float( KW_WIND_H ) * cpaScale );
    #ifdef KW_WIND_FLEX
      float cpaWeight = flex * ( KW_WIND == 3 ? 1.0 : cpaScale );
    #else
      // Without flex: height² (a stem bends most at the tip), in world units of bend at full wind.
      float cpaWeight = KW_WIND == 3 ? clamp( cpaHn, 0.0, 1.0 )
        : cpaHn * cpaHn * float( KW_WIND_H ) * cpaScale * ( KW_WIND == 2 ? 0.1 : 0.35 );
    #endif
    cpaW.xyz += cpaWindOffset( cpaW.xyz, cpaOrigin, cpaHn, cpaWeight * float( KW_WIND_AMP ), cpaN, float( KW_WIND ) );
    mvPosition = viewMatrix * cpaW;
  }
#else
  #ifdef USE_INSTANCING
    mvPosition = instanceMatrix * mvPosition;
  #endif
  mvPosition = modelViewMatrix * mvPosition;
#endif
gl_Position = projectionMatrix * mvPosition;
`;
