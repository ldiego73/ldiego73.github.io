import * as THREE from "three";
import { type Attract, createAttract } from "../arcade-lobby/attract";
import { type Cabinet, createCabinet } from "../arcade-lobby/cabinet";
import type { GameMeta } from "../games/core/types";
import { GAMES } from "../games/registry";
import { denoiseText } from "../lib/signal";
import { stationsInOrder } from "./artifacts";
import { type Collider, type Lang, STATIONS, type WorldEnv } from "./contract";
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
 * Non-company stations along the Qhapaq Ñan. Each is built in a local frame (+Z toward the trail,
 * origin at the station pose) and exposes local focus/front points; content places, registers
 * colliders/walkables (computed after placement) and drives proximity.
 */
/** Per-frame context for places that react to the traveler or the camera (interiors, cutaways). */
export interface PlaceCtx {
  avatar: THREE.Vector3;
  camera: THREE.Camera;
}

export interface Place {
  group: THREE.Group;
  /** World-space extras (e.g. the gate arch spanning the trail). */
  extras: THREE.Object3D[];
  focus: THREE.Vector3;
  front: THREE.Vector3;
  radius: number;
  torches: Torch[];
  hits: THREE.Object3D[];
  /** After the group is placed in the world. */
  colliders(): Collider[];
  walkables(): Collider[];
  update(dt: number, t: number, dist: number, ctx?: PlaceCtx): void;
  dispose(): void;
}

const ownedSet = () => {
  const mats: THREE.Material[] = [];
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const redraws: Array<() => void> = [];
  return {
    mats,
    geos,
    texs,
    redraws,
    dispose(root: THREE.Object3D) {
      for (const r of redraws) offFontsReady(r);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.includes(":")) m.geometry.dispose();
      });
      for (const g of geos) g.dispose();
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
      root.removeFromParent();
    },
  };
};

function signPlane(
  env: WorldEnv,
  own: ReturnType<typeof ownedSet>,
  w: number,
  h: number,
  pxW: number,
  pxH: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
) {
  const tex = canvasTex(pxW, pxH, draw);
  own.texs.push(tex);
  const mat = toonMapped(env, tex);
  own.mats.push(mat);
  const geo = new THREE.PlaneGeometry(w, h);
  own.geos.push(geo);
  const mesh = new THREE.Mesh(geo, mat);
  const re = () => redraw(tex, draw);
  onFontsReady(re);
  own.redraws.push(re);
  return { mesh, tex, redraw: re };
}

// ------------------------------------------------------------------------------------------------ gate
export function buildGate(env: WorldEnv, lang: Lang): Place {
  const own = ownedSet();
  const group = new THREE.Group();
  group.name = "gate";
  const rand = rng(7);
  const st = STATIONS.find((s) => s.id === "gate")!;

  // Stone arch spanning the trail at the trailhead (world space).
  const arch = new THREE.Group();
  arch.name = "gate-arch";
  const p = env.trail.pointAt(st.t);
  const tan = env.trail.tangentAt(st.t);
  arch.position.set(p.x, env.heightAt(p.x, p.z), p.z);
  // Local X spans across the trail (rotation.y maps +X to (cos, 0, -sin); +Z runs along the tangent).
  arch.rotation.y = Math.atan2(tan.x, tan.z);
  const half = env.trail.halfWidth + 0.75;
  const ak = new Kit(env);
  for (const sx of [-1, 1]) {
    for (let k = 0; k < 7; k++) {
      const bw = 0.95 - k * 0.04 + (rand() - 0.5) * 0.08;
      ak.box(
        bw,
        0.42,
        0.9 - k * 0.03,
        sx * (half + 0.35 + k * 0.012),
        -0.4 + k * 0.42,
        0,
        k % 3 === 1 ? C.stoneDark : C.stone,
        (rand() - 0.5) * 0.05,
      );
    }
  }
  // Trapezoidal lintel of three dressed stones.
  ak.box(half * 2 + 1.7, 0.48, 0.96, 0, 2.55, 0, C.stoneDark);
  ak.box(half * 2 + 1.2, 0.36, 0.86, 0, 3.03, 0, C.stone);
  ak.box(half * 2 + 0.5, 0.16, 0.6, 0, 3.39, 0, C.stoneDark);
  // Ichu tufts on top + a small apacheta cairn.
  for (let i = 0; i < 6; i++)
    ak.cyl(
      0.1,
      0.24,
      0.14 + rand() * 0.08,
      -half - 0.2 + i * ((half * 2 + 0.4) / 5),
      3.5,
      (rand() - 0.5) * 0.25,
      i % 2 ? C.straw : C.strawDark,
      6,
    );
  arch.add(ak.build("gate-arch"));
  // Dye banners hanging from the lintel.
  ["red", "ochre", "indigo", "turq"].forEach((dye, i) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.7, 0.03), env.toon(DYE[dye as keyof typeof DYE]));
    own.geos.push(b.geometry);
    b.position.set(-half + 0.6 + i * ((half * 2 - 1.2) / 3), 2.2, 0.5);
    arch.add(b);
  });

  // Signpost at the station pose: arrow board pointing up the trail + list of stations.
  const post = new Kit(env);
  post.box(0.6, 0.25, 0.6, 0, 0, 0, C.stoneDark);
  post.box(0.16, 3.2, 0.16, 0, 0.2, 0, C.woodDark);
  post.box(1.7, 2.0, 0.08, 0, 0.75, 0.1, C.wood);
  group.add(post.build("gate-post"));
  const list = stationsInOrder().filter((s) => s.kind !== "build" && s.kind !== "gate");
  const listSign = signPlane(env, own, 1.6, 1.9, 360, 428, (ctx, w, h) => {
    drawBoard(ctx, w, h, "#a7764a");
    ctx.fillStyle = "#2a1a10";
    ctx.textBaseline = "middle";
    fitFont(ctx, "QHAPAQ ÑAN", "800", FONT.display, 46, w - 40, "condensed ");
    ctx.textAlign = "center";
    ctx.fillText("QHAPAQ ÑAN", w / 2, 36);
    ctx.textAlign = "left";
    const rowH = (h - 82) / list.length;
    list.forEach((s, i) => {
      const y = 76 + rowH * (i + 0.5);
      ctx.fillStyle =
        s.kind === "company" ? DYE.ochre : s.kind === "bridge" ? DYE.indigo : s.kind === "arcade" ? DYE.red : DYE.turq;
      ctx.beginPath();
      ctx.arc(26, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#2a1a10";
      fitFont(ctx, s.label[lang], "600", FONT.body, 24, w - 60);
      ctx.fillText(s.label[lang], 44, y + 1);
    });
  });
  listSign.mesh.position.set(0, 1.75, 0.145);
  group.add(listSign.mesh);
  // Arrow board on top, pointing along the trail uphill (computed in world, applied in local).
  const drawArrow = (flip: boolean) => (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.save();
    if (flip) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.fillStyle = "#9a6a40";
    ctx.beginPath();
    ctx.moveTo(4, 8);
    ctx.lineTo(w - 60, 8);
    ctx.lineTo(w - 4, h / 2);
    ctx.lineTo(w - 60, h - 8);
    ctx.lineTo(4, h - 8);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = C.ink;
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "#2a1a10";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    const label = lang === "es" ? "A LA CUMBRE" : "TO THE SUMMIT";
    fitFont(ctx, label, "800", FONT.display, 44, w - 100, "condensed ");
    ctx.fillText(label, flip ? w / 2 + 24 : w / 2 - 24, h / 2 + 2);
  };
  const arrow = signPlane(env, own, 1.7, 0.5, 340, 100, drawArrow(false));
  const arrowBack = signPlane(env, own, 1.7, 0.5, 340, 100, drawArrow(true));
  for (const a of [arrow, arrowBack]) {
    const m = a.mesh.material as THREE.MeshToonMaterial;
    m.transparent = true;
    m.alphaTest = 0.5;
  }
  arrowBack.mesh.rotation.y = Math.PI;
  arrowBack.mesh.position.set(0.7, 0, -0.01);
  const arrowPivot = new THREE.Group();
  arrowPivot.position.set(0, 3.0, 0);
  arrow.mesh.position.set(0.7, 0, 0.01);
  arrowPivot.add(arrow.mesh, arrowBack.mesh);
  group.add(arrowPivot);

  // Llama by the gate (cozy diorama).
  const llama = buildLlama(env);
  llama.position.set(-1.6, 0, -0.9);
  llama.rotation.y = 0.8;
  group.add(llama);

  const torch = makeTorch(env, 1.7, 3);
  torch.group.position.set(1.1, 0, 0.4);
  group.add(torch.group);

  return {
    group,
    extras: [arch],
    focus: new THREE.Vector3(0, 0, 1.6),
    front: new THREE.Vector3(0, 0, 2.2),
    radius: 3.2,
    torches: [torch],
    hits: [group],
    colliders() {
      // Aim the arrow uphill along the trail now that the group is placed.
      group.updateMatrixWorld(true);
      const t2 = env.trail.tangentAt(Math.min(1, st.t + 0.03));
      const inv = new THREE.Quaternion();
      group.getWorldQuaternion(inv).invert();
      const dir = new THREE.Vector3(t2.x, 0, t2.z).normalize().applyQuaternion(inv);
      arrowPivot.rotation.y = Math.atan2(-dir.z, dir.x);
      arch.updateMatrixWorld(true);
      return [
        ...circlesAlong(arch, -(half + 0.35), -0.3, -(half + 0.35), 0.3, 0.5),
        ...circlesAlong(arch, half + 0.35, -0.3, half + 0.35, 0.3, 0.5),
        circleAt(group, 0, 0, 0.35),
        circleAt(group, -1.6, -0.9, 0.5),
      ];
    },
    walkables: () => [circleAt(group, 0, 1.8, 2.2)],
    update(_dt, t) {
      torch.update(t);
      llama.rotation.z = 0;
      const head = llama.getObjectByName("llama-head");
      if (head && !env.reducedMotion) head.rotation.y = Math.sin(t * 0.6) * 0.4;
    },
    dispose() {
      torch.dispose();
      own.dispose(group);
      arch.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      arch.removeFromParent();
    },
  };
}

/** A small stylized llama (body, neck, head with ears, legs, a dyed tassel on the ear). */
export function buildLlama(env: WorldEnv) {
  const g = new THREE.Group();
  const k = new Kit(env);
  const wool = "#efe3cf";
  k.box(0.5, 0.48, 1.0, 0, 0.62, 0, wool);
  k.box(0.56, 0.12, 0.7, 0, 1.08, 0, DYE.red); // saddle blanket
  k.box(0.58, 0.04, 0.72, 0, 1.06, 0, DYE.ochre);
  for (const [x, z] of [
    [-0.16, 0.36],
    [0.16, 0.36],
    [-0.16, -0.36],
    [0.16, -0.36],
  ] as const)
    k.box(0.12, 0.66, 0.12, x, 0, z, wool);
  k.box(0.18, 0.12, 0.16, 0, 0.92, -0.52, wool); // tail
  k.box(0.22, 0.7, 0.22, 0, 0.95, 0.42, wool); // neck
  g.add(k.build("llama"));
  const head = new THREE.Group();
  head.name = "llama-head";
  head.position.set(0, 1.62, 0.46);
  const hk = new Kit(env);
  hk.box(0.26, 0.24, 0.32, 0, 0, 0.04, wool);
  hk.box(0.18, 0.14, 0.16, 0, -0.02, 0.26, "#d9c9ad");
  hk.box(0.06, 0.2, 0.05, -0.09, 0.22, -0.04, wool, 0, 0, 0.2);
  hk.box(0.06, 0.2, 0.05, 0.09, 0.22, -0.04, wool, 0, 0, -0.2);
  hk.box(0.07, 0.07, 0.07, -0.12, 0.38, -0.04, DYE.red);
  hk.box(0.04, 0.05, 0.02, -0.08, 0.06, 0.2, C.ink);
  hk.box(0.04, 0.05, 0.02, 0.08, 0.06, 0.2, C.ink);
  head.add(hk.build("llama-headm"));
  g.add(head);
  return g;
}

// ------------------------------------------------------------------------------------------------ arcade
export interface ArcadePlace extends Place {
  cabinets: Array<{ meta: GameMeta; cab: Cabinet; local: THREE.Vector3; world: THREE.Vector3 }>;
  focusCabinet(i: number | null): void;
}

const CAB_COLOR: Record<string, string> = {
  lime: "#7fae6a",
  amber: DYE.ochre,
  violet: "#6b5aa8",
  cyan: DYE.turq,
  magenta: "#c2557f",
  red: DYE.red,
};

export function buildArcade(
  env: WorldEnv,
  lang: Lang,
  ground: (x: number, z: number) => number = () => 0,
): ArcadePlace {
  const own = ownedSet();
  const group = new THREE.Group();
  group.name = "arcade";
  const rand = rng(hashStr("arcade"));
  const w = 11.2;
  const d = 6.4;
  // Tall enough that the traveler and the cabinets read clearly from the follow camera.
  const h = 4.8;
  // Centered on the station pose (the core flattens the full footprint).
  const z1 = d / 2;
  const z0 = z1 - d;
  const zc = (z0 + z1) / 2;
  const kit = new Kit(env);
  // Plinth seated tile by tile on the terrain (no gaps on slopes).
  for (let x = -w / 2 - 0.6; x < w / 2 + 2.9; x += 1.0)
    for (let z = z0 - 0.6; z < z1 + 0.6; z += 1.0)
      kit.seatBox(1.0, 0.1, 1.0, x + 0.5, -0.06, z + 0.5, C.stoneDark, ground);
  kit.box(w + 0.9, 0.12, d + 0.9, 0, 0, zc, C.stone);
  // Plank floor inside.
  for (let x = -w / 2 + 0.6; x < w / 2 - 0.5; x += 0.42)
    kit.box(0.4, 0.04, d - 0.7, x + 0.2, 0.12, zc + 0.05, rand() < 0.3 ? C.woodDark : C.wood);
  // Walls in separate groups so the ones facing the camera can drop to a cutaway while inside.
  const wallG = (name: string, build: (k: Kit) => void) => {
    const k = new Kit(env);
    build(k);
    const g = new THREE.Group();
    g.add(k.build(name));
    group.add(g);
    return g;
  };
  const backW = wallG("arcade-back", (k) =>
    stoneWall(k, rand, -w / 2, z0, w / 2, z0, 0.12, h, 0.45, { batter: 0.012, inward: new THREE.Vector2(0, 1) }),
  );
  const leftW = wallG("arcade-left", (k) =>
    stoneWall(k, rand, -w / 2, z0, -w / 2, z1, 0.12, h, 0.45, { batter: 0.012, inward: new THREE.Vector2(1, 0) }),
  );
  const rightW = wallG("arcade-right", (k) => {
    stoneWall(k, rand, w / 2, z0, w / 2, z1, 0.12, h, 0.45, { batter: 0.012, inward: new THREE.Vector2(-1, 0) });
    // Asymmetry: a lean-to storeroom on the right side.
    stoneWall(k, rand, w / 2, z0 + 0.6, w / 2 + 2.2, z0 + 0.6, 0.12, 1.7, 0.4);
    stoneWall(k, rand, w / 2 + 2.2, z0 + 0.6, w / 2 + 2.2, z0 + 3.2, 0.12, 1.7, 0.4);
  });
  // Open front: corner piers + a carved wooden beam.
  const frontW = wallG("arcade-front", (k) => {
    stoneWall(k, rand, -w / 2, z1, -w / 2 + 1.1, z1, 0.12, h, 0.5);
    stoneWall(k, rand, w / 2 - 1.5, z1, w / 2, z1, 0.12, h, 0.5);
  });
  // Front lintel beam + sign: fades (not squashed) together with the front cutaway, so it never
  // hangs in the foreground over the cabinets while the traveler is inside.
  const beamG = wallG("arcade-beam", (k) => k.box(w + 0.3, 0.32, 0.5, 0, h - 0.2, z1, C.woodDark));
  kit.box(2.6, 0.08, 3.0, w / 2 + 1.15, 1.82, z0 + 1.9, C.thatch, 0, 0, -0.2);
  const rk = new Kit(env);
  rk.box(w + 0.2, 0.12, d + 0.2, 0, h + 0.1, zc, C.woodDark);
  thatchRoof(rk, rand, w, d, h + 0.18, 2.6, 0, zc);
  const roofG = new THREE.Group();
  roofG.add(rk.build("arcade-roof"));
  // Woven rug (dye stripes) in front of the cabinets.
  ["red", "ochre", "indigo", "turq", "red"].forEach((dye, i) => {
    kit.box(5.2, 0.02, 0.36, 0, 0.16, zc + 0.9 + i * 0.36, DYE[dye as keyof typeof DYE]);
  });
  // Crates and jars inside the corners.
  kit.box(0.6, 0.5, 0.6, -w / 2 + 0.8, 0.14, z1 - 0.8, C.wood, 0.3);
  kit.box(0.45, 0.4, 0.45, -w / 2 + 0.85, 0.64, z1 - 0.85, C.woodDark, 0.6);
  kit.cyl(0.22, 0.15, 0.5, w / 2 - 0.7, 0.14, z1 - 0.9, C.adobe, 8);
  // Cords for the hanging lanterns.
  for (const x of [-3.2, 0.4, 3.6])
    kit.stick(new THREE.Vector3(x, h + 0.1, zc + 0.6), new THREE.Vector3(x, h - 1.45, zc + 0.6), 0.02, C.cotton, 4);
  group.add(kit.build("arcade-house"));
  group.add(roofG);
  const roofFade = fadeable(roofG, env);
  const roofEase = new Ease01(0.35, env.reducedMotion);
  const tmpL = new THREE.Vector3();

  // Sign above the opening.
  const sign = signPlane(env, own, 3.4, 0.62, 560, 102, (ctx, cw, ch) => {
    drawBoard(ctx, cw, ch);
    ctx.fillStyle = "#2a1a10";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = lang === "es" ? "TAMBO ARCADE" : "ARCADE TAMBO";
    fitFont(ctx, label, "800", FONT.display, 66, cw - 40, "condensed ");
    ctx.fillText(label, cw / 2, ch / 2 + 3);
  });
  sign.mesh.position.set(0, h - 0.2, z1 + 0.27);
  beamG.add(sign.mesh);
  const beamFade = fadeable(beamG, env);
  const cut = cutaway(
    [
      { g: backW, n: new THREE.Vector3(0, 0, -1) },
      { g: leftW, n: new THREE.Vector3(-1, 0, 0) },
      { g: rightW, n: new THREE.Vector3(1, 0, 0) },
      { g: frontW, n: new THREE.Vector3(0, 0, 1) },
    ],
    env.reducedMotion,
  );

  // Nine cabinets in a cozy shallow arc along the back wall.
  const games = GAMES.slice(0, 9);
  const attracts: Attract[] = [];
  const span = 9.0;
  const cabinets = games.map((meta, i) => {
    const u = games.length > 1 ? i / (games.length - 1) - 0.5 : 0;
    const x = u * span;
    const z = z0 + 0.95 + u * u * 2.4;
    const color = CAB_COLOR[meta.neon] ?? DYE.ochre;
    const cab = createCabinet({ color, marquee: meta.marquee, lang });
    cab.group.position.set(x, 0.14, z);
    cab.group.rotation.y = -u * 0.9;
    const at = createAttract(meta.slug, meta.title[lang], color);
    at.draw(0);
    cab.setScreenTexture(at.texture);
    attracts.push(at);
    group.add(cab.group);
    const f = new THREE.Vector3(Math.sin(-u * 0.9), 0, Math.cos(-u * 0.9));
    const local = new THREE.Vector3(x, 0, z).addScaledVector(f, 1.05);
    return { meta, cab, local, world: new THREE.Vector3() };
  });

  // Hanging lanterns inside (warm at night).
  const torches: Torch[] = [];
  for (const x of [-3.2, 0.4, 3.6]) {
    const t = makeTorch(env, 0.01, hashStr(`lan${x}`));
    t.group.position.set(x, h - 1.5, zc + 0.6);
    t.group.scale.setScalar(0.8);
    group.add(t.group);
    torches.push(t);
  }
  const outside = makeTorch(env, 1.7, 11);
  outside.group.position.set(w / 2 + 0.4, 0, z1 + 0.9);
  group.add(outside.group);
  torches.push(outside);

  let focused: number | null = null;
  const focusLevel = cabinets.map(() => 0);
  let lastFrame = -1;
  return {
    group,
    extras: [],
    cabinets,
    focus: new THREE.Vector3(0, 0, zc + 0.5),
    front: new THREE.Vector3(-0.8, 0, z1 + 2.4),
    radius: 7,
    torches,
    hits: cabinets.map((c) => c.cab.group),
    focusCabinet(i) {
      focused = i;
    },
    colliders() {
      group.updateMatrixWorld(true);
      for (const c of cabinets) c.world.copy(c.local).applyMatrix4(group.matrixWorld);
      return [
        ...circlesAlong(group, -w / 2, z0, w / 2, z0, 0.45),
        ...circlesAlong(group, -w / 2, z0, -w / 2, z1, 0.45),
        ...circlesAlong(group, w / 2, z0, w / 2, z1, 0.45),
        ...circlesAlong(group, -w / 2, z1, -w / 2 + 1.1, z1, 0.4),
        ...circlesAlong(group, w / 2 - 1.5, z1, w / 2, z1, 0.4),
        ...circlesAlong(group, w / 2, z0 + 0.6, w / 2 + 2.2, z0 + 3.2, 0.5),
        ...cabinets.map((c) => circleAt(group, c.cab.group.position.x, c.cab.group.position.z, 0.5)),
        circleAt(group, -w / 2 + 0.8, z1 - 0.8, 0.45),
        circleAt(group, w / 2 - 0.7, z1 - 0.9, 0.3),
      ];
    },
    walkables() {
      const out: Collider[] = [];
      for (let x = -w / 2 + 1; x <= w / 2 - 1; x += 1.3)
        for (let z = z0 + 0.9; z <= z1 + 0.2; z += 1.3) out.push(circleAt(group, x, z, 1.0));
      out.push(circleAt(group, 0, z1 + 1.8, 3.2));
      return out;
    },
    update(dt, t, dist, ctx?: PlaceCtx) {
      for (const tt of torches) tt.update(t);
      if (ctx) {
        tmpL.copy(ctx.avatar);
        group.worldToLocal(tmpL);
        const inside = tmpL.x > -w / 2 && tmpL.x < w / 2 && tmpL.z > z0 && tmpL.z < z1 + 0.3;
        roofFade.set(roofEase.step(inside ? 0 : 1, dt));
        // Cut camera-facing walls while the traveler is inside or on the doorstep.
        const near = tmpL.x > -w / 2 - 1 && tmpL.x < w / 2 + 3 && tmpL.z > z0 - 1 && tmpL.z < z1 + 3;
        tmpL.copy(ctx.camera.position);
        group.worldToLocal(tmpL);
        tmpL.set(tmpL.x, 0, tmpL.z - zc).normalize();
        cut.update(dt, near, tmpL);
        beamFade.set(cut.level(3));
        (group.userData as { inside?: boolean }).inside = inside;
      }
      if (dist > 30) return;
      cabinets.forEach((c, i) => {
        const target = i === focused ? 1 : 0;
        focusLevel[i] = focusLevel[i]! + (target - focusLevel[i]!) * Math.min(1, dt * 6);
        c.cab.setFocus(focusLevel[i]!);
      });
      const fr = Math.floor(t * 12);
      if (fr !== lastFrame) {
        lastFrame = fr;
        for (const a of attracts) a.draw(t);
      }
    },
    dispose() {
      for (const tt of torches) tt.dispose();
      for (const a of attracts) a.dispose();
      for (const c of cabinets) c.cab.dispose();
      roofFade.dispose();
      beamFade.dispose();
      own.dispose(group);
    },
  };
}

// ------------------------------------------------------------------------------------------------ AI Intihuatana
export function buildIntihuatana(env: WorldEnv, lang: Lang): Place {
  const own = ownedSet();
  const group = new THREE.Group();
  group.name = "intihuatana";
  const rand = rng(hashStr("ai"));
  const kit = new Kit(env);
  // Small summit platform: two irregular stepped terraces.
  const terrace = (r: number, y: number, hgt: number, color: string, seg: number) => {
    const g = new THREE.CylinderGeometry(r, r * 1.04, hgt, seg);
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + Math.sin(a * 3 + 1) * 0.06 + Math.cos(a * 5) * 0.04;
      p.setXYZ(i, p.getX(i) * k, p.getY(i), p.getZ(i) * k);
    }
    kit.add(g, color, 0, y + hgt / 2, -2.2, 0, 0, 0, 1, 1, 1, true);
    g.dispose();
  };
  terrace(3.6, -1.4, 1.5, C.stoneDark, 9);
  terrace(2.5, 0.1, 0.22, C.stone, 8);
  // Steps up front.
  kit.box(1.4, 0.12, 0.5, 0, 0.0, 0.6, C.stone);
  // The carved stone: base block, stepped seat, the gnomon pillar with a slanted top.
  kit.box(1.9, 0.55, 1.3, 0, 0.32, -2.4, "#a59d8f", 0.12);
  kit.box(1.3, 0.38, 0.95, -0.15, 0.86, -2.45, C.stone, 0.12);
  kit.box(0.7, 0.3, 0.55, 0.55, 0.86, -2.2, C.stoneDark, 0.12);
  kit.add(
    new THREE.CylinderGeometry(0.2, 0.27, 0.9, 4),
    C.stone,
    -0.2,
    1.68,
    -2.5,
    0,
    Math.PI / 4 + 0.12,
    0,
    1,
    1,
    1,
    true,
  );
  kit.box(0.34, 0.18, 0.34, -0.2, 2.1, -2.5, C.stoneDark, Math.PI / 4 + 0.12, 0.35);
  // Stele frame (stone screen) to the right, on two stone feet.
  kit.box(0.3, 0.5, 0.4, 1.05, 0.32, -1.7, C.stoneDark);
  kit.box(0.3, 0.5, 0.4, 2.65, 0.32, -1.7, C.stoneDark);
  kit.box(2.1, 1.45, 0.24, 1.85, 0.8, -1.7, "#7b7468", -0.35);
  kit.box(2.3, 0.16, 0.34, 1.85, 2.24, -1.7, C.stoneDark, -0.35);
  for (let i = 0; i < 5; i++)
    kit.rock(0.2 + rand() * 0.25, -2.3 + rand() * 0.6, 0.2, -3.2 + rand() * 2.2, C.stoneDark, rand);
  group.add(kit.build("inti"));

  // Glyph screen: "Del ruido a la señal" denoising (CanvasTexture + denoiseText).
  const msg = lang === "es" ? "DEL RUIDO A LA SEÑAL" : "FROM NOISE TO SIGNAL";
  const W = 512;
  const H = 336;
  let level = 0;
  const drawScreen = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#24222b";
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `600 22px ${FONT.mono}`;
    const noiseRows = 9;
    for (let r = 0; r < noiseRows; r++) {
      const line = denoiseText("·".repeat(30), 0, 3 + r + Math.floor(level * 6));
      ctx.fillStyle = r % 2 ? "rgba(42,157,143,0.45)" : "rgba(221,166,60,0.35)";
      const y = 24 + r * 33;
      if (Math.abs(y - H / 2) < 40) continue;
      ctx.fillText(line, W / 2, y);
    }
    const s = level;
    const text = denoiseText(msg, s, 11);
    fitFont(ctx, msg, "800", FONT.display, 54, W - 48, "condensed ");
    ctx.fillStyle = s > 0.98 ? "#ffd48a" : "#7fd6c8";
    ctx.fillText(text, W / 2, H / 2 + 2);
    ctx.strokeStyle = "rgba(255,212,138,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, W - 20, H - 20);
  };
  const screenTex = canvasTex(W, H, drawScreen);
  own.texs.push(screenTex);
  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false });
  own.mats.push(screenMat);
  const screenGeo = new THREE.PlaneGeometry(1.86, 1.22);
  own.geos.push(screenGeo);
  const screen = new THREE.Mesh(screenGeo, screenMat);
  screen.position.set(1.85, 1.52, -1.57);
  screen.rotation.y = -0.35;
  screen.position.x += Math.sin(-0.35) * 0.01;
  env.noOutline(screen);
  group.add(screen);

  const torch = makeTorch(env, 1.6, 21);
  torch.group.position.set(-1.6, 0.3, -1.2);
  group.add(torch.group);

  let acc = 0;
  let cycle = 0;
  const rm = env.reducedMotion;
  if (rm) {
    level = 1;
    redraw(screenTex, drawScreen);
  }
  return {
    group,
    extras: [],
    focus: new THREE.Vector3(0.6, 0, 0.2),
    front: new THREE.Vector3(0.4, 0, 1.6),
    radius: 3.4,
    torches: [torch],
    hits: [group],
    colliders: () => [
      circleAt(group, 0, -2.4, 1.1),
      circleAt(group, 1.85, -1.7, 0.6),
      circleAt(group, 1.1, -1.7, 0.4),
      circleAt(group, 2.6, -1.7, 0.4),
      circleAt(group, -1.6, -1.2, 0.2),
    ],
    walkables: () => [circleAt(group, 0, -1.4, 2.6), circleAt(group, 0, 0.8, 2.0)],
    update(dt, t, dist) {
      torch.update(t);
      if (rm || dist > 32) return;
      acc += dt;
      if (acc < 0.1) return;
      cycle = (cycle + acc) % 7;
      acc = 0;
      // 0–3.2 s resolve, hold, then scatter back to noise.
      level = cycle < 3.2 ? cycle / 3.2 : cycle < 6.2 ? 1 : 1 - (cycle - 6.2) / 0.8;
      redraw(screenTex, drawScreen);
    },
    dispose() {
      torch.dispose();
      own.dispose(group);
    },
  };
}

// ------------------------------------------------------------------------------------------------ Construction plot
export function buildPlot(env: WorldEnv, id: string, lang: Lang): Place {
  const own = ownedSet();
  const group = new THREE.Group();
  group.name = `plot:${id}`;
  const rand = rng(hashStr(id));
  const kit = new Kit(env);
  const w = 4.6 + rand() * 1.2;
  const d = 3.6 + rand() * 0.8;
  const cz = -d / 2 - 0.4;
  // Terrace: retaining wall + bare earth.
  kit.box(w + 0.5, 1.2, d + 0.5, 0, -1.0, cz, C.stoneDark);
  kit.box(w, 0.1, d, 0, 0.1, cz, "#8a6a48");
  stoneWall(kit, rand, -w / 2 - 0.25, cz + d / 2 + 0.25, w / 2 + 0.25, cz + d / 2 + 0.25, -0.3, 0.55, 0.35);
  // Fence on three sides.
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(len / 0.9));
    for (let i = 0; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n;
      const z = az + ((bz - az) * i) / n;
      kit.box(0.09, 0.95 + rand() * 0.1, 0.09, x, 0.1, z, C.woodDark, rand() * 0.3, (rand() - 0.5) * 0.08);
    }
    const ry = Math.atan2(-(bz - az), bx - ax);
    for (const hy of [0.45, 0.8]) kit.box(len, 0.06, 0.05, (ax + bx) / 2, hy, (az + bz) / 2, C.wood, ry);
  };
  fence(-w / 2, cz - d / 2, w / 2, cz - d / 2);
  fence(-w / 2, cz - d / 2, -w / 2, cz + d / 2);
  fence(w / 2, cz - d / 2, w / 2, cz + d / 2);
  // Scaffolding: poles, two plank levels, cross braces.
  const sx = -w / 2 + 1.1 + rand() * 0.5;
  const sz = cz - d / 2 + 0.9;
  const P = (x: number, yy: number, z: number) => new THREE.Vector3(x, yy, z);
  for (const [x, z] of [
    [sx, sz],
    [sx + 1.6, sz],
    [sx, sz + 1.0],
    [sx + 1.6, sz + 1.0],
  ] as const)
    kit.stick(P(x, 0.1, z), P(x, 2.7, z), 0.045, C.wood, 5);
  for (const lv of [1.25, 2.35]) kit.box(1.9, 0.07, 1.15, sx + 0.8, lv, sz + 0.5, C.woodDark);
  kit.stick(P(sx, 0.2, sz + 1.0), P(sx + 1.6, 1.25, sz + 1.0), 0.03, C.wood, 4);
  kit.stick(P(sx, 1.3, sz + 1.0), P(sx + 1.6, 2.35, sz + 1.0), 0.03, C.wood, 4);
  // Half-built adobe wall behind the scaffold.
  for (let c = 0; c < 4; c++)
    for (let i = 0; i < 6 - c; i++)
      kit.box(
        0.36,
        0.16,
        0.24,
        sx - 0.1 + i * 0.38 + (c % 2) * 0.19,
        0.12 + c * 0.17,
        sz - 0.3,
        rand() < 0.3 ? C.thatch : C.adobe,
      );
  // Stacked adobe bricks.
  const bx = w / 2 - 1.3;
  const bz = cz + 0.3;
  for (let c = 0; c < 4; c++)
    for (let i = 0; i < 3; i++)
      kit.box(
        0.36,
        0.15,
        0.24,
        bx + (c % 2 ? 0 : 0.0) + (c % 2 ? 0.1 : 0) + (rand() - 0.5) * 0.03,
        0.12 + c * 0.155,
        bz + i * 0.26,
        C.adobe,
        (((c % 2) * Math.PI) / 2) * 0 + (rand() - 0.5) * 0.08,
      );
  for (let i = 0; i < 4; i++)
    kit.box(0.36, 0.15, 0.24, bx + 0.5, 0.12, bz - 0.4 + i * 0.26, C.adobe, (rand() - 0.5) * 0.1);
  // Cones.
  for (let i = 0; i < 3; i++) {
    const x = -w / 2 + 0.9 + i * 1.3 + rand() * 0.3;
    const z = cz + d / 2 - 0.4;
    kit.box(0.42, 0.05, 0.42, x, 0.12, z, C.cone);
    kit.cyl(0.04, 0.17, 0.55, x, 0.17, z, C.cone, 8);
    kit.cyl(0.11, 0.13, 0.1, x, 0.38, z, C.cotton, 8);
  }
  group.add(kit.build(`plot-${id}`));

  const sign = signPlane(env, own, 1.7, 0.75, 400, 176, (ctx, cw, ch) => {
    drawBoard(ctx, cw, ch, "#d9b25a");
    ctx.fillStyle = "#2a1a10";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const a = lang === "es" ? "EN CONSTRUCCIÓN" : "UNDER CONSTRUCTION";
    fitFont(ctx, a, "800", FONT.display, 54, cw - 40, "condensed ");
    ctx.fillText(a, cw / 2, ch * 0.4);
    ctx.font = `600 28px ${FONT.mono}`;
    ctx.fillText(lang === "es" ? "Próximamente" : "Coming soon", cw / 2, ch * 0.74);
  });
  const sk = new Kit(env);
  sk.box(0.08, 1.4, 0.08, -0.7, 0, 0, C.woodDark);
  sk.box(0.08, 1.4, 0.08, 0.7, 0, 0, C.woodDark);
  const signG = new THREE.Group();
  signG.add(sk.build("plot-sign"));
  sign.mesh.position.set(0, 1.05, 0.05);
  signG.add(sign.mesh);
  signG.position.set(w / 2 - 0.9, 0.1, cz + d / 2 + 0.9);
  signG.rotation.y = -0.2;
  group.add(signG);

  return {
    group,
    extras: [],
    focus: new THREE.Vector3(0.6, 0, 1.4),
    front: new THREE.Vector3(0, 0, 2.2),
    radius: 3.4,
    torches: [],
    hits: [group],
    colliders: () => [
      ...circlesAlong(group, -w / 2, cz - d / 2, w / 2, cz - d / 2, 0.4),
      ...circlesAlong(group, -w / 2, cz - d / 2, -w / 2, cz + d / 2, 0.4),
      ...circlesAlong(group, w / 2, cz - d / 2, w / 2, cz + d / 2, 0.4),
      circleAt(group, sx + 0.8, sz + 0.5, 1.0),
      circleAt(group, bx + 0.2, bz + 0.2, 0.6),
    ],
    walkables: () => [circleAt(group, 0, cz, Math.max(w, d) / 2 + 0.3), circleAt(group, 0, 1.4, 2.2)],
    update() {},
    dispose() {
      own.dispose(group);
    },
  };
}
