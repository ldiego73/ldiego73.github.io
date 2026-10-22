/**
 * Face styles (pure data) for the face decals (./face.ts draws them): one row of the crowd's face atlas per
 * style, in the order of `FACE` in ./archetype.ts. Same gentle anime proportions for everyone (never
 * caricature); styles differ only in small cues: lash flicks, brow weight, eye size for children, a smaller,
 * calmer eye and a couple of soft lines for elders. Skin tone comes from the body palette (the decal is
 * transparent around the features).
 *
 * Pure (no DOM, no Three).
 */

export interface FaceStyle {
  /** Iris (dark) and its warm lower gradient. */
  iris: string;
  irisLow: string;
  lash: string;
  brow: string;
  mouth: string;
  blush: string;
  /** Blush opacity (0..1). */
  blushK: number;
  /** Eye centres (px from the cell centre) and size (px). */
  eyeX: number;
  eyeY: number;
  eyeW: number;
  eyeH: number;
  /** Outer-corner lash flicks (0 none … 2). */
  flicks: number;
  /** Mouth centre y (px from the cell centre, down positive). */
  mouthY: number;
  /** Brow lift above the eye (px). */
  browUp: number;
  /** Brow stroke width (px, default 5). */
  browW?: number;
  /** Soft smile lines at the eye corners and cheeks (elders), 0..1. */
  lines?: number;
}

export const TRAVELER_FACE: FaceStyle = {
  iris: "#2a1810",
  irisLow: "#7a4a2a",
  lash: "#24150f",
  brow: "#3a2418",
  mouth: "#7a3a2c",
  blush: "#e2726a",
  blushK: 0.45,
  eyeX: 62,
  eyeY: -18,
  eyeW: 44,
  eyeH: 58,
  flicks: 0,
  mouthY: 76,
  browUp: 12,
};

export const WOMAN_FACE: FaceStyle = {
  ...TRAVELER_FACE,
  iris: "#24140d",
  irisLow: "#6e3f24",
  lash: "#1c100b",
  brow: "#22140e",
  mouth: "#8a3a34",
  blush: "#e0606a",
  blushK: 0.55,
  eyeH: 56,
  flicks: 2,
  browUp: 14,
};

export const MAN_FACE: FaceStyle = {
  ...TRAVELER_FACE,
  iris: "#22130c",
  irisLow: "#6a3d22",
  brow: "#1e130d",
  blushK: 0.3,
  eyeW: 42,
  eyeH: 52,
  browW: 6.5,
  browUp: 10,
};

export const GIRL_FACE: FaceStyle = {
  ...WOMAN_FACE,
  eyeW: 48,
  eyeH: 64,
  eyeY: -12,
  mouthY: 70,
  flicks: 1,
  blushK: 0.6,
};
export const BOY_FACE: FaceStyle = { ...MAN_FACE, eyeW: 47, eyeH: 62, eyeY: -12, mouthY: 70, browW: 5, blushK: 0.5 };
export const ELDER_WOMAN_FACE: FaceStyle = { ...WOMAN_FACE, eyeH: 46, eyeW: 42, flicks: 1, blushK: 0.35, lines: 1 };
export const ELDER_MAN_FACE: FaceStyle = { ...MAN_FACE, eyeH: 44, eyeW: 40, brow: "#8a8178", browW: 7, lines: 1 };
export const TEEN_FACE: FaceStyle = { ...TRAVELER_FACE, eyeH: 60, flicks: 1 };

/** Rows of the crowd face atlas (index = FACE row). */
export const FACE_STYLES: readonly FaceStyle[] = [
  TRAVELER_FACE,
  WOMAN_FACE,
  MAN_FACE,
  GIRL_FACE,
  BOY_FACE,
  ELDER_WOMAN_FACE,
  ELDER_MAN_FACE,
  TEEN_FACE,
];
