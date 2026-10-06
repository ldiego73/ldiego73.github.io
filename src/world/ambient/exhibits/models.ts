/**
 * One representative object per company tambo, built from that company's stack and achievements in
 * src/data/career.ts. Static parts merge into one toon mesh per color (Kit); moving parts are a few
 * InstancedMeshes updated in place (no per-frame allocations). Screens and plaques are unlit canvas plates.
 * Local frame: origin on the ground at the object's center, +Z toward the viewer (the trail).
 */
import * as THREE from "three";
import type { Lang, WorldEnv } from "../../contract";
import { C, DYE, FONT, Kit } from "../../props";
import { fitText, type Owned, plate, roundRect } from "./label";

export interface ExhibitModel {
  group: THREE.Group;
  /** Meshes that animate (hidden by the caller when far). */
  moving: THREE.Object3D[];
  update(t: number): void;
  dispose(): void;
}

interface Ctx {
  env: WorldEnv;
  lang: Lang;
  low: boolean;
  rm: boolean;
  kit: Kit;
  group: THREE.Group;
  owned: Owned[];
  geos: THREE.BufferGeometry[];
  mats: THREE.Material[];
  moving: THREE.Object3D[];
}

/** Top of the stone pedestal every exhibit stands on. */
const B = 0.24;
const _o = new THREE.Object3D();
const _c = new THREE.Color();
const _v = new THREE.Vector3();
const WHITE = new THREE.Color("#ffffff");

const DARK = "#2b2d3a";
const STEEL = "#4a5068";

function pedestal(ctx: Ctx, w: number, d: number, round = false) {
  const k = ctx.kit;
  if (round) {
    k.cyl(w / 2, w / 2 + 0.06, 0.7, 0, -0.5, 0, C.stoneDark, 12);
    k.cyl(w / 2 - 0.03, w / 2 - 0.03, 0.08, 0, B - 0.08, 0, C.stone, 12);
    return;
  }
  k.box(w + 0.1, 0.7, d + 0.1, 0, -0.5, 0, C.stoneDark);
  k.box(w, 0.08, d, 0, B - 0.08, 0, C.stone);
}

function inst(ctx: Ctx, geo: THREE.BufferGeometry, n: number, mat: THREE.Material) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  m.name = "exhibit-anim";
  ctx.geos.push(geo);
  ctx.moving.push(m);
  ctx.group.add(m);
  return m;
}

function setInst(m: THREE.InstancedMesh, i: number, x: number, y: number, z: number, s = 1, ry = 0) {
  _o.position.set(x, y, z);
  _o.rotation.set(0, ry, 0);
  _o.scale.setScalar(Math.max(0.001, s));
  _o.updateMatrix();
  m.setMatrixAt(i, _o.matrix);
}

function addPlate(
  ctx: Ctx,
  w: number,
  h: number,
  px: number,
  draw: (c: CanvasRenderingContext2D, cw: number, ch: number) => void,
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
) {
  const p = plate(ctx.env, w, h, px, draw);
  p.mesh.position.set(x, y, z);
  p.mesh.rotation.set(rx, ry, 0);
  ctx.group.add(p.mesh);
  ctx.owned.push(p);
  return p.mesh;
}

/** Paper plaque with ink border and centered lines. */
function plaqueDraw(lines: string[], bg = C.paper, fg = C.ink, accent?: string) {
  return (c: CanvasRenderingContext2D, w: number, h: number) => {
    c.fillStyle = C.ink;
    c.fillRect(0, 0, w, h);
    c.fillStyle = bg;
    roundRect(c, 6, 6, w - 12, h - 12, 6);
    c.fill();
    if (accent) {
      c.fillStyle = accent;
      c.fillRect(6, 6, 14, h - 12);
    }
    c.fillStyle = fg;
    const n = lines.length;
    lines.forEach((ln, i) => {
      const big = i === 0;
      fitText(
        c,
        ln,
        w / 2 + (accent ? 7 : 0),
        (h * (i + 0.55)) / n,
        w - 40,
        big ? (h * 0.62) / n + 8 : (h * 0.4) / n + 6,
      );
    });
  };
}

/** A smooth 0..1 loop with pause-free motion; static when reduced motion. */
const loop = (ctx: Ctx, t: number, speed: number, phase: number) => (ctx.rm ? phase % 1 : (t * speed + phase) % 1);

// ------------------------------------------------------------------------------------------- Auna
/** Server rack with blinking LEDs: Kong Gateway for digital health at 99.9% SLA. */
function auna(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 1.3, 1.05);
  const W = 0.92;
  const H = 1.72;
  const D = 0.72;
  k.box(W, H, D, 0, B, 0, DARK);
  k.box(W + 0.06, 0.07, D + 0.06, 0, B + H, 0, "#1f2130");
  for (const sx of [-1, 1]) {
    k.box(0.03, H - 0.1, D - 0.1, sx * (W / 2 + 0.01), B + 0.05, 0, DYE.indigo);
    for (const sz of [-1, 1]) k.box(0.1, 0.06, 0.1, sx * (W / 2 - 0.08), B - 0.04, sz * (D / 2 - 0.08), "#1f2130");
  }
  const units = 5;
  const leds: Array<[number, number]> = [];
  for (let i = 0; i < units; i++) {
    const y = B + 0.1 + i * 0.24;
    k.box(W - 0.12, 0.2, 0.04, 0, y, D / 2, STEEL);
    for (let v = 0; v < 4; v++) k.box(0.36, 0.018, 0.012, -0.12, y + 0.04 + v * 0.04, D / 2 + 0.022, DARK);
    k.box(0.05, 0.14, 0.03, -W / 2 + 0.1, y + 0.03, D / 2 + 0.02, "#9aa2bd");
    for (let j = 0; j < 4; j++) leds.push([0.16 + j * 0.065, y + 0.1]);
  }
  // Health cross on top.
  k.box(0.32, 0.1, 0.06, 0, B + H + 0.18, 0.1, "#c4383f");
  k.box(0.1, 0.32, 0.06, 0, B + H + 0.07, 0.1, "#c4383f");
  k.box(0.4, 0.04, 0.2, 0, B + H + 0.05, 0.1, C.cotton);
  // Cables from the back into the ground (patient systems).
  const dyes = [DYE.indigo, DYE.ochre, DYE.turq];
  dyes.forEach((d, i) => {
    k.stick(
      new THREE.Vector3(-0.25 + i * 0.25, B + H - 0.1, -D / 2 - 0.02),
      new THREE.Vector3(-0.35 + i * 0.3, B - 0.02, -D / 2 - 0.3),
      0.025,
      d,
    );
  });
  // Status display: the knot's metric.
  addPlate(
    ctx,
    W - 0.14,
    0.26,
    360,
    (c, w, h) => {
      c.fillStyle = "#0f1f18";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#2c5a45";
      c.lineWidth = 4;
      c.strokeRect(2, 2, w - 4, h - 4);
      c.fillStyle = "#8dffbf";
      fitText(c, "99.9% SLA", w / 2, h * 0.54, w - 30, h * 0.66, "700", FONT.mono);
    },
    0,
    B + 0.1 + units * 0.24 + 0.15,
    D / 2 + 0.005,
  );
  // LEDs.
  const mat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
  ctx.mats.push(mat);
  const m = inst(ctx, new THREE.BoxGeometry(0.04, 0.04, 0.02), leds.length, mat);
  ctx.env.noOutline(m);
  leds.forEach(([x, y], i) => {
    setInst(m, i, x, y, D / 2 + 0.03);
  });
  const rates = leds.map((_, i) => 1.3 + ((i * 7919) % 13) * 0.37);
  const kinds = leds.map((_, i) => (i % 4 === 3 ? 1 : 0));
  let last = -1;
  const paint = (t: number) => {
    for (let i = 0; i < leds.length; i++) {
      const on = ctx.rm ? i % 3 !== 1 : Math.sin(t * rates[i]! + i * 1.7) > -0.2;
      _c.set(kinds[i] ? (on ? "#ffc44d" : "#5a4618") : on ? "#5dff9a" : "#1b4a2b");
      m.setColorAt(i, _c);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  paint(0);
  m.instanceMatrix.needsUpdate = true;
  return (t: number) => {
    if (ctx.rm) return;
    const q = Math.floor(t * 8);
    if (q === last) return;
    last = q;
    paint(t);
  };
}

// ----------------------------------------------------------------------------------------- TopSort
/** Event queues: blocks flowing from producers to consumers through Kafka, SQS and EventBridge. */
function topsort(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 2.0, 1.0);
  const X0 = -0.56;
  const X1 = 0.56;
  k.box(0.42, 1.05, 0.62, -0.78, B, 0, DYE.red);
  k.box(0.44, 0.08, 0.64, -0.78, B + 1.05, 0, "#8f2a30");
  k.box(0.42, 1.05, 0.62, 0.78, B, 0, "#8f2a30");
  k.box(0.44, 0.08, 0.64, 0.78, B + 1.05, 0, DYE.red);
  const names = ["Kafka", "SQS", "EventBridge"];
  const lanes = [DYE.turq, DYE.ochre, DYE.indigo];
  const ys = [B + 0.18, B + 0.5, B + 0.82];
  ys.forEach((y, i) => {
    k.box(X1 - X0, 0.03, 0.24, 0, y - 0.03, 0, C.cotton);
    k.box(X1 - X0, 0.07, 0.025, 0, y - 0.03, -0.12, lanes[i]!);
    k.box(X1 - X0, 0.05, 0.025, 0, y - 0.03, 0.12, lanes[i]!);
    for (const x of [-0.2, 0.2]) {
      k.box(0.03, 0.17, 0.03, x, y - 0.03, 0.135, C.woodDark);
      k.box(0.03, 0.17, 0.03, x, y - 0.03, -0.135, C.woodDark);
      k.box(0.03, 0.03, 0.3, x, y + 0.14, 0, C.woodDark);
    }
    // Mouths in the producer/consumer boxes.
    k.box(0.02, 0.15, 0.22, -0.565, y - 0.02, 0, "#1f1a17");
    k.box(0.02, 0.15, 0.22, 0.565, y - 0.02, 0, "#1f1a17");
    // Queue name on the consumer's front, level with its channel.
    addPlate(ctx, 0.4, 0.13, 260, plaqueDraw([names[i]!], C.paper, C.ink, lanes[i]), 0.78, y - 0.0, 0.315);
  });
  // Struts under the channels.
  for (const x of [-0.3, 0.3]) k.box(0.05, 0.75, 0.05, x, B, -0.05, C.woodDark);
  const per = ctx.low ? 2 : 4;
  const geo = new THREE.BoxGeometry(0.12, 0.08, 0.13);
  const m = inst(ctx, geo, per * 3, ctx.env.toon("#ffffff"));
  for (let i = 0; i < per * 3; i++) {
    _c.set(lanes[Math.floor(i / per)]!).lerp(WHITE, 0.15);
    m.setColorAt(i, _c);
  }
  const speeds = [0.32, 0.22, 0.27];
  return (t: number) => {
    for (let i = 0; i < per * 3; i++) {
      const lane = Math.floor(i / per);
      const u = loop(ctx, t, speeds[lane]!, (i % per) / per + lane * 0.13);
      const x = X0 + u * (X1 - X0);
      const s = Math.min(1, u / 0.1, (1 - u) / 0.1);
      setInst(m, i, x, ys[lane]! + 0.035, 0, s);
    }
    m.instanceMatrix.needsUpdate = true;
  };
}

// ----------------------------------------------------------------------------------------- Xepelin
/** AI-accelerated development desk: a terminal, an agent orbiting and two khipu knots, Claude Code + ChatGPT. */
function xepelin(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 1.6, 1.0);
  const top = B + 0.72;
  k.box(1.36, 0.06, 0.66, 0, top - 0.06, 0, C.wood);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.06, 0.66, 0.06, sx * 0.6, B, sz * 0.26, C.woodDark);
  k.box(1.2, 0.04, 0.04, 0, B + 0.18, -0.26, C.woodDark);
  // Laptop facing the viewer.
  k.box(0.56, 0.03, 0.36, -0.18, top, 0.08, DARK);
  k.box(0.56, 0.36, 0.025, -0.18, top + 0.02, -0.1, DARK, 0, -0.18);
  addPlate(
    ctx,
    0.5,
    0.3,
    360,
    (c, w, h) => {
      c.fillStyle = "#14161c";
      c.fillRect(0, 0, w, h);
      c.font = `700 ${Math.round(h * 0.13)}px ${FONT.mono}`;
      c.textAlign = "left";
      c.textBaseline = "middle";
      const rows: Array<[string, string]> = [
        ["#7fd1c7", "$ Claude Code"],
        ["#9aa2bd", "  …"],
        ["#f0c46a", "$ ChatGPT"],
        ["#9aa2bd", "  …"],
      ];
      rows.forEach(([col, s], i) => {
        c.fillStyle = col;
        c.fillText(s, w * 0.07, h * (0.2 + i * 0.18));
      });
    },
    -0.18,
    top + 0.2,
    -0.084,
    -0.18,
  );
  // Khipu stand on the desk: two pendant cords whose knots carry the tool names.
  const kx = 0.4;
  k.box(0.04, 0.62, 0.04, kx - 0.3, top, -0.12, C.woodDark);
  k.box(0.04, 0.62, 0.04, kx + 0.3, top, -0.12, C.woodDark);
  k.box(0.66, 0.05, 0.05, kx, top + 0.6, -0.12, C.wood);
  const names = ["Claude Code", "ChatGPT"];
  const cols = [DYE.turq, DYE.ochre];
  const knot = new THREE.SphereGeometry(0.035, 8, 6);
  ctx.geos.push(knot);
  names.forEach((n, i) => {
    const x = kx - 0.14 + i * 0.28;
    k.stick(new THREE.Vector3(x, top + 0.6, -0.12), new THREE.Vector3(x, top + 0.2, -0.1), 0.014, cols[i]!);
    k.add(knot, cols[i]!, x, top + 0.42, -0.115);
    k.add(knot, cols[i]!, x, top + 0.34, -0.112, 0, 0, 0, 0.85, 0.85, 0.85);
    addPlate(ctx, 0.27, 0.09, 240, plaqueDraw([n], C.paper, C.ink, cols[i]), x, top + 0.12, -0.08);
  });
  // Stool tucked to the side.
  k.cyl(0.2, 0.2, 0.05, -0.85, B + 0.42, 0.2, C.wood, 8);
  for (const a of [0, 2.1, 4.2])
    k.box(0.04, 0.42, 0.04, -0.85 + Math.cos(a) * 0.13, B, 0.2 + Math.sin(a) * 0.13, C.woodDark);
  // Agent: three small spheres orbiting above the laptop; a blinking cursor.
  const m = inst(
    ctx,
    new THREE.IcosahedronGeometry(0.045, 1),
    3,
    ctx.env.toon("#ffffff", { emissive: "#ffffff", emissiveIntensity: 0.25 }),
  );
  [DYE.turq, DYE.ochre, C.cotton].forEach((col, i) => {
    m.setColorAt(i, _c.set(col));
  });
  const curMat = new THREE.MeshBasicMaterial({ color: "#7fd1c7" });
  ctx.mats.push(curMat);
  const curGeo = new THREE.PlaneGeometry(0.025, 0.035);
  ctx.geos.push(curGeo);
  const cursor = new THREE.Mesh(curGeo, curMat);
  cursor.position.set(-0.07, top + 0.29, -0.077);
  cursor.rotation.x = -0.18;
  ctx.env.noOutline(cursor);
  ctx.group.add(cursor);
  ctx.moving.push(cursor);
  return (t: number) => {
    for (let i = 0; i < 3; i++) {
      const a = (ctx.rm ? 0 : t * 1.4) + (i * Math.PI * 2) / 3;
      setInst(m, i, -0.18 + Math.cos(a) * 0.3, top + 0.55 + Math.sin(a * 2) * 0.03, 0.02 + Math.sin(a) * 0.16);
    }
    m.instanceMatrix.needsUpdate = true;
    cursor.visible = ctx.rm || Math.floor(t * 2.2) % 2 === 0;
  };
}

// ----------------------------------------------------------------------------------------- Belcorp
/** Omnichannel API gateway: an Inca doorway (Kong) with the Lua authorization plugin chip on its lintel. */
function belcorp(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 1.7, 1.4);
  const rows = 4;
  for (let r = 0; r < rows; r++) {
    const y = B + r * 0.31;
    const inset = r * 0.035;
    for (const sx of [-1, 1]) {
      k.box(0.34, 0.29, 0.46, sx * (0.52 - inset), y, 0, r % 2 ? C.stoneDark : C.stone, sx * 0.02 * r);
    }
  }
  k.box(1.32, 0.26, 0.5, 0, B + rows * 0.31, 0, C.stoneDark);
  k.box(1.1, 0.12, 0.44, 0, B + rows * 0.31 + 0.26, 0, C.stone);
  // Lua chip: indigo package with gold pins.
  const cy = B + rows * 0.31 + 0.13;
  k.box(0.34, 0.34, 0.05, 0, cy - 0.17 + 0.02, 0.26, "#232a5c");
  for (let p = 0; p < 4; p++) {
    const o = -0.12 + p * 0.08;
    k.box(0.03, 0.05, 0.02, o, cy + 0.17, 0.26, DYE.ochre);
    k.box(0.03, 0.05, 0.02, o, cy - 0.2, 0.26, DYE.ochre);
    k.box(0.05, 0.03, 0.02, 0.19, cy + o - 0.01, 0.26, DYE.ochre);
    k.box(0.05, 0.03, 0.02, -0.19, cy + o - 0.01, 0.26, DYE.ochre);
  }
  addPlate(
    ctx,
    0.27,
    0.27,
    200,
    (c, w, h) => {
      c.fillStyle = "#232a5c";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#6f7bd6";
      c.lineWidth = 6;
      c.beginPath();
      c.arc(w / 2, h / 2, w * 0.4, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = "#ffffff";
      fitText(c, "Lua", w / 2, h * 0.52, w * 0.7, h * 0.36, "800", FONT.display);
    },
    0,
    cy,
    0.29,
  );
  // Plaque on the pedestal.
  addPlate(ctx, 0.9, 0.16, 400, plaqueDraw(["Kong · API Gateway"]), 0, B - 0.2, 0.756);
  // Requests from three channels converge through the doorway; past the plugin they turn ochre (authorized).
  const per = ctx.low ? 1 : 2;
  const n = per * 3;
  const m = inst(ctx, new THREE.BoxGeometry(0.1, 0.1, 0.1), n, ctx.env.toon("#ffffff"));
  const lane = [DYE.red, DYE.turq, DYE.indigo];
  const laneX = [-0.4, 0, 0.4];
  const lastSide = new Int8Array(n).fill(-1);
  return (t: number) => {
    let colors = false;
    for (let i = 0; i < n; i++) {
      const l = i % 3;
      const u = loop(ctx, t, 0.24, Math.floor(i / 3) / per + l * 0.21);
      const z = -0.62 + u * 1.3;
      const s = THREE.MathUtils.clamp((z + 0.45) / 0.4, 0, 1);
      const x = laneX[l]! * (1 - s * s * (3 - 2 * s));
      const sc = Math.min(1, u / 0.08, (1 - u) / 0.08);
      setInst(m, i, x, B + 0.08, z, sc, u * 3);
      const side = z > 0 ? 1 : 0;
      if (side !== lastSide[i]) {
        lastSide[i] = side;
        m.setColorAt(i, _c.set(side ? DYE.ochre : lane[l]!));
        colors = true;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (colors && m.instanceColor) m.instanceColor.needsUpdate = true;
  };
}

// ----------------------------------------------------------------------------------------- Globant
/** INSIS Core with 50+ integrations orbiting under one shared pattern. */
function globant(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 1.9, 1.9, true);
  k.cyl(0.3, 0.36, 0.74, 0, B, 0, DYE.ochre, 10);
  k.cyl(0.34, 0.34, 0.07, 0, B + 0.74, 0, C.woodDark, 10);
  k.cyl(0.12, 0.16, 0.18, 0, B + 0.81, 0, DYE.ochre, 10);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    k.box(0.05, 0.74, 0.03, Math.sin(a) * 0.335, B, Math.cos(a) * 0.335, "#b98a2c", a);
  }
  addPlate(
    ctx,
    0.74,
    0.3,
    360,
    plaqueDraw(["INSIS", ctx.lang === "es" ? "50+ integraciones" : "50+ integrations"], C.paper, C.ink, DYE.ochre),
    0,
    B + 1.2,
    0.03,
  );
  // The plaque stands on a short post above the core, clear of the orbiting integrations.
  // (The post stops under the backing board: unlit plates skip the ink prepass, so edges behind them would show.)
  k.box(0.05, 0.06, 0.05, 0, B + 0.98, 0, C.woodDark);
  k.box(0.78, 0.34, 0.04, 0, B + 1.03, 0, C.woodDark);
  const rings = [
    { n: 20, r: 0.6, y: B + 0.58, dir: 1 },
    { n: 32, r: 0.84, y: B + 0.22, dir: -1 },
  ];
  const groups: THREE.Group[] = [];
  const sats: THREE.InstancedMesh[] = [];
  const palette = [DYE.turq, DYE.indigo, DYE.red, C.cotton, DYE.alpaca];
  const satGeo = new THREE.BoxGeometry(0.085, 0.085, 0.085);
  ctx.geos.push(satGeo);
  for (const ring of rings) {
    const g = new THREE.Group();
    const sat = new THREE.InstancedMesh(satGeo, ctx.env.toon("#ffffff"), ring.n);
    const spoke = new THREE.InstancedMesh(
      ctx.geos[ctx.geos.push(new THREE.BoxGeometry(1, 0.014, 0.014)) - 1]!,
      ctx.env.toon(C.woodDark),
      ring.n,
    );
    for (let i = 0; i < ring.n; i++) {
      const a = (i / ring.n) * Math.PI * 2;
      const cx = Math.cos(a);
      const sz = Math.sin(a);
      setInst(sat, i, cx * ring.r, ring.y, sz * ring.r, 1, -a);
      sat.setColorAt(i, _c.set(palette[i % palette.length]!));
      const len = ring.r - 0.34;
      _o.position.set(cx * (0.34 + len / 2), ring.y + 0.0, sz * (0.34 + len / 2));
      _o.rotation.set(0, -a, 0);
      _o.scale.set(len, 1, 1);
      _o.updateMatrix();
      spoke.setMatrixAt(i, _o.matrix);
    }
    sat.computeBoundingSphere();
    spoke.computeBoundingSphere();
    g.add(sat, spoke);
    ctx.group.add(g);
    ctx.moving.push(g);
    groups.push(g);
    sats.push(sat);
  }
  let last = -1;
  return (t: number) => {
    if (ctx.rm) return;
    groups[0]!.rotation.y = t * 0.25;
    groups[1]!.rotation.y = -t * 0.16;
    // A pulse walks the rings: one integration lights up at a time.
    const q = Math.floor(t * 6);
    if (q === last) return;
    const prev = last;
    last = q;
    for (let r = 0; r < 2; r++) {
      const sat = sats[r]!;
      const n = rings[r]!.n;
      if (prev >= 0) sat.setColorAt(prev % n, _c.set(palette[(prev % n) % palette.length]!));
      sat.setColorAt(q % n, _c.set(DYE.ochre).multiplyScalar(1.25));
      if (sat.instanceColor) sat.instanceColor.needsUpdate = true;
    }
  };
}

// ----------------------------------------------------------------------------------------- Hundred
function phone(ctx: Ctx, x: number, ry: number, title: string, bg: string, accent: string, lift = 0) {
  const k = ctx.kit;
  const y = B + lift + 0.1;
  const cx = Math.sin(ry);
  const cz = Math.cos(ry);
  if (lift > 0) k.box(0.09, lift, 0.09, x, B, 0, C.woodDark, ry);
  k.box(0.38, 0.06, 0.26, x, B + lift, 0, C.woodDark, ry);
  k.box(0.36, 0.66, 0.05, x - cx * 0.02, y, -cz * 0.02, "#24262e", ry, -0.12);
  addPlate(
    ctx,
    0.3,
    0.54,
    200,
    (c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = accent;
      c.fillRect(0, 0, w, h * 0.16);
      c.fillStyle = "#ffffff";
      fitText(c, title, w / 2, h * 0.085, w - 16, h * 0.1, "800", FONT.display);
      for (let i = 0; i < 4; i++) {
        c.fillStyle = i % 2 ? "#d7d2c4" : "#c9c2b0";
        roundRect(c, w * 0.08, h * (0.22 + i * 0.14), w * 0.84, h * 0.1, 6);
        c.fill();
      }
      c.strokeStyle = accent;
      c.lineWidth = 7;
      c.beginPath();
      c.arc(w / 2, h * 0.86, w * 0.1, 0.3, Math.PI * 1.7);
      c.stroke();
    },
    x + cx * 0.012,
    y + 0.34,
    cz * 0.012,
    -0.12,
    ry,
  );
}

/** Two phones syncing: 50% less sync time in “Gestiona tu Negocio” (Android + iOS). */
function hundred(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 1.7, 0.95);
  phone(ctx, -0.5, 0.32, "Android", "#eef2e8", "#5f8f55", 0.3);
  phone(ctx, 0.5, -0.32, "iOS", "#eef0f7", "#3446a6", 0.3);
  // Progress bar plaque with the metric.
  k.box(0.8, 0.2, 0.06, 0, B, 0.18, C.woodDark);
  addPlate(
    ctx,
    0.74,
    0.14,
    360,
    (c, w, h) => {
      c.fillStyle = C.ink;
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#3a3530";
      c.fillRect(6, 6, w - 12, h - 12);
      c.fillStyle = DYE.turq;
      c.fillRect(6, 6, (w - 12) * 0.5, h - 12);
      c.fillStyle = "#ffffff";
      fitText(
        c,
        ctx.lang === "es" ? "−50% tiempo de sync" : "−50% sync time",
        w / 2,
        h / 2 + 1,
        w - 24,
        h * 0.62,
        "800",
      );
    },
    0,
    B + 0.1,
    0.212,
  );
  // Sync ring: two curved arrows between the phones.
  const ring = new THREE.Group();
  ring.position.set(0, B + 1.25, 0.02);
  const mat = ctx.env.toon(DYE.ochre);
  const arc = new THREE.TorusGeometry(0.17, 0.03, 6, 14, Math.PI * 0.78);
  const head = new THREE.ConeGeometry(0.06, 0.11, 6);
  ctx.geos.push(arc, head);
  for (let i = 0; i < 2; i++) {
    const a = new THREE.Mesh(arc, mat);
    a.rotation.z = i * Math.PI;
    const hm = new THREE.Mesh(head, mat);
    const end = Math.PI * 0.78 + i * Math.PI;
    hm.position.set(Math.cos(end) * 0.17, Math.sin(end) * 0.17, 0);
    hm.rotation.z = end + Math.PI;
    ring.add(a, hm);
  }
  ctx.group.add(ring);
  ctx.moving.push(ring);
  // Data hopping between the phones.
  const m = inst(ctx, new THREE.BoxGeometry(0.07, 0.07, 0.07), 2, ctx.env.toon("#ffffff"));
  m.setColorAt(0, _c.set(DYE.turq));
  m.setColorAt(1, _c.set(DYE.red));
  return (t: number) => {
    ring.rotation.z = ctx.rm ? 0.4 : -t * 1.6;
    for (let i = 0; i < 2; i++) {
      const u = loop(ctx, t, 0.45, i * 0.5);
      const p = u < 0.5 ? u * 2 : 2 - u * 2;
      const x = THREE.MathUtils.lerp(-0.38, 0.38, i ? 1 - p : p);
      const y = B + 0.92 + Math.sin(p * Math.PI) * 0.22;
      setInst(m, i, x, y, 0.06, 1, ctx.rm ? 0 : t);
    }
    m.instanceMatrix.needsUpdate = true;
  };
}

// ----------------------------------------------------------------------------------------- Avances
/** The company's first Node.js microservices architecture, behind the hybrid mobile app (Ionic + Angular). */
function avances(ctx: Ctx) {
  const k = ctx.kit;
  pedestal(ctx, 1.9, 1.05);
  phone(ctx, -0.62, 0.25, "Ionic · Angular", "#f4efe4", DYE.alpaca, 0.15);
  // Hexagonal services on pillars.
  const nodes: Array<[number, number, number, string, number]> = [
    [0.2, 0.62, 0.05, DYE.turq, 0.2],
    [0.62, 0.38, -0.2, DYE.indigo, 0.15],
    [0.66, 0.85, 0.2, DYE.ochre, 0.15],
    [0.2, 0.25, -0.33, DYE.red, 0.13],
  ];
  for (const [x, y, z, col, r] of nodes) {
    k.box(0.06, y - 0.06, 0.06, x, B, z, C.woodDark);
    k.cyl(r, r, 0.14, x, B + y - 0.07, z, col, 6);
    k.cyl(r * 0.6, r * 0.6, 0.02, x, B + y + 0.07, z, C.cotton, 6);
  }
  addPlate(ctx, 0.36, 0.11, 240, plaqueDraw(["Node.js"]), 0.2, B + 0.62 - 0.17, 0.252);
  const hub = new THREE.Vector3(0.2, B + 0.62, 0.05);
  const ph = new THREE.Vector3(-0.5, B + 0.75, 0.0);
  k.stick(ph, hub, 0.014, C.strawDark);
  const paths: THREE.Vector3[][] = [[ph, hub]];
  for (let i = 1; i < nodes.length; i++) {
    const [x, y, z] = nodes[i]!;
    const p = new THREE.Vector3(x, B + y, z);
    k.stick(hub, p, 0.014, C.strawDark);
    paths.push([hub, p]);
  }
  const n = ctx.low ? 3 : 4;
  const m = inst(ctx, new THREE.BoxGeometry(0.06, 0.06, 0.06), n, ctx.env.toon("#ffffff"));
  for (let i = 0; i < n; i++) m.setColorAt(i, _c.set(i ? DYE.turq : DYE.ochre));
  return (t: number) => {
    for (let i = 0; i < n; i++) {
      const path = paths[i % paths.length]!;
      const u = loop(ctx, t, 0.5, i * 0.29);
      _v.copy(path[0]!).lerp(path[1]!, u);
      setInst(m, i, _v.x, _v.y, _v.z, Math.min(1, u / 0.1, (1 - u) / 0.1));
    }
    m.instanceMatrix.needsUpdate = true;
  };
}

/** Builder, display scale and footprint radius (world units, after scale). */
const BUILDERS: Record<string, { make: (ctx: Ctx) => (t: number) => void; scale: number; r: number }> = {
  avances: { make: avances, scale: 1.3, r: 1.25 },
  hundred: { make: hundred, scale: 1.35, r: 1.15 },
  belcorp: { make: belcorp, scale: 1.3, r: 1.15 },
  auna: { make: auna, scale: 1, r: 0.75 },
  xepelin: { make: xepelin, scale: 1.2, r: 1.0 },
  topsort: { make: topsort, scale: 1.25, r: 1.25 },
  globant: { make: globant, scale: 1.15, r: 1.1 },
};

/** Footprint radius of a company's exhibit (for layout and its collider). */
export const exhibitRadius = (companyId: string) => BUILDERS[companyId]?.r ?? 1;

export const hasExhibit = (companyId: string) => companyId in BUILDERS;

export function buildExhibit(
  env: WorldEnv,
  companyId: string,
  opts: { lang: Lang; low: boolean; rm: boolean },
): ExhibitModel | null {
  const spec = BUILDERS[companyId];
  if (!spec) return null;
  const group = new THREE.Group();
  group.name = `exhibit:${companyId}`;
  group.scale.setScalar(spec.scale);
  const ctx: Ctx = {
    env,
    lang: opts.lang,
    low: opts.low,
    rm: opts.rm,
    kit: new Kit(env),
    group,
    owned: [],
    geos: [],
    mats: [],
    moving: [],
  };
  const update = spec.make(ctx);
  group.add(ctx.kit.build(`exhibit-${companyId}`));
  update(0);
  for (const o of ctx.moving) {
    if ((o as THREE.InstancedMesh).isInstancedMesh) {
      const im = o as THREE.InstancedMesh;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }
  return {
    group,
    moving: ctx.moving,
    update,
    dispose() {
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && mesh.name.startsWith(`exhibit-${companyId}`)) mesh.geometry.dispose();
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      });
      for (const g of ctx.geos) g.dispose();
      for (const m of ctx.mats) m.dispose();
      for (const o of ctx.owned) o.dispose();
      group.removeFromParent();
    },
  };
}
