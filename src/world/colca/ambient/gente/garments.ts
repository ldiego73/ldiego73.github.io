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
 * Names are not in the shared PartName union; `wear()` widens a list for Person/Crowd (they only compare names).
 */
import type * as THREE from "three";
import type { PartName } from "../../../ambient/people/models";
import { Part, type PartSpec, protos, S_ACC, S_MAIN } from "../../../ambient/people/rig";

export type ColcaPart = PartName | "colca:cabana" | "colca:collagua" | "colca:bordado";

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

/** Fresh geometries for the Colca parts (each crowd owns its own). */
export function colcaPartSpecs(): PartSpec[] {
  const P = protos();
  const out: PartSpec[] = [
    { name: "colca:cabana", bone: "head", geo: cabana(P) },
    { name: "colca:collagua", bone: "head", geo: collagua(P) },
    { name: "colca:bordado", bone: "hips", geo: bordado(P) },
  ];
  for (const g of Object.values(P)) g.dispose();
  return out;
}

/** Bright, embroidered palettes for the valley's women (main = pollera, acc = embroidery, alt = jacket). */
export const BORDADOS = ["#2f3b8f", "#7b2350", "#1f6f6a", "#8c1f2a", "#3d2b6b", "#c2456b"];
export const RIBBONS = ["#d6306f", "#e9b23a", "#2a9db0", "#3f9a5a", "#e0572f"];
