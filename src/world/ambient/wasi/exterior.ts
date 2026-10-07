/**
 * Wasi exterior: the owner's Andean house at the trailhead, always built (cheap: a handful of merged,
 * vertex-coloured meshes). Adobe walls in cream and ochre plaster over a stone plinth, with patches of bare
 * adobe brick at the base; a red teja (clay tile) gable roof with a ridge, rafter ends and a pair of
 * Pucará toritos; a carved double door swung open against the facade; windows with shutters in khipu dyes
 * and a little wooden balcón de cajón; a levelled stone plinth with a flagstone terrace along the front and
 * stone steps down to a flagstone walk to the trail, a bench, clay pots and macetas with flowers.
 *
 * The floor is level (plan.ts `platform()`: the highest terrain under the rooms + a lift), registered as a
 * raised deck by ../wasi.ts so core stands the traveler on it. Each wall's stone plinth runs from below the
 * lowest terrain along it up to the floor, so it grows on the downhill side; the terrace and the steps are
 * stone blocks down to the terrain. `floor(lx, lz)` is that walking surface (plinth, steps, else terrain).
 *
 * Draw calls: walls ×4 (one group each so camera-facing ones can drop to a cutaway), window panes ×2
 * (their own material: they glow warm at night), roof ×1 (fades while inside), porch/walk/garden ×1,
 * door plaque ×1, lantern ×2 (flame + glow, night only).
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { DYE } from "../../palette";
import {
  C,
  canvasTex,
  drawBoard,
  FONT,
  fitFont,
  glowSprite,
  Kit,
  offFontsReady,
  onFontsReady,
  redraw,
  rng,
  stoneWall,
  toonMapped,
} from "../../props";
import { WASI } from "../../trailhead";
import {
  BACK_WINDOWS,
  DOOR,
  FRONT_WINDOWS,
  GARDEN,
  HD,
  HEADROOM,
  HW,
  onPlinth,
  type Platform,
  STEP_D,
  STEP_W,
  T,
  TERRACE_D,
  toLocal,
  toWorld,
  WALK,
  WALK_R,
  WINDOW,
} from "./plan";

/** House palette (flat toon colours). */
export const W_COL = {
  plaster: "#ecd9b0",
  ochre: "#d49a52",
  adobe: "#b2703f",
  adobeDark: "#94582f",
  teja: "#b9452c",
  tejaLight: "#cc5a36",
  tejaDark: "#8e3322",
  wood: C.wood,
  woodDark: C.woodDark,
  stone: C.stone,
  stoneDark: C.stoneDark,
  flag: "#a9a090",
  clay: "#b8653a",
  clayDark: "#8f4a2a",
  leaf: "#5f8f55",
  pane: "#2f3a52",
} as const;

/** World x where the walk meets the trail's west curb (trail centre ≈ 42.0 there, half width 2.6). */
const TRAIL_EDGE_X = 39.2;
/** Roof rise above the eaves and overhangs. */
const RISE = 1.75;
const OV_Z = 0.55;
const OV_X = 0.45;

export interface WallSet {
  front: THREE.Group;
  back: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
}

export interface WasiExterior {
  /** Positioned at (WASI.x, y0, WASI.z) with rotation.y = WASI.yaw. */
  group: THREE.Group;
  walls: WallSet;
  roof: THREE.Group;
  /** Local height of the walking surface (level floor on the plinth, step treads, else terrain). */
  floor(lx: number, lz: number): number;
  /** Local y of the level eave line. */
  eave: number;
  setNight(night: boolean): void;
  /** Hides the facade extras (balcony, lantern, plaque) while the front wall is cut away. */
  syncCut(): void;
  update(t: number): void;
  dispose(): void;
}

/**
 * `terrain` is the bare world terrain (env.heightAt: never a deck-aware ground, the plinth is a deck) and
 * `plat` the levelled platform computed from it (plan.ts).
 */
export function buildExterior(env: WorldEnv, terrain: (x: number, z: number) => number, plat: Platform): WasiExterior {
  const rand = rng(7319);
  const y0 = terrain(WASI.x, WASI.z);
  /** Terrain relative to the group origin. */
  const ground = (lx: number, lz: number) => {
    const p = toWorld(lx, lz);
    return terrain(p.x, p.z) - y0;
  };
  const F = plat.floor - y0;
  const floor = (lx: number, lz: number) => {
    if (onPlinth(lx, lz)) return F;
    for (const st of plat.steps)
      if (lx >= st.box.x0 && lx <= st.box.x1 && lz >= st.box.z0 && lz <= st.box.z1) return st.y - y0;
    return ground(lx, lz);
  };
  /** Lowest terrain and highest walking surface along a local segment. */
  const span = (ax: number, az: number, bx: number, bz: number) => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i <= 24; i++) {
      const k = i / 24;
      const x = ax + (bx - ax) * k;
      const z = az + (bz - az) * k;
      lo = Math.min(lo, ground(x, z));
      hi = Math.max(hi, floor(x, z));
    }
    return { lo, hi };
  };
  const eave = F + HEADROOM;

  const group = new THREE.Group();
  group.name = "wasi";
  group.position.set(WASI.x, y0, WASI.z);
  group.rotation.y = WASI.yaw;
  const vmat = vertexToon();
  const owned: { geos: THREE.BufferGeometry[]; mats: THREE.Material[]; texs: THREE.Texture[] } = {
    geos: [],
    mats: [vmat],
    texs: [],
  };

  // Window glass: one material for every pane (dark by day, warm lamplight at night).
  const paneMat = env.toon(W_COL.pane).clone();
  owned.mats.push(paneMat);

  const finish = (g: THREE.Group, k: Kit, name: string, shadow = true) => {
    const built = k.build(name);
    const merged = flattenToonGroup(built, vmat);
    for (const c of [...built.children]) g.add(c);
    if (merged) {
      merged.castShadow = shadow;
      merged.receiveShadow = true;
    }
    return g;
  };

  // ------------------------------------------------------------------ walls
  /**
   * One wall from (ax, az) to (bx, bz) in local space, built inside a group whose origin sits just below the
   * lowest terrain along it (so the cutaway's y-scale keeps the wall planted). `gaps`: openings along the
   * wall's length (distance from a), each from the floor up to `top` above the floor.
   */
  const wall = (
    name: string,
    ax: number,
    az: number,
    bx: number,
    bz: number,
    opts: {
      gaps?: Array<{ s0: number; s1: number; top: number }>;
      windows?: Array<{ s: number; shutters: boolean }>;
      /** Extra parts merged into this wall's mesh (in its frame: origin at `base`). */
      decorate?: (k: Kit, base: number) => void;
    } = {},
  ) => {
    const g = new THREE.Group();
    g.name = name;
    const { lo, hi } = span(ax, az, bx, bz);
    const base = lo - 0.3;
    g.position.y = base;
    const k = new Kit(env);
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    const ry = Math.atan2(-(bz - az), bx - ax);
    // Outward normal (away from the house centre).
    let nx = uz;
    let nz = -ux;
    if (nx * (ax + bx) + nz * (az + bz) < 0) {
      nx = -nx;
      nz = -nz;
    }
    const top = eave - base;
    const plinth = hi - base + 0.32;
    const dado = plinth + 0.55;
    // Plaster: ochre dado band, cream above, over a stone plinth. Split around gaps.
    const gaps = (opts.gaps ?? []).slice().sort((p, q) => p.s0 - q.s0);
    const pieces: Array<[number, number]> = [];
    let s = 0;
    for (const gp of gaps) {
      if (gp.s0 > s) pieces.push([s, gp.s0]);
      s = gp.s1;
    }
    if (s < len) pieces.push([s, len]);
    const slab = (s0: number, s1: number, yb: number, yt: number, color: string, thick = T) => {
      if (s1 - s0 < 0.02 || yt - yb < 0.02) return;
      const m = (s0 + s1) / 2;
      k.box(s1 - s0, yt - yb, thick, ax + ux * m, yb, az + uz * m, color, ry);
    };
    const courses = Math.max(2, Math.round(plinth / 0.34));
    for (const [p0, p1] of pieces) {
      // Stone plinth (ashlar courses), a little proud of the plaster.
      stoneWall(k, rand, ax + ux * p0, az + uz * p0, ax + ux * p1, az + uz * p1, 0, plinth, T + 0.1, { courses });
      slab(p0, p1, plinth, dado, W_COL.ochre);
      slab(p0, p1, dado, top, W_COL.plaster);
    }
    for (const gp of gaps) {
      // Above the opening: plaster, with a wooden lintel.
      const gm = (gp.s0 + gp.s1) / 2;
      const fy = floor(ax + ux * gm, az + uz * gm) - base;
      slab(gp.s0, gp.s1, fy + gp.top + 0.18, top, W_COL.plaster);
      k.box(gp.s1 - gp.s0 + 0.5, 0.2, T + 0.12, ax + ux * gm, fy + gp.top, az + uz * gm, W_COL.woodDark, ry);
      // Under the opening: stone up to the threshold.
      slab(gp.s0, gp.s1, 0, fy - 0.04, W_COL.stoneDark, T + 0.1);
    }
    // Patches of bare adobe brick where the plaster has worn off near the base.
    const patches = 2 + Math.floor(rand() * 2);
    for (let i = 0; i < patches; i++) {
      const pm = 0.8 + rand() * (len - 1.6);
      if (gaps.some((gp) => pm > gp.s0 - 0.8 && pm < gp.s1 + 0.8)) continue;
      const rows = 2 + Math.floor(rand() * 2);
      for (let r = 0; r < rows; r++) {
        const n = 2 + Math.floor(rand() * 2);
        for (let c = 0; c < n; c++) {
          const sm = pm + (c - n / 2) * 0.4 + (r % 2 ? 0.2 : 0);
          const px = ax + ux * sm + nx * (T / 2 + 0.015);
          const pz = az + uz * sm + nz * (T / 2 + 0.015);
          k.box(0.36, 0.15, 0.05, px, plinth + 0.08 + r * 0.18, pz, r % 2 ? W_COL.adobe : W_COL.adobeDark, ry);
        }
      }
    }
    // Windows: frame, sill, shutters open against the wall (khipu dyes).
    const dyes = [DYE.turq, DYE.red, DYE.indigo, DYE.ochre];
    const paneParts: THREE.BufferGeometry[] = [];
    for (const [wi, { s: wsm, shutters }] of (opts.windows ?? []).entries()) {
      const wx = ax + ux * wsm;
      const wz = az + uz * wsm;
      const fy = floor(wx - nx * 0.5, wz - nz * 0.5) - base;
      const wy0 = fy + WINDOW.y0;
      const wy1 = fy + WINDOW.y1;
      const ww = WINDOW.w;
      const pane = new THREE.BoxGeometry(ww, wy1 - wy0, T + 0.04);
      pane.rotateY(ry);
      pane.translate(wx, (wy0 + wy1) / 2, wz);
      paneParts.push(pane);
      const ox = nx * (T / 2 + 0.04);
      const oz = nz * (T / 2 + 0.04);
      k.box(ww + 0.24, 0.1, T + 0.2, wx + nx * 0.04, wy0 - 0.1, wz + nz * 0.04, W_COL.woodDark, ry);
      k.box(ww + 0.2, 0.12, T + 0.08, wx, wy1, wz, W_COL.woodDark, ry);
      for (const sd of [-1, 1]) {
        k.box(
          0.09,
          wy1 - wy0,
          T + 0.08,
          wx + ux * sd * (ww / 2 + 0.045),
          wy0,
          wz + uz * sd * (ww / 2 + 0.045),
          W_COL.woodDark,
          ry,
        );
        if (!shutters) continue;
        // Shutter leaf, swung open flat against the wall, with a painted border and centre.
        const so = sd * (ww / 2 + 0.31);
        const dye = dyes[(wi * 2 + (sd > 0 ? 1 : 0)) % dyes.length]!;
        k.box(0.52, wy1 - wy0 + 0.04, 0.05, wx + ux * so + ox, wy0 - 0.02, wz + uz * so + oz, dye, ry);
        k.box(
          0.3,
          (wy1 - wy0) * 0.62,
          0.03,
          wx + ux * so + ox * 1.6,
          wy0 + (wy1 - wy0) * 0.19,
          wz + uz * so + oz * 1.6,
          W_COL.plaster,
          ry,
        );
      }
      // Mullion cross.
      k.box(0.05, wy1 - wy0, 0.05, wx + nx * (T / 2 + 0.02), wy0, wz + nz * (T / 2 + 0.02), W_COL.woodDark, ry);
      k.box(ww, 0.05, 0.05, wx + nx * (T / 2 + 0.02), (wy0 + wy1) / 2, wz + nz * (T / 2 + 0.02), W_COL.woodDark, ry);
    }
    opts.decorate?.(k, base);
    finish(g, k, name);
    if (paneParts.length) {
      const merged = paneParts.length > 1 ? mergeGeos(paneParts) : paneParts[0]!;
      const pm = new THREE.Mesh(merged, paneMat);
      pm.name = `${name}:panes`;
      owned.geos.push(merged);
      g.add(pm);
    }
    group.add(g);
    return { g, base };
  };

  const dl = DOOR.x - DOOR.w / 2;
  const dr = DOOR.x + DOOR.w / 2;
  const zf = HD - T / 2;
  const zb = -HD + T / 2;
  const xl = -HW + T / 2;
  const xr = HW - T / 2;
  // Door: frame, threshold and the two carved leaves swung open flat against the facade (merged into the
  // front wall's mesh, so it follows the cutaway).
  const buildDoor = (k: Kit, fb: number) => {
    const fy = floor(DOOR.x, HD) - fb;
    const zo = HD + 0.02;
    k.box(0.16, DOOR.h, 0.22, dl - 0.06, fy, zo - 0.08, W_COL.woodDark);
    k.box(0.16, DOOR.h, 0.22, dr + 0.06, fy, zo - 0.08, W_COL.woodDark);
    k.box(DOOR.w + 0.1, 0.12, T + 0.2, DOOR.x, fy - 0.08, HD - T / 2, W_COL.stoneDark);
    const leaf = (x0: number, x1: number) => {
      const w = x1 - x0;
      const cx = (x0 + x1) / 2;
      k.box(w, DOOR.h - 0.08, 0.08, cx, fy + 0.04, zo + 0.04, W_COL.wood);
      // Carved panels (raised, darker) and a chakana inlay in the middle.
      for (const py of [0.25, 1.35])
        for (const px of [-0.2, 0.2]) k.box(0.3, 0.85, 0.04, cx + px * (w / 0.9), fy + py, zo + 0.09, W_COL.woodDark);
      k.box(0.34, 0.12, 0.03, cx, fy + 1.18, zo + 0.12, DYE.ochre);
      k.box(0.12, 0.34, 0.03, cx, fy + 1.07, zo + 0.12, DYE.ochre);
      k.box(0.06, 0.06, 0.04, cx, fy + 1.21, zo + 0.14, DYE.red);
      // Iron ring pull.
      k.cyl(
        0.05,
        0.05,
        0.03,
        cx + (x0 < 0 ? w / 2 - 0.12 : -w / 2 + 0.12),
        fy + 1.05,
        zo + 0.11,
        "#3a3430",
        8,
        Math.PI / 2,
      );
    };
    leaf(dl - DOOR.w / 2, dl - 0.02);
    leaf(dr + 0.02, dr + DOOR.w / 2);
  };

  // Front wall runs left → right along +x at z = zf (s = x + HW).
  const front = wall("wasi-wall-front", -HW, zf, HW, zf, {
    gaps: [{ s0: dl + HW, s1: dr + HW, top: DOOR.h }],
    // The left window carries the balcón de cajón (no shutters); the right one has shutters and a flower box.
    windows: FRONT_WINDOWS.map((x, i) => ({ s: x + HW, shutters: i === 1 })),
    decorate: buildDoor,
  });
  const back = wall("wasi-wall-back", -HW, zb, HW, zb, {
    windows: BACK_WINDOWS.map((x) => ({ s: x + HW, shutters: true })),
  });
  const left = wall("wasi-wall-left", xl, -HD + T, xl, HD - T);
  const right = wall("wasi-wall-right", xr, -HD + T, xr, HD - T);

  // Balcón de cajón on the left front window: a projecting wooden box with lattice and a little roof.
  // The flower box and the door lantern share its mesh (facade extras, hidden while the wall is cut).
  const LX = 2.2;
  const lanternY = floor(LX, HD) - front.base + 2.15;
  const balcony = new THREE.Group();
  {
    const k = new Kit(env);
    const wx = FRONT_WINDOWS[0];
    const fb = front.base;
    const fy = floor(wx, HD) - fb;
    const by = fy + WINDOW.y0 - 0.32;
    const bw = WINDOW.w + 0.9;
    const bd = 0.5;
    const zo = HD + bd / 2;
    k.box(bw, 0.1, bd, wx, by, zo, W_COL.woodDark);
    k.box(bw + 0.12, 0.08, bd + 0.12, wx, fy + WINDOW.y1 + 0.18, zo, W_COL.woodDark);
    k.box(bw + 0.2, 0.06, bd + 0.2, wx, fy + WINDOW.y1 + 0.26, zo + 0.03, W_COL.teja);
    for (const sx of [-1, 1]) {
      k.box(0.08, WINDOW.y1 - WINDOW.y0 + 0.5, 0.08, wx + sx * (bw / 2 - 0.04), by, HD + bd - 0.04, W_COL.woodDark);
      k.box(0.08, WINDOW.y1 - WINDOW.y0 + 0.5, bd, wx + sx * (bw / 2 - 0.04), by, zo, W_COL.wood);
      // Carved corbel under the box.
      k.box(0.12, 0.3, bd * 0.9, wx + sx * (bw / 2 - 0.25), by - 0.3, zo - 0.04, W_COL.woodDark);
    }
    // Lower solid panel (painted turquoise) and upper lattice slats.
    k.box(bw - 0.12, 0.42, 0.05, wx, by + 0.1, HD + bd - 0.02, DYE.turq);
    for (let i = 0; i < 9; i++) {
      const sx = wx - bw / 2 + 0.16 + i * ((bw - 0.32) / 8);
      k.box(0.04, WINDOW.y1 - WINDOW.y0 - 0.25, 0.04, sx, by + 0.56, HD + bd - 0.02, W_COL.wood);
    }
    k.box(bw - 0.12, 0.05, 0.05, wx, by + 0.56, HD + bd - 0.02, W_COL.woodDark);
    // Flower box on the right window sill.
    const lx = FRONT_WINDOWS[1];
    const ly = floor(lx, HD) - fb + WINDOW.y0 - 0.22;
    k.box(WINDOW.w + 0.1, 0.2, 0.26, lx, ly, HD + 0.2, W_COL.clay);
    for (let i = 0; i < 6; i++) {
      const fx = lx - WINDOW.w / 2 + 0.1 + i * 0.17;
      k.cyl(0.03, 0.03, 0.12, fx, ly + 0.2, HD + 0.2, W_COL.leaf, 5);
      k.add(
        sphere,
        i % 2 ? DYE.red : "#e86f9a",
        fx,
        ly + 0.35,
        HD + 0.2 + (rand() - 0.5) * 0.06,
        0,
        0,
        0,
        0.09,
        0.08,
        0.09,
      );
    }
    // Wall lantern bracket beside the door, between the right leaf and the right window.
    k.box(0.06, 0.06, 0.34, LX, lanternY + 0.3, HD + 0.17, W_COL.woodDark);
    k.box(0.24, 0.05, 0.24, LX, lanternY + 0.28, HD + 0.36, "#3a3430");
    k.box(0.2, 0.05, 0.2, LX, lanternY - 0.02, HD + 0.36, "#3a3430");
    balcony.name = "wasi-balcony";
    finish(balcony, k, "wasi-balcony");
    front.g.add(balcony);
  }

  // Plaque over the door: "WASI" carved on a board.
  const plaqueDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    drawBoard(ctx, w, h, "#9a6a40");
    ctx.fillStyle = "#2a1a10";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = "WASI";
    fitFont(ctx, label, "800", FONT.display, 58, w - 40, "condensed ");
    ctx.fillText(label, w / 2, h / 2 + 3);
    ctx.fillStyle = DYE.red;
    for (const x of [26, w - 26]) ctx.fillRect(x - 7, h / 2 - 7, 14, 14);
  };
  const plaqueTex = canvasTex(256, 80, plaqueDraw);
  owned.texs.push(plaqueTex);
  const plaqueRe = () => redraw(plaqueTex, plaqueDraw);
  onFontsReady(plaqueRe);
  const plaqueMat = toonMapped(env, plaqueTex);
  owned.mats.push(plaqueMat);
  const plaqueGeo = new THREE.PlaneGeometry(1.15, 0.36);
  owned.geos.push(plaqueGeo);
  const plaque = new THREE.Mesh(plaqueGeo, plaqueMat);
  plaque.name = "wasi-plaque";
  plaque.position.set(DOOR.x, floor(DOOR.x, HD) - front.base + DOOR.h + 0.45, HD + 0.03);
  front.g.add(plaque);

  // The lantern's flame and glow (lit at night).
  const flameMat = new THREE.MeshBasicMaterial({ color: "#ffd08a", toneMapped: false });
  owned.mats.push(flameMat);
  const flameGeo = new THREE.BoxGeometry(0.16, 0.26, 0.16);
  owned.geos.push(flameGeo);
  const flame = new THREE.Mesh(flameGeo, flameMat);
  flame.position.set(LX, lanternY + 0.15, HD + 0.36);
  env.noOutline(flame);
  const glow = glowSprite(env, C.torch, 2.2);
  glow.position.copy(flame.position);
  owned.mats.push(glow.material as THREE.Material);
  balcony.add(flame, glow);
  /** Facade pieces that would float or squash when the front wall drops to the cutaway. */
  const facade = [balcony, plaque];

  // ------------------------------------------------------------------ roof (fades while inside)
  const roof = new THREE.Group();
  roof.name = "wasi-roof";
  {
    const k = new Kit(env);
    const A = Math.atan2(RISE, HD);
    const tanA = RISE / HD;
    const L = Math.hypot(HD + OV_Z, (HD + OV_Z) * tanA);
    const width = HW * 2 + OV_X * 2;
    const slabT = 0.16;
    for (const side of [1, -1]) {
      // Slope from the ridge (z = 0, y = eave + RISE) down past the wall to the eave lip.
      const zEnd = side * (HD + OV_Z);
      const yEnd = eave + RISE - (HD + OV_Z) * tanA;
      const cz = zEnd / 2;
      const cy = (eave + RISE + yEnd) / 2;
      const rx = side * A;
      // Outward normal of this slope.
      const nY = Math.cos(A);
      const nZ = side * Math.sin(A);
      k.add(boxProto, W_COL.tejaDark, 0, cy, cz, rx, 0, 0, width, slabT, L);
      // Tile columns (canal tiles), two reds alternating.
      const cols = Math.floor(width / 0.3);
      for (let i = 0; i < cols; i++) {
        const x = -width / 2 + 0.15 + i * (width / cols);
        const lift = slabT / 2 + 0.05;
        k.add(
          boxProto,
          i % 2 ? W_COL.teja : W_COL.tejaLight,
          x,
          cy + nY * lift,
          cz + nZ * lift,
          rx,
          0,
          0,
          0.2,
          0.1,
          L - 0.05,
        );
      }
      // Tile courses: a darker lip every ~0.5 down the slope.
      for (let d = 0.35; d < L - 0.1; d += 0.5) {
        const zz = side * d * Math.cos(A);
        const yy = eave + RISE - d * Math.sin(A);
        const lift = slabT / 2 + 0.1;
        k.add(boxProto, W_COL.tejaDark, 0, yy + nY * lift, zz + nZ * lift, rx, 0, 0, width, 0.05, 0.07);
      }
      // Fascia board and rafter ends under the eave.
      k.add(boxProto, W_COL.woodDark, 0, yEnd - 0.08, zEnd, 0, 0, 0, width, 0.14, 0.08);
      for (let x = -HW + 0.4; x <= HW - 0.3; x += 1.1)
        k.add(boxProto, W_COL.woodDark, x, eave - 0.06, side * (HD + 0.2), 0, 0, 0, 0.14, 0.14, 0.7);
    }
    // Ridge cap: a row of round ridge tiles.
    k.cyl(0.17, 0.17, width + 0.1, 0, eave + RISE + 0.07 - (width + 0.1) / 2, 0, W_COL.tejaDark, 8, 0, Math.PI / 2);
    // Pucará toritos and a small iron cross on the ridge, the classic blessing of a new roof.
    const ry = eave + RISE + 0.2;
    for (const sx of [-1, 1]) {
      const bx = sx * 0.42;
      k.box(0.34, 0.2, 0.16, bx, ry, 0, W_COL.plaster);
      k.box(0.14, 0.15, 0.14, bx + sx * 0.2, ry + 0.12, 0, W_COL.plaster);
      k.box(0.24, 0.04, 0.04, bx + sx * 0.22, ry + 0.27, 0, W_COL.plaster);
      for (const lz of [-0.05, 0.05])
        for (const lxo of [-0.12, 0.12]) k.box(0.05, 0.1, 0.05, bx + lxo, ry - 0.08, lz, W_COL.plaster);
      k.box(0.36, 0.04, 0.17, bx, ry + 0.1, 0, DYE.red);
    }
    k.box(0.05, 0.5, 0.05, 0, ry, 0, "#3a3430");
    k.box(0.26, 0.05, 0.05, 0, ry + 0.33, 0, "#3a3430");
    // Gable triangles on the side walls, each with a small round vent. They belong to the roof (not the
    // walls) so they fade with it instead of squashing into the cutaway.
    for (const gx of [xl, xr]) {
      const shape = new THREE.Shape();
      shape.moveTo(-HD - 0.02, 0);
      shape.lineTo(HD + 0.02, 0);
      shape.lineTo(0, RISE);
      shape.closePath();
      const tri = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false });
      tri.translate(0, 0, -T / 2);
      // Shape x → local z, extrusion → local x.
      tri.rotateY(Math.PI / 2);
      k.add(tri, W_COL.plaster, gx, eave, 0);
      tri.dispose();
      // (Horizontal cylinders: Kit.cyl puts the base at y, so pass the centre minus half the length.)
      k.cyl(0.2, 0.2, T + 0.06, gx, eave + RISE * 0.42 - (T + 0.06) / 2, 0, W_COL.woodDark, 10, 0, Math.PI / 2);
      k.cyl(0.13, 0.13, T + 0.1, gx, eave + RISE * 0.42 - (T + 0.1) / 2, 0, W_COL.pane, 10, 0, Math.PI / 2);
    }
    // Ceiling beams (vigas) across the rooms, under the roof so they fade with it.
    for (let x = -HW + 1.1; x < HW - 0.5; x += 1.6) k.box(0.18, 0.18, HD * 2, x, eave - 0.2, 0, W_COL.woodDark);
    finish(roof, k, "wasi-roof");
  }
  group.add(roof);

  // ------------------------------------------------------------------ terrace, steps, walk, garden (one mesh)
  {
    const k = new Kit(env);
    /** Lowest terrain along a local segment (stone faces start a little below it). */
    const low = (ax: number, az: number, bx: number, bz: number) => span(ax, az, bx, bz).lo - 0.3;
    // Terrace: a stone fill under the flagstones with ashlar faces on its open sides (front and both ends);
    // the steps leave a gap in the front face.
    const tz1 = HD + TERRACE_D;
    const tb = low(-HW, HD, -HW, tz1);
    const tbR = low(HW, HD, HW, tz1);
    const fb = low(-HW, tz1, HW, tz1);
    const base = Math.min(tb, tbR, fb);
    k.box(HW * 2 - 0.1, F - 0.02 - base, TERRACE_D - 0.05, 0, base, HD + TERRACE_D / 2, W_COL.stoneDark);
    const face = (ax: number, az: number, bx: number, bz: number, b: number) =>
      stoneWall(k, rand, ax, az, bx, bz, b, F - b, 0.3, { courses: Math.max(2, Math.round((F - b) / 0.34)) });
    face(-HW + 0.12, HD, -HW + 0.12, tz1 - 0.12, tb);
    face(HW - 0.12, HD, HW - 0.12, tz1 - 0.12, tbR);
    face(-HW, tz1 - 0.12, DOOR.x - STEP_W / 2, tz1 - 0.12, fb);
    face(DOOR.x + STEP_W / 2, tz1 - 0.12, HW, tz1 - 0.12, fb);
    // Steps: stone blocks down to the terrain with a dressed flagstone tread on each.
    for (const st of plat.steps) {
      const b = low(st.box.x0, st.box.z1, st.box.x1, st.box.z1);
      const ty = st.y - y0;
      const cz = (st.box.z0 + st.box.z1) / 2;
      const w = st.box.x1 - st.box.x0;
      k.box(w, ty - 0.07 - b, STEP_D + 0.02, DOOR.x, b, cz, rand() < 0.5 ? W_COL.stone : W_COL.stoneDark);
      k.box(w + 0.08, 0.09, STEP_D + 0.06, DOOR.x, ty - 0.08, cz + 0.02, W_COL.flag);
    }
    const seat = (lx: number, lz: number, w: number, d: number, color: string, ryy = 0, lift = 0.06) => {
      // Flagstone seated on the slope: top just above the highest corner, base below the lowest.
      let hi = Number.NEGATIVE_INFINITY;
      let lo = Number.POSITIVE_INFINITY;
      for (const [ox, oz] of [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
        [0, 0],
      ] as const) {
        const c = Math.cos(ryy);
        const s = Math.sin(ryy);
        const h = floor(lx + ox * c + oz * s, lz - ox * s + oz * c);
        hi = Math.max(hi, h);
        lo = Math.min(lo, h);
      }
      k.box(w, hi + lift - (lo - 0.15), d, lx, lo - 0.15, lz, color, ryy);
    };
    // Terrace paving: dressed stones over the whole terrace (flush with the level floor).
    for (let x = -HW + 0.35; x <= HW - 0.3; x += 0.6)
      for (let z = HD + 0.35; z <= HD + TERRACE_D - 0.1; z += 0.55)
        seat(
          x + (rand() - 0.5) * 0.06,
          z,
          0.54,
          0.5,
          rand() < 0.3 ? W_COL.stoneDark : W_COL.flag,
          (rand() - 0.5) * 0.08,
          0.04,
        );
    // Walk: two staggered flagstones every ~0.6 along the path to the trail (local frame).
    const pts = WALK.map(([x, z]) => toLocal(x, z));
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const ryy = Math.atan2(b.x - a.x, b.z - a.z);
      const px = (b.z - a.z) / len;
      const pz = -(b.x - a.x) / len;
      for (let d = i === 0 ? 0.2 : 0; d < len; d += 0.62) {
        const cx = a.x + ((b.x - a.x) * d) / len;
        const cz = a.z + ((b.z - a.z) * d) / len;
        // Stop at the trail's curb (the paved band takes over there).
        if (toWorld(cx, cz).x > TRAIL_EDGE_X) break;
        const sw = ((Math.round(d / 0.62) % 2) - 0.5) * 0.3;
        for (const off of [-0.34 + sw, 0.36 + sw]) {
          if (Math.abs(off) > WALK_R - 0.25) continue;
          seat(
            cx + px * off,
            cz + pz * off,
            0.5 + rand() * 0.12,
            0.46,
            rand() < 0.3 ? W_COL.stoneDark : W_COL.flag,
            ryy + (rand() - 0.5) * 0.3,
            0.05,
          );
        }
      }
    }
    // Garden: bench, big clay pot (tinaja), macetas with flowers (plan.ts GARDEN holds their colliders).
    for (const it of GARDEN) {
      const gy = floor(it.x, it.z);
      if (it.id === "bench" && it.x < 2.6) {
        // Wooden bench along the facade (two collider discs, one model).
        const bx = 2.6;
        k.box(1.3, 0.08, 0.4, bx, gy + 0.42, it.z, W_COL.wood);
        for (const sx of [-0.55, 0.55]) k.box(0.1, 0.42, 0.34, bx + sx, gy - 0.05, it.z, W_COL.woodDark);
      } else if (it.id === "pot") {
        const s = it.r / 0.32;
        k.cyl(0.18 * s, 0.14 * s, 0.1 * s, it.x, gy - 0.02, it.z, W_COL.clayDark, 9);
        k.add(sphere, W_COL.clay, it.x, gy + 0.32 * s, it.z, 0, 0, 0, 0.3 * s, 0.32 * s, 0.3 * s);
        k.cyl(0.13 * s, 0.11 * s, 0.14 * s, it.x, gy + 0.56 * s, it.z, W_COL.clay, 9);
        k.box(0.42 * s, 0.05, 0.06, it.x, gy + 0.36 * s, it.z + 0.28 * s, DYE.cotton);
      } else if (it.id === "maceta") {
        k.cyl(0.17, 0.12, 0.26, it.x, gy - 0.02, it.z, W_COL.clay, 8);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const fx = it.x + Math.cos(a) * 0.08;
          const fz = it.z + Math.sin(a) * 0.08;
          k.cyl(0.02, 0.02, 0.26, fx, gy + 0.22, fz, W_COL.leaf, 4);
          k.add(sphere, i % 2 ? "#f2c230" : DYE.red, fx, gy + 0.5, fz, 0, 0, 0, 0.08, 0.07, 0.08);
        }
      }
    }
    // A few potted geraniums on the terrace beside the steps (small: no colliders).
    for (const [x, z] of [
      [-1.95, HD + 1.2],
      [1.95, HD + 1.25],
      [-2.4, HD + 0.5],
    ] as const) {
      const gy = floor(x, z);
      k.cyl(0.14, 0.1, 0.22, x, gy - 0.02, z, W_COL.clay, 7);
      k.add(sphere, W_COL.leaf, x, gy + 0.3, z, 0, 0, 0, 0.18, 0.13, 0.18);
      for (let i = 0; i < 3; i++)
        k.add(
          sphere,
          i === 1 ? "#e86f9a" : DYE.red,
          x + (i - 1) * 0.08,
          gy + 0.42,
          z + (rand() - 0.5) * 0.1,
          0,
          0,
          0,
          0.06,
          0.05,
          0.06,
        );
    }
    const gg = new THREE.Group();
    gg.name = "wasi-grounds";
    finish(gg, k, "wasi-grounds");
    group.add(gg);
  }

  let night = false;
  const setNight = (n: boolean) => {
    night = n;
    flame.visible = glow.visible = n;
    paneMat.color.set(n ? "#e9b65c" : W_COL.pane);
    paneMat.emissive.set(n ? "#f0a040" : "#000000");
    paneMat.emissiveIntensity = n ? 0.85 : 0;
  };
  setNight(false);

  const walls: WallSet = { front: front.g, back: back.g, left: left.g, right: right.g };
  return {
    group,
    walls,
    roof,
    floor,
    eave,
    setNight,
    syncCut() {
      const up = walls.front.scale.y > 0.85;
      for (const o of facade) o.visible = up;
    },
    update(t) {
      if (!night) return;
      const f = 1 + Math.sin(t * 9.3) * 0.05 + Math.sin(t * 17.1) * 0.04;
      (glow.material as THREE.SpriteMaterial).opacity = 0.6 + (f - 1) * 1.5;
    },
    dispose() {
      offFontsReady(plaqueRe);
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
      });
      for (const g of owned.geos) g.dispose();
      for (const t of owned.texs) t.dispose();
      for (const m of owned.mats) m.dispose();
      group.removeFromParent();
    },
  };
}

// Shared prototypes for Kit.add (cloned per use by the Kit).
const boxProto = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.IcosahedronGeometry(1, 1);

function mergeGeos(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Panes share one material: fold them into one geometry (non-indexed boxes).
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const n = flat.reduce((s, g) => s + g.getAttribute("position").count, 0);
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of flat) {
    pos.set(g.getAttribute("position").array as Float32Array, o * 3);
    nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
    o += g.getAttribute("position").count;
  }
  for (const g of list) g.dispose();
  for (const g of flat) g.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}
