/**
 * Where each cloth's pattern lives in the shared cloth atlas (./patterns.ts draws it there): UV rectangles
 * [u0, v0, u1, v1] with v0 the pinned edge (row 0 of the cloth grid) and v1 the free hem. The atlas is eight
 * horizontal strips (canvas top = v 1). Pure data, shared by the archetypes (pure) and the canvas painter (DOM).
 */
export type Rect = [number, number, number, number];

const strip = (k: number): Rect => [0, 1 - k / 8, 1, 1 - (k + 1) / 8];

export const REGION = {
  /** Khipu-dye bands with a pallay row and a fringed hem. */
  poncho: strip(0),
  /** Bayeta field, chumpi belt, woven hem bands, contrasting under-layer edge. */
  pollera: strip(1),
  /** Warp stripes, a pallay band, a woven free edge. */
  lliclla: strip(2),
  /** Thin vertical warp stripes (cushma), a plain hem. */
  stripes: strip(3),
  /** Kené: a maze of fine geometric lines (Shipibo-Konibo skirts), a dark hem. */
  kene: strip(4),
  /** Embroidered flower rows and a wide embroidered hem (Colca valley). */
  bordado: strip(5),
  /** A tropical flower print (open beach shirt). */
  floral: strip(6),
  /** Plain cloth with a hem band (aprons, plain skirts, scarves). */
  plain: strip(7),
};

export type RegionName = keyof typeof REGION;

/** Canvas strip index of a region (the painter draws strip k at y = k × height / 8). */
export const REGION_ORDER: RegionName[] = [
  "poncho",
  "pollera",
  "lliclla",
  "stripes",
  "kene",
  "bordado",
  "floral",
  "plain",
];
