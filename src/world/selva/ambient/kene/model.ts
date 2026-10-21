/**
 * Builders for the Antisuyu finale (../kene.ts): the kené texture atlas, the painted totem pole with Ronin
 * (the cosmic anaconda) coiled up it, the painted jars, the feather crown, the dais and plaza, the feathered
 * banner poles with their fluttering streamers, and the burst's petal and morpho instances.
 * Helpers only: this file does not export `create`.
 *
 * Draw calls (static): every kené-painted surface (pole, anaconda, jars) shares ONE atlas and ONE mesh; every
 * rigid flat-coloured part (dais, plaza, carved bands, poles, cords, the anaconda's head) is ONE vertex-coloured
 * mesh; everything that moves with the wind (the crown's macaw feathers, the poles' feather tufts and the
 * pennants) is ONE more vertex-coloured mesh with a `flex` weight (0 where it is tied, growing to the free tip)
 * on the shared wind's "grass" mode; the streamers are one static ribbon mesh on the atlas material that the
 * shared wind waves as cloth (`flex` 0 at the pole → 1 at the free end). No CPU animation: the gust you see
 * crossing the canopy is the one that lifts the streamers. The burst adds one instanced petal mesh and one
 * instanced morpho mesh, visible only while it plays.
 *
 * Atlas (1024², canvas y down): POLE x 0–512 × y 0–1024 (cream ground, brown lines, 2 periods across so it
 * wraps round the pole), SKIN x 512–1024 × y 0–512 (achiote red, black bold lines and cream fine lines: the
 * anaconda's skin), JAR x 512–1024 × y 512–768 (cream band over a red-slip foot) and STREAMER x 512–1024 ×
 * y 768–1024 (cream with achiote lines). A twin canvas holds only the lines, in gold on black: it is the
 * material's emissive map, so the kené lines (not the ground) light up when the totem glows.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldEnv } from "../../../contract";
import type { Kit } from "../../../props";
import type { GeoBuilder } from "../../scenery/kit";
import { A, type Rand } from "../embarcadero/amazon";
import { type KeneDesign, keneDesign, PERIOD } from "./pattern";
import { aroundTotem, DAIS_R, POLE_ANGLES, POLE_R, POTS, TOTEM_LOCAL } from "./spot";

const ATLAS = 1024;
/** Atlas regions in canvas pixels. */
export const REGION = {
  pole: { x: 0, y: 0, w: 512, h: 1024 },
  skin: { x: 512, y: 0, w: 512, h: 512 },
  jar: { x: 512, y: 512, w: 512, h: 256 },
  streamer: { x: 512, y: 768, w: 512, h: 256 },
} as const;
type Region = (typeof REGION)[keyof typeof REGION];

/** Shipibo palette: cream ground, huito black-brown, achiote red, and the macaw feathers of the crown. */
export const K = {
  cream: "#efe2c4",
  creamDark: "#dccaa3",
  line: "#2a1a12",
  achiote: "#b3382a",
  achioteDark: "#8e2a20",
  black: "#1b1411",
  wood: "#5a3a24",
  woodDark: "#3b2416",
  scarlet: "#cf2b2b",
  yellow: "#f2b630",
  blue: "#2a6fd6",
  green: "#3d8a3c",
  earth: "#a77650",
  earthDark: "#8a5d3d",
} as const;

/** Totem pole: painted shaft between carved base and cap; anaconda coil from COIL_Y0 to the top. */
export const POLE = { r: 0.44, base: 1.0, top: 6.2, cap: 0.35 } as const;
const DAIS = [
  { r: DAIS_R, h: 0.22 },
  { r: DAIS_R - 0.55, h: 0.22 },
] as const;
/** Height of the dais top above the plaza floor (the pole stands on it). */
export const DAIS_TOP = DAIS[0].h + DAIS[1].h;
/** Height (above the plaza floor) of the feather crown, where the burst springs from. */
export const CROWN_Y = DAIS_TOP + POLE.top + POLE.cap + 0.6;

// ------------------------------------------------------------------------------------------------ atlas

interface Paint {
  ground: string;
  thick: string;
  thin: string;
  dot: string;
  /** Optional red-slip foot: the bottom fraction of the region. */
  foot?: { frac: number; color: string };
}

function strokeDesign(
  ctx: CanvasRenderingContext2D,
  d: KeneDesign,
  cell: number,
  colors: { thick: string; thin: string; dot: string },
) {
  ctx.lineJoin = "miter";
  ctx.lineCap = "square";
  ctx.strokeStyle = colors.thin;
  ctx.lineWidth = Math.max(1.5, cell * 0.2);
  ctx.beginPath();
  for (const [[x0, y0], [x1, y1]] of d.thin) {
    ctx.moveTo(x0 * cell, y0 * cell);
    ctx.lineTo(x1 * cell, y1 * cell);
  }
  ctx.stroke();
  // Bold lines may run past the field's edges: draw them wrapped (the field is a torus).
  ctx.strokeStyle = colors.thick;
  ctx.lineWidth = cell * 0.62;
  for (const ox of [-d.cols, 0, d.cols])
    for (const oy of [-d.rows, 0, d.rows]) {
      ctx.beginPath();
      for (const pl of d.thick)
        for (const [i, [x, y]] of pl.entries()) {
          if (i) ctx.lineTo((x + ox) * cell, (y + oy) * cell);
          else ctx.moveTo((x + ox) * cell, (y + oy) * cell);
        }
      ctx.stroke();
    }
  ctx.fillStyle = colors.dot;
  for (const [x, y] of d.dots) ctx.fillRect((x - 0.42) * cell, (y - 0.42) * cell, cell * 0.84, cell * 0.84);
}

function drawRegion(ctx: CanvasRenderingContext2D, r: Region, d: KeneDesign, paint: Paint, glow: boolean, rand: Rand) {
  const cell = r.w / d.cols;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
  ctx.translate(r.x, r.y);
  if (glow) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, r.w, r.h);
    strokeDesign(ctx, d, cell, { thick: "#ffd277", thin: "#c98a2e", dot: "#ffd277" });
  } else {
    ctx.fillStyle = paint.ground;
    ctx.fillRect(0, 0, r.w, r.h);
    // Hand-painted ground: faint blotches of a darker tone.
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = paint.foot ? K.creamDark : paint.ground === K.cream ? K.creamDark : K.achioteDark;
    for (let i = 0; i < 40; i++) {
      ctx.beginPath();
      ctx.arc(rand() * r.w, rand() * r.h, 6 + rand() * 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (paint.foot) {
      ctx.fillStyle = paint.foot.color;
      ctx.fillRect(0, r.h * (1 - paint.foot.frac), r.w, r.h * paint.foot.frac);
    }
    strokeDesign(ctx, d, cell, paint);
  }
  ctx.restore();
}

export function drawAtlas(ctx: CanvasRenderingContext2D, glow: boolean) {
  // Same seed per region in both canvases, so the glow lines sit exactly on the painted ones.
  const rand = mulberry(0x5e1b0);
  const pole = keneDesign({ cols: PERIOD * 2, rows: PERIOD * 4, seed: 4, bars: true });
  const skin = keneDesign({ cols: PERIOD * 2, rows: PERIOD * 2, seed: 9, bars: true, echoes: 2 });
  const jar = keneDesign({ cols: PERIOD * 2, rows: PERIOD, seed: 2, bars: true });
  const streamer = keneDesign({ cols: PERIOD * 2, rows: PERIOD, seed: 6, bars: false, echoes: 2 });
  drawRegion(ctx, REGION.pole, pole, { ground: K.cream, thick: K.line, thin: K.line, dot: K.achiote }, glow, rand);
  drawRegion(ctx, REGION.skin, skin, { ground: K.achiote, thick: K.black, thin: K.cream, dot: K.black }, glow, rand);
  // The jar's foot is red slip with no design: only its upper band is drawn on the glow twin too.
  drawRegion(
    ctx,
    REGION.jar,
    jar,
    { ground: K.cream, thick: K.line, thin: K.achiote, dot: K.line, foot: { frac: 0.28, color: K.achiote } },
    glow,
    rand,
  );
  drawRegion(
    ctx,
    REGION.streamer,
    streamer,
    { ground: K.cream, thick: K.achiote, thin: K.line, dot: K.line },
    glow,
    rand,
  );
  if (glow) {
    // No glow on the jar's red foot.
    const j = REGION.jar;
    ctx.fillStyle = "#000000";
    ctx.fillRect(j.x, j.y + j.h * 0.72, j.w, j.h * 0.28);
  }
}

function mulberry(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function atlasTexture(glow: boolean): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS;
  canvas.height = ATLAS;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  drawAtlas(ctx, glow);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  return tex;
}

export interface KeneMaterial {
  material: THREE.MeshToonMaterial;
  /** The same paint, double-sided, for the streamers (thin ribbons seen from both sides). */
  ribbon: THREE.MeshToonMaterial;
  /** 0 = no glow, 1 = full celebration glow. */
  setGlow(k: number): void;
  dispose(): void;
}

/** The atlas material: toon-shaded painted wood, its kené lines able to glow through the emissive map. */
export function keneMaterial(env: WorldEnv): KeneMaterial {
  const map = atlasTexture(false);
  const glow = atlasTexture(true);
  const material = env.toon("#ffffff").clone() as THREE.MeshToonMaterial;
  material.map = map;
  material.emissiveMap = glow;
  material.emissive = new THREE.Color("#ffffff");
  material.emissiveIntensity = 0;
  material.needsUpdate = true;
  const ribbon = material.clone();
  ribbon.side = THREE.DoubleSide;
  return {
    material,
    ribbon,
    setGlow(k) {
      material.emissiveIntensity = Math.max(0, k) * 1.6;
      ribbon.emissiveIntensity = material.emissiveIntensity;
    },
    dispose() {
      map.dispose();
      glow.dispose();
      material.dispose();
      ribbon.dispose();
    },
  };
}

/** Remaps a geometry's 0–1 UVs into an atlas region (texture v is flipped: canvas y grows down). */
function toRegion(g: THREE.BufferGeometry, r: Region) {
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, (r.x + u * r.w) / ATLAS, 1 - (r.y + (1 - v) * r.h) / ATLAS);
  }
  uv.needsUpdate = true;
}

// ------------------------------------------------------------------------------------------------ painted

/**
 * The anaconda's body: a tube along `curve`, tapering at the tail, split into tiles of equal length so each
 * tile maps onto the whole SKIN region (an atlas region cannot repeat by wrapping): rings are duplicated at
 * the tile seams. u runs round the body, v along it.
 */
function snakeBody(curve: THREE.Curve<THREE.Vector3>, radius: (s: number) => number, tiles: number) {
  const perTile = 10;
  const radial = 10;
  const n = tiles * perTile;
  const frames = curve.computeFrenetFrames(n, false);
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const ring = (i: number, v: number) => {
    const s = i / n;
    curve.getPointAt(s, P);
    const r = radius(s);
    const fn = frames.normals[i] as THREE.Vector3;
    const fb = frames.binormals[i] as THREE.Vector3;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      N.copy(fn).multiplyScalar(Math.cos(a)).addScaledVector(fb, Math.sin(a)).normalize();
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      nor.push(N.x, N.y, N.z);
      uvs.push(j / radial, v);
    }
  };
  const idx: number[] = [];
  let base = 0;
  for (let t = 0; t < tiles; t++) {
    for (let k = 0; k <= perTile; k++) ring(t * perTile + k, k / perTile);
    for (let k = 0; k < perTile; k++)
      for (let j = 0; j < radial; j++) {
        const a = base + k * (radial + 1) + j;
        const b = a + radial + 1;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    base += (perTile + 1) * (radial + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/** Path of Ronin's body (totem-local, origin at the dais top centre): coils up the pole, then rears up in
 * front of the crown facing +Z (the road). Returns the curve and the head pose at its end. */
function snakePath() {
  const pts: THREE.Vector3[] = [];
  const R = POLE.r + 0.15;
  const y0 = 0.25;
  const y1 = POLE.top - 0.15;
  const turns = 2.25;
  // End the coil at angle 0 (+Z, facing the road).
  const n = 46;
  for (let i = 0; i <= n; i++) {
    const s = i / n;
    const a = -turns * Math.PI * 2 * (1 - s);
    pts.push(new THREE.Vector3(Math.sin(a) * R, y0 + (y1 - y0) * s, Math.cos(a) * R));
  }
  // Neck: rises in front of the cap and leans out toward the road.
  pts.push(new THREE.Vector3(0, y1 + 0.45, R + 0.16));
  pts.push(new THREE.Vector3(0, y1 + 0.95, R + 0.32));
  pts.push(new THREE.Vector3(0, y1 + 1.3, R + 0.62));
  pts.push(new THREE.Vector3(0, y1 + 1.42, R + 0.98));
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const end = curve.getPointAt(1);
  const tan = curve.getTangentAt(1);
  return { curve, head: end, dir: tan };
}

/** A Shipibo jar (chomo): lathe profile, wide shoulder, short neck, flared lip; unit height ≈ 0.9. */
function jarGeometry() {
  const prof: Array<[number, number]> = [
    [0.001, 0],
    [0.2, 0.01],
    [0.36, 0.1],
    [0.45, 0.26],
    [0.47, 0.38],
    [0.42, 0.52],
    [0.3, 0.64],
    [0.19, 0.71],
    [0.16, 0.79],
    [0.21, 0.88],
    [0.24, 0.9],
  ];
  return new THREE.LatheGeometry(
    prof.map(([r, y]) => new THREE.Vector2(r, y)),
    16,
  );
}

export interface Painted {
  mesh: THREE.Mesh;
  /** Ronin's head position and facing (totem-local), for the flat-coloured head. */
  head: { pos: THREE.Vector3; dir: THREE.Vector3 };
  dispose(): void;
}

/**
 * Pole shaft, anaconda body and jars: one mesh on the atlas material, built in the plaza frame on a flat
 * floor `floorY` above the frame origin.
 */
export function buildPainted(mat: THREE.Material, floorY: number): Painted {
  const [tx, tz] = TOTEM_LOCAL;
  const parts: THREE.BufferGeometry[] = [];
  // Shaft: painted between the carved base and cap; slightly tapered.
  const shaftH = POLE.top - POLE.base;
  const shaft = new THREE.CylinderGeometry(POLE.r * 0.94, POLE.r, shaftH, 16, 1, true);
  toRegion(shaft, REGION.pole);
  shaft.translate(tx, floorY + DAIS_TOP + POLE.base + shaftH / 2, tz);
  parts.push(shaft);
  // Ronin.
  const { curve, head, dir } = snakePath();
  const len = curve.getLength();
  const tiles = Math.max(1, Math.round(len / 1.15));
  const body = snakeBody(curve, (s) => 0.07 + 0.11 * Math.min(1, s / 0.3) + (s > 0.92 ? 0.02 : 0), tiles);
  toRegion(body, REGION.skin);
  body.translate(tx, floorY + DAIS_TOP, tz);
  parts.push(body);
  // Jars round the dais on the plaza floor (bases a little sunk into it).
  for (const [a, r, s] of POTS) {
    const [lx, lz] = aroundTotem(a, r);
    const j = jarGeometry();
    toRegion(j, REGION.jar);
    j.scale(s, s, s);
    j.rotateY(a * 2.3);
    j.translate(lx, floorY - 0.03, lz);
    parts.push(j);
  }
  const merged = mergeGeometries(
    parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    false,
  ) as THREE.BufferGeometry;
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = "selva-kene:painted";
  return {
    mesh,
    head: { pos: head.clone().add(new THREE.Vector3(tx, floorY + DAIS_TOP, tz)), dir: dir.clone() },
    dispose: () => merged.dispose(),
  };
}

// ------------------------------------------------------------------------------------------------ flat

const FEATHERS = [K.scarlet, K.yellow, K.blue, K.scarlet, K.green, K.yellow] as const;

/** Wind weight (u of bend at full wind) at a feather's tip and at a pennant's free corner. */
const FEATHER_FLEX = 0.3;
const PENNANT_FLEX = 0.26;

/** Writes a `flex` attribute: `k` × (how far along `axis` from `from` to `to`), clamped 0–1. */
function flexAlong(g: THREE.BufferGeometry, axis: "x" | "y" | "z", from: number, to: number, k: number) {
  const pos = g.getAttribute("position") as THREE.BufferAttribute;
  const out = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const v = axis === "x" ? pos.getX(i) : axis === "y" ? pos.getY(i) : pos.getZ(i);
    out[i] = k * Math.min(1, Math.max(0, (v - from) / (to - from)));
  }
  g.setAttribute("flex", new THREE.BufferAttribute(out, 1));
  return g;
}

/**
 * One feather: a flattened 4-sided cone, tip up, at (x, y, z), leaning `lean` outward along yaw `ry`, into the
 * wind-swayed builder (its weight grows from the quill to the tip).
 */
function feather(
  sway: GeoBuilder,
  x: number,
  y: number,
  z: number,
  len: number,
  ry: number,
  lean: number,
  color: string,
) {
  const g = new THREE.ConeGeometry(0.1, len, 4);
  g.translate(0, len / 2, 0);
  g.scale(1, 1, 0.35);
  flexAlong(g, "y", 0, len, FEATHER_FLEX * Math.min(1.4, len));
  // Tilt toward +Z first, then turn: the feather leans out along (sin ry, cos ry).
  g.rotateX(lean);
  g.rotateY(ry);
  g.translate(x, y, z);
  sway.add(g, { color });
}

/**
 * Every flat-coloured part, into `kit` (plaza frame): plaza floor, dais, the pole's carved base, bands and cap,
 * Ronin's head, the banner poles and the pennant cords between them; the parts that move with the wind (the
 * feather crown, the poles' feather tufts, the pennants) go into `sway` with their `flex` weights.
 * `floorY` is the plaza floor height relative to the frame origin.
 */
export function buildFlat(
  kit: Kit,
  sway: GeoBuilder,
  rand: Rand,
  o: { floorY: number; plazaR: number; head: { pos: THREE.Vector3; dir: THREE.Vector3 } },
) {
  const [tx, tz] = TOTEM_LOCAL;
  const fy = o.floorY;
  // Plaza: packed-earth disc (deep enough to bury into the terrain) with a darker rim and a ring of logs.
  kit.cyl(o.plazaR, o.plazaR + 0.15, 0.6, 0, fy - 0.6, 0, K.earth, 40);
  // A darker trodden ring inside the curb.
  const ring = new THREE.RingGeometry(o.plazaR - 1.5, o.plazaR - 1.15, 48);
  kit.add(ring, K.earthDark, 0, fy + 0.015, 0, -Math.PI / 2, 0, 0);
  ring.dispose();
  const logs = 26;
  for (let i = 0; i < logs; i++) {
    const a = (i / logs) * Math.PI * 2;
    // The entrance (road side, around +Z) has no curb.
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.42) continue;
    const r = o.plazaR - 0.12;
    const len = ((Math.PI * 2 * r) / logs) * 0.92;
    kit.cyl(
      0.11,
      0.12,
      len,
      Math.sin(a) * r,
      fy + 0.11 - len / 2,
      Math.cos(a) * r,
      i % 3 ? A.wood : A.woodDark,
      6,
      0,
      Math.PI / 2,
      a,
    );
  }
  // Dais: two round tiers (red-earth base, dark hardwood top).
  kit.cyl(DAIS[0].r, DAIS[0].r + 0.06, DAIS[0].h + 0.3, tx, fy - 0.3, tz, K.achioteDark, 24);
  kit.cyl(DAIS[1].r, DAIS[1].r + 0.04, DAIS[1].h, tx, fy + DAIS[0].h, tz, K.woodDark, 24);
  const base = fy + DAIS_TOP;
  // Carved base (dark hardwood, with a red band) and cap.
  kit.cyl(POLE.r * 1.05, POLE.r * 1.22, POLE.base, tx, base, tz, K.wood, 16);
  kit.cyl(POLE.r * 1.08, POLE.r * 1.1, 0.16, tx, base + POLE.base * 0.45, tz, K.achiote, 16);
  kit.cyl(POLE.r * 1.12, POLE.r * 1.06, 0.12, tx, base + POLE.base - 0.06, tz, K.woodDark, 16);
  // Carved rings dividing the painted shaft into three panels.
  for (const k of [0.36, 0.68]) {
    const y = base + POLE.base + (POLE.top - POLE.base) * k;
    kit.cyl(POLE.r * 1.04, POLE.r * 1.04, 0.13, tx, y - 0.065, tz, K.woodDark, 16);
  }
  kit.cyl(POLE.r * 1.12, POLE.r * 1.0, 0.12, tx, base + POLE.top - 0.06, tz, K.woodDark, 16);
  kit.cyl(POLE.r * 0.9, POLE.r * 1.15, POLE.cap, tx, base + POLE.top, tz, K.wood, 16);
  kit.cyl(POLE.r * 1.25, POLE.r * 1.25, 0.08, tx, base + POLE.top + POLE.cap, tz, K.achiote, 16);
  // Feather crown: a fan of long macaw feathers and an inner ring of short ones.
  const cy = base + POLE.top + POLE.cap + 0.04;
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const r = POLE.r * 1.05;
    const len = 1.35 + (i % 2) * 0.35;
    feather(
      sway,
      tx + Math.sin(a) * r,
      cy,
      tz + Math.cos(a) * r,
      len,
      a,
      0.55,
      FEATHERS[i % FEATHERS.length] as string,
    );
  }
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.26;
    const r = POLE.r * 0.6;
    feather(sway, tx + Math.sin(a) * r, cy, tz + Math.cos(a) * r, 0.95, a, 0.25, i % 2 ? K.blue : K.yellow);
  }
  // Ronin's head: a blunt boa head (achiote red, black crown) facing along the neck, eyes and a forked tongue.
  // Parts are built at the origin facing +Z, pitched, turned to the neck's heading and moved onto it.
  const d = o.head.dir.clone().normalize();
  const yaw = Math.atan2(d.x, d.z);
  const pitch = -Math.asin(Math.max(-1, Math.min(1, d.y))) * 0.5;
  const place = (g: THREE.BufferGeometry, color: string, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    g.rotateX(pitch);
    g.rotateY(yaw);
    kit.add(g, color, o.head.pos.x, o.head.pos.y, o.head.pos.z);
    g.dispose();
  };
  const sphere = (r: number, sx: number, sy: number, sz: number, seg = 10) => {
    const g = new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2));
    g.scale(sx, sy, sz);
    return g;
  };
  place(sphere(0.27, 1.05, 0.7, 1.6), K.achiote, 0, 0, 0.26);
  place(sphere(0.25, 0.85, 0.42, 1.25), K.black, 0, 0.1, 0.18);
  for (const s of [-1, 1]) {
    place(sphere(0.075, 1, 1, 1, 7), K.yellow, s * 0.22, 0.07, 0.38);
    place(sphere(0.04, 1, 1, 1, 6), K.black, s * 0.265, 0.08, 0.4);
    // Forked tongue tips.
    const tip = new THREE.BoxGeometry(0.025, 0.014, 0.18);
    tip.rotateY(s * 0.3);
    place(tip, K.scarlet, s * 0.035, -0.09, 0.98);
  }
  place(new THREE.BoxGeometry(0.03, 0.016, 0.24), K.scarlet, 0, -0.09, 0.8);

  // Banner poles: dark hardwood with achiote bands and a feather tuft; pennant cords between neighbours.
  const tops: THREE.Vector3[] = [];
  for (const [i, a] of POLE_ANGLES.entries()) {
    const x = Math.sin(a) * POLE_R;
    const z = Math.cos(a) * POLE_R;
    const h = 3.3 + (i % 2) * 0.35;
    kit.cyl(0.07, 0.085, h + 0.4, x, fy - 0.4, z, K.woodDark, 6);
    for (const k of [0.55, 0.75]) kit.cyl(0.09, 0.09, 0.1, x, fy + h * k, z, i % 2 ? K.achiote : K.cream, 6);
    kit.cyl(0.11, 0.07, 0.16, x, fy + h, z, K.achiote, 6);
    for (let f = 0; f < 5; f++) {
      const fa = (f / 5) * Math.PI * 2 + i;
      feather(
        sway,
        x + Math.sin(fa) * 0.05,
        fy + h + 0.12,
        z + Math.cos(fa) * 0.05,
        0.55,
        fa,
        0.35,
        FEATHERS[(f + i) % FEATHERS.length] as string,
      );
    }
    tops.push(new THREE.Vector3(x, fy + h - 0.25, z));
  }
  const tri = new THREE.BufferGeometry();
  tri.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.28, 0, 0.12, 0, 0, -0.12, 0, 0, 0, -0.28, 0], 3),
  );
  tri.computeVertexNormals();
  // Tied along the cord (y 0), free at the bottom corner (y −0.28).
  flexAlong(tri, "y", 0, -0.28, PENNANT_FLEX);
  const pennant = [K.cream, K.achiote, K.black, K.yellow] as const;
  for (let i = 0; i + 1 < tops.length; i++) {
    const a = tops[i] as THREE.Vector3;
    const b = tops[i + 1] as THREE.Vector3;
    const pts: THREE.Vector3[] = [];
    const n = 9;
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      pts.push(new THREE.Vector3().lerpVectors(a, b, u).setY(a.y + (b.y - a.y) * u - Math.sin(Math.PI * u) * 0.55));
    }
    for (let k = 0; k < n; k++) kit.stick(pts[k] as THREE.Vector3, pts[k + 1] as THREE.Vector3, 0.012, K.cream, 4);
    const ry = Math.atan2(-(b.z - a.z), b.x - a.x);
    for (let k = 1; k < n; k++) {
      const p = pts[k] as THREE.Vector3;
      const g = tri.clone();
      g.rotateY(ry + (rand() - 0.5) * 0.2);
      g.translate(p.x, p.y, p.z);
      sway.add(g, { color: pennant[(k + i) % pennant.length] as string });
    }
  }
  tri.dispose();
}

// ------------------------------------------------------------------------------------------------ streamers

/** Two streamers per banner pole, hanging from just under its tuft and blowing out and down. */
export interface Streamers {
  mesh: THREE.Mesh;
  dispose(): void;
}

/**
 * The streamers as one static ribbon mesh in a gently blown rest pose (out and down, tangential round the ring,
 * one each way). The shared wind does the rest as cloth: give `mat` `windSway(mat, { mode: "cloth", flex: true })`
 * (the `flex` attribute is 0 at the pole, 1 at the free end).
 */
export function buildStreamers(mat: THREE.Material, floorY: number): Streamers {
  const SEG = 10;
  const LEN = 1.7;
  const W = 0.26;
  const BLOW = 0.6;
  const list: Array<{ ox: number; oy: number; oz: number; dx: number; dz: number }> = [];
  for (const [i, a] of POLE_ANGLES.entries()) {
    const x = Math.sin(a) * POLE_R;
    const z = Math.cos(a) * POLE_R;
    const h = 3.3 + (i % 2) * 0.35;
    for (const s of [-1, 1]) {
      // Blowing roughly tangentially round the ring, one each way, a little outward.
      const dx = Math.cos(a) * s * 0.8 + Math.sin(a) * 0.45;
      const dz = -Math.sin(a) * s * 0.8 + Math.cos(a) * 0.45;
      const l = Math.hypot(dx, dz);
      list.push({ ox: x, oy: floorY + h - 0.05, oz: z, dx: dx / l, dz: dz / l });
    }
  }
  const nv = list.length * (SEG + 1) * 2;
  const pos = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const flex = new Float32Array(nv);
  const idx: number[] = [];
  const r = REGION.streamer;
  // Along the streamer: the region's x (512 px); across: an 80 px strip at the top of the region.
  const stripV = 80 / ATLAS;
  list.forEach((st, k) => {
    for (let i = 0; i <= SEG; i++) {
      const v0 = (k * (SEG + 1) + i) * 2;
      const u = i / SEG;
      const tu = (r.x + u * r.w) / ATLAS;
      uv.set([tu, 1 - r.y / ATLAS, tu, 1 - r.y / ATLAS - stripV], v0 * 2);
      if (i < SEG) idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2);
      // Rest pose: hangs mostly down and swings out a little (the old animation's mean shape).
      const out = LEN * (0.18 * u + 0.32 * u * u * BLOW);
      const drop = LEN * u * (0.95 - 0.25 * BLOW * u);
      const cx = st.ox + st.dx * out;
      const cz = st.oz + st.dz * out;
      const cy = st.oy - drop;
      const wx = -st.dz * (W / 2);
      const wz = st.dx * (W / 2);
      pos.set([cx - wx, cy, cz - wz, cx + wx, cy, cz + wz], v0 * 3);
      flex[v0] = u;
      flex[v0 + 1] = u;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("flex", new THREE.BufferAttribute(flex, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  const mesh = new THREE.Mesh(g, mat);
  mesh.name = "selva-kene:streamers";
  return { mesh, dispose: () => g.dispose() };
}

// ------------------------------------------------------------------------------------------------ burst

/** Flower colours of the burst: hibiscus red, heliconia orange, yellow, orchid pink, white. */
export const PETAL_COLORS = ["#e0303a", "#f08a24", "#f4c430", "#e86aa0", "#f6efe2"] as const;

/** A small cupped petal (two bent triangles), for an InstancedMesh. */
export function petalGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const L = 0.17;
  const W = 0.09;
  g.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [0, 0, -L / 2, -W, 0.03, 0, 0, 0, L / 2, 0, 0, -L / 2, 0, 0, L / 2, W, 0.03, 0],
      3,
    ),
  );
  g.computeVertexNormals();
  return g;
}
