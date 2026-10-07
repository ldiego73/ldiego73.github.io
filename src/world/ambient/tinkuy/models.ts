/**
 * Tinkuy models: the crossroads signpost (three carved arrow boards with canvas lettering), the Antisuyu
 * branch (a dirt ribbon that follows the ground, with flagstones and edge stones) and the stone punku
 * (a trapezoidal Inca doorway) with a shimmering jungle glimpse in its opening and big jungle leaves
 * growing around it. Flat-coloured parts are merged into vertex-coloured meshes (one draw each).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Lang, WorldEnv } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { DYE } from "../../palette";
import { C, canvasTex, drawBoard, FONT, fitFont, Kit, redraw, rng, toonMapped } from "../../props";
import { PUNKU } from "../../trailhead";
import { arrowYaw, BAND, BAND_R, DOORWAY, SIGN, SIGN_TARGETS } from "./logic";

export interface Owned {
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  texs: THREE.Texture[];
  redraws: Array<() => void>;
}

type Ground = (x: number, z: number) => number;

const LABELS: Record<keyof typeof SIGN_TARGETS, { es: string; en: string }> = {
  qhapaq: { es: "QHAPAQ ÑAN · CUMBRE", en: "QHAPAQ ÑAN · SUMMIT" },
  wasi: { es: "WASI · LA CASA", en: "WASI · THE HOUSE" },
  antisuyu: { es: "ANTISUYU · SELVA", en: "ANTISUYU · JUNGLE" },
};

const finish = (k: Kit, name: string, mat: THREE.Material) => {
  const g = k.build(name);
  const m = flattenToonGroup(g, mat);
  if (m) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  return g;
};

// ------------------------------------------------------------------------------------------- signpost

export function buildSignpost(env: WorldEnv, lang: Lang, ground: Ground, mat: THREE.Material, own: Owned) {
  const group = new THREE.Group();
  group.name = "tinkuy-sign";
  const y0 = ground(SIGN.x, SIGN.z);
  group.position.set(SIGN.x, y0, SIGN.z);
  const rand = rng(23);
  const k = new Kit(env);
  // Apacheta-like cairn of stones at the foot, then the post.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    k.rock(
      0.2 + rand() * 0.08,
      Math.cos(a) * 0.32,
      -0.1,
      Math.sin(a) * 0.32,
      rand() < 0.4 ? C.stoneDark : C.stone,
      rand,
    );
  }
  k.rock(0.22, 0, 0.15, 0, C.stone, rand);
  k.box(0.18, 3.25, 0.18, 0, -0.1, 0, C.woodDark);
  k.cyl(0.13, 0.11, 0.12, 0, 3.12, 0, C.wood, 6);
  // Dye ribbons tied under the cap.
  ["red", "ochre", "turq"].forEach((d, i) => {
    k.box(
      0.05,
      0.42 - i * 0.06,
      0.02,
      -0.05 + i * 0.05,
      2.62 + i * 0.03,
      0.1,
      DYE[d as keyof typeof DYE],
      0,
      0,
      (i - 1) * 0.12,
    );
  });

  // Three arrow boards: local +X points along the arrow; the tip is a short prism.
  const rows = Object.keys(SIGN_TARGETS) as Array<keyof typeof SIGN_TARGETS>;
  const heights = [2.55, 2.1, 1.65];
  const BOARD = { len: 1.7, h: 0.36, d: 0.07 };
  const textGeos: THREE.BufferGeometry[] = [];
  const tip = new THREE.Shape();
  tip.moveTo(0, -BOARD.h / 2 - 0.05);
  tip.lineTo(0.34, 0);
  tip.lineTo(0, BOARD.h / 2 + 0.05);
  tip.closePath();
  const tipGeo = new THREE.ExtrudeGeometry(tip, { depth: BOARD.d, bevelEnabled: false });
  tipGeo.translate(0, 0, -BOARD.d / 2);
  rows.forEach((id, i) => {
    const [tx, tz] = SIGN_TARGETS[id];
    const yaw = arrowYaw(tx - SIGN.x, tz - SIGN.z);
    const y = heights[i]!;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    // Board centre along the arrow, starting just off the post.
    const off = 0.12 + BOARD.len / 2;
    k.box(BOARD.len, BOARD.h, BOARD.d, off * cos, y - BOARD.h / 2, -off * sin, i === 1 ? C.wood : "#9a6a40", yaw);
    k.add(tipGeo, i === 1 ? C.wood : "#9a6a40", (0.12 + BOARD.len) * cos, y, -(0.12 + BOARD.len) * sin, 0, yaw, 0);
    // A dye stripe along the bottom edge (Qhapaq red, Wasi ochre, Antisuyu turquoise).
    const dye = [DYE.red, DYE.ochre, DYE.turq][i]!;
    k.box(BOARD.len - 0.1, 0.05, BOARD.d + 0.02, off * cos, y - BOARD.h / 2 + 0.02, -off * sin, dye, yaw);
    // Lettering on both faces (UV row i of the atlas); the back face is turned so it reads too.
    for (const face of [1, -1]) {
      const g = new THREE.PlaneGeometry(BOARD.len - 0.16, BOARD.h - 0.08);
      const uv = g.getAttribute("uv");
      for (let v = 0; v < uv.count; v++) uv.setY(v, (rows.length - 1 - i + uv.getY(v)) / (rows.length + 1));
      const m = new THREE.Matrix4()
        .makeTranslation(off * cos, y + 0.02, -off * sin)
        .multiply(new THREE.Matrix4().makeRotationY(yaw + (face < 0 ? Math.PI : 0)))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, BOARD.d / 2 + 0.006));
      g.applyMatrix4(m);
      textGeos.push(g);
    }
  });
  tipGeo.dispose();
  // "TINKUY" plate on top, facing the trail (east), both faces.
  for (const face of [1, -1]) {
    const g = new THREE.PlaneGeometry(1.0, 0.25);
    const uv = g.getAttribute("uv");
    for (let v = 0; v < uv.count; v++) uv.setY(v, (rows.length + uv.getY(v)) / (rows.length + 1));
    g.applyMatrix4(
      new THREE.Matrix4()
        .makeTranslation(0, 3.0, 0)
        .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2 + (face < 0 ? Math.PI : 0)))
        .multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.056)),
    );
    textGeos.push(g);
  }
  k.box(0.1, 0.32, 1.1, 0, 2.85, 0, C.woodDark);
  group.add(finish(k, "tinkuy-sign", mat));

  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const rh = h / (rows.length + 1);
    ctx.clearRect(0, 0, w, h);
    rows.forEach((id, i) => {
      ctx.save();
      ctx.translate(0, (i + 1) * rh);
      drawBoard(ctx, w, rh, i === 1 ? "#8a5a35" : "#9a6a40");
      ctx.fillStyle = "#f3ead8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const label = LABELS[id][lang];
      fitFont(ctx, label, "800", FONT.display, 50, w - 70, "condensed ");
      ctx.fillText(label, w / 2, rh / 2 + 3);
      ctx.restore();
    });
    // Top plate.
    drawBoard(ctx, w, rh, "#5e3b22");
    ctx.fillStyle = "#e8b631";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitFont(ctx, "TINKUY", "800", FONT.display, 54, w * 0.6, "condensed ");
    ctx.fillText("TINKUY", w / 2, rh / 2 + 3);
  };
  const tex = canvasTex(512, 64 * (rows.length + 1), draw);
  own.texs.push(tex);
  own.redraws.push(() => redraw(tex, draw));
  const textMat = toonMapped(env, tex);
  own.mats.push(textMat);
  const textGeo = mergeGeometries(textGeos, false);
  for (const g of textGeos) g.dispose();
  if (textGeo) {
    own.geos.push(textGeo);
    const text = new THREE.Mesh(textGeo, textMat);
    text.name = "tinkuy-sign-text";
    group.add(text);
  }
  return group;
}

// ------------------------------------------------------------------------------------------- branch

/** Dirt ribbon (vertex colours, follows the ground) + flagstones and edge stones (merged). */
export function buildBranch(env: WorldEnv, ground: Ground, mat: THREE.Material, own: Owned) {
  const group = new THREE.Group();
  group.name = "tinkuy-branch";
  const rand = rng(61);
  const curve = new THREE.CatmullRomCurve3(
    BAND.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    false,
    "centripetal",
  );
  const n = Math.ceil(curve.getLength() / 0.45);
  const pts = curve.getSpacedPoints(n);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const dirt = new THREE.Color("#a77a4f");
  const edge = new THREE.Color("#8a6844");
  const grassy = new THREE.Color("#7a9a58");
  const tan = new THREE.Vector3();
  // Across: grass-blend lip, edge, centre, edge, lip.
  const across = [-1.18, -0.92, 0, 0.92, 1.18];
  for (let i = 0; i <= n; i++) {
    const p = pts[i]!;
    curve.getTangentAt(Math.min(1, i / n), tan);
    const nx = -tan.z;
    const nz = tan.x;
    // Wider at the plaza end and at the doorstep, irregular in between.
    const t = i / n;
    const w = BAND_R * (0.95 + 0.12 * Math.sin(i * 1.7) + (t < 0.06 || t > 0.94 ? 0.2 : 0));
    for (const a of across) {
      const j = (Math.abs(a) > 1 ? rand() * 0.25 : 0) * Math.sign(a);
      const x = p.x + nx * (a * w * 0.82 + j);
      const z = p.z + nz * (a * w * 0.82 + j);
      pos.push(x, ground(x, z) + (Math.abs(a) > 1 ? 0.015 : 0.05), z);
      const c = Math.abs(a) > 1 ? grassy : a === 0 ? dirt : edge;
      const v = 0.94 + rand() * 0.1;
      col.push(c.r * v, c.g * v, c.b * v);
    }
  }
  const m = across.length;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = a + 1;
      const c = a + m;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Faces must point up: flip the winding if the first normal came out downward.
  if ((geo.getAttribute("normal").getY(0) ?? 1) < 0) {
    for (let q = 0; q < idx.length; q += 3) [idx[q + 1], idx[q + 2]] = [idx[q + 2]!, idx[q + 1]!];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  geo.computeBoundingSphere();
  own.geos.push(geo);
  const ribbon = new THREE.Mesh(geo, mat);
  ribbon.name = "tinkuy-branch:dirt";
  ribbon.receiveShadow = true;
  group.add(ribbon);

  // Flagstones down the middle and a few edge stones.
  const k = new Kit(env);
  for (let i = 2; i < n - 1; i += 1) {
    const p = pts[i]!;
    curve.getTangentAt(i / n, tan);
    const ry = Math.atan2(tan.x, tan.z);
    for (let s = 0; s < 2; s++) {
      if (rand() < 0.3) continue;
      const off = (s - 0.5) * 0.75 + (rand() - 0.5) * 0.2;
      const x = p.x - tan.z * off;
      const z = p.z + tan.x * off;
      const y = ground(x, z);
      const w = 0.42 + rand() * 0.2;
      const d = 0.34 + rand() * 0.14;
      k.box(
        w,
        0.12,
        d,
        x,
        y - 0.06 + 0.03 + rand() * 0.02,
        z,
        rand() < 0.35 ? C.stoneDark : "#a9a090",
        ry + (rand() - 0.5) * 0.5,
      );
    }
    if (i % 4 === 0)
      for (const sd of [-1, 1]) {
        if (rand() < 0.4) continue;
        const off = sd * (BAND_R + 0.05);
        const x = p.x - tan.z * off;
        const z = p.z + tan.x * off;
        k.rock(0.16 + rand() * 0.1, x, ground(x, z) - 0.08, z, rand() < 0.5 ? C.stoneDark : C.stone, rand);
      }
  }
  group.add(finish(k, "tinkuy-branch-stones", mat));
  return group;
}

// ------------------------------------------------------------------------------------------- punku

export interface PunkuModel {
  group: THREE.Group;
  /** Shimmer of the jungle glimpse (t in seconds). */
  update(t: number): void;
}

export function buildPunku(env: WorldEnv, ground: Ground, mat: THREE.Material, own: Owned): PunkuModel {
  const group = new THREE.Group();
  group.name = "tinkuy-punku";
  const y0 = ground(PUNKU.x, PUNKU.z);
  group.position.set(PUNKU.x, y0, PUNKU.z);
  group.rotation.y = PUNKU.yaw;
  const rand = rng(97);
  const k = new Kit(env);
  const { bottom, top, height, jamb, depth } = DOORWAY;
  const g = (lx: number, lz: number) => {
    const c = Math.cos(PUNKU.yaw);
    const s = Math.sin(PUNKU.yaw);
    return ground(PUNKU.x + lx * c + lz * s, PUNKU.z - lx * s + lz * c) - y0;
  };
  // Footing slab levels the doorway on the slope.
  let lo = 0;
  for (const lx of [-2, 0, 2]) for (const lz of [-0.8, 0.8]) lo = Math.min(lo, g(lx, lz));
  k.box(bottom + jamb * 2 + 0.6, 0.28 - lo, depth + 0.5, 0, lo - 0.1, 0, C.stoneDark);
  // Jambs: courses of dressed stones whose inner faces lean in (the Inca trapezoid).
  const courses = 6;
  const ch = height / courses;
  for (const sx of [-1, 1])
    for (let c = 0; c < courses; c++) {
      const yb = 0.18 + c * ch;
      const yc = yb + ch / 2;
      const inner = bottom / 2 - ((bottom - top) / 2) * (yc / height);
      const w = jamb * (1 - c * 0.025) + (rand() - 0.5) * 0.06;
      k.box(
        w,
        ch * 0.96,
        depth * (1 - c * 0.012),
        sx * (inner + w / 2),
        yb,
        0,
        c % 2 ? C.stoneDark : C.stone,
        (rand() - 0.5) * 0.02,
      );
    }
  // Lintel: one long monolith and a capping course.
  const lw = top + jamb * 2 + 0.25;
  k.box(lw, 0.62, depth + 0.06, 0, 0.18 + height, 0, C.stone);
  k.box(lw - 0.5, 0.36, depth - 0.1, 0, 0.8 + height, 0, C.stoneDark);
  // Moss and creeping green: the jungle is already reaching over the stones.
  for (let i = 0; i < 9; i++) {
    const x = (rand() - 0.5) * lw;
    k.box(0.3 + rand() * 0.4, 0.06, depth * 0.7, x, 1.15 + height, (rand() - 0.5) * 0.2, i % 2 ? "#3f8a3e" : "#5aa04a");
  }
  // Hanging vines from the lintel, both faces.
  for (let i = 0; i < 7; i++) {
    const x = -lw / 2 + 0.25 + rand() * (lw - 0.5);
    const len = 0.5 + rand() * 1.1;
    const z = (rand() < 0.5 ? -1 : 1) * (depth / 2 + 0.04);
    k.box(0.04, len, 0.04, x, 0.18 + height - len + 0.05, z, "#2f7d3a");
    addLeaf(k, "#3f9a46", x, 0.18 + height - len, z, -0.3, rand() * 3, 0.25, 0.25, 0.25);
  }
  group.add(finish(k, "tinkuy-punku", mat));

  // Jungle plants: broad bent leaves (double-sided material), bromeliads, a banana-like stalk.
  const leafMat = vertexToon();
  leafMat.side = THREE.DoubleSide;
  own.mats.push(leafMat);
  const pk = new Kit(env);
  const plant = (lx: number, lz: number, s: number, leaves: number, tall = false) => {
    const py = g(lx, lz);
    if (tall) {
      pk.cyl(0.07 * s, 0.1 * s, 1.6 * s, lx, py - 0.1, lz, "#5b7a3a", 6);
    }
    for (let i = 0; i < leaves; i++) {
      const a = (i / leaves) * Math.PI * 2 + rand() * 0.4;
      const tilt = 0.5 + rand() * 0.5;
      const sc = s * (0.8 + rand() * 0.45);
      const y = py + (tall ? 1.45 * s : 0.05);
      const c = ["#2f7d3a", "#3f9a46", "#246b33", "#4ca853"][i % 4]!;
      addLeaf(pk, c, lx, y, lz, tilt, a, sc * 0.9, sc, sc * 1.6);
    }
  };
  // Clusters flank the doorway on both sides, front and back (never on the doorstep).
  plant(-2.35, 0.55, 1.1, 7);
  plant(2.4, 0.4, 1.0, 6);
  plant(-2.1, -1.0, 1.25, 7, true);
  plant(2.3, -1.1, 1.15, 6, true);
  plant(-3.2, -0.3, 0.8, 5);
  plant(3.3, -0.1, 0.85, 5);
  plant(0.6, -1.7, 1.0, 6);
  // Bromeliads: a rosette of stiff leaves with a red heart.
  for (const [lx, lz] of [
    [-1.75, 1.05],
    [1.85, 1.0],
  ] as const) {
    const py = g(lx, lz);
    for (let i = 0; i < 6; i++) addLeaf(pk, "#4f8f3a", lx, py, lz, 0.9, (i / 6) * Math.PI * 2, 0.35, 0.35, 0.55);
    pk.cyl(0.05, 0.08, 0.3, lx, py, lz, "#d8342c", 6);
  }
  const plants = pk.build("tinkuy-plants");
  const pm = flattenToonGroup(plants, leafMat);
  if (pm) pm.castShadow = true;
  group.add(plants);

  // The glimpse: a trapezoid filling the opening, a soft jungle gradient with leaf silhouettes and light.
  const glimpseTex = canvasTex(128, 256, (ctx, w, h) => {
    const gr = ctx.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, "#cfeec0");
    gr.addColorStop(0.35, "#69c27a");
    gr.addColorStop(0.75, "#1f7a45");
    gr.addColorStop(1, "#0e4a2c");
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    // Light in the middle distance.
    const lg = ctx.createRadialGradient(w / 2, h * 0.38, 2, w / 2, h * 0.38, w * 0.6);
    lg.addColorStop(0, "rgba(255,250,210,0.85)");
    lg.addColorStop(1, "rgba(255,250,210,0)");
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, w, h);
    // Leaf silhouettes framing the view.
    const r = rng(3);
    ctx.fillStyle = "rgba(10,60,32,0.85)";
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const x = side > 0 ? w - r() * 18 : r() * 18;
      const y = 30 + r() * (h - 40);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(side * (0.9 + r() * 0.5));
      ctx.beginPath();
      ctx.ellipse(0, -26, 9, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // A far river glint.
    ctx.fillStyle = "rgba(170,230,240,0.6)";
    ctx.fillRect(w * 0.3, h * 0.62, w * 0.4, 3);
  });
  own.texs.push(glimpseTex);
  const glimpseMat = new THREE.MeshBasicMaterial({
    map: glimpseTex,
    transparent: true,
    opacity: 0.88,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  own.mats.push(glimpseMat);
  const shape = new THREE.Shape();
  shape.moveTo(-bottom / 2 + 0.02, 0);
  shape.lineTo(bottom / 2 - 0.02, 0);
  shape.lineTo(top / 2 - 0.02, height);
  shape.lineTo(-top / 2 + 0.02, height);
  shape.closePath();
  const glimpseGeo = new THREE.ShapeGeometry(shape);
  // UVs from the shape's bounding box.
  const uv = glimpseGeo.getAttribute("uv");
  const p = glimpseGeo.getAttribute("position");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + bottom / 2) / bottom, p.getY(i) / height);
  own.geos.push(glimpseGeo);
  const glimpse = new THREE.Mesh(glimpseGeo, glimpseMat);
  glimpse.name = "tinkuy-glimpse";
  glimpse.position.y = 0.18;
  env.noOutline(glimpse);
  group.add(glimpse);

  const rm = env.reducedMotion;
  return {
    group,
    update(t) {
      if (rm) return;
      glimpseMat.opacity = 0.8 + Math.sin(t * 1.7) * 0.07 + Math.sin(t * 4.3) * 0.03;
      glimpseTex.offset.x = Math.sin(t * 0.6) * 0.02;
    },
  };
}

/** A broad leaf: an elongated blade along +Z with a midrib fold and a downward curl (unit size). */
let leafGeo: THREE.BufferGeometry | null = null;
function leafProto(): THREE.BufferGeometry {
  if (leafGeo) return leafGeo;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.42, 0.35, 0.18, 0.85);
  s.lineTo(0, 1);
  s.lineTo(-0.18, 0.85);
  s.quadraticCurveTo(-0.42, 0.35, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  const p = g.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    // Blade lies along +Z; fold up at the midrib, curl down toward the tip.
    p.setXYZ(i, x, Math.abs(x) * 0.35 - y * y * 0.35, y);
  }
  g.computeVertexNormals();
  leafGeo = g;
  return g;
}

/**
 * Adds a leaf scaled (sx, sy, sz), pitched up by `tilt` in its own frame, then turned to `yaw`
 * (Kit's Euler is XYZ, which would tilt around the world axis instead).
 */
function addLeaf(
  k: Kit,
  color: string,
  x: number,
  y: number,
  z: number,
  tilt: number,
  yaw: number,
  sx: number,
  sy: number,
  sz: number,
) {
  const g = leafProto().clone();
  g.scale(sx, sy, sz);
  g.rotateX(-tilt);
  k.add(g, color, x, y, z, 0, yaw, 0, 1, 1, 1, true);
  g.dispose();
}
