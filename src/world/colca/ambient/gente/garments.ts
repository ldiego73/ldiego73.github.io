/**
 * Colca garments, added to the shared people rig without touching it (../../../ambient/people: the mountain's
 * look never changes): extra parts built with the same Part/palette-slot tools and handed to a Crowd next to
 * the shared ones.
 *  - "colca:cabana": the Cabanaconde women's hat, a white, wide, flat-brimmed hat whose brim is embroidered
 *    all round with bright flowers and edged with a ribbon;
 *  - "colca:collagua": the Collagua (Chivay, Yanque) women's tall white hat with a narrow brim, a lace band
 *    and an embroidered ribbon;
 *  - "colca:bordado": the richly embroidered skirt overlay of the valley, rows of flowers and bands in
 *    fuchsia, gold, green and turquoise over the pollera, with a wide embroidered hem.
 * Travellers on the road (../viajeros.ts) add outdoor clothes:
 *  - "colca:jacket": a zipped outdoor jacket (main = shell, acc = zip and trim) in place of the poncho;
 *  - "colca:cap": a peaked cap (acc); "colca:sunhat": a wide-brimmed canvas sun hat with a band (acc), the
 *    archaeologists' and walkers' hat on the pampa;
 *  - "colca:backpack": a day pack with a lid and a rolled mat (acc).
 * Names are not in the shared PartName union; `wear()` widens a list for Person/Crowd (they only compare names).
 */
import type * as THREE from "three";
import type { PartName } from "../../../ambient/people/models";
import { Part, type PartSpec, protos, S_ACC, S_MAIN, S_SKIN } from "../../../ambient/people/rig";

export type ColcaPart =
  | PartName
  | "colca:cabana"
  | "colca:collagua"
  | "colca:bordado"
  | "colca:jacket"
  | "colca:cap"
  | "colca:sunhat"
  | "colca:backpack";

/** Person / Crowd only match part names as strings: the Colca names ride along with the shared ones. */
export const wear = (names: readonly ColcaPart[]): readonly PartName[] => names as readonly PartName[];

const WHITE = "#f5f1e8";
const FLOWERS = ["#d6306f", "#e9b23a", "#3f9a5a", "#2a9db0", "#e0572f", "#8b3fa8"];

function cabana(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.cyl, WHITE, 0, 0.35, 0, 0, 0, 0, 0.36, 0.03, 0.36);
  p.add(P.cyl, WHITE, 0, 0.41, 0, 0, 0, 0, 0.17, 0.1, 0.17);
  p.add(P.halfSph, WHITE, 0, 0.455, 0, 0, 0, 0, 0.17, 0.06, 0.17);
  // Embroidered flowers in a ring on the brim, and a ribbon round the crown.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    const r = i % 2 ? 0.27 : 0.31;
    p.add(
      P.lowSph,
      FLOWERS[i % FLOWERS.length] as string,
      Math.sin(a) * r,
      0.372,
      Math.cos(a) * r,
      0,
      0,
      0,
      0.035,
      0.012,
      0.035,
    );
  }
  p.add(P.cyl, S_ACC, 0, 0.375, 0, 0, 0, 0, 0.175, 0.035, 0.175);
  p.add(P.cyl, S_MAIN, 0, 0.334, 0, 0, 0, 0, 0.365, 0.012, 0.365);
  return p.build();
}

function collagua(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.cyl, WHITE, 0, 0.35, 0, 0, 0, 0, 0.27, 0.025, 0.27);
  // Tall crown, a little wider at the top.
  p.add(P.flare, WHITE, 0, 0.5, 0, Math.PI, 0, 0, 0.19, 0.3, 0.19);
  p.add(P.cyl, WHITE, 0, 0.655, 0, 0, 0, 0, 0.19, 0.012, 0.19);
  // Lace band and an embroidered ribbon with small flowers.
  p.add(P.cyl, "#ffffff", 0, 0.4, 0, 0, 0, 0, 0.165, 0.06, 0.165);
  p.add(P.cyl, S_ACC, 0, 0.45, 0, 0, 0, 0, 0.17, 0.045, 0.17);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.add(
      P.lowSph,
      FLOWERS[i % FLOWERS.length] as string,
      Math.sin(a) * 0.172,
      0.45,
      Math.cos(a) * 0.172,
      0,
      0,
      0,
      0.025,
      0.025,
      0.012,
    );
  }
  return p.build();
}

function bordado(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  // Over the shared pollera (womanSkirt: 0.17 → 0.66, flare 0.34 × 0.3): bands just outside it.
  const band = (y: number, h: number, color: string | typeof S_ACC, grow = 0) =>
    p.add(P.flare, color, 0, y, 0, 0, 0, 0, 0.345 + grow, h, 0.305 + grow);
  band(0.2, 0.08, FLOWERS[0] as string, 0.006);
  band(0.255, 0.025, FLOWERS[1] as string, 0.004);
  band(0.29, 0.02, S_ACC, 0.002);
  // Rows of embroidered flowers round the skirt.
  for (const [y, r, n] of [
    [0.36, 0.3, 14],
    [0.47, 0.265, 12],
  ] as const)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      p.add(
        P.lowSph,
        FLOWERS[(i + (y > 0.4 ? 2 : 0)) % FLOWERS.length] as string,
        Math.sin(a) * r,
        y,
        Math.cos(a) * r * 0.9,
        0,
        0,
        0,
        0.03,
        0.03,
        0.015,
      );
    }
  return p.build();
}

function jacket(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  // Shell from the hips to the shoulders (over the shared trousers), rounded shoulders, collar and neck.
  p.add(P.cyl, S_MAIN, 0, 0.24, 0, 0, 0, 0, 0.2, 0.56, 0.16);
  p.add(P.sph, S_MAIN, 0, 0.47, 0, 0, 0, 0, 0.25, 0.1, 0.165);
  p.add(P.cyl, S_ACC, 0, 0.53, 0, 0, 0, 0, 0.1, 0.06, 0.09);
  p.add(P.cyl, S_SKIN, 0, 0.58, 0, 0, 0, 0, 0.07, 0.08, 0.07);
  // Zip down the front, a hem band and two chest pockets.
  p.add(P.box, S_ACC, 0, 0.25, 0.162, 0, 0, 0, 0.025, 0.5, 0.01);
  p.add(P.cyl, S_ACC, 0, -0.02, 0, 0, 0, 0, 0.205, 0.04, 0.165);
  for (const s of [-1, 1]) p.add(P.box, S_ACC, s * 0.09, 0.36, 0.158, 0, 0, 0, 0.08, 0.07, 0.01);
  return p.build();
}

function cap(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.halfSph, S_ACC, 0, 0.27, 0, 0, 0, 0, 0.215, 0.17, 0.215);
  p.add(P.box, S_ACC, 0, 0.29, 0.22, 0.12, 0, 0, 0.26, 0.02, 0.17);
  p.add(P.sph, WHITE, 0, 0.44, 0, 0, 0, 0, 0.025, 0.015, 0.025);
  return p.build();
}

function sunhat(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.cyl, "#d8c9a3", 0, 0.33, 0, 0, 0, 0, 0.34, 0.02, 0.34);
  p.add(P.cyl, "#d8c9a3", 0, 0.41, 0, 0, 0, 0, 0.2, 0.15, 0.2);
  p.add(P.halfSph, "#d8c9a3", 0, 0.48, 0, 0, 0, 0, 0.2, 0.05, 0.2);
  p.add(P.cyl, S_ACC, 0, 0.365, 0, 0, 0, 0, 0.205, 0.04, 0.205);
  return p.build();
}

function backpack(P: ReturnType<typeof protos>): THREE.BufferGeometry {
  const p = new Part();
  p.add(P.box, S_ACC, 0, 0.27, -0.25, 0, 0, 0, 0.3, 0.42, 0.16);
  p.add(P.box, S_ACC, 0, 0.5, -0.25, -0.1, 0, 0, 0.29, 0.07, 0.18);
  p.add(P.box, "#2b2a2c", 0, 0.16, -0.335, 0, 0, 0, 0.2, 0.16, 0.03);
  // Shoulder straps and a rolled mat under the pack.
  for (const s of [-1, 1]) p.add(P.box, "#2b2a2c", s * 0.1, 0.32, 0.0, 0, 0, 0, 0.04, 0.38, 0.33);
  p.add(P.cyl, "#3f7f4a", 0, 0.03, -0.25, 0, 0, Math.PI / 2, 0.07, 0.34, 0.07);
  return p.build();
}

/** Fresh geometries for the Colca parts (each crowd owns its own); `only` limits them to the named ones. */
export function colcaPartSpecs(only?: readonly ColcaPart[]): PartSpec[] {
  const P = protos();
  const out: PartSpec[] = [
    { name: "colca:cabana", bone: "head", geo: cabana(P) },
    { name: "colca:collagua", bone: "head", geo: collagua(P) },
    { name: "colca:bordado", bone: "hips", geo: bordado(P) },
    { name: "colca:jacket", bone: "torso", geo: jacket(P) },
    { name: "colca:cap", bone: "head", geo: cap(P) },
    { name: "colca:sunhat", bone: "head", geo: sunhat(P) },
    { name: "colca:backpack", bone: "torso", geo: backpack(P) },
  ];
  for (const g of Object.values(P)) g.dispose();
  if (!only) return out.filter((o) => !TRAVEL.has(o.name));
  const keep = out.filter((o) => only.includes(o.name as ColcaPart));
  for (const o of out) if (!keep.includes(o)) o.geo.dispose();
  return keep;
}

/** Travellers' parts: left out of the default set (the village crowd in ../gente.ts does not draw them). */
const TRAVEL = new Set(["colca:jacket", "colca:cap", "colca:sunhat", "colca:backpack"]);

/** Bright, embroidered palettes for the valley's women (main = pollera, acc = embroidery, alt = jacket). */
export const BORDADOS = ["#2f3b8f", "#7b2350", "#1f6f6a", "#8c1f2a", "#3d2b6b", "#c2456b"];
export const RIBBONS = ["#d6306f", "#e9b23a", "#2a9db0", "#3f9a5a", "#e0572f"];
/** Outdoor shells and packs (travellers), khaki field clothes (archaeologists), trousers. */
export const SHELLS = ["#2f6db0", "#d0553a", "#3f8a5a", "#e2a83a", "#5a4e8c", "#c23b5a"];
export const KHAKI = ["#b8a77e", "#9c8d68", "#c9b58a", "#7d7a5c"];
export const PACKS = ["#2a9d8f", "#c4383f", "#e07a3a", "#3446a6", "#5b5a58"];
export const TROUSERS = ["#3b3a36", "#5a5046", "#2f3557", "#6b6152", "#4a4a44"];
