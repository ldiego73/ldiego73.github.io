/**
 * One canvas atlas (1024²) with every painted or carved surface of the coast's monuments, drawn procedurally:
 *  - three Moche frieze bands (Huaca de la Luna): rows of warriors holding hands, the rhomboid lattice with the
 *    fanged face, and the stepped wave band, in red, yellow, white and black;
 *  - Chan Chan reliefs in mud: fish, pelicans, waves and the net lattice, carved light-and-shadow on clay;
 *  - three Paracas mantles: embroidered flying figures on dark grounds with woven borders;
 *  - a Nasca polychrome pottery band;
 *  - the market's reed-mat weave.
 * Monuments map quads onto CELLS (uv rectangles). Everything here is stylised geometry, drawn from the shapes and
 * palettes these traditions are known for; no image is fetched.
 */
import * as THREE from "three";
import { canvasTex } from "../../../props";

const W = 1024;

/** Cells in pixels: x, y, w, h. */
const PX = {
  mocheWarriors: [0, 0, 512, 128],
  mocheFaces: [512, 0, 512, 128],
  mocheWaves: [0, 128, 512, 128],
  nasca: [512, 128, 512, 128],
  fish: [0, 256, 256, 256],
  pelican: [256, 256, 256, 256],
  net: [512, 256, 256, 256],
  wave: [768, 256, 256, 256],
  mantle1: [0, 512, 256, 384],
  mantle2: [256, 512, 256, 384],
  mantle3: [512, 512, 256, 384],
  mat: [768, 512, 256, 256],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export type Cell = keyof typeof PX;
/** UV rectangles (u0, v0, u1, v1; v up as three.js reads canvas textures with flipY). */
export const CELLS: Record<Cell, [number, number, number, number]> = Object.fromEntries(
  Object.entries(PX).map(([k, [x, y, w, h]]) => [k, [x / W, 1 - (y + h) / W, (x + w) / W, 1 - y / W]]),
) as Record<Cell, [number, number, number, number]>;
/** Aspect (w / h) of each cell, so quads keep their motifs' proportions. */
export const ASPECT: Record<Cell, number> = Object.fromEntries(
  Object.entries(PX).map(([k, v]) => [k, v[2] / v[3]]),
) as Record<Cell, number>;

const M = { red: "#b8402f", yellow: "#e2b33c", white: "#efe6d2", black: "#2a221d", ochre: "#c8873a" };

function moche(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, kind: Cell) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = kind === "mocheFaces" ? M.yellow : M.white;
  ctx.fillRect(0, 0, w, h);
  // Top and bottom borders (stepped).
  ctx.fillStyle = M.red;
  ctx.fillRect(0, 0, w, 12);
  ctx.fillRect(0, h - 12, w, 12);
  ctx.fillStyle = M.black;
  for (let i = 0; i < w; i += 24) {
    ctx.fillRect(i, 12, 12, 5);
    ctx.fillRect(i + 12, h - 17, 12, 5);
  }
  if (kind === "mocheWarriors") {
    // A row of warriors holding hands: helmet, round face, tunic, legs.
    for (let i = 0; i < 8; i++) {
      const cx = 32 + i * 64;
      ctx.fillStyle = M.black;
      ctx.fillRect(cx - 4, 30, 8, 6);
      ctx.fillStyle = i % 2 ? M.red : M.ochre;
      ctx.beginPath();
      ctx.moveTo(cx - 14, 40);
      ctx.lineTo(cx + 14, 40);
      ctx.lineTo(cx + 9, 30);
      ctx.lineTo(cx - 9, 30);
      ctx.fill();
      ctx.fillStyle = M.yellow;
      ctx.beginPath();
      ctx.arc(cx, 48, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = M.black;
      ctx.fillRect(cx - 4, 46, 2, 2);
      ctx.fillRect(cx + 2, 46, 2, 2);
      ctx.fillStyle = i % 2 ? M.ochre : M.red;
      ctx.fillRect(cx - 10, 57, 20, 30);
      ctx.fillStyle = M.black;
      ctx.fillRect(cx - 10, 70, 20, 4);
      ctx.fillRect(cx - 8, 87, 5, 18);
      ctx.fillRect(cx + 3, 87, 5, 18);
      // Arms to the neighbours.
      ctx.fillStyle = M.ochre;
      ctx.fillRect(cx + 10, 62, 22, 5);
      ctx.fillRect(cx - 32, 62, 22, 5);
    }
  } else if (kind === "mocheFaces") {
    // Rhomboid lattice; in each diamond the fanged face (eyes, nose, a wide mouth with fangs).
    const s = 52;
    for (let i = -1; i < w / s + 1; i++) {
      const cx = i * s + s / 2;
      const cy = h / 2;
      ctx.fillStyle = M.red;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 46);
      ctx.lineTo(cx + 26, cy);
      ctx.lineTo(cx, cy + 46);
      ctx.lineTo(cx - 26, cy);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = M.black;
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = M.white;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = M.black;
      ctx.fillRect(cx - 7, cy - 6, 4, 4);
      ctx.fillRect(cx + 3, cy - 6, 4, 4);
      ctx.fillRect(cx - 8, cy + 4, 16, 3);
      ctx.fillStyle = M.white;
      ctx.fillRect(cx - 5, cy + 7, 2, 4);
      ctx.fillRect(cx + 3, cy + 7, 2, 4);
    }
  } else {
    // Stepped wave band: the step-and-scroll motif.
    ctx.fillStyle = M.red;
    ctx.fillRect(0, 20, w, h - 40);
    for (let i = 0; i < w / 64 + 1; i++) {
      const x0 = i * 64;
      ctx.fillStyle = M.white;
      ctx.beginPath();
      ctx.moveTo(x0, h - 26);
      ctx.lineTo(x0, 70);
      ctx.lineTo(x0 + 16, 70);
      ctx.lineTo(x0 + 16, 50);
      ctx.lineTo(x0 + 32, 50);
      ctx.lineTo(x0 + 32, 34);
      ctx.lineTo(x0 + 48, 34);
      ctx.lineTo(x0 + 48, 50);
      ctx.lineTo(x0 + 40, 50);
      ctx.lineTo(x0 + 40, 42);
      ctx.lineTo(x0 + 40, h - 26);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = M.black;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Clay relief: draw `shape` lit from the top-left (light edge), shadowed bottom-right, on a clay ground. */
function relief(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  shape: (c: CanvasRenderingContext2D) => void,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.fillStyle = "#c9a57b";
  ctx.fillRect(0, 0, w, h);
  // Mud texture.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = i % 2 ? "rgba(120,86,52,0.08)" : "rgba(255,240,210,0.08)";
    ctx.fillRect(((i * 97) % w) | 0, ((i * 57) % h) | 0, 3 + (i % 5), 2 + (i % 3));
  }
  ctx.translate(3, 3);
  ctx.fillStyle = "rgba(92,62,36,0.75)";
  ctx.strokeStyle = "rgba(92,62,36,0.75)";
  shape(ctx);
  ctx.translate(-5, -5);
  ctx.fillStyle = "#e3c69c";
  ctx.strokeStyle = "#e3c69c";
  shape(ctx);
  ctx.translate(2, 2);
  ctx.fillStyle = "#d4b38a";
  ctx.strokeStyle = "#d4b38a";
  shape(ctx);
  ctx.restore();
}

const fishShape = (c: CanvasRenderingContext2D) => {
  for (let r = 0; r < 4; r++)
    for (let k = 0; k < 3; k++) {
      const cx = 44 + k * 84 + (r % 2) * 42;
      const cy = 34 + r * 64;
      c.beginPath();
      c.ellipse(cx, cy, 24, 11, 0, 0, Math.PI * 2);
      c.moveTo(cx - 22, cy);
      c.lineTo(cx - 38, cy - 12);
      c.lineTo(cx - 38, cy + 12);
      c.closePath();
      c.fill();
    }
};
const pelicanShape = (c: CanvasRenderingContext2D) => {
  for (let r = 0; r < 2; r++)
    for (let k = 0; k < 2; k++) {
      const ox = 20 + k * 120 + (r % 2) * 20;
      const oy = 20 + r * 120;
      c.beginPath();
      // Body, neck, head and the long pouched bill; a wing raised.
      c.ellipse(ox + 50, oy + 70, 34, 18, -0.2, 0, Math.PI * 2);
      c.fill();
      c.fillRect(ox + 70, oy + 22, 9, 44);
      c.beginPath();
      c.arc(ox + 76, oy + 22, 10, 0, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.moveTo(ox + 82, oy + 18);
      c.lineTo(ox + 112, oy + 34);
      c.lineTo(ox + 82, oy + 30);
      c.closePath();
      c.fill();
      c.beginPath();
      c.moveTo(ox + 30, oy + 62);
      c.lineTo(ox + 10, oy + 28);
      c.lineTo(ox + 52, oy + 56);
      c.closePath();
      c.fill();
      c.fillRect(ox + 40, oy + 86, 5, 18);
      c.fillRect(ox + 56, oy + 86, 5, 18);
    }
};
const netShape = (c: CanvasRenderingContext2D) => {
  c.lineWidth = 7;
  for (let i = -256; i < 512; i += 36) {
    c.beginPath();
    c.moveTo(i, 0);
    c.lineTo(i + 256, 256);
    c.stroke();
    c.beginPath();
    c.moveTo(i + 256, 0);
    c.lineTo(i, 256);
    c.stroke();
  }
};
const waveShape = (c: CanvasRenderingContext2D) => {
  c.lineWidth = 9;
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 3; k++) {
      const cx = 44 + k * 84;
      const cy = 46 + r * 82;
      c.beginPath();
      // A scroll: a spiral that runs out into the next one.
      for (let a = 0; a < Math.PI * 3.2; a += 0.2) {
        const rr = 4 + a * 5;
        const px = cx + Math.cos(a + Math.PI) * rr;
        const py = cy + Math.sin(a + Math.PI) * rr;
        if (a === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.stroke();
    }
};

function mantle(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, i: number) {
  const grounds = ["#3a2f5a", "#7a2b26", "#2f4a3a"];
  const pal = [
    ["#d9a43a", "#c4383f", "#4f8a6a", "#e6d2a8"],
    ["#d9a43a", "#3f5f9a", "#e6d2a8", "#5f8a3a"],
    ["#c4383f", "#d9a43a", "#3f5f9a", "#e6d2a8"],
  ][i] as string[];
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = grounds[i] as string;
  ctx.fillRect(0, 0, w, h);
  // Border bands.
  ctx.fillStyle = pal[0] as string;
  ctx.fillRect(0, 0, w, 16);
  ctx.fillRect(0, h - 16, w, 16);
  ctx.fillRect(0, 0, 14, h);
  ctx.fillRect(w - 14, 0, 14, h);
  ctx.fillStyle = pal[1] as string;
  for (let k = 0; k < w; k += 16) {
    ctx.fillRect(k, 4, 8, 8);
    ctx.fillRect(k + 8, h - 12, 8, 8);
  }
  // A grid of embroidered flying figures (alternating colours, mirrored on odd rows).
  const cols = 3;
  const rows = 5;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cx = 34 + c * ((w - 68) / (cols - 1));
      const cy = 46 + r * ((h - 92) / (rows - 1));
      const col = pal[(r + c) % pal.length] as string;
      const flip = (r + c) % 2 ? -1 : 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(flip, 1);
      ctx.fillStyle = col;
      // Body (horizontal: flying), head with a headdress, a staff, trailing streamers.
      ctx.fillRect(-16, -6, 30, 12);
      ctx.beginPath();
      ctx.arc(18, -2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(14, -16, 4, 8);
      ctx.fillRect(20, -18, 4, 10);
      ctx.fillRect(26, -14, 4, 7);
      ctx.fillRect(-4, 6, 4, 12);
      ctx.fillRect(6, 6, 4, 10);
      ctx.fillRect(-26, -3, 12, 3);
      ctx.fillRect(-30, 3, 14, 3);
      ctx.fillStyle = "#1f1a17";
      ctx.fillRect(19, -4, 3, 3);
      ctx.restore();
    }
  ctx.restore();
}

function nasca(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e9dcc0";
  ctx.fillRect(0, 0, w, h);
  const bands = ["#b8402f", "#2a221d", "#d07a32", "#7a5a8a"];
  bands.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(0, i * 8, w, 5);
    ctx.fillRect(0, h - 5 - i * 8, w, 5);
  });
  // Hummingbirds and stepped frets.
  for (let i = 0; i < 8; i++) {
    const cx = 32 + i * 64;
    const cy = h / 2;
    ctx.fillStyle = i % 2 ? "#4f8a6a" : "#b8402f";
    ctx.beginPath();
    ctx.ellipse(cx, cy, 10, 6, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx + 6, cy - 9, 18, 3);
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy - 4);
    ctx.lineTo(cx - 16, cy - 22);
    ctx.lineTo(cx + 2, cy - 6);
    ctx.fill();
    ctx.fillStyle = "#2a221d";
    ctx.fillRect(cx - 18, cy + 8, 8, 4);
    ctx.fillRect(cx - 22, cy + 12, 4, 6);
  }
  ctx.restore();
}

function reedMat(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#c9b06a";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 6) {
    ctx.fillStyle = i % 12 ? "#b89c58" : "#d8c07a";
    ctx.fillRect(i, 0, 3, h);
  }
  ctx.fillStyle = "rgba(90,70,40,0.35)";
  for (let j = 0; j < h; j += 32) ctx.fillRect(0, j, w, 3);
  ctx.restore();
}

/** Builds the atlas texture (call once per world mount; the owner disposes it). */
export function buildAtlas(): THREE.CanvasTexture {
  const tex = canvasTex(W, W, (ctx) => {
    ctx.fillStyle = "#c9a57b";
    ctx.fillRect(0, 0, W, W);
    const at = (c: Cell) => PX[c];
    for (const c of ["mocheWarriors", "mocheFaces", "mocheWaves"] as const) {
      const [x, y, w, h] = at(c);
      moche(ctx, x, y, w, h, c);
    }
    {
      const [x, y, w, h] = at("nasca");
      nasca(ctx, x, y, w, h);
    }
    for (const [c, shape] of [
      ["fish", fishShape],
      ["pelican", pelicanShape],
      ["net", netShape],
      ["wave", waveShape],
    ] as const) {
      const [x, y, w, h] = at(c);
      relief(ctx, x, y, w, h, shape);
    }
    (["mantle1", "mantle2", "mantle3"] as const).forEach((c, i) => {
      const [x, y, w, h] = at(c);
      mantle(ctx, x, y, w, h, i);
    });
    {
      const [x, y, w, h] = at("mat");
      reedMat(ctx, x, y, w, h);
    }
  });
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

/** Collects textured quads (world-space corners, a cell of the atlas) into one geometry. */
export class Quads {
  private pos: number[] = [];
  private uv: number[] = [];
  private nrm: number[] = [];
  /**
   * A vertical quad: bottom-left at (ax, y, az) → bottom-right (bx, y, bz), height h; the cell is repeated
   * `rep` times along its width (by splitting into rep quads).
   */
  wall(ax: number, az: number, bx: number, bz: number, y: number, h: number, cell: Cell, rep = 1, yb?: number) {
    const [u0, v0, u1, v1] = CELLS[cell];
    const n = Math.max(1, Math.round(rep));
    const dx = bx - ax;
    const dz = bz - az;
    const l = Math.hypot(dx, dz) || 1;
    // Facing: seen from the front, a is on the left and b on the right (counter-clockwise winding).
    const nx = -dz / l;
    const nz = dx / l;
    for (let i = 0; i < n; i++) {
      const x0 = ax + (dx * i) / n;
      const z0 = az + (dz * i) / n;
      const x1 = ax + (dx * (i + 1)) / n;
      const z1 = az + (dz * (i + 1)) / n;
      const y0 = y;
      const y1 = (yb ?? y) + h;
      this.pos.push(x0, y0, z0, x1, y0, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x0, y1, z0);
      this.uv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
      for (let k = 0; k < 6; k++) this.nrm.push(nx, 0, nz);
    }
  }
  get empty() {
    return this.pos.length === 0;
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
}
