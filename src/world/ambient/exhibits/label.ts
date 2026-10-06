/**
 * Canvas labels for the exhibits and the C4 maquettes: paper tags with an ink border, drawn once
 * (and again when the web fonts arrive). Sprites always face the camera; plates are flat screens/plaques.
 * Both are unlit and skip the ink outline.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { canvasTex, FONT, offFontsReady, onFontsReady, redraw } from "../../props";
import { inkMask } from "../../toon";

export interface Owned {
  dispose(): void;
}

export interface LabelOpts {
  /** World height of the tag. */
  h?: number;
  bg?: string;
  fg?: string;
  border?: string;
  /** Small second line under the main text. */
  sub?: string;
  /** Left color stripe (dye). */
  stripe?: string;
  font?: "display" | "mono";
}

const PX = 64;

function measure(text: string, sub: string | undefined, font: string) {
  const c = document.createElement("canvas").getContext("2d");
  if (!c) return 300;
  c.font = font;
  let w = c.measureText(text).width;
  if (sub) {
    c.font = `600 ${PX * 0.5}px ${FONT.mono}`;
    w = Math.max(w, c.measureText(sub).width);
  }
  return w;
}

/** A camera-facing paper tag. Returns the sprite (centered on its bottom edge) and its disposer. */
export function labelSprite(env: WorldEnv, text: string, o: LabelOpts = {}): { sprite: THREE.Sprite } & Owned {
  const font = o.font === "mono" ? `700 ${PX * 0.78}px ${FONT.mono}` : `800 ${PX}px ${FONT.display}`;
  const pad = PX * 0.36;
  const stripe = o.stripe ? PX * 0.22 : 0;
  const textW = measure(text, o.sub, font) * 1.08;
  const w = Math.ceil(Math.min(1400, textW + pad * 2 + stripe));
  const hpx = Math.ceil(o.sub ? PX * 1.85 : PX * 1.3);
  const draw = (ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    const b = 6;
    ctx.fillStyle = o.border ?? "#1f1a17";
    roundRect(ctx, 0, 0, cw, ch, 14);
    ctx.fill();
    ctx.fillStyle = o.bg ?? "#f3ead8";
    roundRect(ctx, b, b, cw - b * 2, ch - b * 2, 10);
    ctx.fill();
    if (o.stripe) {
      ctx.fillStyle = o.stripe;
      ctx.fillRect(b, b, stripe, ch - b * 2);
    }
    ctx.fillStyle = o.fg ?? "#1f1a17";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    let s = o.font === "mono" ? PX * 0.78 : PX;
    const maxW = cw - pad * 2 - stripe;
    const fam = o.font === "mono" ? FONT.mono : FONT.display;
    const wt = o.font === "mono" ? "700" : "800";
    ctx.font = `${wt} ${s}px ${fam}`;
    while (ctx.measureText(text).width > maxW && s > 14) {
      s -= 2;
      ctx.font = `${wt} ${s}px ${fam}`;
    }
    const cx = stripe + (cw - stripe) / 2;
    ctx.fillText(text, cx, o.sub ? ch * 0.38 : ch / 2 + 2);
    if (o.sub) {
      ctx.font = `600 ${PX * 0.5}px ${FONT.mono}`;
      ctx.fillStyle = "#5b4a3a";
      ctx.fillText(o.sub, cx, ch * 0.74);
    }
  };
  const tex = canvasTex(w, hpx, draw);
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  const mat = new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  const h = o.h ?? 0.2;
  sprite.scale.set((h * w) / hpx, h, 1);
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 5;
  sprite.name = "label";
  env.noOutline(sprite);
  inkMask(sprite);
  return {
    sprite,
    dispose() {
      offFontsReady(re);
      tex.dispose();
      mat.dispose();
    },
  };
}

/** A flat canvas plate (screen, plaque) facing +Z, w × h world units. */
export function plate(
  env: WorldEnv,
  w: number,
  h: number,
  px: number,
  draw: (ctx: CanvasRenderingContext2D, cw: number, ch: number) => void,
): { mesh: THREE.Mesh } & Owned {
  const cw = Math.round(px);
  const ch = Math.round((px * h) / w);
  const tex = canvasTex(cw, ch, draw);
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  const mat = new THREE.MeshBasicMaterial({ map: tex });
  const geo = new THREE.PlaneGeometry(w, h);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "plate";
  env.noOutline(mesh);
  inkMask(mesh);
  return {
    mesh,
    dispose() {
      offFontsReady(re);
      tex.dispose();
      mat.dispose();
      geo.dispose();
    },
  };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Centered text that shrinks to fit. */
export function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  px: number,
  weight = "800",
  family = FONT.display,
) {
  let s = px;
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${family}`;
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}
