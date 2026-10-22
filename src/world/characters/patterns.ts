/**
 * The cloth pattern atlas (canvas, no image files), shared by every character so all cloth draws with one
 * material. It holds MASKS, not colours: black = the piece's base slot, red / green / blue / white = its four
 * pattern slots (./material.ts mixes palette colours by them), so the same weave is dyed per person.
 *
 * Eight horizontal strips (./regions.ts), each drawn top (the pinned edge, UV row 0) to bottom (the free hem):
 *   poncho   khipu-dye bands with a row of pallay diamonds and a fringed hem border;
 *   pollera  a plain bayeta field, woven hem bands and a contrasting under-layer edge;
 *   lliclla  warp stripes and a pallay band, with a woven border along the free edge;
 *   stripes  the cushma's thin vertical warp stripes over a plain hem;
 *   kene     the Shipibo-Konibo maze of fine lines (stepped crosses and meanders) and a dark hem;
 *   bordado  Colca embroidery: rows of small flowers and a wide embroidered hem;
 *   floral   a hibiscus-and-leaf print (the beach traveler's open shirt);
 *   plain    plain cloth with a hem band (aprons, scarves).
 * Drawn plainly from the textiles they evoke, never as costume.
 */
import * as THREE from "three";
import { REGION_ORDER, type RegionName } from "./regions";

export { REGION } from "./regions";

export const ATLAS_W = 512;
export const ATLAS_H = 1024;
/** @deprecated the atlas is no longer square: use ATLAS_W / ATLAS_H. */
export const ATLAS = ATLAS_W;
const R = "#ff0000";
const G = "#00ff00";
const B = "#0000ff";
const W = "#ffffff";
const K = "#000000";

type Ctx = CanvasRenderingContext2D;

export function clothAtlas(): THREE.CanvasTexture {
  const el = document.createElement("canvas");
  el.width = ATLAS_W;
  el.height = ATLAS_H;
  const c = el.getContext("2d");
  if (!c) throw new Error("characters: no 2d context");
  c.fillStyle = K;
  c.fillRect(0, 0, ATLAS_W, ATLAS_H);
  const H = ATLAS_H / REGION_ORDER.length;
  const draw: Record<RegionName, (c: Ctx, y0: number, h: number) => void> = {
    poncho,
    pollera,
    lliclla,
    stripes,
    kene,
    bordado,
    floral,
    plain,
  };
  REGION_ORDER.forEach((name, k) => {
    c.save();
    c.beginPath();
    c.rect(0, k * H, ATLAS_W, H);
    c.clip();
    draw[name](c, k * H, H);
    c.restore();
  });
  const t = new THREE.CanvasTexture(el);
  // Masks are data, not colours: keep them linear.
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

const band = (c: Ctx, y0: number, h: number, v: number, th: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(0, y0 + v * h - th / 2, ATLAS_W, th);
};

/** Diamonds (pallay "eye" motif) along a row: outline in `a`, centre in `b`. */
function diamonds(c: Ctx, y: number, n: number, rx: number, ry: number, a: string, b: string) {
  for (let i = 0; i < n; i++) {
    const x = ((i + 0.5) / n) * ATLAS_W;
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
  // Bands from the neck (top) to the hem (bottom), the khipu dyes.
  band(c, y0, h, 0.14, 7, R);
  band(c, y0, h, 0.23, 3, G);
  diamonds(c, y0 + h * 0.4, 16, 9, 8, B, G);
  band(c, y0, h, 0.56, 8, B);
  band(c, y0, h, 0.68, 3, W);
  band(c, y0, h, 0.78, 6, R);
  band(c, y0, h, 0.9, 9, B);
  // Fringe hint at the very hem.
  c.fillStyle = G;
  for (let x = 0; x < ATLAS_W; x += 6) c.fillRect(x, y0 + h * 0.965, 3, h * 0.035);
}

function pollera(c: Ctx, y0: number, h: number) {
  // Waist at the top: a woven chumpi belt, then the plain field; the hem: a wide woven band (zig-zag, two
  // dyes) and the contrasting under-layer edge.
  band(c, y0, h, 0.03, 8, W);
  band(c, y0, h, 0.068, 3, R);
  c.fillStyle = R;
  c.fillRect(0, y0 + h * 0.74, ATLAS_W, h * 0.13);
  c.fillStyle = G;
  const zy = y0 + h * 0.805;
  c.beginPath();
  for (let x = 0; x <= ATLAS_W; x += 16) {
    c.lineTo(x, zy - 5);
    c.lineTo(x + 8, zy + 5);
  }
  c.lineTo(ATLAS_W, zy + 7);
  c.lineTo(0, zy + 7);
  c.fill();
  band(c, y0, h, 0.725, 3, W);
  band(c, y0, h, 0.885, 3, W);
  c.fillStyle = B;
  c.fillRect(0, y0 + h * 0.91, ATLAS_W, h * 0.09);
}

function lliclla(c: Ctx, y0: number, h: number) {
  // Warp stripes running down the back (vertical in the atlas), a pallay band across, a woven free edge.
  const st: Array<[number, number, string]> = [
    [0.08, 10, R],
    [0.16, 4, W],
    [0.3, 8, G],
    [0.5, 14, R],
    [0.7, 8, G],
    [0.84, 4, W],
    [0.92, 10, R],
  ];
  for (const [u, w, col] of st) {
    c.fillStyle = col;
    c.fillRect(u * ATLAS_W - w / 2, y0, w, h);
  }
  c.fillStyle = K;
  c.fillRect(0, y0 + h * 0.52, ATLAS_W, h * 0.2);
  diamonds(c, y0 + h * 0.62, 12, 12, 10, B, R);
  band(c, y0, h, 0.52, 3, W);
  band(c, y0, h, 0.72, 3, W);
  c.fillStyle = B;
  c.fillRect(0, y0 + h * 0.92, ATLAS_W, h * 0.08);
  band(c, y0, h, 0.93, 3, G);
}

function stripes(c: Ctx, y0: number, h: number) {
  // Thin warp stripes all round (a pair of R, a single G, repeat), a plain band then the hem in B.
  for (let i = 0; i < 24; i++) {
    const x = (i / 24) * ATLAS_W;
    c.fillStyle = i % 3 === 2 ? G : R;
    c.fillRect(x + 4, y0, 3, h * 0.86);
  }
  c.fillStyle = K;
  c.fillRect(0, y0 + h * 0.86, ATLAS_W, h * 0.02);
  c.fillStyle = B;
  c.fillRect(0, y0 + h * 0.9, ATLAS_W, h * 0.1);
}

function kene(c: Ctx, y0: number, h: number) {
  // Kené: thick and thin lines laid on a grid as stepped crosses joined by meanders (a maze read at a
  // distance as a fine dark lattice), the thick ones in R, the fine fill in G, between a band and a dark hem.
  const cell = 32;
  c.strokeStyle = R;
  c.lineWidth = 4;
  c.lineCap = "square";
  const top = y0 + h * 0.08;
  const bot = y0 + h * 0.82;
  for (let gx = 0; gx < ATLAS_W; gx += cell * 2)
    for (let gy = top; gy < bot; gy += cell * 2) {
      const cx = gx + cell;
      const cy = gy + cell;
      // Stepped cross.
      c.beginPath();
      c.moveTo(cx - cell, cy);
      c.lineTo(cx - cell * 0.5, cy);
      c.lineTo(cx - cell * 0.5, cy - cell * 0.5);
      c.lineTo(cx, cy - cell * 0.5);
      c.lineTo(cx, cy - cell);
      c.moveTo(cx + cell, cy);
      c.lineTo(cx + cell * 0.5, cy);
      c.lineTo(cx + cell * 0.5, cy + cell * 0.5);
      c.lineTo(cx, cy + cell * 0.5);
      c.lineTo(cx, cy + cell);
      c.stroke();
    }
  c.strokeStyle = G;
  c.lineWidth = 1.5;
  for (let gy = top + 8; gy < bot; gy += 8) {
    c.beginPath();
    for (let x = 0; x <= ATLAS_W; x += 16) {
      c.lineTo(x, gy);
      c.lineTo(x + 8, gy + ((x / 16) % 2 ? 3 : -3));
    }
    c.globalAlpha = 0.6;
    c.stroke();
    c.globalAlpha = 1;
  }
  band(c, y0, h, 0.04, 5, W);
  c.fillStyle = B;
  c.fillRect(0, y0 + h * 0.86, ATLAS_W, h * 0.14);
  band(c, y0, h, 0.88, 2, W);
}

function bordado(c: Ctx, y0: number, h: number) {
  // Rows of small five-petal flowers (alternating R / G / B dyes) over the base, then a wide embroidered hem:
  // a white band with big flowers and leafy zig-zags.
  const flower = (x: number, y: number, r: number, col: string, mid: string) => {
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = mid;
    c.beginPath();
    c.arc(x, y, r * 0.6, 0, Math.PI * 2);
    c.fill();
  };
  const rows = [0.18, 0.36, 0.54];
  rows.forEach((v, k) => {
    for (let i = 0; i < 16; i++)
      flower(((i + 0.5 + (k % 2) * 0.5) / 16) * ATLAS_W, y0 + v * h, 5, [R, G, B][(i + k) % 3] as string, W);
  });
  c.fillStyle = W;
  c.fillRect(0, y0 + h * 0.68, ATLAS_W, h * 0.26);
  for (let i = 0; i < 10; i++) flower(((i + 0.5) / 10) * ATLAS_W, y0 + h * 0.81, 8, [R, B, G][i % 3] as string, G);
  c.fillStyle = G;
  for (let x = 0; x < ATLAS_W; x += 12) c.fillRect(x, y0 + h * 0.7, 6, 3);
  band(c, y0, h, 0.965, 6, R);
}

function floral(c: Ctx, y0: number, h: number) {
  // Fixed scatter (the print is the same on every visit): leaves (B) under flowers (W, G, R).
  const spots: Array<[number, number, string]> = [];
  for (let i = 0; i < 22; i++) {
    const x = ((i * 97) % ATLAS_W) + 10;
    const y = y0 + ((i * 53) % Math.floor(h - 16)) + 8;
    spots.push([x, y, [W, G, R][i % 3] as string]);
  }
  c.fillStyle = B;
  for (const [x, y] of spots) {
    c.beginPath();
    c.ellipse(x + 10, y + 6, 10, 4, 0.6, 0, Math.PI * 2);
    c.ellipse(x - 9, y + 7, 9, 3.5, -0.7, 0, Math.PI * 2);
    c.fill();
  }
  for (const [x, y, col] of spots) {
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      c.beginPath();
      c.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.5, 0, Math.PI * 2);
      c.fill();
    }
  }
}

function plain(c: Ctx, y0: number, h: number) {
  // A plain field with a narrow woven hem (R) and a thin W line above it.
  band(c, y0, h, 0.86, 3, W);
  c.fillStyle = R;
  c.fillRect(0, y0 + h * 0.9, ATLAS_W, h * 0.1);
}
