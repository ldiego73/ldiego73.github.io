/**
 * The cloth pattern atlas (canvas, no image files), shared by every character so all cloth can later draw with
 * one material. It holds MASKS, not colours: black = the piece's base slot, red / green / blue / white = its
 * four pattern slots (./material.ts mixes palette colours by them), so the same poncho weave can be dyed any
 * way per person.
 *
 * Three horizontal regions, each drawn top (the pinned edge, UV row 0) to bottom (the free hem):
 *   top third     poncho: khipu-dye bands with a row of pallay diamonds and a fringed hem border;
 *   middle third  pollera: a plain bayeta field, woven hem bands (the top tier) and a contrasting under-layer edge;
 *   bottom third  lliclla: warp stripes and a pallay band, with a woven border along the free edge.
 */
import * as THREE from "three";

export { REGION } from "./regions";

export const ATLAS = 512;
const R = "#ff0000";
const G = "#00ff00";
const B = "#0000ff";
const W = "#ffffff";

export function clothAtlas(): THREE.CanvasTexture {
  const el = document.createElement("canvas");
  el.width = ATLAS;
  el.height = ATLAS;
  const c = el.getContext("2d");
  if (!c) throw new Error("characters: no 2d context");
  c.fillStyle = "#000000";
  c.fillRect(0, 0, ATLAS, ATLAS);
  const H = ATLAS / 3;
  poncho(c, 0, H);
  pollera(c, H, H);
  lliclla(c, 2 * H, H);
  const t = new THREE.CanvasTexture(el);
  // Masks are data, not colours: keep them linear.
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

type Ctx = CanvasRenderingContext2D;

const band = (c: Ctx, y0: number, h: number, v: number, th: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(0, y0 + v * h - th / 2, ATLAS, th);
};

/** Diamonds (pallay "eye" motif) along a row: outline in `a`, centre in `b`. */
function diamonds(c: Ctx, y: number, n: number, rx: number, ry: number, a: string, b: string) {
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * ATLAS;
    c.fillStyle = a;
    c.beginPath();
    c.moveTo(x, y - ry);
    c.lineTo(x + rx, y);
    c.lineTo(x, y + ry);
    c.lineTo(x - rx, y);
    c.fill();
    c.fillStyle = b;
    c.fillRect(x - rx * 0.25, y - ry * 0.25, rx * 0.5, ry * 0.5);
  }
}

function poncho(c: Ctx, y0: number, h: number) {
  // Bands from the neck (top) to the hem (bottom), the old avatar's khipu dyes.
  band(c, y0, h, 0.14, 9, R);
  band(c, y0, h, 0.23, 4, G);
  diamonds(c, y0 + h * 0.4, 16, 9, 10, B, G);
  band(c, y0, h, 0.56, 10, B);
  band(c, y0, h, 0.68, 4, W);
  band(c, y0, h, 0.78, 7, R);
  band(c, y0, h, 0.9, 12, B);
  // Fringe hint at the very hem.
  c.fillStyle = G;
  for (let x = 0; x < ATLAS; x += 6) c.fillRect(x, y0 + h * 0.965, 3, h * 0.035);
}

function pollera(c: Ctx, y0: number, h: number) {
  // Waist at the top: a woven chumpi belt, then the plain field; the hem: a wide woven band (zig-zag, two
  // dyes) and the contrasting under-layer edge.
  band(c, y0, h, 0.03, 10, W);
  band(c, y0, h, 0.068, 3, R);
  c.fillStyle = R;
  c.fillRect(0, y0 + h * 0.74, ATLAS, h * 0.13);
  c.fillStyle = G;
  const zy = y0 + h * 0.805;
  c.beginPath();
  for (let x = 0; x <= ATLAS; x += 16) {
    c.lineTo(x, zy - 6);
    c.lineTo(x + 8, zy + 6);
  }
  c.lineTo(ATLAS, zy + 9);
  c.lineTo(0, zy + 9);
  c.fill();
  band(c, y0, h, 0.725, 4, W);
  band(c, y0, h, 0.885, 4, W);
  c.fillStyle = B;
  c.fillRect(0, y0 + h * 0.91, ATLAS, h * 0.09);
}

function lliclla(c: Ctx, y0: number, h: number) {
  // Warp stripes running down the back (vertical in the atlas), a pallay band across, a woven free edge.
  const stripes: Array<[number, number, string]> = [
    [0.08, 10, R],
    [0.16, 4, W],
    [0.3, 8, G],
    [0.5, 14, R],
    [0.7, 8, G],
    [0.84, 4, W],
    [0.92, 10, R],
  ];
  for (const [u, w, col] of stripes) {
    c.fillStyle = col;
    c.fillRect(u * ATLAS - w / 2, y0, w, h);
  }
  c.fillStyle = "#000000";
  c.fillRect(0, y0 + h * 0.52, ATLAS, h * 0.2);
  diamonds(c, y0 + h * 0.62, 12, 12, 12, B, R);
  band(c, y0, h, 0.52, 3, W);
  band(c, y0, h, 0.72, 3, W);
  c.fillStyle = B;
  c.fillRect(0, y0 + h * 0.92, ATLAS, h * 0.08);
  band(c, y0, h, 0.93, 3, G);
}
