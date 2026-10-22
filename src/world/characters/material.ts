/**
 * Materials of the new characters: cel-shaded toon (they get the world's two-tone light, tinted shade and warm
 * ink like everything else) with the painted blotches OFF (they would slide over a moving body), coloured from
 * a palette instead of fixed colours so one geometry can dress many people later.
 *
 *   body   vertex slots + a crisp per-pixel cut between them (./paint.ts) pick a palette colour; a face decal
 *          atlas (./face.ts) is laid over the head where `aFace` says (expression = which atlas cell).
 *   cloth  the same palette, plus a pattern atlas whose R, G, B (and white) masks pick four more slots per
 *          piece (khipu-dye stripes on the poncho, woven hem bands on the pollera, the lliclla's pallay);
 *          double-sided (the inside a shade darker) and on the shared cloth wind (style-gl.ts `windSway`).
 *
 * Both are skinned by three (SkinnedMesh). The body draws in the ink prepass through the override material
 * (which three skins per object); the cloth is ink-aware, so the prepass sees it displaced by the wind.
 * Uniform and varying names use a `ch` prefix (`cpa` is reserved for the shared style chunk).
 */
import * as THREE from "three";
import { paintStrength, windSway } from "../style-gl";
import { gradientMap } from "../toon";
import { PALETTE_SIZE } from "./slots";

export { PALETTE_SIZE };

export interface CharacterUniforms {
  chPal: { value: THREE.Color[] };
  /** Face atlas cell: x = u offset, y = u scale (1 / cells), z = 1 when a face is drawn. */
  chFaceCell: { value: THREE.Vector4 };
  chFace: { value: THREE.Texture | null };
  chCloth: { value: THREE.Texture | null };
}

export function paletteColors(hex: readonly string[]): THREE.Color[] {
  const out: THREE.Color[] = [];
  for (let i = 0; i < PALETTE_SIZE; i++) out.push(new THREE.Color(hex[i] ?? "#ff00ff"));
  return out;
}

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
uniform vec3 chPal[${PALETTE_SIZE}];
uniform vec4 chFaceCell;
uniform sampler2D chFace;
flat varying vec2 chSlots;
varying float chCut;
varying vec3 chFaceV;
#ifdef CH_CLOTH
uniform sampler2D chCloth;
flat varying vec4 chClothS;
varying vec2 chUv;
#endif
`;
const FRAG_COLOR = /* glsl */ `
{
  vec3 chC = chPal[int(chCut < 0.0 ? chSlots.x : chSlots.y)];
#ifdef CH_CLOTH
  vec4 chM = texture2D(chCloth, chUv);
  float chW = min(chM.r, min(chM.g, chM.b));
  chC = mix(chC, chPal[int(chClothS.x)], clamp(chM.r - chW, 0.0, 1.0));
  chC = mix(chC, chPal[int(chClothS.y)], clamp(chM.g - chW, 0.0, 1.0));
  chC = mix(chC, chPal[int(chClothS.z)], clamp(chM.b - chW, 0.0, 1.0));
  chC = mix(chC, chPal[int(chClothS.w)], chW);
  if (!gl_FrontFacing) chC *= 0.74;
#endif
  diffuseColor.rgb *= chC;
  if (chFaceCell.z > 0.5 && chFaceV.z > 0.001 && chFaceV.x > 0.0 && chFaceV.x < 1.0 && chFaceV.y > 0.0 && chFaceV.y < 1.0) {
    vec4 chF = texture2D(chFace, vec2(chFaceCell.x + chFaceV.x * chFaceCell.y, chFaceV.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, chF.rgb, chF.a * chFaceV.z);
  }
}
`;

function patch(mat: THREE.MeshToonMaterial, u: CharacterUniforms, key: string) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
      .replace("#include <color_vertex>", `#include <color_vertex>\n${VERT_MAIN}`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", `#include <common>\n${FRAG_PARS}`)
      .replace("#include <color_fragment>", `#include <color_fragment>\n${FRAG_COLOR}`);
  };
  mat.customProgramCacheKey = () => key;
}

export function characterUniforms(palette: THREE.Color[], face: THREE.Texture | null, cells = 4): CharacterUniforms {
  return {
    chPal: { value: palette },
    chFaceCell: { value: new THREE.Vector4(0, 1 / cells, face ? 1 : 0, 0) },
    chFace: { value: face },
    chCloth: { value: null },
  };
}

/** Opaque body material (one per character instance in the prototype: its palette and face cell). */
export function bodyMaterial(u: CharacterUniforms): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: gradientMap() });
  patch(m, u, "ch-body");
  return paintStrength(m, 0);
}

/** Double-sided cloth on the shared wind (`amp` scales the sway: a heavy wool poncho moves less than a flag). */
export function clothMaterial(u: CharacterUniforms, pattern: THREE.Texture, amp: number): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color: "#ffffff",
    vertexColors: true,
    gradientMap: gradientMap(),
    side: THREE.DoubleSide,
  });
  m.defines = { ...(m.defines ?? {}), CH_CLOTH: "" };
  const cu = { ...u, chCloth: { value: pattern } };
  patch(m, cu, "ch-cloth");
  paintStrength(m, 0);
  return windSway(m, { mode: "cloth", flex: true, amp });
}
