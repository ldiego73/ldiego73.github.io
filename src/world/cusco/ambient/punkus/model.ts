/**
 * Models of the hub's five punkus, all gates in three meshes:
 *   stone    the doorways (jambs of dressed blocks whose inner faces step in: the Inca trapezoid; a monolith
 *            lintel and a capping course), a brazier on a post either side of the plaza face, and on closed
 *            gates a bar of three lashed logs across the opening; one vertex-coloured mesh.
 *   glimpse  in each opening, a picture of the world behind it (canvas atlas, one column per gate: the
 *            mountain, the coast, the jungle, the lake, the canyon), dimmed grey on closed gates.
 *   signs    a carved plaque on each lintel (canvas atlas: the suyu's name, its bearing, or "coming soon").
 * Frames come from ./logic.ts (gate-local x across, z toward the plaza).
 */
import * as THREE from "three";
import type { Lang } from "../../../contract";
import { FONT, fitFont } from "../../../props";
import { GATES, type Gate, gateYaw } from "../../plan";
import { Masonry } from "../../scenery/masonry";
import { DOOR, gateAction, gateWorld } from "./logic";

const STONE = ["#a39d90", "#958f83", "#ada79a", "#8c867b"] as const;
const LOG = "#6e4a2c";
const ROPE = "#c9ad74";

export interface PunkuModels {
  stone: THREE.BufferGeometry;
  glimpse: { geometry: THREE.BufferGeometry; texture: THREE.CanvasTexture };
  signs: { geometry: THREE.BufferGeometry; texture: THREE.CanvasTexture; redraw(): void };
  /** World points of the braziers' flames (night glow). */
  flames: Array<{ x: number; y: number; z: number; open: boolean }>;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Inner half width of the opening at height y. */
const innerAt = (y: number) => DOOR.bottom / 2 - ((DOOR.bottom - DOOR.top) / 2) * Math.min(1, y / DOOR.height);

function buildStone(): { geometry: THREE.BufferGeometry; flames: PunkuModels["flames"] } {
  const m = new Masonry();
  const rand = rng(0x9e7);
  const flames: PunkuModels["flames"] = [];
  for (const g of GATES) {
    const yaw = gateYaw(g);
    const at = (lx: number, y: number, lz: number, w: number, h: number, d: number, color: string, top = 0.99) => {
      const p = gateWorld(g, lx, lz);
      m.color(color, 0.08, rand).box(p.x, y, p.z, w, h, d, yaw, { top });
    };
    // Footing across the street.
    at(0, -0.3, 0, DOOR.outer * 2 + 0.6, 0.42, DOOR.depth + 0.6, "#8a847a");
    // Jambs: six courses, each block from the stepped inner face out to the outer edge.
    const courses = 6;
    const ch = DOOR.height / courses;
    for (const side of [-1, 1])
      for (let c = 0; c < courses; c++) {
        const y = 0.1 + c * ch;
        const inner = innerAt(c * ch + ch / 2);
        const w = DOOR.outer - inner;
        // Two blocks per course, the joint staggered.
        const split = 0.35 + rand() * 0.3;
        const w1 = w * split;
        const pick = () => STONE[Math.floor(rand() * STONE.length)] ?? STONE[0];
        at(side * (inner + w1 / 2), y, 0, w1 - 0.04, ch - 0.04, DOOR.depth * (1 - c * 0.01), pick());
        at(side * (inner + w1 + (w - w1) / 2), y, 0, w - w1 - 0.04, ch - 0.04, DOOR.depth * (1 - c * 0.01), pick());
        // Core behind the joints.
        at(side * (inner + w / 2), y, 0, w - 0.1, ch, DOOR.depth * 0.85, "#4f4a43");
      }
    // Lintel monolith and the capping course (the sign plaque sits on its plaza face).
    at(0, 0.1 + DOOR.height, 0, DOOR.outer * 2 + 0.2, 0.75, DOOR.depth + 0.1, "#9b9488");
    at(0, 0.85 + DOOR.height, 0, DOOR.outer * 2 - 0.4, 0.95, DOOR.depth - 0.2, "#a8a296");
    at(0, 1.8 + DOOR.height, 0, DOOR.outer * 2 - 1.4, 0.3, DOOR.depth - 0.5, "#8c867b");
    // Braziers on stone posts either side of the plaza face.
    for (const side of [-1, 1]) {
      const lx = side * (DOOR.outer - 0.6);
      at(lx, 0, DOOR.depth / 2 + 0.7, 0.45, 1.5, 0.45, "#8c867b");
      at(lx, 1.5, DOOR.depth / 2 + 0.7, 0.75, 0.28, 0.75, "#5d564c", 1.25);
      const f = gateWorld(g, lx, DOOR.depth / 2 + 0.7);
      flames.push({ x: f.x, y: 2.0, z: f.z, open: g.available });
    }
    // A closed gate: three lashed logs across the opening, front of the doorway.
    if (gateAction(g).kind === "soon") {
      for (const [i, y] of [0.7, 1.5, 2.3].entries()) {
        const len = innerAt(y) * 2 + 0.9;
        const hex: Array<[number, number]> = [];
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          hex.push([Math.cos(a) * 0.14, y + Math.sin(a) * 0.14]);
        }
        const start = gateWorld(g, -len / 2, DOOR.depth / 2 + 0.25 + (i % 2) * 0.05);
        m.color(LOG, 0.1, rand).prism(hex, start.x, 0.1, start.z, yaw + Math.PI / 2, 0, len, true);
        for (const side of [-1, 1])
          at(side * (innerAt(y) + 0.05), y + 0.1 - 0.2, DOOR.depth / 2 + 0.25, 0.14, 0.4, 0.36, ROPE);
      }
    }
  }
  return { geometry: m.build(), flames };
}

/** One glimpse column: a small painting of the world behind the gate. */
function paintGlimpse(ctx: CanvasRenderingContext2D, g: Gate, x0: number, w: number, h: number) {
  const [sky, mid, ground] = g.glimpse;
  const gr = ctx.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, sky);
  gr.addColorStop(0.55, mid);
  gr.addColorStop(1, ground);
  ctx.fillStyle = gr;
  ctx.fillRect(x0, 0, w, h);
  const r = rng(g.id.length * 97);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, 0, w, h);
  ctx.clip();
  if (g.id === "qhapaq") {
    // A snowy peak above green slopes and a winding path.
    ctx.fillStyle = "#7d8f6a";
    ctx.beginPath();
    ctx.moveTo(x0, h * 0.62);
    ctx.lineTo(x0 + w * 0.5, h * 0.2);
    ctx.lineTo(x0 + w, h * 0.6);
    ctx.lineTo(x0 + w, h);
    ctx.lineTo(x0, h);
    ctx.fill();
    ctx.fillStyle = "#f4f1ea";
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.36, h * 0.33);
    ctx.lineTo(x0 + w * 0.5, h * 0.2);
    ctx.lineTo(x0 + w * 0.64, h * 0.33);
    ctx.fill();
    ctx.strokeStyle = "#d9c18e";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.5, h);
    ctx.bezierCurveTo(x0 + w * 0.2, h * 0.8, x0 + w * 0.8, h * 0.65, x0 + w * 0.5, h * 0.45);
    ctx.stroke();
  } else if (g.id === "chinchaysuyu") {
    // The Pacific: a sea band, the sun low, a sandy shore.
    ctx.fillStyle = "#3f8fb0";
    ctx.fillRect(x0, h * 0.48, w, h * 0.16);
    ctx.fillStyle = "#ffd77a";
    ctx.beginPath();
    ctx.arc(x0 + w * 0.6, h * 0.42, w * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e9cf98";
    ctx.fillRect(x0, h * 0.64, w, h * 0.36);
  } else if (g.id === "antisuyu") {
    // Leaves framing light and a river glint.
    ctx.fillStyle = "rgba(255,250,210,0.5)";
    ctx.beginPath();
    ctx.ellipse(x0 + w / 2, h * 0.4, w * 0.4, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(10,60,32,0.85)";
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      ctx.save();
      ctx.translate(side > 0 ? x0 + w - r() * 18 : x0 + r() * 18, 30 + r() * (h - 40));
      ctx.rotate(side * (0.9 + r() * 0.5));
      ctx.beginPath();
      ctx.ellipse(0, -26, 9, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = "rgba(170,230,240,0.7)";
    ctx.fillRect(x0 + w * 0.3, h * 0.66, w * 0.4, 3);
  } else if (g.id === "collasuyu") {
    // The lake, an island, totora reeds.
    ctx.fillStyle = "#2f6fb2";
    ctx.fillRect(x0, h * 0.5, w, h * 0.3);
    ctx.fillStyle = "#c9b06a";
    ctx.beginPath();
    ctx.ellipse(x0 + w * 0.62, h * 0.52, w * 0.18, h * 0.03, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a9a44";
    ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const x = x0 + r() * w;
      ctx.beginPath();
      ctx.moveTo(x, h * 0.9);
      ctx.lineTo(x + (r() - 0.5) * 6, h * 0.72);
      ctx.stroke();
    }
  } else if (g.id === "kuntisuyu") {
    // Canyon walls and a condor.
    ctx.fillStyle = "#a8643c";
    ctx.beginPath();
    ctx.moveTo(x0, h * 0.3);
    ctx.lineTo(x0 + w * 0.38, h * 0.55);
    ctx.lineTo(x0 + w * 0.3, h);
    ctx.lineTo(x0, h);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x0 + w, h * 0.28);
    ctx.lineTo(x0 + w * 0.62, h * 0.55);
    ctx.lineTo(x0 + w * 0.72, h);
    ctx.lineTo(x0 + w, h);
    ctx.fill();
    ctx.strokeStyle = "#1f1a17";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0 + w * 0.38, h * 0.32);
    ctx.quadraticCurveTo(x0 + w * 0.45, h * 0.27, x0 + w * 0.5, h * 0.31);
    ctx.quadraticCurveTo(x0 + w * 0.55, h * 0.27, x0 + w * 0.62, h * 0.32);
    ctx.stroke();
  }
  if (gateAction(g).kind === "soon") {
    // Not open yet: veiled in grey mist.
    ctx.fillStyle = "rgba(150,150,146,0.62)";
    ctx.fillRect(x0, 0, w, h);
  }
  ctx.restore();
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) draw(ctx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The opening's trapezoid in a gate's frame, with UVs into column i of an n-column atlas. */
function trapezoid(g: Gate, i: number, n: number, lz: number, y0: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-DOOR.bottom / 2, 0);
  shape.lineTo(DOOR.bottom / 2, 0);
  shape.lineTo(DOOR.top / 2, DOOR.height);
  shape.lineTo(-DOOR.top / 2, DOOR.height);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape);
  const uv = geo.getAttribute("uv");
  const p = geo.getAttribute("position");
  for (let k = 0; k < uv.count; k++)
    uv.setXY(k, (i + (p.getX(k) + DOOR.bottom / 2) / DOOR.bottom) / n, p.getY(k) / DOOR.height);
  const c = gateWorld(g, 0, lz);
  geo.rotateY(gateYaw(g));
  geo.translate(c.x, y0, c.z);
  return geo;
}

export function buildPunkus(lang: Lang): PunkuModels {
  const { geometry: stone, flames } = buildStone();

  // Glimpses: one atlas, one merged geometry (a quad set just inside each doorway, both faces drawn).
  const colW = 128;
  const glimpseTex = canvasTexture(colW * GATES.length, 256, (ctx) => {
    GATES.forEach((g, i) => {
      paintGlimpse(ctx, g, i * colW, colW, 256);
    });
  });
  const parts = GATES.map((g, i) => trapezoid(g, i, GATES.length, 0, 0.1));
  const glimpseGeo = mergeAll(parts);

  // Signs: one row per gate in the atlas, a plaque on the lintel's plaza face.
  const SW = 512;
  const RH = 128;
  const drawSigns = (ctx: CanvasRenderingContext2D) => {
    ctx.clearRect(0, 0, SW, RH * GATES.length);
    GATES.forEach((g, i) => {
      const y = i * RH;
      ctx.fillStyle = "#5f5a52";
      ctx.fillRect(0, y, SW, RH);
      ctx.fillStyle = "#6c665d";
      ctx.fillRect(8, y + 8, SW - 16, RH - 16);
      ctx.fillStyle = g.dye;
      ctx.fillRect(8, y + RH - 22, SW - 16, 10);
      ctx.strokeStyle = "#1f1a17";
      ctx.lineWidth = 6;
      ctx.strokeRect(3, y + 3, SW - 6, RH - 6);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#f3ead8";
      const name = g.name[lang].toUpperCase();
      fitFont(ctx, name, "800", FONT.display, 54, SW - 60, "condensed ");
      ctx.fillText(name, SW / 2, y + RH * 0.38);
      ctx.fillStyle = gateAction(g).kind === "travel" ? "#e8d29a" : "#d9d2c3";
      const sub = gateAction(g).kind === "travel" ? g.bearing[lang] : lang === "es" ? "PRÓXIMAMENTE" : "COMING SOON";
      fitFont(ctx, sub, "700", FONT.body, 26, SW - 60);
      ctx.fillText(sub, SW / 2, y + RH * 0.68);
    });
  };
  const signTex = canvasTexture(SW, RH * GATES.length, drawSigns);
  const signParts = GATES.map((g, i) => {
    const w = 3.6;
    const h = w * (RH / SW);
    const q = new THREE.PlaneGeometry(w, h);
    const uv = q.getAttribute("uv");
    for (let k = 0; k < uv.count; k++) uv.setY(k, (GATES.length - 1 - i + uv.getY(k)) / GATES.length);
    q.rotateY(gateYaw(g));
    const c = gateWorld(g, 0, (DOOR.depth - 0.2) / 2 + 0.03);
    q.translate(c.x, 0.85 + DOOR.height + 0.95 / 2, c.z);
    return q;
  });
  const signGeo = mergeAll(signParts);
  return {
    stone,
    glimpse: { geometry: glimpseGeo, texture: glimpseTex },
    signs: {
      geometry: signGeo,
      texture: signTex,
      redraw() {
        const ctx = (signTex.image as HTMLCanvasElement).getContext("2d");
        if (ctx) drawSigns(ctx);
        signTex.needsUpdate = true;
      },
    },
    flames,
  };
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (const g of parts) {
    const base = pos.length / 3;
    const p = g.getAttribute("position");
    const t = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
      uv.push(t.getX(i), t.getY(i));
    }
    const index = g.getIndex();
    if (index) for (let i = 0; i < index.count; i++) idx.push(base + index.getX(i));
    else for (let i = 0; i < p.count; i++) idx.push(base + i);
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  out.computeBoundingSphere();
  return out;
}
