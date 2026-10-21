/**
 * Procedural face decals (canvas, no image files): one atlas of square cells per face style, laid over the
 * head's surface by ./material.ts. Cells: 0 neutral, 1 blink, 2 smile (happy closed eyes and an open smile),
 * 3 half-lidded (the in-between frame of a blink, so it reads as a blink and not a flicker).
 *
 * Anime-leaning but gentle: tall dark-brown eyes with a warm lower gradient, two highlights and a soft upper
 * lash line, thin brows, a small mouth, a light blush. Never caricature: no exaggerated features, the same
 * proportions for everyone, skin tone from the body palette (the decal is transparent around the features).
 *
 * The cell is drawn in a 256 px square; ./archetypes place it on the head so 256 px ≈ the decal's `w` units.
 */
import * as THREE from "three";

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
}

export const CELL = 256;
export const CELLS = 4;

type Ctx = CanvasRenderingContext2D;

function eyeOpen(c: Ctx, cx: number, cy: number, s: FaceStyle, side: 1 | -1, lid: number) {
  const w = s.eyeW;
  const h = s.eyeH * lid;
  c.save();
  // Iris: a tall soft oval, dark at the top, warmer toward the bottom (the light catches the lower iris).
  const g = c.createLinearGradient(cx, cy - h / 2, cx, cy + h / 2);
  g.addColorStop(0, s.iris);
  g.addColorStop(0.55, s.iris);
  g.addColorStop(1, s.irisLow);
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(cx, cy + (s.eyeH - h) * 0.5, w / 2, h / 2, 0, 0, Math.PI * 2);
  c.fill();
  if (lid > 0.6) {
    // Pupil and highlights (upper one toward the light, a tiny one opposite).
    c.fillStyle = "rgba(15,8,6,0.55)";
    c.beginPath();
    c.ellipse(cx, cy + h * 0.02, w * 0.24, h * 0.28, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.ellipse(cx - w * 0.17 * side, cy - h * 0.2, w * 0.17, h * 0.14, -0.3 * side, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 0.85;
    c.beginPath();
    c.arc(cx + w * 0.16 * side, cy + h * 0.22, w * 0.07, 0, Math.PI * 2);
    c.fill();
    c.globalAlpha = 1;
  }
  // Upper lash line: a thick soft arc over the top of the eye, a little past it on the outer side.
  const top = cy + (s.eyeH - h) * 0.5 - h / 2;
  c.strokeStyle = s.lash;
  c.lineCap = "round";
  c.lineWidth = 6.5;
  c.beginPath();
  c.moveTo(cx - (w / 2 + 2) * side, top + h * 0.3);
  c.quadraticCurveTo(cx - w * 0.05 * side, top - 4, cx + (w / 2 + 5) * side, top + h * 0.18);
  c.stroke();
  for (let i = 0; i < s.flicks; i++) {
    c.lineWidth = 3.5;
    c.beginPath();
    const ox = cx + (w / 2 + 1) * side;
    const oy = top + h * (0.14 + i * 0.12);
    c.moveTo(ox, oy);
    c.lineTo(ox + (7 - i) * side, oy - 5 + i * 2);
    c.stroke();
  }
  // Soft lower lash hint.
  c.globalAlpha = 0.35;
  c.lineWidth = 2.5;
  c.beginPath();
  c.ellipse(cx, cy + (s.eyeH - h) * 0.5, w / 2 - 1, h / 2, 0, Math.PI * 0.2, Math.PI * 0.8);
  c.stroke();
  c.restore();
}

function eyeClosed(c: Ctx, cx: number, cy: number, s: FaceStyle, side: 1 | -1, happy: boolean) {
  c.save();
  c.strokeStyle = s.lash;
  c.lineCap = "round";
  c.lineWidth = 6;
  c.beginPath();
  const w = s.eyeW * 0.62;
  if (happy) {
    // ∩: cheeks pushed up by a smile.
    c.moveTo(cx - w, cy + 6);
    c.quadraticCurveTo(cx, cy - 16, cx + w, cy + 6);
  } else {
    // ‿: a calm closed lid.
    c.moveTo(cx - w, cy + 2);
    c.quadraticCurveTo(cx, cy + 14, cx + w, cy + 2);
  }
  c.stroke();
  if (!happy && s.flicks) {
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(cx + w * side, cy + 3);
    c.lineTo(cx + (w + 7) * side, cy - 1);
    c.stroke();
  }
  c.restore();
}

function brows(c: Ctx, s: FaceStyle, lift: number) {
  c.save();
  c.strokeStyle = s.brow;
  c.lineCap = "round";
  c.lineWidth = 5;
  for (const side of [-1, 1] as const) {
    const cx = CELL / 2 + s.eyeX * side;
    const y = CELL / 2 + s.eyeY - s.eyeH / 2 - s.browUp - lift;
    c.beginPath();
    c.moveTo(cx - s.eyeW * 0.45 * side, y + 3);
    c.quadraticCurveTo(cx + s.eyeW * 0.05 * side, y - 5, cx + s.eyeW * 0.55 * side, y + 1);
    c.stroke();
  }
  c.restore();
}

function blush(c: Ctx, s: FaceStyle) {
  if (s.blushK <= 0) return;
  for (const side of [-1, 1]) {
    const cx = CELL / 2 + (s.eyeX + 10) * side;
    const cy = CELL / 2 + s.eyeY + s.eyeH * 0.62;
    const g = c.createRadialGradient(cx, cy, 2, cx, cy, 22);
    g.addColorStop(0, s.blush);
    g.addColorStop(1, "rgba(0,0,0,0)");
    c.save();
    c.globalAlpha = s.blushK;
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(cx, cy, 24, 14, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }
}

function mouth(c: Ctx, s: FaceStyle, open: boolean) {
  const cx = CELL / 2;
  const cy = CELL / 2 + s.mouthY;
  c.save();
  c.lineCap = "round";
  if (open) {
    // Small open smile: a soft D with a warm tongue.
    c.fillStyle = "#5e2620";
    c.beginPath();
    c.moveTo(cx - 13, cy - 3);
    c.quadraticCurveTo(cx, cy + 2, cx + 13, cy - 3);
    c.quadraticCurveTo(cx + 9, cy + 13, cx, cy + 13);
    c.quadraticCurveTo(cx - 9, cy + 13, cx - 13, cy - 3);
    c.fill();
    c.fillStyle = "#c86a5e";
    c.beginPath();
    c.ellipse(cx, cy + 9, 6, 3.5, 0, 0, Math.PI * 2);
    c.fill();
  } else {
    c.strokeStyle = s.mouth;
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(cx - 8, cy);
    c.quadraticCurveTo(cx, cy + 5, cx + 8, cy);
    c.stroke();
  }
  c.restore();
}

/** One human face cell (expression 0..3) drawn at (ox, 0). */
function humanCell(c: Ctx, ox: number, s: FaceStyle, expr: number) {
  c.save();
  c.translate(ox, 0);
  blush(c, s);
  brows(c, s, expr === 2 ? 3 : 0);
  for (const side of [-1, 1] as const) {
    const cx = CELL / 2 + s.eyeX * side;
    const cy = CELL / 2 + s.eyeY;
    if (expr === 0) eyeOpen(c, cx, cy, s, side, 1);
    else if (expr === 3) eyeOpen(c, cx, cy, s, side, 0.45);
    else eyeClosed(c, cx, cy, s, side, expr === 2);
  }
  mouth(c, s, expr === 2);
  c.restore();
}

function canvas(w: number, h: number) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  const c = el.getContext("2d");
  if (!c) throw new Error("characters: no 2d context");
  return { el, c };
}

function texture(el: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(el);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Atlas of the four human expressions (CELLS × CELL by CELL px). */
export function humanFace(s: FaceStyle): THREE.CanvasTexture {
  const { el, c } = canvas(CELL * CELLS, CELL);
  for (let e = 0; e < CELLS; e++) humanCell(c, e * CELL, s, e);
  return texture(el);
}

/**
 * The llama's eye (side of the head, mirrored by the decal): a large dark eye with a highlight and long upper
 * lashes. Cells: 0 open, 1 closed, 2 open (no smile for a llama), 3 half.
 */
export function llamaFace(): THREE.CanvasTexture {
  const { el, c } = canvas(CELL * CELLS, CELL);
  const eye = (ox: number, lid: number) => {
    const cx = ox + CELL / 2;
    const cy = CELL / 2;
    const w = 112;
    const h = 124 * lid;
    c.save();
    if (lid > 0.1) {
      c.fillStyle = "#1c120e";
      c.beginPath();
      c.ellipse(cx, cy + (124 - h) * 0.5, w / 2, h / 2, -0.15, 0, Math.PI * 2);
      c.fill();
      const g = c.createLinearGradient(cx, cy, cx, cy + h / 2);
      g.addColorStop(0, "rgba(90,52,32,0)");
      g.addColorStop(1, "rgba(120,72,44,0.9)");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(cx, cy + (124 - h) * 0.5, w / 2 - 6, h / 2 - 6, -0.15, 0, Math.PI * 2);
      c.fill();
      if (lid > 0.6) {
        c.fillStyle = "#ffffff";
        c.beginPath();
        c.ellipse(cx + 16, cy - h * 0.18, 16, 12, 0.3, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.arc(cx - 18, cy + h * 0.22, 6, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Upper lid line with long lashes sweeping back (+u is the muzzle side; lashes fan toward −u and up).
    const top = cy + (124 - (lid > 0.1 ? h : 0)) * 0.5 - (lid > 0.1 ? h / 2 : 0);
    c.strokeStyle = "#1a110d";
    c.lineCap = "round";
    c.lineWidth = 10;
    c.beginPath();
    if (lid > 0.1) {
      c.moveTo(cx + w / 2 + 2, top + h * 0.35);
      c.quadraticCurveTo(cx, top - 6, cx - w / 2 - 4, top + h * 0.3);
    } else {
      c.moveTo(cx + w / 2, cy);
      c.quadraticCurveTo(cx, cy + 16, cx - w / 2 - 4, cy - 2);
    }
    c.stroke();
    c.lineWidth = 6;
    for (let i = 0; i < 4; i++) {
      const t = 0.3 + i * 0.2;
      const x = cx + w / 2 - t * (w + 6);
      const y = lid > 0.1 ? top + Math.sin(t * Math.PI) * -8 + h * 0.06 : cy + Math.sin(t * Math.PI) * 12;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x - 8, y - (lid > 0.1 ? 18 : -6), x - 20, y - (lid > 0.1 ? 24 : -16));
      c.stroke();
    }
    c.restore();
  };
  eye(0, 1);
  eye(CELL, 0);
  eye(CELL * 2, 1);
  eye(CELL * 3, 0.5);
  return texture(el);
}
