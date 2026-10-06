/**
 * One canvas atlas for every wooden sign of a station (one texture, one material, many planes).
 * Signs are unlit (readable at dusk and on the shaded side of a terrace) and skip the ink outline.
 * The atlas redraws once the web fonts are ready.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { canvasTex, offFontsReady, onFontsReady, redraw } from "../../props";
import { inkMask } from "../../toon";

export interface SignAtlas {
  material: THREE.MeshBasicMaterial;
  /** A plane (w × h world units) showing cell i, facing +Z. Geometry is owned by the atlas. */
  plane(i: number, w: number, h: number): THREE.Mesh;
  dispose(): void;
}

export function signAtlas(
  env: WorldEnv,
  cells: number,
  cw: number,
  ch: number,
  drawCell: (ctx: CanvasRenderingContext2D, i: number, cw: number, ch: number) => void,
): SignAtlas {
  const n = Math.max(1, cells);
  const draw = (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(0, i * ch);
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.clip();
      drawCell(ctx, i, cw, ch);
      ctx.restore();
    }
  };
  const tex = canvasTex(cw, ch * n, draw);
  const material = new THREE.MeshBasicMaterial({ map: tex, color: "#ece4d6" });
  const geos: THREE.BufferGeometry[] = [];
  const refresh = () => redraw(tex, draw);
  onFontsReady(refresh);
  return {
    material,
    plane(i, w, h) {
      const g = new THREE.PlaneGeometry(w, h);
      const uv = g.getAttribute("uv") as THREE.BufferAttribute;
      const v0 = 1 - (i + 1) / n;
      const v1 = 1 - i / n;
      for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 : v0);
      geos.push(g);
      const m = new THREE.Mesh(g, material);
      m.name = "qnf-sign";
      env.noOutline(m);
      inkMask(m);
      return m;
    },
    dispose() {
      offFontsReady(refresh);
      for (const g of geos) g.dispose();
      tex.dispose();
      material.dispose();
    },
  };
}

/** Shrinks the font until the text fits maxW; returns the size used. */
export function fit(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: (px: number) => string,
  px: number,
  maxW: number,
) {
  let s = px;
  ctx.font = font(s);
  while (ctx.measureText(text).width > maxW && s > 10) {
    s -= 1;
    ctx.font = font(s);
  }
  return s;
}
