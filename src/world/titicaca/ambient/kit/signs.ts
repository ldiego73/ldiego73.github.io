/**
 * Painted boards for a lake ambient: one canvas atlas (cells stacked vertically) and ONE mesh holding every
 * board's quad, so a set of signs is a single draw call. Unlit (readable at dusk and in the shade, like the
 * other worlds' signs), off the ink layer with an ink-mask twin so the board keeps its outline. The atlas
 * redraws once the web fonts are ready.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../../contract";
import { canvasTex, offFontsReady, onFontsReady, redraw } from "../../../props";
import { inkMask } from "../../../toon";

export interface BoardSpec {
  /** Atlas cell. */
  i: number;
  /** World size. */
  w: number;
  h: number;
  /** Centre and facing (the board's front faces +z turned by yaw). */
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface Boards {
  mesh: THREE.Mesh;
  redraw(): void;
  dispose(): void;
}

export function buildBoards(
  env: WorldEnv,
  name: string,
  cells: number,
  cw: number,
  ch: number,
  drawCell: (ctx: CanvasRenderingContext2D, i: number, cw: number, ch: number) => void,
  boards: ReadonlyArray<BoardSpec>,
): Boards {
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
  tex.anisotropy = 4;
  const material = new THREE.MeshBasicMaterial({ map: tex, color: "#f1ebe0", side: THREE.DoubleSide });
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const b of boards) {
    const v0 = 1 - (b.i + 1) / n;
    const v1 = 1 - b.i / n;
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const o = pos.length / 3;
    for (const [lx, ly, u, v] of [
      [-b.w / 2, -b.h / 2, 0, v0],
      [b.w / 2, -b.h / 2, 1, v0],
      [b.w / 2, b.h / 2, 1, v1],
      [-b.w / 2, b.h / 2, 0, v1],
    ] as const) {
      pos.push(b.x + lx * c, b.y + ly, b.z - lx * s);
      uv.push(u, v);
    }
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  env.noOutline(mesh);
  inkMask(mesh);
  const refresh = () => redraw(tex, draw);
  onFontsReady(refresh);
  return {
    mesh,
    redraw: refresh,
    dispose() {
      offFontsReady(refresh);
      geo.dispose();
      tex.dispose();
      material.dispose();
    },
  };
}

/** Woven-frame paper board: cream paper, a selvage band in `dye`, an inked edge. */
export function paperBoard(ctx: CanvasRenderingContext2D, w: number, h: number, dye: string) {
  ctx.fillStyle = "#f3ead8";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = dye;
  ctx.fillRect(0, 0, w, 18);
  ctx.fillRect(0, h - 18, w, 18);
  // Little woven diamonds along the bands.
  ctx.fillStyle = "#efe6d6";
  for (let x = 10; x < w; x += 26)
    for (const y of [9, h - 9]) {
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fill();
    }
  ctx.strokeStyle = "#1f1a17";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
}
