/**
 * The seven coastal monuments of the career stations, one builder per culture, in a station's local frame:
 * origin at the centre of its plaza (y 0 = plaza level), +Z toward the road, the monument on its flat apron
 * behind (centred at z = −APRON.off). Each builder adds vertex-coloured parts to `g` (one merged mesh for all
 * stations), textured friezes / mantles to `q` (the atlas mesh, ./atlas.ts), and declares its colliders
 * (local rectangles / circles) and the braziers lit at night. Shapes follow each culture's best-known monument
 * (see ../../plan.ts CULTURES for what the text mode says about them); sizes are compressed to fit the road.
 */
import type { Geo } from "../../kit";
import { APRON } from "../../layout";
import type { Culture } from "../../plan";
import type { Quads } from "./atlas";

export interface Build {
  g: Geo;
  q: Quads;
  rects: Array<{ x: number; z: number; hw: number; hd: number }>;
  circles: Array<{ x: number; z: number; r: number }>;
  fires: Array<[number, number, number]>;
}

const Z0 = -APRON.off;

const ADOBE = "#c9a27a";
const ADOBE_ALT = "#bd9470";
const ADOBE_DARK = "#a47c58";
const WOOD = "#6b4a33";
const REED = "#c9b06a";

/** Straight stair of thin steps from (zFront, y 0) back and up to (zBack, top), width w, centred on x. */
function stair(g: Geo, x: number, zFront: number, zBack: number, top: number, w: number, color: string, alt?: string) {
  const n = Math.max(2, Math.round(top / 0.32));
  const dz = (zBack - zFront) / n;
  for (let i = 0; i < n; i++) {
    const y = (top * (i + 1)) / n;
    const z = zFront + dz * (i + 0.5);
    g.box(w, y, Math.abs(dz) + 0.02, x, 0, z, i % 2 && alt ? alt : color);
  }
}

/** A brazier: a clay bowl on a short pillar (the glow sits above it at night). */
function brazier(b: Build, x: number, z: number, y = 0) {
  b.g.cyl(0.22, 0.28, 0.9, x, y, z, ADOBE_DARK, 7);
  b.g.cyl(0.42, 0.26, 0.32, x, y + 0.9, z, "#8f4a2e", 8);
  b.g.cyl(0.36, 0.36, 0.05, x, y + 1.19, z, "#3a2a20", 8);
  b.fires.push([x, y + 1.45, z]);
  b.circles.push({ x, z, r: 0.45 });
}

function nasca(b: Build) {
  const { g, q } = b;
  // Cahuachi: a stepped adobe pyramid with a central stair, Nasca pots on its terraces.
  const W = 22;
  const D = 15;
  const tiers = 5;
  const th = 1.45;
  const inset = 1.5;
  g.box(W + 0.6, 1.2, D + 0.6, 0, -1.2, Z0, ADOBE_DARK);
  g.steps(0, 0, Z0, W, D, tiers, th, inset, (i) => (i % 2 ? ADOBE_ALT : ADOBE));
  const front = Z0 + D / 2;
  stair(g, 0, front + 0.6, front - inset * (tiers - 1) - 0.4, th * tiers, 3.2, "#b88b62", "#c39a72");
  // Pots along the terraces: cream bodies with red and black bands.
  for (let i = 1; i < tiers; i++) {
    const zf = front - inset * i + 0.45;
    const y = th * i;
    for (let x = -W / 2 + inset * i + 1.2; x < W / 2 - inset * i - 1; x += 2.3) {
      if (Math.abs(x) < 2.3) continue;
      g.cyl(0.28, 0.22, 0.42, x, y, zf, "#e7d8b8", 8);
      g.cyl(0.29, 0.29, 0.1, x, y + 0.2, zf, i % 2 ? "#b8402f" : "#2a221d", 8);
      g.cyl(0.18, 0.28, 0.12, x, y + 0.42, zf, "#d07a32", 8);
    }
  }
  // The polychrome band along the first terrace, both sides of the stair.
  q.wall(-W / 2 + 0.2, front + 0.01, -2, front + 0.01, 0.25, 0.9, "nasca", 2);
  q.wall(2, front + 0.01, W / 2 - 0.2, front + 0.01, 0.25, 0.9, "nasca", 2);
  b.rects.push({ x: 0, z: Z0, hw: W / 2, hd: D / 2 });
  brazier(b, -3, front + 1.4);
  brazier(b, 3, front + 1.4);
}

function paracas(b: Build) {
  const { g, q } = b;
  // A funerary platform with a reed-mat ramada; embroidered mantles hang in its shade, bundles below.
  const stone = "#b8a58a";
  g.box(17, 1.8, 11.5, 0, -1.1, Z0, "#a8957a");
  g.box(16, 0.7, 10.5, 0, 0, Z0, stone);
  for (let k = 0; k < 2; k++) g.box(4, 0.35 * (k + 1), 0.6, 0, 0, Z0 + 5.25 + 0.6 * (2 - k) - 0.3, stone);
  const posts: Array<[number, number]> = [];
  for (const x of [-7, -2.4, 2.4, 7]) for (const z of [Z0 + 4.4, Z0 - 4.4]) posts.push([x, z]);
  for (const [x, z] of posts) g.cyl(0.14, 0.18, 3.6, x, 0.7, z, WOOD, 6);
  // Beams and the flat mat roof.
  for (const z of [Z0 + 4.4, Z0 - 4.4, Z0 - 0.6]) g.box(15, 0.22, 0.24, 0, 4.25, z, "#5a3b24");
  g.box(16.2, 0.18, 10.4, 0, 4.47, Z0, REED);
  g.box(16.6, 0.1, 0.4, 0, 4.6, Z0 + 5.1, "#b39a58");
  // Mantles hang from the middle beam, facing the road.
  for (const [x, cell] of [
    [-4.6, "mantle1"],
    [0, "mantle2"],
    [4.6, "mantle3"],
  ] as const) {
    q.hanging(x - 1.15, Z0 - 0.45, x + 1.15, Z0 - 0.45, 1.05, 3.05, cell);
    g.box(2.5, 0.08, 0.08, x, 4.1, Z0 - 0.5, "#3a2a20");
  }
  // Funerary bundles (fardos) wrapped in cream cloth with a "false head".
  for (const [x, z, s] of [
    [-6, Z0 + 2.4, 1],
    [-5, Z0 + 3, 0.8],
    [6.2, Z0 + 2.2, 1.1],
  ] as const) {
    g.cyl(0.45 * s, 0.6 * s, 1.1 * s, x, 0.7, z, "#e6d8b8", 8);
    g.blob(0.3 * s, 0.3 * s, 0.3 * s, x, 0.7 + 1.25 * s, z, "#d8c49a", 1);
    g.cyl(0.62 * s, 0.62 * s, 0.1, x, 0.95, z, "#b8402f", 8);
  }
  b.rects.push({ x: 0, z: Z0, hw: 8.3, hd: 5.6 });
  brazier(b, -3.4, Z0 + 7.2);
  brazier(b, 3.4, Z0 + 7.2);
}

function pachacamac(b: Build) {
  const { g } = b;
  // A great pyramid with a ramp, terraces painted red with ochre copings; a small temple on top.
  const W = 25;
  const D = 19;
  const tiers = 4;
  const th = 2.1;
  const inset = 2;
  const red = "#b5533c";
  const red2 = "#a8492f";
  g.box(W + 0.6, 1.2, D + 0.6, 0, -1.2, Z0, ADOBE_DARK);
  g.steps(0, 0, Z0, W, D, tiers, th, inset, (i) => (i % 2 ? red2 : red));
  for (let i = 0; i < tiers; i++) {
    const w = W - 2 * inset * i;
    const d = D - 2 * inset * i;
    const y = th * (i + 1);
    g.box(w + 0.1, 0.16, 0.3, 0, y - 0.16, Z0 + d / 2, "#d9a441");
    g.box(w + 0.1, 0.16, 0.3, 0, y - 0.16, Z0 - d / 2, "#d9a441");
    g.box(0.3, 0.16, d, -w / 2, y - 0.16, Z0, "#d9a441");
    g.box(0.3, 0.16, d, w / 2, y - 0.16, Z0, "#d9a441");
  }
  const top = th * tiers;
  // The ramp: a sloped causeway from the plaza to the top terrace's front.
  const zFront = Z0 + D / 2 + 3.2;
  const zTop = Z0 + D / 2 - inset * (tiers - 1) - 0.3;
  const len = Math.hypot(zFront - zTop, top);
  const ang = Math.atan2(top, zFront - zTop);
  g.box(3.6, 0.5, len, 0, top / 2 - 0.25, (zFront + zTop) / 2, "#c06a4a", 0, ang);
  g.box(3.3, top * 0.9, (zFront - zTop) * 0.7, 0, 0, zTop + (zFront - zTop) * 0.3, "#9f4a32");
  // Temple on top: walls with a doorway, a timber roof.
  const ty = top;
  const tz = Z0 - 1;
  g.box(7, 2.2, 0.5, 0, ty, tz - 2.2, red2);
  g.box(0.5, 2.2, 4.4, -3.3, ty, tz, red2);
  g.box(0.5, 2.2, 4.4, 3.3, ty, tz, red2);
  g.box(2.4, 2.2, 0.5, -2.3, ty, tz + 2.2, red2);
  g.box(2.4, 2.2, 0.5, 2.3, ty, tz + 2.2, red2);
  g.box(2.2, 0.6, 0.5, 0, ty + 1.6, tz + 2.2, red2);
  g.box(7.6, 0.25, 5.2, 0, ty + 2.2, tz, "#5a3b24");
  b.rects.push({ x: 0, z: Z0, hw: W / 2, hd: D / 2 });
  b.rects.push({ x: 0, z: (zFront + zTop) / 2, hw: 1.9, hd: (zFront - zTop) / 2 });
  brazier(b, -3.4, zFront + 1.2);
  brazier(b, 3.4, zFront + 1.2);
}

/** A cuchimilco: a standing figure with raised arms, cream with black painted lines (local x, z, facing +Z). */
function cuchimilco(g: Geo, x: number, z: number, s: number) {
  const cream = "#efe3c8";
  const black = "#2a221d";
  g.box(0.9 * s, 0.2 * s, 0.6 * s, x, 0, z, "#d8c8a8");
  g.box(0.36 * s, 1.0 * s, 0.4 * s, x - 0.22 * s, 0.2 * s, z, cream);
  g.box(0.36 * s, 1.0 * s, 0.4 * s, x + 0.22 * s, 0.2 * s, z, cream);
  g.box(0.95 * s, 1.15 * s, 0.48 * s, x, 1.15 * s, z, cream);
  g.box(0.75 * s, 0.75 * s, 0.5 * s, x, 2.3 * s, z, cream);
  // Raised arms.
  g.box(0.24 * s, 0.9 * s, 0.3 * s, x - 0.62 * s, 1.75 * s, z, cream, 0, 0, 0.5);
  g.box(0.24 * s, 0.9 * s, 0.3 * s, x + 0.62 * s, 1.75 * s, z, cream, 0, 0, -0.5);
  // Painted face and body lines.
  const fz = z + 0.255 * s;
  g.box(0.16 * s, 0.07 * s, 0.02, x - 0.17 * s, 2.72 * s, fz, black);
  g.box(0.16 * s, 0.07 * s, 0.02, x + 0.17 * s, 2.72 * s, fz, black);
  g.box(0.24 * s, 0.05 * s, 0.02, x, 2.47 * s, fz, black);
  g.box(0.8 * s, 0.1 * s, 0.52 * s, x, 3.0 * s, z, black);
  for (const y of [1.35, 1.6, 1.85]) g.box(0.97 * s, 0.05 * s, 0.5 * s, x, y * s, z, black);
  g.box(0.06 * s, 1.0 * s, 0.02, x, 1.18 * s, z + 0.245 * s, black);
}

function chancay(b: Build) {
  const { g } = b;
  // A rammed-earth compound, two cuchimilcos at its door, black-on-white jars along the walls.
  const tap = "#c8a477";
  const tap2 = "#b99668";
  const W = 18;
  const D = 14;
  const h = 2.6;
  const t = 0.7;
  const zf = Z0 + D / 2;
  const zb = Z0 - D / 2;
  g.box(W, h, t, 0, 0, zb, tap);
  g.box(t, h, D, -W / 2, 0, Z0, tap2);
  g.box(t, h, D, W / 2, 0, Z0, tap2);
  g.box(W / 2 - 1.6, h, t, -(W / 4 + 0.8), 0, zf, tap);
  g.box(W / 2 - 1.6, h, t, W / 4 + 0.8, 0, zf, tap);
  // Coping and tapial courses (horizontal seams).
  for (const y of [0.9, 1.8]) {
    g.box(W + 0.02, 0.06, t + 0.02, 0, y, zb, "#a88758");
    g.box(W / 2 - 1.58, 0.06, t + 0.02, -(W / 4 + 0.8), y, zf, "#a88758");
    g.box(W / 2 - 1.58, 0.06, t + 0.02, W / 4 + 0.8, y, zf, "#a88758");
  }
  // Inner platform.
  g.box(7, 1.2, 4, 0, 0, zb + 3, tap2);
  g.box(2.4, 0.6, 1, 0, 0, zb + 5.4, tap2);
  cuchimilco(g, -2.6, zf + 1.2, 1);
  cuchimilco(g, 2.6, zf + 1.2, 1);
  // Jars, black on white.
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + 1.6 + i * 1.3;
    g.cyl(0.32, 0.26, 0.6, x, 0, zb + 1, "#efe6d2", 8);
    g.cyl(0.33, 0.33, 0.08, x, 0.3, zb + 1, "#2a221d", 8);
    g.cyl(0.12, 0.2, 0.18, x, 0.6, zb + 1, "#efe6d2", 8);
  }
  b.rects.push({ x: 0, z: zb, hw: W / 2, hd: t });
  b.rects.push({ x: -W / 2, z: Z0, hw: t, hd: D / 2 });
  b.rects.push({ x: W / 2, z: Z0, hw: t, hd: D / 2 });
  b.rects.push({ x: -(W / 4 + 0.8), z: zf, hw: W / 4 - 0.8, hd: t });
  b.rects.push({ x: W / 4 + 0.8, z: zf, hw: W / 4 - 0.8, hd: t });
  b.rects.push({ x: 0, z: zb + 3, hw: 3.5, hd: 2 });
  b.circles.push({ x: -2.6, z: zf + 1.2, r: 0.7 }, { x: 2.6, z: zf + 1.2, r: 0.7 });
  brazier(b, -4.4, zf + 1.8);
  brazier(b, 4.4, zf + 1.8);
}

function caral(b: Build) {
  const { g } = b;
  // The Great Pyramid of Caral: stepped stone platform, central stair, and in front the sunken circular plaza.
  const st = "#c8b597";
  const st2 = "#b7a486";
  const W = 21;
  const D = 13;
  const tiers = 6;
  const th = 1.15;
  const inset = 1.0;
  const zc = Z0 - 4;
  g.box(W + 0.6, 1.2, D + 0.6, 0, -1.2, zc, "#a89577");
  g.steps(0, 0, zc, W, D, tiers, th, inset, (i) => (i % 2 ? st2 : st));
  // Stone courses: thin darker seams on each tier.
  for (let i = 0; i < tiers; i++) {
    const w = W - 2 * inset * i;
    g.box(w + 0.04, 0.05, 0.04, 0, th * i + th * 0.5, zc + (D - 2 * inset * i) / 2, "#9c8a6e");
  }
  const front = zc + D / 2;
  stair(g, 0, front + 0.5, front - inset * (tiers - 1) - 0.3, th * tiers, 4, "#bba98b", "#ccbb9d");
  // Sunken circular plaza: two stepped stone rings (gaps front and back for its stairs).
  const cz = Z0 + 6.5;
  const seg = 24;
  for (const [r, h, w] of [
    [5.3, 0.9, 0.7],
    [4.3, 0.45, 0.6],
  ] as const) {
    for (let k = 0; k < seg; k++) {
      const a = ((k + 0.5) / seg) * Math.PI * 2;
      const nearFront = Math.abs(Math.sin(a)) < 0.2;
      if (nearFront) continue;
      const x = Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      g.box(w, h, (2 * Math.PI * r) / seg + 0.05, x, 0, z, k % 2 ? st : st2, -a);
    }
  }
  g.cyl(4, 4, 0.04, 0, 0.01, cz, "#d6c6a4", 24);
  b.rects.push({ x: 0, z: zc, hw: W / 2, hd: D / 2 });
  b.circles.push({ x: 0, z: cz, r: 5.4 });
  brazier(b, -6.6, cz + 2);
  brazier(b, 6.6, cz + 2);
}

function moche(b: Build) {
  const { g, q } = b;
  // Huaca de la Luna: a great adobe platform whose stepped front is painted with friezes.
  const W = 24;
  const D = 15;
  const tiers = 4;
  const th = 1.55;
  const set = 1.1;
  const adobe = "#b98c62";
  g.box(W + 0.6, 1.2, D + 0.6, 0, -1.2, Z0, ADOBE_DARK);
  for (let i = 0; i < tiers; i++) {
    const d = D - set * i;
    g.box(W, th, d, 0, th * i, Z0 - (set * i) / 2, i % 2 ? "#b08560" : adobe);
  }
  const top = th * tiers;
  g.box(W, 0.6, D - set * tiers, 0, top, Z0 - (set * tiers) / 2 - 0.4, "#a87d58");
  // Friezes on every riser (the bands alternate as on the Huaca's north facade).
  const cells = ["mocheWarriors", "mocheFaces", "mocheWaves", "mocheFaces"] as const;
  for (let i = 0; i < tiers; i++) {
    const zf = Z0 + D / 2 - set * i + 0.01;
    q.wall(-W / 2 + 0.15, zf, W / 2 - 0.15, zf, th * i + 0.1, th - 0.2, cells[i] as (typeof cells)[number], 4);
  }
  // A side ramp up the left flank.
  const len = Math.hypot(D * 0.8, top);
  g.box(2.6, 0.5, len, -W / 2 - 1.4, top / 2 - 0.25, Z0, "#a87d58", 0, -Math.atan2(top, D * 0.8));
  g.box(2.2, top * 0.6, D * 0.55, -W / 2 - 1.4, 0, Z0 - D * 0.18, "#9a724f");
  b.rects.push({ x: 0, z: Z0, hw: W / 2, hd: D / 2 });
  b.rects.push({ x: -W / 2 - 1.4, z: Z0, hw: 1.4, hd: D * 0.42 });
  brazier(b, -4.5, Z0 + D / 2 + 1.6);
  brazier(b, 4.5, Z0 + D / 2 + 1.6);
}

function chanchan(b: Build) {
  const { g, q } = b;
  // High mud walls round a ceremonial plaza, their faces carved with fish, pelicans, waves and nets.
  const mud = "#c9a57b";
  const mud2 = "#bb966c";
  const h = 4.4;
  const t = 1.2;
  const zb = Z0 - 10;
  const zf = Z0 + 8;
  const W = 21;
  const wall = (x0: number, z0: number, x1: number, z1: number, c: string) => {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    // Tapered: a wide base and a narrower top course.
    g.box(t, h - 0.8, len, mx, 0, mz, c, yaw);
    g.box(t * 0.75, 0.8, len, mx, h - 0.8, mz, mud2, yaw);
  };
  wall(-W / 2, zb, W / 2, zb, mud);
  wall(-W / 2, zb, -W / 2, zf, mud);
  wall(W / 2, zb, W / 2, zf, mud);
  wall(-W / 2, zf, -3.6, zf, mud);
  wall(3.6, zf, W / 2, zf, mud);
  // Reliefs: back wall inner face (fish), side walls inner faces (pelicans / waves), the front's outer face
  // (the net lattice), each square tile ~2.6 u.
  const yb = 0.5;
  const hh = 3.2;
  q.wall(-W / 2 + t / 2, zb + t / 2 + 0.01, W / 2 - t / 2, zb + t / 2 + 0.01, yb, hh, "fish", 6);
  q.wall(-W / 2 + t / 2 + 0.01, zf - 0.8, -W / 2 + t / 2 + 0.01, zb + 0.8, yb, hh, "pelican", 5);
  q.wall(W / 2 - t / 2 - 0.01, zb + 0.8, W / 2 - t / 2 - 0.01, zf - 0.8, yb, hh, "wave", 5);
  q.wall(-W / 2 + 0.2, zf + t / 2 + 0.01, -3.8, zf + t / 2 + 0.01, yb, hh, "net", 2);
  q.wall(3.8, zf + t / 2 + 0.01, W / 2 - 0.2, zf + t / 2 + 0.01, yb, hh, "net", 2);
  // The audiencia: a small U-shaped platform against the back wall.
  g.box(7, 1, 3.4, 0, 0, zb + 2.4, mud2);
  g.box(1, 1.8, 3.4, -3, 0, zb + 2.4, mud);
  g.box(1, 1.8, 3.4, 3, 0, zb + 2.4, mud);
  b.rects.push({ x: 0, z: zb, hw: W / 2, hd: t / 2 });
  b.rects.push({ x: -W / 2, z: (zb + zf) / 2, hw: t / 2, hd: (zf - zb) / 2 });
  b.rects.push({ x: W / 2, z: (zb + zf) / 2, hw: t / 2, hd: (zf - zb) / 2 });
  b.rects.push({ x: -(W / 2 + 3.6) / 2, z: zf, hw: (W / 2 - 3.6) / 2, hd: t / 2 });
  b.rects.push({ x: (W / 2 + 3.6) / 2, z: zf, hw: (W / 2 - 3.6) / 2, hd: t / 2 });
  b.rects.push({ x: 0, z: zb + 2.4, hw: 3.5, hd: 1.7 });
  brazier(b, -5, zf + 1.6);
  brazier(b, 5, zf + 1.6);
}

export const BUILDERS: Record<Culture, (b: Build) => void> = {
  nasca,
  paracas,
  pachacamac,
  chancay,
  caral,
  moche,
  chanchan,
};

/** Common furniture of every company station: the khipu frame spot and the sign's posts. */
export const KHIPU_AT = { x: -2.3, z: -3.6 } as const;
export const SIGN_AT = { x: 3.4, z: -3.4, w: 3.6, h: 1.1, y: 1.15 } as const;

export function signPosts(g: Geo) {
  for (const dx of [-SIGN_AT.w / 2 + 0.2, SIGN_AT.w / 2 - 0.2])
    g.cyl(0.08, 0.1, SIGN_AT.y + SIGN_AT.h + 0.1, SIGN_AT.x + dx, -0.2, SIGN_AT.z - 0.06, WOOD, 6);
}
