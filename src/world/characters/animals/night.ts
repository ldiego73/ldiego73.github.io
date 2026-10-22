/**
 * Night rim for animals: a thin, cool moonlit rim on the silhouette so dark coats (the jaguar, the tapir, a
 * caiman, a black llama) still read after dusk, the way the old jungle rigs did with their `uRim`. One shared
 * uniform drives every animal material (single animals and herds); the world sets it once per frame from its
 * sky's night amount:
 *
 *   setAnimalNight(sky.night);   // 0 by day … 1 at full night (0 = no rim, the day look is untouched)
 *
 * The rim is a fresnel term added to the lit colour (view-space normal against the view direction), tinted
 * moon-blue and kept faint so the toon bands and the ink stay in charge. The same chunk can be reused by any
 * toon material (`withNightRim`).
 */
import * as THREE from "three";

export const NIGHT_RIM = {
  chNight: { value: 0 },
  chNightRim: { value: new THREE.Color("#9fb6e8") },
};

/** Night amount 0..1 (from the world's sky). */
export function setAnimalNight(k: number) {
  NIGHT_RIM.chNight.value = Math.min(1, Math.max(0, k));
}

const PARS = /* glsl */ `
uniform float chNight;
uniform vec3 chNightRim;
`;

const RIM = /* glsl */ `
if (chNight > 0.001) {
  // three.js vViewPosition = -mvPosition: it already points from the fragment toward the camera.
  vec3 chV = normalize(vViewPosition);
  float chF = 1.0 - clamp(dot(normal, chV), 0.0, 1.0);
  outgoingLight += chNightRim * pow(chF, 3.0) * 0.45 * chNight;
}
`;

/** Patch a MeshToonMaterial's shader (call inside its onBeforeCompile) with the night rim. */
export function injectNightRim(sh: THREE.WebGLProgramParametersWithUniforms) {
  // Idempotent: a material wrapped twice (e.g. a shared body material) must not redeclare the uniforms.
  if (sh.fragmentShader.includes("uniform float chNight;")) return;
  Object.assign(sh.uniforms, NIGHT_RIM);
  sh.fragmentShader = sh.fragmentShader
    .replace("#include <common>", `#include <common>\n${PARS}`)
    .replace("#include <opaque_fragment>", `${RIM}\n#include <opaque_fragment>`);
}

/** Chain the night rim onto a toon material that may already have its own onBeforeCompile. */
export function withNightRim<M extends THREE.Material>(m: M, cacheKey: string): M {
  if (m.userData.nightRim) return m;
  m.userData.nightRim = true;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    injectNightRim(sh);
  };
  m.customProgramCacheKey = () => `${prevKey()}|${cacheKey}`;
  m.needsUpdate = true;
  return m;
}
