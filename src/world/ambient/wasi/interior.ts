/**
 * Wasi interior: the lazily loaded chunk of the house (`import("./wasi/interior")` from ../wasi.ts when the
 * traveler comes within ~45 u, disposed again beyond ~120 u). A cozy Andean dollhouse in four sections:
 *  - Sala · trayectoria: an adobe poyo (built-in bench) with woven cushions, a clay tinaja and the wall
 *    khipu (one cord per company in its dye, one knot per role, from career.ts);
 *  - Mesa del viajero · pasaporte: a table with an open passport and a postcard, a candle, a bench;
 *  - Estudio · formación y CV: a desk with a laptop and a lamp, a chair, a bookshelf, a floor lamp;
 *  - Rincón del chasqui · contacto: a little table with a wooden buzón (mailbox) and a pututu (conch);
 * on level wooden floorboards (the plinth top, plan.ts `platform()`), with aguayo rugs, low adobe partitions, wooden posts, a
 * painted zócalo (base band) along the walls and two niches (hornacinas) in the back wall.
 * It also builds the room panels (./rooms.ts). Colliders and walkable areas are NOT registered here: the
 * contract cannot remove them, so ../wasi.ts registers them once at create time from ./plan.ts (the same
 * boxes this file places the furniture on).
 *
 * Draw calls: floor 1, rugs 1, furniture 1, zócalo ×4 (inside each wall group, so they follow the cutaway),
 * khipu 1, niches 1, tapestry 1, laptop screen 1, table paper 1, lamp/candle glows ×3 (night only).
 * While the traveler sits at the desk (`setTyping`), the laptop screen is redrawn with code being typed.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { flattenToonGroup, vertexToon } from "../../merge-colors";
import { DYE } from "../../palette";
import { C, canvasTex, FONT, glowSprite, Kit, redraw, rng, toonMapped } from "../../props";
import { khipuCords } from "./content";
import type { WallSet } from "./exterior";
import { W_COL } from "./exterior";
import { FURNITURE, type Furniture, INNER, PARTITION_H, PARTITIONS, POSTS } from "./plan";
import { createRoomPanels, type RoomPanels } from "./rooms";

export interface InteriorHost {
  group: THREE.Group;
  walls: WallSet;
  floor(lx: number, lz: number): number;
  eave: number;
}

export interface WasiInterior {
  group: THREE.Group;
  panels: RoomPanels;
  setNight(night: boolean): void;
  /** Shows or hides everything (rooms and the wall-mounted pieces inside the wall groups). */
  setVisible(visible: boolean): void;
  /** The traveler sits at the desk (../../seat.ts): the laptop screen brightens and fills with typed code. */
  setTyping(on: boolean): void;
  update(t: number): void;
  dispose(): void;
}

const IN = {
  plaster: "#f2e4c4",
  zocalo: "#b5533a",
  zocaloLine: "#dda63c",
  wood: "#9a6438",
  woodDark: C.woodDark,
  cushionRed: DYE.red,
  cushionOchre: DYE.ochre,
  cushionTurq: DYE.turq,
  paper: C.paper,
  metal: "#4a4743",
  screenBack: "#6d6a66",
  conch: "#f1dcc6",
  conchPink: "#e3a48c",
  clay: W_COL.clay,
  clayDark: W_COL.clayDark,
  leaf: W_COL.leaf,
} as const;

const sphere = new THREE.IcosahedronGeometry(1, 1);

export function buildInterior(env: WorldEnv, host: InteriorHost, hudRoot: HTMLElement): WasiInterior {
  const rand = rng(4410);
  const fy = host.floor;
  const group = new THREE.Group();
  group.name = "wasi-interior";
  host.group.add(group);
  const vmat = vertexToon();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [vmat];
  const texs: THREE.Texture[] = [];
  const extras: THREE.Object3D[] = [];

  const finish = (parent: THREE.Object3D, k: Kit, name: string) => {
    const g = k.build(name);
    flattenToonGroup(g, vmat);
    for (const m of g.children) (m as THREE.Mesh).receiveShadow = true;
    parent.add(g);
    if (parent !== group) extras.push(g);
    return g;
  };
  /** Lowest / highest floor under a local box. */
  const under = (x0: number, z0: number, x1: number, z1: number) => {
    let lo = Number.POSITIVE_INFINITY;
    let hi = Number.NEGATIVE_INFINITY;
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        const h = fy(x0 + ((x1 - x0) * i) / 4, z0 + ((z1 - z0) * j) / 4);
        lo = Math.min(lo, h);
        hi = Math.max(hi, h);
      }
    return { lo, hi };
  };
  const fBox = (id: string): Furniture["box"] => {
    const f = FURNITURE.find((x) => x.id === id);
    if (!f) throw new Error(`wasi: no furniture ${id}`);
    return f.box;
  };

  // ------------------------------------------------------------------ floor + rugs (on host.floor)
  /** A grid over a local rectangle whose vertices sit `lift` above host.floor (level on the plinth). */
  const conformed = (
    x0: number,
    z0: number,
    x1: number,
    z1: number,
    lift: number,
    step: number,
    uv: (x: number, z: number) => [number, number],
    into: { pos: number[]; uv: number[]; idx: number[] },
  ) => {
    const nx = Math.max(1, Math.ceil((x1 - x0) / step));
    const nz = Math.max(1, Math.ceil((z1 - z0) / step));
    const start = into.pos.length / 3;
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const x = x0 + ((x1 - x0) * i) / nx;
        const z = z0 + ((z1 - z0) * j) / nz;
        into.pos.push(x, fy(x, z) + lift, z);
        const [u, v] = uv(x, z);
        into.uv.push(u, v);
      }
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = start + j * (nx + 1) + i;
        const b = a + 1;
        const c = a + nx + 1;
        const d = c + 1;
        // Counter-clockwise seen from above (+y normals).
        into.idx.push(a, c, b, b, c, d);
      }
  };
  const toGeo = (d: { pos: number[]; uv: number[]; idx: number[] }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(d.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(d.uv, 2));
    g.setIndex(d.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    geos.push(g);
    return g;
  };

  const boardsTex = canvasTex(256, 256, (ctx, w, h) => {
    const r = rng(91);
    const plank = w / 6;
    for (let i = 0; i < 6; i++) {
      let y = -r() * h * 0.5;
      while (y < h) {
        const len = h * (0.45 + r() * 0.4);
        const tone = 150 + Math.floor(r() * 26);
        ctx.fillStyle = `rgb(${tone + 18}, ${Math.floor(tone * 0.68)}, ${Math.floor(tone * 0.42)})`;
        ctx.fillRect(i * plank, y, plank, len);
        ctx.fillStyle = "rgba(60,32,16,0.55)";
        ctx.fillRect(i * plank, y, plank, 3);
        // Nail heads at the plank ends.
        ctx.fillStyle = "rgba(40,24,14,0.7)";
        ctx.fillRect(i * plank + 6, y + 6, 4, 4);
        ctx.fillRect(i * plank + plank - 10, y + 6, 4, 4);
        y += len;
      }
      ctx.fillStyle = "rgba(55,30,15,0.8)";
      ctx.fillRect(i * plank, 0, 3, h);
    }
  });
  boardsTex.wrapS = boardsTex.wrapT = THREE.RepeatWrapping;
  texs.push(boardsTex);
  const floorMat = toonMapped(env, boardsTex);
  mats.push(floorMat);
  const fd = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
  conformed(
    INNER.x0 - 0.05,
    INNER.z0 - 0.05,
    INNER.x1 + 0.05,
    INNER.z1 + 0.25,
    0.04,
    0.5,
    (x, z) => [x / 2.2, z / 2.2],
    fd,
  );
  const floorMesh = new THREE.Mesh(toGeo(fd), floorMat);
  floorMesh.name = "wasi-floor";
  floorMesh.receiveShadow = true;
  group.add(floorMesh);

  // Aguayo: woven stripes with diamond (k'enko) motifs and a fringe at both ends.
  const aguayoTex = canvasTex(256, 128, (ctx, w, h) => {
    const bands = [DYE.red, DYE.ochre, "#7a2533", DYE.turq, DYE.red, DYE.indigo, DYE.ochre, DYE.red];
    const bw = w / bands.length;
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i * bw, 0, bw + 1, h);
      if (i % 2 === 0) {
        ctx.fillStyle = i % 4 === 0 ? "#f3ead8" : "#1f1a17";
        for (let y = 10; y < h; y += 18) {
          ctx.beginPath();
          ctx.moveTo(i * bw + bw / 2, y - 6);
          ctx.lineTo(i * bw + bw / 2 + 6, y);
          ctx.lineTo(i * bw + bw / 2, y + 6);
          ctx.lineTo(i * bw + bw / 2 - 6, y);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.fillRect(i * bw + 2, 0, 3, h);
        ctx.fillRect(i * bw + bw - 5, 0, 3, h);
      }
    });
    ctx.fillStyle = "#efe6d6";
    for (let x = 0; x < w; x += 6) {
      ctx.fillRect(x, 0, 3, 7);
      ctx.fillRect(x, h - 7, 3, 7);
    }
  });
  texs.push(aguayoTex);
  const rugMat = toonMapped(env, aguayoTex);
  mats.push(rugMat);
  const rd = { pos: [] as number[], uv: [] as number[], idx: [] as number[] };
  const rug = (cx: number, cz: number, w: number, d: number, alongX: boolean) =>
    conformed(
      cx - w / 2,
      cz - d / 2,
      cx + w / 2,
      cz + d / 2,
      0.065,
      0.45,
      (x, z) => {
        const u = (x - (cx - w / 2)) / w;
        const v = (z - (cz - d / 2)) / d;
        return alongX ? [v, u] : [u, v];
      },
      rd,
    );
  rug(-3.3, 2.45, 2.5, 1.6, false);
  rug(0, 2.45, 1.1, 2.6, true);
  rug(-2.55, -2.25, 2.0, 1.3, false);
  rug(3.1, -2.35, 1.6, 1.1, false);
  const rugs = new THREE.Mesh(toGeo(rd), rugMat);
  rugs.name = "wasi-rugs";
  rugs.receiveShadow = true;
  group.add(rugs);

  // ------------------------------------------------------------------ furniture (one merged mesh)
  const k = new Kit(env);
  const at = (x: number, z: number) => fy(x, z);
  // Partitions: low adobe walls with a wooden cap.
  for (const p of PARTITIONS) {
    const { lo, hi } = under(p.x0, p.z0, p.x1, p.z1);
    const cx = (p.x0 + p.x1) / 2;
    const cz = (p.z0 + p.z1) / 2;
    const top = hi + PARTITION_H;
    k.box(p.x1 - p.x0, top - (lo - 0.15), p.z1 - p.z0, cx, lo - 0.15, cz, IN.plaster);
    k.box(p.x1 - p.x0 + 0.08, 0.08, p.z1 - p.z0 + 0.08, cx, top, cz, IN.woodDark);
    k.box(p.x1 - p.x0 + 0.01, 0.3, p.z1 - p.z0 + 0.01, cx, lo - 0.15, cz, IN.zocalo);
  }
  // Posts carry the ceiling beams (the beams belong to the roof group and fade with it).
  for (const [x, z] of POSTS) {
    const y = at(x, z);
    k.box(0.2, host.eave - 0.2 - (y - 0.1), 0.2, x, y - 0.1, z, IN.woodDark);
    k.box(0.32, 0.12, 0.32, x, host.eave - 0.32, z, IN.woodDark);
  }

  // Sala: poyo with cushions against the partition, a tinaja in the corner.
  {
    const b = fBox("banca");
    const cx = (b.x0 + b.x1) / 2;
    const y = under(b.x0, b.z0, b.x1, b.z1).hi;
    k.box(b.x1 - b.x0, y + 0.4 - (y - 0.3), b.z1 - b.z0 - 0.05, cx, y - 0.3, (b.z0 + b.z1) / 2, IN.plaster);
    k.box(b.x1 - b.x0 + 0.02, 0.18, b.z1 - b.z0 - 0.03, cx, y - 0.02, (b.z0 + b.z1) / 2, IN.zocalo);
    const cols = [IN.cushionRed, IN.cushionOchre, IN.cushionTurq];
    for (let i = 0; i < 3; i++) {
      const x = b.x0 + 0.42 + i * 0.78;
      k.box(0.72, 0.14, 0.62, x, y + 0.4, 0.58, cols[i]!);
      k.box(0.6, 0.48, 0.16, x, y + 0.5, 0.22, cols[(i + 1) % 3]!, 0, -0.18);
      k.box(0.62, 0.05, 0.64, x, y + 0.54, 0.58, i % 2 ? DYE.cotton : DYE.indigo, 0, 0, 0);
    }
    const t = fBox("tinaja");
    const tx = (t.x0 + t.x1) / 2;
    const tz = (t.z0 + t.z1) / 2;
    const ty = at(tx, tz);
    k.add(sphere, IN.clay, tx, ty + 0.36, tz, 0, 0, 0, 0.3, 0.36, 0.3);
    k.cyl(0.14, 0.18, 0.18, tx, ty + 0.62, tz, IN.clay, 9);
    k.box(0.5, 0.05, 0.08, tx, ty + 0.42, tz + 0.24, DYE.cotton);
  }

  // Mesa del viajero: table with the open passport and a postcard, a candle and a clay cup; a bench.
  const tableY = (() => {
    const b = fBox("mesa");
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const { hi } = under(b.x0, b.z0, b.x1, b.z1);
    const top = hi + 0.76;
    k.box(b.x1 - b.x0, 0.08, b.z1 - b.z0, cx, top - 0.08, cz, IN.wood);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const lx = cx + sx * ((b.x1 - b.x0) / 2 - 0.12);
        const lz = cz + sz * ((b.z1 - b.z0) / 2 - 0.12);
        const ly = at(lx, lz) - 0.05;
        k.box(0.1, top - 0.08 - ly, 0.1, lx, ly, lz, IN.woodDark);
      }
    // Clay cup and candle.
    k.cyl(0.06, 0.05, 0.11, cx + 0.55, top, cz - 0.28, IN.clay, 8);
    k.cyl(0.05, 0.05, 0.16, cx - 0.58, top, cz + 0.3, DYE.cotton, 8);
    k.cyl(0.08, 0.09, 0.03, cx - 0.58, top, cz + 0.3, IN.clayDark, 8);
    const bn = fBox("banco");
    const by = under(bn.x0, bn.z0, bn.x1, bn.z1).hi;
    const bcx = (bn.x0 + bn.x1) / 2;
    k.box(bn.x1 - bn.x0, 0.07, bn.z1 - bn.z0, bcx, by + 0.4, (bn.z0 + bn.z1) / 2, IN.wood);
    for (const z of [bn.z0 + 0.15, bn.z1 - 0.15])
      k.box(bn.x1 - bn.x0 - 0.06, 0.45, 0.08, bcx, by - 0.05, z, IN.woodDark);
    k.box(bn.x1 - bn.x0 - 0.02, 0.05, (bn.z1 - bn.z0) * 0.8, bcx, by + 0.47, (bn.z0 + bn.z1) / 2, DYE.ochre);
    return { x: cx, z: cz, y: top };
  })();

  // Estudio: desk, laptop, desk lamp, chair, bookshelf, floor lamp.
  const desk = (() => {
    const b = fBox("desk");
    const z1 = -3.4;
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + z1) / 2;
    const { hi } = under(b.x0, b.z0, b.x1, z1);
    const top = hi + 0.76;
    k.box(b.x1 - b.x0, 0.07, z1 - b.z0, cx, top - 0.07, cz, IN.wood);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const lx = cx + sx * ((b.x1 - b.x0) / 2 - 0.08);
        const lz = cz + sz * ((z1 - b.z0) / 2 - 0.08);
        const ly = at(lx, lz) - 0.05;
        k.box(0.08, top - 0.07 - ly, 0.08, lx, ly, lz, IN.woodDark);
      }
    k.box(0.55, 0.22, z1 - b.z0 - 0.06, b.x1 - 0.36, top - 0.3, cz, IN.woodDark);
    k.box(0.1, 0.03, 0.03, b.x1 - 0.36, top - 0.2, z1 - 0.02, DYE.ochre);
    // Laptop: base + lid back (the screen is its own mesh).
    const lx = cx - 0.15;
    const lz = cz + 0.06;
    k.box(0.46, 0.025, 0.32, lx, top, lz, IN.metal);
    k.box(0.46, 0.3, 0.02, lx, top + 0.02, lz - 0.17, IN.screenBack, 0, -0.22);
    // Notebook, mug, pencil cup.
    k.box(0.22, 0.03, 0.3, cx + 0.42, top, cz + 0.08, DYE.indigo, 0.2);
    k.cyl(0.05, 0.05, 0.1, cx + 0.62, top, cz - 0.18, DYE.red, 8);
    k.cyl(0.04, 0.04, 0.12, cx - 0.72, top, cz - 0.2, IN.clay, 7);
    for (let i = 0; i < 3; i++)
      k.box(
        0.012,
        0.16,
        0.012,
        cx - 0.73 + i * 0.015,
        top + 0.05,
        cz - 0.2,
        ["#e8b631", DYE.red, DYE.turq][i]!,
        0,
        0.15 * (i - 1),
      );
    // Desk lamp.
    const dx = b.x0 + 0.22;
    const dz = cz - 0.08;
    k.cyl(0.09, 0.1, 0.03, dx, top, dz, IN.metal, 8);
    k.stick(new THREE.Vector3(dx, top + 0.02, dz), new THREE.Vector3(dx + 0.12, top + 0.4, dz + 0.04), 0.012, IN.metal);
    k.cyl(0.05, 0.12, 0.14, dx + 0.14, top + 0.33, dz + 0.06, DYE.ochre, 8);
    // Chair tucked in.
    const chz = -3.15;
    const chy = at(cx - 0.1, chz);
    k.box(0.46, 0.06, 0.44, cx - 0.1, chy + 0.44, chz, IN.wood);
    for (const sx of [-0.19, 0.19])
      for (const sz of [-0.17, 0.17]) k.box(0.05, 0.46, 0.05, cx - 0.1 + sx, chy - 0.02, chz + sz, IN.woodDark);
    k.box(0.46, 0.5, 0.05, cx - 0.1, chy + 0.5, chz + 0.2, IN.wood);
    k.box(0.4, 0.06, 0.38, cx - 0.1, chy + 0.5, chz, DYE.red);
    // Bookshelf against the left wall, facing +x.
    const s = fBox("shelf");
    const sy = under(s.x0, s.z0, s.x1, s.z1).lo - 0.05;
    const sh = 2.05;
    const scx = (s.x0 + s.x1) / 2;
    for (const z of [s.z0 + 0.04, s.z1 - 0.04]) k.box(s.x1 - s.x0, sh, 0.08, scx, sy, z, IN.woodDark);
    k.box(0.04, sh, s.z1 - s.z0, s.x0 + 0.02, sy, (s.z0 + s.z1) / 2, IN.woodDark);
    const levels = [0.08, 0.55, 1.02, 1.49, 1.96];
    for (const ly of levels) k.box(s.x1 - s.x0, 0.06, s.z1 - s.z0 - 0.1, scx, sy + ly, (s.z0 + s.z1) / 2, IN.wood);
    const spines = [DYE.red, DYE.indigo, DYE.ochre, DYE.turq, "#7a2533", DYE.cotton, "#3c6e47", DYE.alpaca];
    for (let li = 0; li < 4; li++) {
      let z = s.z0 + 0.12;
      while (z < s.z1 - 0.2) {
        const bw = 0.06 + rand() * 0.06;
        const bh = 0.28 + rand() * 0.12;
        if (rand() < 0.08 && li !== 0) {
          // A small clay pot or a gap between the books.
          if (rand() < 0.5) k.cyl(0.07, 0.06, 0.14, scx, sy + levels[li]! + 0.06, z + 0.1, IN.clay, 7);
          z += 0.22;
          continue;
        }
        k.box(
          0.28,
          bh,
          bw,
          scx + 0.02,
          sy + levels[li]! + 0.06,
          z + bw / 2,
          spines[Math.floor(rand() * spines.length)]!,
          0,
          0,
          rand() < 0.12 ? 0.18 : 0,
        );
        z += bw + 0.008;
      }
    }
    // A potted plant on top.
    k.cyl(0.11, 0.08, 0.16, scx, sy + sh, s.z1 - 0.3, IN.clay, 8);
    k.add(sphere, IN.leaf, scx, sy + sh + 0.28, s.z1 - 0.3, 0, 0, 0, 0.2, 0.18, 0.2);
    // Floor lamp.
    const fl = fBox("lamp");
    const flx = (fl.x0 + fl.x1) / 2;
    const flz = (fl.z0 + fl.z1) / 2;
    const fly = at(flx, flz);
    k.cyl(0.16, 0.18, 0.04, flx, fly, flz, IN.woodDark, 8);
    k.cyl(0.025, 0.025, 1.45, flx, fly, flz, IN.woodDark, 6);
    k.cyl(0.14, 0.22, 0.26, flx, fly + 1.42, flz, DYE.cotton, 10);
    return {
      x: cx,
      z: cz,
      y: top,
      lx,
      lz,
      lamp: new THREE.Vector3(dx + 0.14, top + 0.36, dz + 0.06),
      floorLamp: new THREE.Vector3(flx, fly + 1.5, flz),
    };
  })();

  // Rincón del chasqui: table with the buzón and the pututu; the q'ipi bundle by the partition.
  {
    const b = fBox("buzon");
    const cx = (b.x0 + b.x1) / 2;
    const cz = (b.z0 + b.z1) / 2;
    const { hi } = under(b.x0, b.z0, b.x1, b.z1);
    const top = hi + 0.72;
    k.box(b.x1 - b.x0, 0.07, b.z1 - b.z0, cx, top - 0.07, cz, IN.wood);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const lx = cx + sx * ((b.x1 - b.x0) / 2 - 0.08);
        const lz = cz + sz * ((b.z1 - b.z0) / 2 - 0.08);
        const ly = at(lx, lz) - 0.05;
        k.box(0.08, top - 0.07 - ly, 0.08, lx, ly, lz, IN.woodDark);
      }
    // Buzón: a wooden box with a slanted lid, a slot, a letter peeking out and a little red flag.
    const mx = cx - 0.3;
    k.box(0.46, 0.36, 0.32, mx, top, cz, IN.wood);
    k.box(0.5, 0.06, 0.38, mx, top + 0.38, cz + 0.01, IN.woodDark, 0, 0.18);
    k.box(0.26, 0.03, 0.02, mx, top + 0.24, cz + 0.165, "#2a1a10");
    k.box(0.18, 0.12, 0.01, mx + 0.02, top + 0.24, cz + 0.17, IN.paper, 0, 0, 0.08);
    k.box(0.02, 0.36, 0.02, mx + 0.25, top + 0.12, cz + 0.08, IN.woodDark);
    k.box(0.14, 0.09, 0.015, mx + 0.32, top + 0.38, cz + 0.08, DYE.red);
    k.box(0.36, 0.06, 0.04, mx, top + 0.12, cz + 0.17, DYE.ochre);
    // Pututu (conch trumpet): a spiral cone with a flared lip and a mouthpiece.
    const px = cx + 0.33;
    const pz = cz + 0.05;
    const shell = new THREE.ConeGeometry(0.12, 0.42, 9);
    k.add(shell, IN.conch, px, top + 0.12, pz, 0, 0.3, Math.PI / 2);
    shell.dispose();
    k.add(sphere, IN.conchPink, px - 0.2, top + 0.12, pz, 0, 0.3, 0, 0.06, 0.12, 0.12);
    for (let i = 0; i < 3; i++)
      k.add(
        sphere,
        IN.conch,
        px + 0.02 + i * 0.07,
        top + 0.17 + i * 0.01,
        pz - 0.02 * i,
        0,
        0,
        0,
        0.08 - i * 0.015,
        0.05,
        0.08 - i * 0.015,
      );
    k.cyl(0.025, 0.03, 0.06, px + 0.24, top + 0.1, pz, IN.clayDark, 6, 0, Math.PI / 2);
    // Letters tied with a red thread.
    k.box(0.22, 0.04, 0.15, cx + 0.1, top, cz - 0.15, IN.paper, 0.3);
    k.box(0.23, 0.045, 0.02, cx + 0.1, top, cz - 0.15, DYE.red, 0.3);
    // Q'ipi: a bundle wrapped in an aguayo, knotted on top.
    const q = fBox("qipi");
    const qx = (q.x0 + q.x1) / 2;
    const qz = (q.z0 + q.z1) / 2;
    const qy = at(qx, qz);
    k.add(sphere, DYE.red, qx, qy + 0.26, qz, 0, 0.4, 0, 0.3, 0.27, 0.27);
    k.add(sphere, DYE.ochre, qx, qy + 0.27, qz, 0, 0.4, 0, 0.31, 0.08, 0.28);
    k.add(sphere, DYE.indigo, qx, qy + 0.26, qz, 0, 0.4, 0, 0.12, 0.28, 0.28);
    k.add(sphere, DYE.red, qx, qy + 0.56, qz, 0, 0, 0, 0.08, 0.06, 0.08);
  }
  finish(group, k, "wasi-furniture");

  // ------------------------------------------------------------------ wall-mounted pieces (follow the cutaway)
  /** y in a wall group's frame (its origin sits at the wall base). */
  const wy = (wall: THREE.Group, yLocal: number) => yLocal - wall.position.y;
  const zocalos: THREE.Object3D[] = [];
  // Zócalo: a painted base band with a thin ochre line along the inner faces.
  for (const [name, wall, ax, az, bx, bz] of [
    ["front", host.walls.front, INNER.x0, INNER.z1, INNER.x1, INNER.z1],
    ["back", host.walls.back, INNER.x0, INNER.z0, INNER.x1, INNER.z0],
    ["left", host.walls.left, INNER.x0, INNER.z0, INNER.x0, INNER.z1],
    ["right", host.walls.right, INNER.x1, INNER.z0, INNER.x1, INNER.z1],
  ] as const) {
    const zk = new Kit(env);
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.ceil(len / 0.8));
    const inward = name === "front" ? [0, -1] : name === "back" ? [0, 1] : name === "left" ? [1, 0] : [-1, 0];
    for (let i = 0; i < n; i++) {
      const s0 = (i / n) * len;
      const s1 = ((i + 1) / n) * len;
      const mx = ax + ((bx - ax) * (s0 + s1)) / 2 / len;
      const mz = az + ((bz - az) * (s0 + s1)) / 2 / len;
      // Leave the door gap clear.
      if (name === "front" && Math.abs(mx) < 1.0) continue;
      const g = fy(mx + inward[0]! * 0.2, mz + inward[1]! * 0.2);
      const ry = name === "front" || name === "back" ? 0 : Math.PI / 2;
      const px = mx + inward[0]! * 0.012;
      const pz = mz + inward[1]! * 0.012;
      zk.box(s1 - s0 + 0.01, 0.95, 0.02, px, wy(wall, g - 0.1), pz, IN.zocalo, ry);
      zk.box(s1 - s0 + 0.01, 0.05, 0.03, px, wy(wall, g + 0.85), pz, IN.zocaloLine, ry);
    }
    zocalos.push(finish(wall, zk, `wasi-zocalo-${name}`));
  }

  // Wall khipu on the sala's left wall: a wooden rod, one cord per company in its dye, one knot per role.
  const khipuK = new Kit(env);
  const kx = INNER.x0 + 0.06;
  const ky = wy(host.walls.left, fy(INNER.x0 + 0.5, 2.2) + 2.25);
  const cords = khipuCords();
  const kz0 = 0.8;
  const kz1 = 3.6;
  // Horizontal rod (Kit.cyl puts the base at y: pass the centre minus half the length).
  const rodLen = kz1 - kz0 + 0.4;
  khipuK.cyl(0.035, 0.035, rodLen, kx, ky - rodLen / 2, (kz0 + kz1) / 2, IN.woodDark, 6, Math.PI / 2);
  khipuK.box(0.05, 0.12, 0.05, kx - 0.02, ky - 0.04, kz0 - 0.1, IN.woodDark);
  khipuK.box(0.05, 0.12, 0.05, kx - 0.02, ky - 0.04, kz1 + 0.1, IN.woodDark);
  cords.forEach((c, i) => {
    const z = kz0 + 0.15 + (i * (kz1 - kz0 - 0.3)) / Math.max(1, cords.length - 1);
    const len = 0.85 + c.knots * 0.1;
    khipuK.box(0.04, len, 0.04, kx + 0.02, ky - len, z, c.dye);
    for (let n = 0; n < c.knots; n++)
      khipuK.add(sphere, c.dye, kx + 0.02, ky - 0.25 - n * 0.2, z, 0, 0, 0, 0.055, 0.05, 0.055);
    khipuK.add(sphere, IN.woodDark, kx + 0.02, ky - len - 0.03, z, 0, 0, 0, 0.035, 0.05, 0.035);
  });
  const khipu = finish(host.walls.left, khipuK, "wasi-khipu");

  // Two hornacinas (trapezoidal niches) in the back wall, each holding a small clay piece.
  const nicheK = new Kit(env);
  for (const nx of [-1.05, 1.15]) {
    const g = fy(nx, INNER.z0 + 0.3);
    const y0 = wy(host.walls.back, g + 1.3);
    const shape = new THREE.Shape();
    shape.moveTo(-0.24, 0);
    shape.lineTo(0.24, 0);
    shape.lineTo(0.17, 0.6);
    shape.lineTo(-0.17, 0.6);
    shape.closePath();
    const tz = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    nicheK.add(tz, "#5a3f2c", nx, y0, INNER.z0 + 0.005);
    tz.dispose();
    nicheK.box(0.52, 0.05, 0.1, nx, y0 - 0.05, INNER.z0 + 0.05, IN.woodDark);
    nicheK.add(sphere, nx < 0 ? IN.clay : DYE.ochre, nx, y0 + 0.12, INNER.z0 + 0.1, 0, 0, 0, 0.09, 0.11, 0.07);
  }
  const niches = finish(host.walls.back, nicheK, "wasi-niches");

  // A small woven tapestry over the bench on the right wall (shares the aguayo texture).
  const tapGeo = new THREE.PlaneGeometry(1.3, 0.8);
  geos.push(tapGeo);
  const tapestry = new THREE.Mesh(tapGeo, rugMat);
  tapestry.name = "wasi-tapestry";
  tapestry.rotation.y = -Math.PI / 2;
  tapestry.position.set(INNER.x1 - 0.03, wy(host.walls.right, fy(4.7, 2.25) + 1.55), 2.25);
  host.walls.right.add(tapestry);
  extras.push(tapestry);

  // ------------------------------------------------------------------ textured small pieces
  // Laptop screen: an editor with code lines.
  const codeCols = ["#dda63c", "#2a9d8f", "#c4383f", "#a9b8ff", "#efe6d6"];
  const screenTex = canvasTex(128, 84, (ctx, w, h) => {
    ctx.fillStyle = "#1d2230";
    ctx.fillRect(0, 0, w, h);
    const r = rng(5);
    const cols = codeCols;
    for (let y = 8; y < h - 4; y += 7) {
      let x = 8 + Math.floor(r() * 3) * 8;
      while (x < w - 12 && r() < 0.85) {
        const lw = 8 + r() * 24;
        ctx.fillStyle = cols[Math.floor(r() * cols.length)]!;
        ctx.fillRect(x, y, lw, 3);
        x += lw + 5;
      }
    }
  });
  texs.push(screenTex);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  mats.push(screenMat);
  const screenGeo = new THREE.PlaneGeometry(0.42, 0.27);
  geos.push(screenGeo);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.name = "wasi-laptop-screen";
  screen.position.set(desk.lx, desk.y + 0.17, desk.lz - 0.15);
  screen.rotation.x = -0.22;
  group.add(screen);

  // Typing (seated at the desk): new code appears token by token at ~8 Hz under a blinking cursor, scrolling
  // up a row at the bottom; the screen glows a little brighter. Static (brighter only) with reduced motion.
  type Tok = readonly [x: number, w: number, color: string];
  const tokRand = rng(17);
  const newRow = (): Tok[] => {
    const row: Tok[] = [];
    let x = 8 + Math.floor(tokRand() * 3) * 8;
    while (x < 116 && (row.length === 0 || tokRand() < 0.8)) {
      const lw = 6 + tokRand() * 22;
      row.push([x, lw, codeCols[Math.floor(tokRand() * codeCols.length)]!]);
      x += lw + 5;
    }
    return row;
  };
  const ROWS = 10;
  const rows: Tok[][] = Array.from({ length: 5 }, newRow);
  let cur = newRow();
  let curN = 0;
  let typing = false;
  let tick = 0;
  const drawTyping = (cursor: boolean) => {
    redraw(screenTex, (ctx, w, h) => {
      ctx.fillStyle = "#1d2230";
      ctx.fillRect(0, 0, w, h);
      const line = (row: readonly Tok[], y: number, n: number) => {
        for (let i = 0; i < n; i++) {
          const [x, lw, c] = row[i]!;
          ctx.fillStyle = c;
          ctx.fillRect(x, y, lw, 3);
        }
      };
      for (const [i, row] of rows.entries()) line(row, 8 + i * 7, row.length);
      const y = 8 + rows.length * 7;
      line(cur, y, curN);
      if (cursor) {
        const last = cur[curN - 1];
        ctx.fillStyle = "#efe6d6";
        ctx.fillRect(last ? last[0] + last[1] + 2 : cur[0]![0], y - 1, 3, 5);
      }
    });
  };

  // Table paper: the open passport (stamped pages) and a postcard of the mountain.
  const paperTex = canvasTex(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Passport: cover edge + two pages with stamps.
    ctx.fillStyle = "#7a2533";
    ctx.fillRect(6, 10, 138, 108);
    ctx.fillStyle = "#f3ead8";
    ctx.fillRect(10, 14, 63, 100);
    ctx.fillRect(77, 14, 63, 100);
    ctx.strokeStyle = "rgba(31,26,23,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(75, 14);
    ctx.lineTo(75, 114);
    ctx.stroke();
    const stamps = [
      [30, 38, DYE.red],
      [54, 72, DYE.indigo],
      [100, 36, DYE.turq],
      [120, 80, DYE.ochre],
      [28, 92, DYE.red],
    ] as const;
    for (const [x, y, c] of stamps) {
      ctx.strokeStyle = c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = c;
      ctx.fillRect(x - 5, y - 2, 10, 4);
    }
    // Postcard: sky, snowy peak, green slope, the trail.
    ctx.save();
    ctx.translate(198, 64);
    ctx.rotate(0.12);
    ctx.fillStyle = "#f3ead8";
    ctx.fillRect(-46, -34, 92, 68);
    ctx.fillStyle = "#9ed0e6";
    ctx.fillRect(-42, -30, 84, 40);
    ctx.fillStyle = "#7d8592";
    ctx.beginPath();
    ctx.moveTo(-42, 10);
    ctx.lineTo(-6, -24);
    ctx.lineTo(30, 10);
    ctx.fill();
    ctx.fillStyle = "#f3efe6";
    ctx.beginPath();
    ctx.moveTo(-15, -15);
    ctx.lineTo(-6, -24);
    ctx.lineTo(3, -15);
    ctx.fill();
    ctx.fillStyle = "#7fae6a";
    ctx.fillRect(-42, 6, 84, 24);
    ctx.strokeStyle = "#c98b5a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-30, 30);
    ctx.quadraticCurveTo(0, 14, 10, 8);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#1f1a17";
    ctx.font = `700 9px ${FONT.mono}`;
    ctx.fillText("QHAPAQ ÑAN", 170, 116);
  });
  texs.push(paperTex);
  const paperMat = toonMapped(env, paperTex);
  paperMat.alphaTest = 0.5;
  mats.push(paperMat);
  const paperGeo = new THREE.PlaneGeometry(1.0, 0.5);
  paperGeo.rotateX(-Math.PI / 2);
  geos.push(paperGeo);
  const paper = new THREE.Mesh(paperGeo, paperMat);
  paper.name = "wasi-table-paper";
  paper.position.set(tableY.x - 0.05, tableY.y + 0.012, tableY.z);
  // Read from the entry: the long side runs across the room.
  paper.rotation.y = Math.PI / 2;
  env.noOutline(paper);
  group.add(paper);

  // ------------------------------------------------------------------ night glows
  const candleMat = new THREE.MeshBasicMaterial({ color: "#ffd08a", toneMapped: false });
  mats.push(candleMat);
  const candleGeo = new THREE.ConeGeometry(0.03, 0.08, 5);
  geos.push(candleGeo);
  const candle = new THREE.Mesh(candleGeo, candleMat);
  candle.position.set(tableY.x - 0.58, tableY.y + 0.2, tableY.z + 0.3);
  env.noOutline(candle);
  group.add(candle);
  const glows = [
    { s: glowSprite(env, C.torch, 1.6), p: desk.lamp },
    { s: glowSprite(env, C.torch, 2.4), p: desk.floorLamp },
    { s: glowSprite(env, C.torch, 1.1), p: candle.position },
  ];
  for (const g of glows) {
    g.s.position.copy(g.p);
    mats.push(g.s.material as THREE.Material);
    group.add(g.s);
  }

  const panels = createRoomPanels(hudRoot, env.lang);
  let night = false;
  const setNight = (n: boolean) => {
    night = n;
    candle.visible = n;
    for (const g of glows) g.s.visible = n;
  };
  setNight(env.sky.isNight());

  let shown = true;
  return {
    group,
    panels,
    setNight,
    setTyping(on) {
      if (on === typing) return;
      typing = on;
      screenMat.color.setScalar(on ? 1.35 : 1);
      if (on) drawTyping(true);
    },
    setVisible(v) {
      if (v === shown) return;
      shown = v;
      group.visible = v;
      for (const z of zocalos) z.visible = v;
      if (!v) khipu.visible = niches.visible = tapestry.visible = false;
    },
    update(t) {
      if (!shown) return;
      khipu.visible = host.walls.left.scale.y > 0.85;
      niches.visible = host.walls.back.scale.y > 0.85;
      tapestry.visible = host.walls.right.scale.y > 0.85;
      if (typing && !env.reducedMotion && t - tick > 0.12) {
        tick = t;
        if (++curN > cur.length) {
          rows.push(cur);
          if (rows.length > ROWS) rows.shift();
          cur = newRow();
          curN = 0;
        }
        drawTyping(Math.floor(t * 2.5) % 2 === 0);
      }
      if (!night) return;
      const f = Math.sin(t * 11.3) * 0.05 + Math.sin(t * 19.7) * 0.04;
      candle.scale.y = 1 + f * 2;
      (glows[2]!.s.material as THREE.SpriteMaterial).opacity = 0.7 + f * 2;
    },
    dispose() {
      panels.dispose();
      for (const root of [group, ...extras])
        root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
        });
      for (const o of extras) o.removeFromParent();
      for (const g of geos) g.dispose();
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      group.removeFromParent();
    },
  };
}
