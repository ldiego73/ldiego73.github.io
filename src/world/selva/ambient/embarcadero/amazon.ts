/**
 * Amazonian architecture kit shared by the jungle's content stations (regatón, maloca, embarcadero, canoe,
 * palafitos, floating arcade, collpa). Everything is built in a station's local frame on top of the mountain's
 * `Kit` (props.ts: primitives merged per color) and then folded into ONE vertex-colored toon mesh per station
 * (merge-colors.ts flattenToonGroup), so a whole station costs one draw call per pass plus its sign atlas.
 *
 * Pieces: hardwood plank decks (flat, or following the terrain for decor), stilts, steep gable roofs of
 * irapay palm-leaf thatch with ragged eaves, conical maloca roofs, dugout hulls (one trunk, pointed ends),
 * balsa log rafts, railings, ladders, plus a merged carved-sign atlas (one material, one mesh for all signs).
 * Walkable planks are registered by each station as raised decks (station.ts `addDeck`, ../../../decks.ts) at
 * the same heights these builders use (`stairY` gives the stair treads), so feet meet the planks.
 * This file does not export `create` (helpers only).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldEnv } from "../../../contract";
import { flattenToonGroup, vertexToon } from "../../../merge-colors";
import { canvasTex, type Kit, offFontsReady, onFontsReady, redraw } from "../../../props";
import { inkMask } from "../../../toon";

/** Jungle palette: tropical hardwoods, palm thatch, balsa, achiote and river clay. */
export const A = {
  wood: "#7a4a2b",
  woodDark: "#4f2f1c",
  plank: "#a06a3e",
  plankAlt: "#8d5b34",
  weathered: "#8c7358",
  stilt: "#5d3d26",
  thatch: "#9a6b35",
  thatchLight: "#b98d4c",
  thatchDark: "#6e4f27",
  thatchGreen: "#87803c",
  balsa: "#cdb68a",
  balsaDark: "#a8916a",
  rope: "#c8ae7a",
  bark: "#d8c39d",
  achiote: "#b8432f",
  huito: "#2b3550",
  clay: "#b4553a",
  clayDark: "#8f3f2b",
  clayLight: "#c8734c",
  leaf: "#4f7d3a",
  leafDark: "#36592b",
  banana: "#e2c34a",
  ink: "#1f1a17",
  paper: "#f3ead8",
  mud: "#6b5236",
  ember: "#e2702e",
  stone: "#8a8172",
} as const;

export type Rand = () => number;

/** Station local-ground sampler: terrain height relative to the station origin height. */
export type Ground = (lx: number, lz: number) => number;

/** Builds the kit into a group and folds its plain-colored meshes into one vertex-colored mesh on `mat`. */
export function bake(kit: Kit, name: string, mat: THREE.Material): THREE.Group {
  const g = kit.build(name);
  flattenToonGroup(g, mat);
  return g;
}

/** One vertex-colored toon material for a station (the station disposes it). */
export const stationMaterial = () => vertexToon();

/**
 * Plank deck between local x0..x1, z0..z1 with its top at y (planks run along `along`, small gaps and color
 * jitter). With `ground`, each plank follows the terrain under its centre (+ lift) instead of y (decor only:
 * a walkable deck is flat at y and registered as a deck).
 */
export function deck(
  kit: Kit,
  rand: Rand,
  o: {
    x0: number;
    z0: number;
    x1: number;
    z1: number;
    y: number;
    along?: "x" | "z";
    plank?: number;
    thick?: number;
    ground?: Ground;
    lift?: number;
    /** Joists under the planks (2 beams along the planks' cross direction). */
    joists?: boolean;
  },
) {
  const along = o.along ?? "x";
  const pw = o.plank ?? 0.32;
  const th = o.thick ?? 0.08;
  const w = o.x1 - o.x0;
  const d = o.z1 - o.z0;
  const across = along === "x" ? d : w;
  const n = Math.max(1, Math.round(across / pw));
  const step = across / n;
  for (let i = 0; i < n; i++) {
    const c = (along === "x" ? o.z0 : o.x0) + step * (i + 0.5);
    const cx = along === "x" ? (o.x0 + o.x1) / 2 : c;
    const cz = along === "x" ? c : (o.z0 + o.z1) / 2;
    const top = o.ground ? o.ground(cx, cz) + (o.lift ?? 0.05) : o.y;
    const len = (along === "x" ? w : d) - rand() * 0.06;
    const color = rand() < 0.3 ? A.plankAlt : rand() < 0.12 ? A.weathered : A.plank;
    if (along === "x") kit.box(len, th, step - 0.035, cx + (rand() - 0.5) * 0.04, top - th, cz, color);
    else kit.box(step - 0.035, th, len, cx, top - th, cz + (rand() - 0.5) * 0.04, color);
  }
  if (o.joists && !o.ground) {
    for (const k of [0.12, 0.88]) {
      if (along === "x") kit.box(0.12, 0.14, d, o.x0 + w * k, o.y - th - 0.14, (o.z0 + o.z1) / 2, A.woodDark);
      else kit.box(w, 0.14, 0.12, (o.x0 + o.x1) / 2, o.y - th - 0.14, o.z0 + d * k, A.woodDark);
    }
  }
}

/** A round stilt (hardwood post) from below the ground (or riverbed) up to yTop. */
export function stilt(
  kit: Kit,
  x: number,
  z: number,
  yBottom: number,
  yTop: number,
  r = 0.09,
  color: string = A.stilt,
) {
  const h = yTop - yBottom;
  if (h <= 0.02) return;
  kit.cyl(r * 0.9, r, h, x, yBottom, z, color, 6);
}

/** Stilts under a rectangle (corners + every `every` units), from the ground sampler (−0.4) to yTop. */
export function stiltGrid(
  kit: Kit,
  ground: Ground,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yTop: number,
  every = 1.6,
  r = 0.09,
) {
  const nx = Math.max(1, Math.round((x1 - x0) / every));
  const nz = Math.max(1, Math.round((z1 - z0) / every));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const edge = i === 0 || j === 0 || i === nx || j === nz;
      if (!edge) continue;
      const x = x0 + ((x1 - x0) * i) / nx;
      const z = z0 + ((z1 - z0) * j) / nz;
      stilt(kit, x, z, Math.min(ground(x, z), yTop) - 0.4, yTop, r);
    }
  }
}

/**
 * Steep gable roof of irapay (palm-leaf shingles): ridge along local X at height y + h, eaves at y on both
 * sides (overhang `over`), built from overlapping courses of thatch slabs with ragged leaf tips at the eaves
 * and a dark ridge cap. Width w (along the ridge) and depth d (eave to eave), centred at (ox, oz).
 */
export function irapayRoof(
  kit: Kit,
  rand: Rand,
  o: { w: number; d: number; y: number; h: number; ox?: number; oz?: number; over?: number; ry?: number },
) {
  const ox = o.ox ?? 0;
  const oz = o.oz ?? 0;
  const over = o.over ?? 0.45;
  const ry = o.ry ?? 0;
  const half = o.d / 2 + over;
  const slope = Math.hypot(half, o.h);
  const pitch = Math.atan2(o.h, half);
  const len = o.w + over * 2;
  const courses = Math.max(3, Math.round(slope / 0.42));
  const cs = Math.cos(ry);
  const sn = Math.sin(ry);
  const place = (lx: number, lz: number): [number, number] => [ox + lx * cs + lz * sn, oz - lx * sn + lz * cs];
  for (const side of [-1, 1]) {
    for (let c = 0; c < courses; c++) {
      // Course c from the eave (0) up to the ridge; each overlaps the one below.
      const u = (c + 0.5) / courses;
      const lz = side * half * (1 - u);
      const yy = o.y + o.h * u;
      const color = c === 0 ? A.thatchDark : rand() < 0.3 ? A.thatchLight : rand() < 0.15 ? A.thatchGreen : A.thatch;
      const [px, pz] = place(0, lz);
      kit.box(len, 0.16, (slope / courses) * 1.35, px, yy - 0.08, pz, color, ry, side * pitch);
    }
    // Ragged leaf tips hanging under the eave.
    for (let x = -len / 2 + 0.1; x < len / 2; x += 0.16 + rand() * 0.12) {
      const [px, pz] = place(x, side * (half + 0.02));
      kit.box(
        0.1 + rand() * 0.08,
        0.2 + rand() * 0.22,
        0.04,
        px,
        o.y - 0.22 - rand() * 0.1,
        pz,
        rand() < 0.5 ? A.thatchDark : A.thatch,
        ry + (rand() - 0.5) * 0.3,
        side * (0.25 + rand() * 0.2),
      );
    }
  }
  // Gable ends: a triangle of thatch slabs closing each end.
  for (const end of [-1, 1]) {
    for (let r = 0; r < 4; r++) {
      const u = (r + 0.5) / 4;
      const [px, pz] = place(end * (o.w / 2 + over * 0.6), 0);
      kit.box(0.08, o.h / 4 + 0.05, half * 2 * (1 - u) * 0.95, px, o.y + o.h * (r / 4), pz, A.thatchDark, ry);
    }
  }
  const [rx, rz] = place(0, 0);
  kit.box(len + 0.1, 0.18, 0.34, rx, o.y + o.h - 0.05, rz, A.thatchDark, ry);
}

/**
 * Conical maloca roof: stacked frustum layers of thatch reaching low (the maloca's roof is almost its wall),
 * ragged tips at the eave, a smoke hood at the apex. Radius r at the eave height y, apex at y + h.
 */
export function coneRoof(kit: Kit, rand: Rand, o: { r: number; y: number; h: number; ox?: number; oz?: number }) {
  const ox = o.ox ?? 0;
  const oz = o.oz ?? 0;
  const layers = 6;
  for (let i = 0; i < layers; i++) {
    const a = i / layers;
    const b = (i + 1.25) / layers;
    const rb = o.r * (1 - a);
    const rt = Math.max(0.05, o.r * (1 - b));
    const color = i === 0 ? A.thatchDark : i % 2 ? A.thatchLight : A.thatch;
    kit.cyl(rt, rb, o.h * (b - a), ox, o.y + o.h * a, oz, color, 18);
  }
  // Hood that lets the smoke out.
  kit.cyl(0.05, 0.55, 0.5, ox, o.y + o.h - 0.2, oz, A.thatchDark, 8);
  kit.cyl(0.07, 0.07, 0.6, ox, o.y + o.h + 0.1, oz, A.wood, 5);
  const n = Math.round(o.r * 2 * Math.PI * 5);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + rand() * 0.04;
    const rr = o.r + 0.02;
    kit.box(
      0.14 + rand() * 0.1,
      0.25 + rand() * 0.25,
      0.04,
      ox + Math.sin(t) * rr,
      o.y - 0.28 - rand() * 0.12,
      oz + Math.cos(t) * rr,
      rand() < 0.5 ? A.thatchDark : A.thatch,
      t,
      0.35,
    );
  }
}

/** Dugout hull geometry: a stretched bowl with pointed ends, open on top, with an inner (darker) skin. */
export function hullGeometries(
  len: number,
  w: number,
  h: number,
): { outer: THREE.BufferGeometry; inner: THREE.BufferGeometry } {
  const make = (s: number) => {
    const g = new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      // Pointed bow and stern: the beam narrows faster toward the ends; the ends rise a little.
      const pinch = 1 - 0.75 * Math.abs(z) ** 2.4;
      p.setXYZ(i, p.getX(i) * (w / 2) * pinch * s, p.getY(i) * h * s + 0.08 * z * z * h, z * (len / 2) * s);
    }
    g.computeVertexNormals();
    return g;
  };
  const outer = make(1);
  const inner = make(0.9);
  // Flip the inner skin's winding so its faces point up into the hull (front faces seen from inside).
  const idx = inner.getIndex();
  if (idx) {
    const a = idx.array as Uint16Array | Uint32Array;
    for (let i = 0; i < a.length; i += 3) {
      const t = a[i + 1] as number;
      a[i + 1] = a[i + 2] as number;
      a[i + 2] = t;
    }
  }
  inner.computeVertexNormals();
  inner.translate(0, 0.02, 0);
  return { outer, inner };
}

/** Adds a dugout canoe (along local Z) at (x, y = waterline, z) to the kit, optionally with thwarts. */
export function dugout(
  kit: Kit,
  o: {
    x: number;
    y: number;
    z: number;
    ry?: number;
    len?: number;
    w?: number;
    h?: number;
    color?: string;
    thwarts?: number;
  },
) {
  const len = o.len ?? 4.6;
  const w = o.w ?? 0.95;
  const h = o.h ?? 0.45;
  const { outer, inner } = hullGeometries(len, w, h);
  const top = o.y + h * 0.75;
  kit.add(outer, o.color ?? A.wood, o.x, top, o.z, 0, o.ry ?? 0, 0);
  kit.add(inner, A.woodDark, o.x, top, o.z, 0, o.ry ?? 0, 0);
  outer.dispose();
  inner.dispose();
  const cs = Math.cos(o.ry ?? 0);
  const sn = Math.sin(o.ry ?? 0);
  const n = o.thwarts ?? 2;
  for (let i = 0; i < n; i++) {
    const lz = (n === 1 ? 0 : -0.5 + i / (n - 1)) * len * 0.5;
    kit.box(w * 0.78, 0.06, 0.2, o.x + lz * sn, top - 0.16, o.z + lz * cs, A.plank, o.ry ?? 0);
  }
}

/**
 * Balsa raft: logs along local Z lashed by two cross poles; top of the logs at y. Kit.cyl turns a cylinder
 * about its own centre (placed at y + h/2), so a lying log's base y is its axis height minus half its length.
 */
export function balsaRaft(kit: Kit, rand: Rand, o: { x0: number; x1: number; z0: number; z1: number; y: number }) {
  const r = 0.17;
  const n = Math.max(2, Math.round((o.x1 - o.x0) / (r * 2)));
  const len = o.z1 - o.z0;
  const cz = (o.z0 + o.z1) / 2;
  for (let i = 0; i < n; i++) {
    const x = o.x0 + ((o.x1 - o.x0) * (i + 0.5)) / n;
    const l = len + (rand() - 0.5) * 0.3;
    kit.cyl(r, r, l, x, o.y - r - l / 2, cz, rand() < 0.35 ? A.balsaDark : A.balsa, 7, Math.PI / 2);
  }
  const pole = o.x1 - o.x0 + 0.3;
  for (const k of [0.15, 0.85]) {
    const z = o.z0 + len * k;
    kit.cyl(0.06, 0.06, pole, (o.x0 + o.x1) / 2, o.y + 0.02 - pole / 2, z, A.woodDark, 5, 0, -Math.PI / 2);
  }
}

/** A simple post-and-rail railing from a to b (local), posts every ~1.2 u, rail at y + 0.85. */
export function railing(kit: Kit, a: [number, number], b: [number, number], y: number | Ground, top = 0.85) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.round(len / 1.2));
  const yAt = (x: number, z: number) => (typeof y === "number" ? y : y(x, z) + 0.05);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / n;
    const z = a[1] + ((b[1] - a[1]) * i) / n;
    kit.cyl(0.05, 0.06, top + 0.05, x, yAt(x, z) - 0.05, z, A.wood, 5);
  }
  const ya = yAt(a[0], a[1]) + top;
  const yb = yAt(b[0], b[1]) + top;
  kit.stick(new THREE.Vector3(a[0], ya, a[1]), new THREE.Vector3(b[0], yb, b[1]), 0.045, A.plank);
  kit.stick(new THREE.Vector3(a[0], ya - 0.42, a[1]), new THREE.Vector3(b[0], yb - 0.42, b[1]), 0.035, A.plankAlt);
}

/** Number of treads of a flight of stairs dropping |ya − yb| (risers of ~0.3). */
const treads = (ya: number, yb: number) => Math.max(3, Math.round(Math.abs(ya - yb) / 0.3));

/**
 * Tread height under a local point of the stairs from (a, ya) to (b, yb) built by `stairs()`: the point is
 * projected on the flight's axis and gets the top of the tread it stands on (for the stair's raised deck).
 */
export function stairY(a: [number, number], ya: number, b: [number, number], yb: number): Ground {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const n = treads(ya, yb);
  return (x, z) => {
    const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
    const i = Math.min(n - 1, Math.floor(u * n));
    return ya + ((yb - ya) * (i + 0.5)) / n;
  };
}

/** Steep plank stairs from (a, ya) down to (b, yb) in local x/z, width w, with stringers. */
export function stairs(kit: Kit, a: [number, number], ya: number, b: [number, number], yb: number, w = 1.1) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  const ry = Math.atan2(dx, dz);
  const steps = treads(ya, yb);
  for (let i = 0; i < steps; i++) {
    const u = (i + 0.5) / steps;
    kit.box(w, 0.06, len / steps + 0.08, a[0] + dx * u, ya + (yb - ya) * u - 0.06, a[1] + dz * u, A.plank, ry);
  }
  const ux = Math.cos(ry);
  const uz = -Math.sin(ry);
  for (const s of [-1, 1]) {
    const ox = (ux * s * w) / 2;
    const oz = (uz * s * w) / 2;
    kit.stick(
      new THREE.Vector3(a[0] + ox, ya - 0.1, a[1] + oz),
      new THREE.Vector3(b[0] + ox, yb - 0.1, b[1] + oz),
      0.06,
      A.woodDark,
    );
  }
}

/** A bunch of bananas / a sack / a crate: small market goods (decor). */
export function goods(
  kit: Kit,
  rand: Rand,
  x: number,
  y: number,
  z: number,
  kind: "crate" | "sack" | "bananas" | "pot",
) {
  if (kind === "crate") {
    kit.box(0.42, 0.3, 0.32, x, y, z, A.plankAlt, rand() * 0.6);
    kit.box(0.44, 0.04, 0.34, x, y + 0.3, z, A.wood, rand() * 0.6);
  } else if (kind === "sack") {
    kit.cyl(0.14, 0.2, 0.38, x, y, z, A.bark, 7);
    kit.cyl(0.05, 0.12, 0.08, x, y + 0.38, z, A.rope, 6);
  } else if (kind === "bananas") {
    kit.cyl(0.03, 0.03, 0.4, x, y, z, A.leafDark, 5);
    for (let i = 0; i < 6; i++)
      kit.cyl(
        0.05,
        0.035,
        0.22,
        x + Math.sin(i) * 0.08,
        y + 0.08 + i * 0.04,
        z + Math.cos(i) * 0.08,
        A.banana,
        5,
        0.3,
        0.4 * Math.sin(i * 2),
      );
  } else {
    kit.cyl(0.12, 0.18, 0.3, x, y, z, A.clay, 9);
    kit.cyl(0.1, 0.12, 0.06, x, y + 0.3, z, A.clayDark, 9);
  }
}

// ------------------------------------------------------------------------------------------------ signs

export interface SignSpec {
  /** Atlas cell. */
  i: number;
  w: number;
  h: number;
  /** Local placement: position and yaw (planes face +Z before the yaw). */
  x: number;
  y: number;
  z: number;
  ry?: number;
  rx?: number;
}

export interface SignBoards {
  mesh: THREE.Mesh;
  dispose(): void;
}

/**
 * Carved signs of one station: a canvas atlas (one texture, one unlit material, no ink outline, ink-masked
 * like the mountain's signs) and every sign plane merged into ONE mesh. The atlas redraws once fonts load.
 */
export function signBoards(
  env: WorldEnv,
  cells: number,
  cw: number,
  ch: number,
  draw: (ctx: CanvasRenderingContext2D, i: number, cw: number, ch: number) => void,
  specs: SignSpec[],
  name: string,
): SignBoards {
  const n = Math.max(1, cells);
  const drawAll = (ctx: CanvasRenderingContext2D) => {
    for (let i = 0; i < n; i++) {
      ctx.save();
      ctx.translate(0, i * ch);
      ctx.beginPath();
      ctx.rect(0, 0, cw, ch);
      ctx.clip();
      draw(ctx, i, cw, ch);
      ctx.restore();
    }
  };
  const tex = canvasTex(cw, ch * n, drawAll);
  const material = new THREE.MeshBasicMaterial({ map: tex, color: "#ece4d6" });
  const parts: THREE.BufferGeometry[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  for (const s of specs) {
    const g = new THREE.PlaneGeometry(s.w, s.h);
    const uv = g.getAttribute("uv") as THREE.BufferAttribute;
    const v0 = 1 - (s.i + 1) / n;
    const v1 = 1 - s.i / n;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) > 0.5 ? v1 : v0);
    m4.compose(
      new THREE.Vector3(s.x, s.y, s.z),
      q.setFromEuler(e.set(s.rx ?? 0, s.ry ?? 0, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    g.applyMatrix4(m4);
    parts.push(g);
  }
  const merged = (parts.length ? mergeGeometries(parts, false) : null) ?? new THREE.BufferGeometry();
  for (const g of parts) g.dispose();
  merged.computeBoundingSphere();
  const mesh = new THREE.Mesh(merged, material);
  mesh.name = `${name}:signs`;
  env.noOutline(mesh);
  inkMask(mesh);
  const refresh = () => redraw(tex, drawAll);
  onFontsReady(refresh);
  return {
    mesh,
    dispose() {
      offFontsReady(refresh);
      merged.dispose();
      tex.dispose();
      material.dispose();
    },
  };
}

/** Carved-wood background for a sign cell: plank grain, a dark border and pegs. */
export function drawCarved(ctx: CanvasRenderingContext2D, w: number, h: number, fill = "#8a5a34") {
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(40,22,10,0.28)";
  ctx.lineWidth = 2;
  for (let y = 8; y < h; y += 11) {
    ctx.beginPath();
    ctx.moveTo(0, y + Math.sin(y) * 2);
    ctx.bezierCurveTo(w * 0.3, y - 3, w * 0.6, y + 4, w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#2a1709";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, w - 6, h - 6);
  ctx.fillStyle = "#2a1709";
  for (const [px, py] of [
    [12, 12],
    [w - 12, 12],
    [12, h - 12],
    [w - 12, h - 12],
  ] as const) {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Distance-based visibility of a station group (cheap manual cull; the jungle road is ~800 u long). */
export function stationCull(group: THREE.Object3D, center: THREE.Vector3, far = 190) {
  const f2 = far * far;
  return (camera: THREE.Camera) => {
    const p = camera.position;
    group.visible = (p.x - center.x) ** 2 + (p.z - center.z) ** 2 < f2;
    return group.visible;
  };
}

/** Disposes every geometry under root and removes it from its parent (materials are disposed by the owner). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.geometry.dispose();
  });
  root.removeFromParent();
}
