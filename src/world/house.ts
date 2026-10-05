import * as THREE from "three";
import type { Collider, Lang, WorldEnv } from "./contract";
import type { Place, PlaceCtx } from "./landmarks";
import { buildLlama } from "./landmarks";
import {
  C,
  canvasTex,
  circleAt,
  circlesAlong,
  cutaway,
  DYE,
  drawBoard,
  Ease01,
  FONT,
  fadeable,
  fitFont,
  glowSprite,
  hashStr,
  Kit,
  makeTorch,
  offFontsReady,
  onFontsReady,
  redraw,
  rng,
  stoneWall,
  type Torch,
  thatchRoof,
  toonMapped,
} from "./props";

/**
 * The chasqui post is the owner's house: an enterable stone house at the top of the trail.
 * Inside, a cozy studio (wood floor, rug, desk with laptop + monitor, podcast mic, headphones, mug,
 * bookshelf, plant, lamps, a wall khipu, a window over the mountains). While the traveler is inside
 * the roof fades and the walls facing the camera drop to a low cutaway (dollhouse view).
 * Local frame: origin at the station pose, +Z toward the trail; the door faces the trail.
 */
export interface HouseSpot {
  id: "desk" | "monitor" | "shelf";
  local: THREE.Vector3;
  r: number;
}

export interface HousePlace extends Place {
  spots: HouseSpot[];
  /** True when a local point lies inside the house. */
  isInside(local: THREE.Vector3): boolean;
  /** Whether the traveler is inside (updated every frame). */
  readonly inside: boolean;
  setNight(night: boolean): void;
}

const W = 6.6;
const Z0 = -6.2; // back wall
const Z1 = -0.9; // front wall
const H = 3.0;
const T = 0.4;
const DOOR_X = -1.2;
const DOOR_W = 1.7;
const DOOR_H = 2.3;
const WIN = { x0: -1.7, x1: -0.3, y0: 1.25, y1: 2.25 };
/** The house body sits this far toward the trail so the station pose falls inside the room. */
const SHIFT = 1.2;

const BOOKS: string[][] = [
  [
    "Fundamentals of Software Architecture",
    "Software Architecture: The Hard Parts",
    "Building Evolutionary Architectures",
    "Clean Architecture",
    "Domain-Driven Design",
  ],
  [
    "Designing Data-Intensive Applications",
    "Building Microservices",
    "Release It!",
    "Enterprise Integration Patterns",
    "Team Topologies",
  ],
  ["Site Reliability Engineering", "Kubernetes Up & Running", "Cloud FinOps", "Terraform: Up & Running", "Accelerate"],
  ["AI Engineering", "Deep Learning", "Hands-On Machine Learning", "Designing ML Systems", "The Phoenix Project"],
];

function spineTexture(titles: string[], seed: number) {
  const r = rng(seed);
  const colors = [DYE.red, DYE.indigo, DYE.ochre, DYE.turq, DYE.alpaca, "#5f8f55", "#efe6d6", "#3d4046"];
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = "#4a2e1c";
    ctx.fillRect(0, 0, w, h);
    let x = 4;
    let i = 0;
    while (x < w - 10) {
      const bw = 30 + Math.floor(r() * 26);
      const bh = h * (0.72 + r() * 0.26);
      const col = colors[Math.floor(r() * colors.length)]!;
      ctx.fillStyle = col;
      ctx.fillRect(x, h - bh, bw - 3, bh);
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, h - bh, bw - 3, bh);
      ctx.fillStyle = col === "#efe6d6" || col === DYE.ochre ? "#2a1a10" : "#f6efe2";
      ctx.fillRect(x + 3, h - bh + 8, bw - 9, 2);
      const title = titles[i % titles.length]!;
      ctx.save();
      ctx.translate(x + bw / 2 - 1, h - bh / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fitFont(ctx, title, "700", FONT.display, 18, bh - 18, "condensed ");
      ctx.fillText(title, 0, 1);
      ctx.restore();
      x += bw;
      i++;
    }
  };
  const tex = canvasTex(512, 112, draw);
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  return { tex, re };
}

function monitorTexture(lang: Lang) {
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = "#1e2130";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#2a2e42";
    ctx.fillRect(0, 0, w, 22);
    for (const [i, c] of ["#c4383f", "#dda63c", "#2a9d8f"].entries()) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(14 + i * 16, 11, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.font = `600 12px ${FONT.mono}`;
    ctx.fillStyle = "#9aa3c7";
    ctx.fillText(lang === "es" ? "proyectos/khipu.ts" : "projects/khipu.ts", 70, 15);
    const lines: Array<Array<[string, string]>> = [
      [
        ["import", "#c792ea"],
        [" { knot } ", "#e9e4ff"],
        ["from", "#c792ea"],
        [' "./cords"', "#c3e88d"],
      ],
      [],
      [
        ["export const", "#c792ea"],
        [" khipu ", "#82aaff"],
        ["= ", "#e9e4ff"],
        ["career", "#ffcb6b"],
        [".map(", "#e9e4ff"],
      ],
      [
        ["  (stage) ", "#f78c6c"],
        ["=> ", "#c792ea"],
        ["knot(", "#82aaff"],
        ["stage", "#f78c6c"],
        [", ", "#e9e4ff"],
        ["{", "#e9e4ff"],
      ],
      [
        ["    dye: ", "#e9e4ff"],
        ['"cochineal"', "#c3e88d"],
        [",", "#e9e4ff"],
      ],
      [
        ["    shipped: ", "#e9e4ff"],
        ["true", "#f78c6c"],
        [",", "#e9e4ff"],
      ],
      [["  }),", "#e9e4ff"]],
      [[");", "#e9e4ff"]],
      [],
      [
        ["// ", "#6b7394"],
        [lang === "es" ? "del ruido a la señal" : "from noise to signal", "#6b7394"],
      ],
      [
        ["await ", "#c792ea"],
        ["deploy", "#82aaff"],
        ["(khipu)", "#e9e4ff"],
      ],
    ];
    ctx.font = `500 15px ${FONT.mono}`;
    lines.forEach((ln, li) => {
      let x = 34;
      ctx.fillStyle = "#4b5274";
      ctx.fillText(String(li + 1).padStart(2, " "), 8, 46 + li * 19);
      for (const [txt, col] of ln) {
        ctx.fillStyle = col;
        ctx.fillText(txt, x, 46 + li * 19);
        x += ctx.measureText(txt).width;
      }
    });
    ctx.fillStyle = "#dda63c";
    ctx.fillRect(34, 46 + 10 * 19 + 6, 9, 3);
  };
  const tex = canvasTex(400, 260, draw);
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  return { tex, re };
}

function laptopTexture() {
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = "#f3ead8";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1f1a17";
    fitFont(ctx, "KHIPU", "800", FONT.display, 54, w - 40, "condensed ");
    ctx.fillText("KHIPU", 18, 70);
    ctx.font = `500 14px ${FONT.body}`;
    ctx.fillText("Luis Diego · Engineering Manager", 18, 98);
    const dyes = [DYE.red, DYE.ochre, DYE.indigo, DYE.turq, DYE.alpaca];
    dyes.forEach((d, i) => {
      ctx.fillStyle = d;
      ctx.fillRect(22 + i * 34, 118, 6, 56 + (i % 3) * 14);
      ctx.beginPath();
      ctx.arc(25 + i * 34, 140 + (i % 2) * 14, 7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#c4383f";
    ctx.fillRect(w - 120, 130, 100, 30);
    ctx.fillStyle = "#fff8ee";
    ctx.font = `700 12px ${FONT.display}`;
    ctx.fillText("60 MIN", w - 96, 150);
  };
  const tex = canvasTex(300, 200, draw);
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  return { tex, re };
}

function windowView(night: boolean) {
  return canvasTex(256, 192, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, night ? "#1b2340" : "#9fd7d0");
    g.addColorStop(1, night ? "#2e3a66" : "#e9f2e6");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    if (night) {
      ctx.fillStyle = "#e9e4ff";
      ctx.beginPath();
      ctx.arc(190, 40, 14, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 18; i++) ctx.fillRect((i * 53) % w, (i * 29) % 80, 2, 2);
    }
    const peak = (x: number, y: number, s: number, c: string, snow: boolean) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(x - s, h);
      ctx.lineTo(x, y);
      ctx.lineTo(x + s, h);
      ctx.fill();
      if (snow) {
        ctx.fillStyle = night ? "#c9cff0" : "#ffffff";
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - s * 0.28, y + s * 0.3);
        ctx.lineTo(x - s * 0.08, y + s * 0.24);
        ctx.lineTo(x + s * 0.1, y + s * 0.33);
        ctx.lineTo(x + s * 0.28, y + s * 0.3);
        ctx.fill();
      }
    };
    peak(70, 50, 110, night ? "#4a557f" : "#8f877b", true);
    peak(190, 70, 100, night ? "#3d4870" : "#b9b1a3", true);
    ctx.fillStyle = night ? "#2f4a3a" : "#7fae6a";
    ctx.fillRect(0, h - 46, w, 46);
    ctx.fillStyle = night ? "#263d30" : "#5f8f55";
    for (let i = 0; i < 4; i++) ctx.fillRect(0, h - 46 + i * 12, w, 4);
  });
}

function rugTexture() {
  return canvasTex(256, 160, (ctx, w, h) => {
    ctx.fillStyle = DYE.red;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#efe6d6";
    ctx.fillRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = DYE.indigo;
    ctx.fillRect(18, 18, w - 36, h - 36);
    // Chakana-like stepped crosses.
    const cross = (cx: number, cy: number, s: number, c: string) => {
      ctx.fillStyle = c;
      ctx.fillRect(cx - s, cy - s * 3, s * 2, s * 6);
      ctx.fillRect(cx - s * 3, cy - s, s * 6, s * 2);
      ctx.fillRect(cx - s * 2, cy - s * 2, s * 4, s * 4);
    };
    cross(w / 2, h / 2, 9, DYE.ochre);
    cross(w / 2, h / 2, 4, DYE.red);
    for (const x of [50, w - 50]) cross(x, h / 2, 6, DYE.turq);
    ctx.fillStyle = DYE.ochre;
    for (let x = 22; x < w - 22; x += 14) {
      ctx.fillRect(x, 22, 6, 6);
      ctx.fillRect(x, h - 28, 6, 6);
    }
  });
}

/** A lamp that behaves like a torch for the night system: warm bulb + glow. */
function lamp(env: WorldEnv, standing: boolean, seed: number): Torch {
  const group = new THREE.Group();
  const kit = new Kit(env);
  const hgt = standing ? 1.55 : 0.42;
  kit.cyl(standing ? 0.18 : 0.08, standing ? 0.2 : 0.09, 0.05, 0, 0, 0, C.woodDark, 8);
  kit.cyl(0.025, 0.025, hgt, 0, 0.04, 0, standing ? C.wood : "#3d4046", 5);
  kit.add(
    new THREE.CylinderGeometry(standing ? 0.14 : 0.08, standing ? 0.26 : 0.13, standing ? 0.3 : 0.14, 10, 1, true),
    standing ? "#efe6d6" : DYE.ochre,
    0,
    hgt + (standing ? 0.12 : 0.04),
    0,
    0,
    0,
    0,
    1,
    1,
    1,
    true,
  );
  group.add(kit.build("lamp"));
  const bulbMat = new THREE.MeshBasicMaterial({ color: "#ffe2a3", toneMapped: false });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(standing ? 0.07 : 0.04, 8, 6), bulbMat);
  bulb.position.y = hgt;
  env.noOutline(bulb);
  const glow = glowSprite(env, C.torch, standing ? 1.6 : 0.9);
  glow.position.y = hgt;
  group.add(bulb, glow);
  let night = false;
  const ph = rng(seed)() * 6;
  return {
    group,
    set(n) {
      night = n;
      glow.visible = n;
      bulbMat.color.set(n ? "#ffe2a3" : "#d9cfb8");
    },
    update(t) {
      if (night) (glow.material as THREE.SpriteMaterial).opacity = 0.7 + Math.sin(t * 2 + ph) * 0.05;
    },
    dispose() {
      bulb.geometry.dispose();
      bulbMat.dispose();
      (glow.material as THREE.SpriteMaterial).dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
      });
    },
  };
}

export function buildHouse(env: WorldEnv, lang: Lang, groundOuter: (x: number, z: number) => number): HousePlace {
  /** Terrain height in the house body's frame (shifted SHIFT toward the trail from the station pose). */
  const ground = (x: number, z: number) => groundOuter(x, z + SHIFT);
  const outer = new THREE.Group();
  outer.name = "chasqui-house";
  const group = new THREE.Group();
  group.name = "chasqui-house-body";
  group.position.z = SHIFT;
  outer.add(group);
  /** Body-local point → outer (station) local point. */
  const toOuter = (v: THREE.Vector3) => v.clone().setZ(v.z + SHIFT);
  const rand = rng(hashStr("chasqui-house"));
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const redraws: Array<() => void> = [];
  const zc = (Z0 + Z1) / 2;

  // ---------- foundation + floor (seated on the terrain)
  const base = new Kit(env);
  const step = 0.9;
  for (let x = -W / 2 - 0.4; x < W / 2 + 0.4; x += step)
    for (let z = Z0 - 0.4; z < Z1 + 0.4; z += step)
      base.seatBox(step, 0.06, step, x + step / 2, -0.08, z + step / 2, C.stoneDark, ground);
  for (let x = -W / 2 + T; x < W / 2 - T - 0.05; x += 0.36)
    base.box(0.34, 0.05, Z1 - Z0 - T * 2, x + 0.18, -0.04, zc, rand() < 0.3 ? C.woodDark : C.wood);
  // Threshold stone under the door, and two steps out to the plaza.
  base.seatBox(DOOR_W + 0.3, 0.06, 0.7, DOOR_X, -0.06, Z1 + 0.35, C.stone, ground);
  group.add(base.build("house-base"));

  // ---------- walls (four groups, so camera-facing ones can drop to a cutaway)
  const wallGroup = (name: string, build: (k: Kit) => void) => {
    const g = new THREE.Group();
    g.name = name;
    const k = new Kit(env);
    build(k);
    g.add(k.build(name));
    group.add(g);
    return g;
  };
  /** A straight wall along X at z, built course by course, leaving rectangular gaps. */
  const wallX = (k: Kit, z: number, gaps: Array<{ x0: number; x1: number; y0: number; y1: number }>) => {
    const courses = Math.round(H / 0.34);
    const ch = H / courses;
    for (let c = 0; c < courses; c++) {
      const y = c * ch;
      const cuts = gaps.filter((g) => y + ch * 0.5 > g.y0 && y + ch * 0.5 < g.y1).sort((a, b) => a.x0 - b.x0);
      let segs: Array<[number, number]> = [[-W / 2, W / 2]];
      for (const g of cuts)
        segs = segs.flatMap(([a, b]) =>
          g.x1 <= a || g.x0 >= b
            ? [[a, b]]
            : (
                [
                  [a, g.x0],
                  [g.x1, b],
                ] as Array<[number, number]>
              ).filter(([p, q]) => q - p > 0.05),
        );
      for (const [a, b] of segs) {
        let s = a;
        while (s < b - 0.02) {
          const bl = Math.min(b - s, 0.38 + rand() * 0.5);
          k.box(
            bl - 0.03,
            ch * (0.93 + rand() * 0.08),
            T * (0.95 + rand() * 0.08),
            s + bl / 2,
            y,
            z,
            rand() < 0.28 ? C.stoneDark : C.stone,
          );
          s += bl;
        }
      }
    }
  };
  const back = wallGroup("house-wall-back", (k) => {
    wallX(k, Z0, [WIN]);
    // Window frame + sill.
    k.box(WIN.x1 - WIN.x0 + 0.24, 0.12, T + 0.12, (WIN.x0 + WIN.x1) / 2, WIN.y0 - 0.12, Z0, C.woodDark);
    k.box(WIN.x1 - WIN.x0 + 0.24, 0.12, T + 0.04, (WIN.x0 + WIN.x1) / 2, WIN.y1, Z0, C.woodDark);
    k.box(0.1, WIN.y1 - WIN.y0, T + 0.04, WIN.x0 - 0.05, WIN.y0, Z0, C.woodDark);
    k.box(0.1, WIN.y1 - WIN.y0, T + 0.04, WIN.x1 + 0.05, WIN.y0, Z0, C.woodDark);
    k.box(0.05, WIN.y1 - WIN.y0, 0.05, (WIN.x0 + WIN.x1) / 2, WIN.y0, Z0 + 0.1, C.woodDark);
  });
  const left = wallGroup("house-wall-left", (k) => stoneWall(k, rand, -W / 2, Z0, -W / 2, Z1, 0, H, T, { courses: 9 }));
  const right = wallGroup("house-wall-right", (k) => stoneWall(k, rand, W / 2, Z0, W / 2, Z1, 0, H, T, { courses: 9 }));
  const front = wallGroup("house-wall-front", (k) => {
    wallX(k, Z1, [{ x0: DOOR_X - DOOR_W / 2, x1: DOOR_X + DOOR_W / 2, y0: -1, y1: DOOR_H }]);
    k.box(DOOR_W + 0.5, 0.28, T + 0.08, DOOR_X, DOOR_H, Z1, C.stoneDark);
    // Wooden door, swung fully open flat against the inner face of the front wall.
    k.box(DOOR_W * 0.9, DOOR_H - 0.1, 0.07, DOOR_X + DOOR_W / 2 + DOOR_W * 0.45 + 0.02, 0, Z1 - T / 2 - 0.05, C.wood);
    k.box(0.06, 0.06, 0.03, DOOR_X + DOOR_W / 2 + DOOR_W * 0.8, 1.1, Z1 - T / 2 - 0.1, C.woodDark);
  });
  // Sign over the door.
  const signDraw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    drawBoard(ctx, w, h);
    ctx.fillStyle = "#2a1a10";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = lang === "es" ? "PUESTO DEL CHASQUI" : "CHASQUI POST";
    fitFont(ctx, label, "800", FONT.display, 52, w - 36, "condensed ");
    ctx.fillText(label, w / 2, h / 2 + 2);
  };
  const signTex = canvasTex(440, 90, signDraw);
  texs.push(signTex);
  const signRe = () => redraw(signTex, signDraw);
  onFontsReady(signRe);
  redraws.push(signRe);
  const signMat = toonMapped(env, signTex);
  mats.push(signMat);
  const signGeo = new THREE.PlaneGeometry(2.2, 0.45);
  geos.push(signGeo);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(DOOR_X, DOOR_H + 0.55, Z1 + T / 2 + 0.03);
  front.add(sign);

  // ---------- roof (fades while inside)
  const roofG = new THREE.Group();
  roofG.name = "house-roof";
  const rk = new Kit(env);
  rk.box(W + 0.2, 0.12, Z1 - Z0 + 0.2, 0, H, zc, C.woodDark);
  thatchRoof(rk, rand, W, Z1 - Z0, H + 0.1, 2.3, 0, zc);
  roofG.add(rk.build("house-roof"));
  group.add(roofG);
  const roofFade = fadeable(roofG, env);
  const roofEase = new Ease01(0.35, env.reducedMotion);

  // ---------- window view (inside the back wall gap)
  const dayView = windowView(false);
  const nightView = windowView(true);
  texs.push(dayView, nightView);
  const viewMat = new THREE.MeshBasicMaterial({ map: dayView, toneMapped: false });
  mats.push(viewMat);
  const viewGeo = new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0);
  geos.push(viewGeo);
  const view = new THREE.Mesh(viewGeo, viewMat);
  view.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, Z0 - 0.12);
  env.noOutline(view);
  back.add(view);

  // ---------- furniture
  const fk = new Kit(env);
  const deskX = 1.6;
  const deskZ = -5.55;
  const deskY = 0.76;
  fk.box(2.4, 0.07, 0.85, deskX, deskY - 0.07, deskZ, C.wood);
  for (const [dx, dz] of [
    [-1.12, -0.36],
    [1.12, -0.36],
    [-1.12, 0.36],
    [1.12, 0.36],
  ] as const)
    fk.box(0.07, deskY - 0.07, 0.07, deskX + dx, 0, deskZ + dz, C.woodDark);
  fk.box(0.55, 0.32, 0.7, deskX + 0.8, deskY - 0.42, deskZ, C.woodDark); // drawers
  fk.box(0.22, 0.03, 0.03, deskX + 0.8, deskY - 0.27, deskZ + 0.36, DYE.ochre);
  // Chair tucked under the desk.
  fk.box(0.5, 0.06, 0.5, deskX - 0.1, 0.44, deskZ + 0.55, C.wood);
  fk.box(0.5, 0.55, 0.06, deskX - 0.1, 0.5, deskZ + 0.8, C.woodDark);
  for (const [dx, dz] of [
    [-0.21, -0.21],
    [0.21, -0.21],
    [-0.21, 0.21],
    [0.21, 0.21],
  ] as const)
    fk.box(0.05, 0.44, 0.05, deskX - 0.1 + dx, 0, deskZ + 0.55 + dz, C.woodDark);
  fk.box(0.5, 0.06, 0.5, deskX - 0.1, 0.5, deskZ + 0.55, DYE.red); // cushion
  // Monitor stand + frame.
  const monX = deskX + 0.35;
  fk.box(0.32, 0.03, 0.22, monX, deskY, deskZ - 0.15, "#3d4046");
  fk.box(0.06, 0.32, 0.05, monX, deskY, deskZ - 0.2, "#3d4046");
  fk.box(0.96, 0.6, 0.05, monX, deskY + 0.3, deskZ - 0.2, "#2b2d33");
  // Laptop base.
  const lapX = deskX - 0.7;
  fk.box(0.52, 0.025, 0.36, lapX, deskY, deskZ + 0.05, "#9a9fa8");
  // Mug + handle.
  fk.cyl(0.055, 0.05, 0.11, deskX - 0.2, deskY, deskZ + 0.25, DYE.ochre, 10);
  fk.add(
    new THREE.TorusGeometry(0.035, 0.012, 5, 8),
    DYE.ochre,
    deskX - 0.14,
    deskY + 0.055,
    deskZ + 0.25,
    0,
    0,
    Math.PI / 2,
  );
  // Podcast mic on a boom arm clamped to the desk's left edge.
  const clamp = new THREE.Vector3(deskX - 1.15, deskY, deskZ - 0.3);
  const elbow = new THREE.Vector3(deskX - 1.1, deskY + 0.62, deskZ - 0.15);
  const head = new THREE.Vector3(deskX - 0.85, deskY + 0.66, deskZ + 0.2);
  fk.box(0.08, 0.1, 0.1, clamp.x, deskY - 0.05, clamp.z, "#2b2d33");
  fk.stick(clamp, elbow, 0.018, "#2b2d33", 5);
  fk.stick(elbow, head, 0.018, "#2b2d33", 5);
  fk.add(new THREE.CapsuleGeometry(0.05, 0.14, 3, 8), "#3d4046", head.x, head.y - 0.1, head.z, 0.3, 0, 0);
  fk.add(new THREE.TorusGeometry(0.075, 0.012, 5, 12), "#2b2d33", head.x, head.y - 0.1, head.z + 0.1, 0.3, 0, 0);
  // Headphones resting on the desk's right end.
  fk.add(
    new THREE.TorusGeometry(0.11, 0.018, 5, 12, Math.PI),
    "#2b2d33",
    deskX + 1.0,
    deskY + 0.05,
    deskZ + 0.15,
    -Math.PI / 2,
    0,
    0,
  );
  for (const s of [-1, 1]) fk.cyl(0.055, 0.055, 0.05, deskX + 1.0 + s * 0.11, deskY, deskZ + 0.15, DYE.turq, 10);
  // Bookshelf against the left wall, facing +X (part of that wall: it drops with the cutaway).
  const shX = -W / 2 + T / 2 + 0.2;
  const shZ = -3.7;
  const shW = 2.0;
  const shk = new Kit(env);
  for (const dz of [-shW / 2, shW / 2]) shk.box(0.38, 2.3, 0.06, shX, 0, shZ + dz, C.woodDark);
  shk.box(0.04, 2.3, shW, shX - 0.18, 0, shZ, C.wood);
  for (let i = 0; i < 5; i++) shk.box(0.38, 0.05, shW, shX, 0.08 + i * 0.55, shZ, C.woodDark);
  left.add(shk.build("bookshelf"));
  // Plant in a clay pot.
  const plant = new THREE.Vector3(W / 2 - 0.6, 0, Z1 - 0.6);
  fk.cyl(0.24, 0.17, 0.42, plant.x, 0, plant.z, C.adobe, 9);
  fk.cyl(0.26, 0.26, 0.06, plant.x, 0.4, plant.z, C.thatch, 9);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    fk.add(
      new THREE.ConeGeometry(0.1, 0.75 + rand() * 0.3, 4),
      i % 2 ? C.grass : C.grassDark,
      plant.x + Math.cos(a) * 0.1,
      0.8,
      plant.z + Math.sin(a) * 0.1,
      Math.sin(a) * 0.35,
      0,
      -Math.cos(a) * 0.35,
    );
  }
  // Rug frame stones? No: the rug is a textured plane below.
  group.add(fk.build("house-furniture"));

  // Rug.
  const rugTex = rugTexture();
  texs.push(rugTex);
  const rugMat = toonMapped(env, rugTex);
  mats.push(rugMat);
  const rugGeo = new THREE.PlaneGeometry(3.0, 1.9);
  geos.push(rugGeo);
  const rug = new THREE.Mesh(rugGeo, rugMat);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.1, 0.02, -3.2);
  env.noOutline(rug);
  group.add(rug);

  // Screens.
  const mon = monitorTexture(lang);
  const lap = laptopTexture();
  texs.push(mon.tex, lap.tex);
  redraws.push(mon.re, lap.re);
  const monMat = new THREE.MeshBasicMaterial({ map: mon.tex, toneMapped: false });
  const lapMat = new THREE.MeshBasicMaterial({ map: lap.tex, toneMapped: false });
  mats.push(monMat, lapMat);
  const monGeo = new THREE.PlaneGeometry(0.88, 0.52);
  const lapGeo = new THREE.PlaneGeometry(0.46, 0.3);
  geos.push(monGeo, lapGeo);
  const monScreen = new THREE.Mesh(monGeo, monMat);
  monScreen.position.set(monX, deskY + 0.6, deskZ - 0.17);
  env.noOutline(monScreen);
  group.add(monScreen);
  const lid = new THREE.Group();
  lid.position.set(lapX, deskY + 0.02, deskZ - 0.13);
  lid.rotation.x = -0.28;
  const lk = new Kit(env);
  lk.box(0.52, 0.34, 0.02, 0, 0, 0, "#9a9fa8");
  lid.add(lk.build("laptop-lid"));
  const lapScreen = new THREE.Mesh(lapGeo, lapMat);
  lapScreen.position.set(0, 0.17, 0.012);
  env.noOutline(lapScreen);
  lid.add(lapScreen);
  group.add(lid);

  // Book spines (one textured strip per shelf, facing into the room).
  BOOKS.forEach((row, i) => {
    const sp = spineTexture(row, 11 + i * 7);
    texs.push(sp.tex);
    redraws.push(sp.re);
    const m = toonMapped(env, sp.tex);
    mats.push(m);
    const g = new THREE.PlaneGeometry(shW - 0.1, 0.46);
    geos.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(shX + 0.02, 0.13 + i * 0.55 + 0.24, shZ);
    env.noOutline(mesh);
    left.add(mesh);
  });

  // Small khipu on the right wall (part of that wall, hides with the cutaway).
  const wk = new THREE.Group();
  wk.position.set(W / 2 - T / 2 - 0.04, 1.85, -3.4);
  wk.rotation.y = -Math.PI / 2;
  const wkk = new Kit(env);
  wkk.box(1.0, 0.06, 0.06, 0, 0, 0, C.woodDark);
  wkk.cyl(0.03, 0.03, 1.0, 0, -0.05, 0, C.cotton, 6, 0, Math.PI / 2);
  ["red", "ochre", "indigo", "turq", "alpaca"].forEach((d, i) => {
    const x = -0.4 + i * 0.2;
    const len = 0.55 + (i % 3) * 0.12;
    wkk.box(0.03, len, 0.03, x, -0.08 - len, 0, DYE[d as keyof typeof DYE]);
    for (let k = 0; k <= i % 3; k++)
      wkk.add(new THREE.SphereGeometry(0.04, 6, 5), DYE[d as keyof typeof DYE], x, -0.25 - k * 0.12, 0);
  });
  wk.add(wkk.build("wall-khipu"));
  right.add(wk);

  // Lamps (warm at night; the content's warm light follows them too).
  const floorLamp = lamp(env, true, 3);
  floorLamp.group.position.set(-W / 2 + 0.7, 0, Z1 - 0.7);
  const deskLamp = lamp(env, false, 5);
  deskLamp.group.position.set(deskX + 1.05, deskY, deskZ - 0.25);
  group.add(floorLamp.group, deskLamp.group);

  // ---------- outside: pututo, message khipu, apacheta, llama (positioned after placement, clear of the trail)
  const yard: Array<{ g: THREE.Group; r: number; cands: Array<[number, number]> }> = [];
  const yardItem = (r: number, cands: Array<[number, number]>, build: (g: THREE.Group) => void) => {
    const g = new THREE.Group();
    build(g);
    group.add(g);
    yard.push({ g, r, cands });
  };
  // Candidate spots (body local) around the sides and back of the house, most preferred first.
  const SIDE_R: Array<[number, number]> = [
    [4.3, -2.0],
    [4.3, -4.6],
    [4.4, -6.6],
    [2.6, -7.3],
  ];
  const SIDE_L: Array<[number, number]> = [
    [-4.3, -3.0],
    [-4.3, -5.4],
    [-2.4, -7.3],
    [-4.4, -1.2],
  ];
  yardItem(0.4, [...SIDE_R], (g) => {
    const k = new Kit(env);
    k.box(0.5, 1.4, 0.5, 0, -0.6, 0, C.stone, 0.2);
    g.add(k.build("pututo-pedestal"));
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      prof.push(new THREE.Vector2(0.02 + Math.sin(u * Math.PI) * 0.17 * (1 - u * 0.4), u * 0.55));
    }
    const shellGeo = new THREE.LatheGeometry(prof, 9);
    geos.push(shellGeo);
    const shell = new THREE.Mesh(shellGeo, env.toon("#f2d8c2"));
    shell.position.set(0, 0.98, 0);
    shell.rotation.set(0.2, 0.4, Math.PI / 2.3);
    g.add(shell);
  });
  yardItem(0.45, [...SIDE_R].reverse(), (g) => {
    const k = new Kit(env);
    let ay = -0.2;
    for (let i = 0; i < 6; i++) {
      const r = 0.34 - i * 0.045;
      k.rock(r, (rand() - 0.5) * 0.1, ay, (rand() - 0.5) * 0.1, i % 2 ? C.stone : C.stoneDark, rand);
      ay += r * 0.9;
    }
    g.add(k.build("apacheta"));
  });
  const mk = new THREE.Group();
  yardItem(0.2, [...SIDE_L], (g) => {
    const k = new Kit(env);
    k.box(0.12, 2.5, 0.12, 0, -0.6, 0, C.woodDark);
    k.box(0.9, 0.08, 0.08, 0, 1.85, 0, C.woodDark);
    g.add(k.build("khipu-post"));
    mk.position.set(0, 1.82, 0);
    const mkk = new Kit(env);
    ["red", "ochre", "indigo", "turq"].forEach((d, i) => {
      mkk.box(0.03, 0.7, 0.03, -0.3 + i * 0.2, -0.7, 0, DYE[d as keyof typeof DYE]);
      for (let kk = 0; kk < 1 + i; kk++)
        mkk.add(new THREE.SphereGeometry(0.04, 6, 5), DYE[d as keyof typeof DYE], -0.3 + i * 0.2, -0.15 - kk * 0.12, 0);
    });
    mk.add(mkk.build("message-khipu"));
    g.add(mk);
  });
  yardItem(0.6, [...SIDE_L].reverse(), (g) => {
    const llama = buildLlama(env);
    llama.rotation.y = 0.9;
    g.add(llama);
  });
  const yardColliders: Collider[] = [];
  /** Moves each yard item to its first candidate that is clear of the trail and other items. */
  const placeYard = () => {
    group.updateMatrixWorld(true);
    yardColliders.length = 0;
    const used: THREE.Vector3[] = [];
    const clear = env.trail.halfWidth + 1.4;
    for (const it of yard) {
      let pick: [number, number] | null = null;
      for (const c of it.cands) {
        const w = group.localToWorld(new THREE.Vector3(c[0], 0, c[1]));
        const tp = env.trail.pointAt(env.trail.nearestT(w.x, w.z));
        if (Math.hypot(tp.x - w.x, tp.z - w.z) < clear) continue;
        if (used.some((u) => u.distanceTo(w) < 1.4)) continue;
        pick = c;
        used.push(w);
        break;
      }
      if (!pick) {
        it.g.visible = false;
        continue;
      }
      it.g.position.set(pick[0], Math.min(0, ground(pick[0], pick[1])), pick[1]);
      yardColliders.push(circleAt(group, pick[0], pick[1], it.r));
    }
  };
  const torch = makeTorch(env, 1.7, 31);
  torch.group.position.set(DOOR_X - DOOR_W / 2 - 0.5, 0, Z1 + 0.5);
  group.add(torch.group);

  // ---------- interaction + state
  const spots: HouseSpot[] = [
    { id: "desk", local: toOuter(new THREE.Vector3(lapX, 0, -4.55)), r: 0.75 },
    { id: "monitor", local: toOuter(new THREE.Vector3(monX + 0.15, 0, -4.55)), r: 0.75 },
    { id: "shelf", local: toOuter(new THREE.Vector3(shX + 1.05, 0, shZ)), r: 1.0 },
  ];
  const isInside = (p: THREE.Vector3) => p.x > -W / 2 + 0.1 && p.x < W / 2 - 0.1 && p.z > Z0 + 0.1 && p.z < Z1 - 0.15;

  const cut = cutaway(
    [
      { g: back, n: new THREE.Vector3(0, 0, -1) },
      { g: front, n: new THREE.Vector3(0, 0, 1) },
      { g: left, n: new THREE.Vector3(-1, 0, 0) },
      { g: right, n: new THREE.Vector3(1, 0, 0) },
    ],
    env.reducedMotion,
  );
  const tmp = new THREE.Vector3();
  const camLocal = new THREE.Vector3();
  let inside = false;
  let night = false;
  const torches: Torch[] = [torch, floorLamp, deskLamp];

  return {
    group: outer,
    extras: [],
    spots,
    focus: toOuter(new THREE.Vector3(DOOR_X + 0.4, 0, 0.9)),
    front: toOuter(new THREE.Vector3(DOOR_X, 0, 1.6)),
    radius: 2.6,
    torches,
    hits: [group],
    isInside,
    setNight(n) {
      night = n;
      viewMat.map = n ? nightView : dayView;
      viewMat.needsUpdate = true;
    },
    colliders(): Collider[] {
      outer.updateMatrixWorld(true);
      placeYard();
      const r = 0.3;
      const dl = DOOR_X - DOOR_W / 2 - r;
      const dr = DOOR_X + DOOR_W / 2 + r;
      return [
        ...circlesAlong(group, -W / 2, Z0, W / 2, Z0, r),
        ...circlesAlong(group, -W / 2, Z0, -W / 2, Z1, r),
        ...circlesAlong(group, W / 2, Z0, W / 2, Z1, r),
        ...circlesAlong(group, -W / 2, Z1, dl, Z1, r),
        ...circlesAlong(group, dr, Z1, W / 2, Z1, r),
        ...circlesAlong(group, deskX - 1.1, deskZ - 0.05, deskX + 1.1, deskZ - 0.05, 0.42),
        ...circlesAlong(group, shX + 0.05, shZ - shW / 2 + 0.2, shX + 0.05, shZ + shW / 2 - 0.2, 0.3),
        circleAt(group, plant.x, plant.z, 0.3),
        circleAt(group, -W / 2 + 0.7, Z1 - 0.7, 0.22),
        ...yardColliders,
        circleAt(group, DOOR_X - DOOR_W / 2 - 0.5, Z1 + 0.5, 0.18),
      ];
    },
    walkables() {
      outer.updateMatrixWorld(true);
      const out: Collider[] = [];
      for (let x = -W / 2 + 0.9; x <= W / 2 - 0.8; x += 0.9)
        for (let z = Z0 + 0.8; z <= Z1 - 0.5; z += 0.9) out.push(circleAt(group, x, z, 0.75));
      out.push(circleAt(group, DOOR_X, Z1, 1.0), circleAt(group, DOOR_X, Z1 + 1.4, 2.2));
      return out;
    },
    update(dt, t, _dist, ctx?: PlaceCtx) {
      for (const tc of torches) tc.update(t);
      if (!env.reducedMotion) mk.rotation.z = Math.sin(t * 1.4) * 0.03;
      if (!ctx) return;
      tmp.copy(ctx.avatar);
      group.worldToLocal(tmp);
      inside = isInside(tmp);
      roofFade.set(roofEase.step(inside ? 0 : 1, dt));
      camLocal.copy(ctx.camera.position);
      group.worldToLocal(camLocal);
      camLocal.y = 0;
      camLocal.z -= zc;
      camLocal.normalize();
      cut.update(dt, inside, camLocal);
      wk.visible = right.scale.y > 0.85;
      sign.visible = front.scale.y > 0.85;
      void night;
    },
    dispose() {
      for (const r of redraws) offFontsReady(r);
      for (const tc of torches) tc.dispose();
      roofFade.dispose();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
      });
      for (const g of geos) g.dispose();
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      outer.removeFromParent();
    },
    // Exposed for content (camera hint).
    get inside() {
      return inside;
    },
  } as HousePlace;
}
