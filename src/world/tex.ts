import * as THREE from "three";

/** A canvas + texture pair that can be redrawn (e.g. after fonts load). */
export interface CanvasTex {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  redraw: () => void;
}

const cache = new Map<string, CanvasTex>();

/**
 * Creates (or returns the cached) canvas texture drawn by `draw`.
 * Every texture is registered so `redrawAll` can repaint once web fonts are ready.
 */
export function canvasTex(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { srgb?: boolean; repeat?: boolean } = {},
): CanvasTex {
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const tex = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  const redraw = () => {
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
    tex.needsUpdate = true;
  };
  redraw();
  const entry = { canvas, ctx, tex, redraw };
  cache.set(key, entry);
  return entry;
}

export function redrawAll() {
  for (const c of cache.values()) c.redraw();
}

export function disposeTextures() {
  for (const c of cache.values()) c.tex.dispose();
  cache.clear();
}

/** Seeded PRNG (mulberry32) so procedural layouts are stable between visits. */
export function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fits text into maxW by shrinking the font size. Returns the size used. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  px: number,
  maxW: number,
): number {
  let size = px;
  ctx.font = font(size);
  while (size > 8 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = font(size);
  }
  return size;
}

/** Painted sign text: a soft ink drop under the fill (kept as `neonText` for older callers). */
export function inkText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, _blur = 0) {
  ctx.save();
  ctx.fillStyle = "rgb(31 26 23 / 0.35)";
  ctx.fillText(text, x + 1, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}
export const neonText = inkText;

// ---------------------------------------------------------------- noise

const hash2 = (x: number, y: number) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth value noise in [-1, 1]. */
export function noise2(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

/** Fractal value noise, roughly [-1, 1]. */
export function fbm(x: number, y: number, oct = 4) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += noise2(x * f + i * 17.3, y * f - i * 9.1) * a;
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
