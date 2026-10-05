import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { NEON } from "../core/neon";
import { addLights, type Stage } from "../core/stage";
import type { Palette } from "../core/types";
import {
  BALL_R,
  BOSS_R,
  BOSS_Y,
  BRICK_H,
  BRICK_TOP,
  BRICK_W,
  type Brick,
  H,
  MAX_BALLS,
  PADDLE_H,
  PADDLE_Y,
  type PowerKind,
  paddleHalf,
  type State,
  W,
} from "./state";

const BRICK_Y = 0.55; // brick height above the floor
const MAX_BRICKS = 80;
const MAX_SPARKS = 90;
const MAX_POWERS = 8;
const PAD_R = PADDLE_H / 2;
const CANVAS_FONT = '"Silkscreen", "Arial Narrow", sans-serif';

/** State (x, y) to world: y runs away from the camera along -z. */
const wz = (y: number) => H / 2 - y;
const col = (c: string) => new THREE.Color(c);

export const POWER_COLOR: Record<PowerKind, string> = {
  wide: NEON.lime,
  multi: NEON.lime,
  slow: NEON.lime,
  pierce: NEON.lime,
  debt: NEON.red,
};
const POWER_TAG: Record<PowerKind, string> = {
  wide: "AUTOSCALE",
  multi: "RETRY",
  slow: "BREAKER",
  pierce: "STRANGLER",
  debt: "TECH DEBT",
};

/** Matte block edging: 12 thin bars merged into one geometry (one draw call, works instanced). */
function frameGeo(w: number, h: number, d: number, t = 0.045): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bar = (sx: number, sy: number, sz: number, x: number, y: number, z: number) =>
    parts.push(new THREE.BoxGeometry(sx, sy, sz).translate(x, y, z));
  for (const a of [-1, 1])
    for (const b of [-1, 1]) {
      bar(w + t, t, t, 0, (a * h) / 2, (b * d) / 2);
      bar(t, h, t, (a * w) / 2, 0, (b * d) / 2);
      bar(t, t, d, (a * w) / 2, (b * h) / 2, 0);
    }
  const g = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return g;
}

function textTex(text: string, color: string, w = 256, h = 64, px = 40): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  const draw = () => {
    const g = c.getContext("2d")!;
    g.fillStyle = NEON.void;
    g.fillRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    g.font = `700 ${px}px ${CANVAS_FONT}`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(text, w / 2, h / 2 + 2, w - 12);
    t.needsUpdate = true;
  };
  draw();
  document.fonts?.ready.then(draw);
  return t;
}

interface Spark {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  c: THREE.Color;
}
/** Tiny, deterministic stone pixels; legacy cores carry a stepped crack. */
function stoneTex(palette: Palette, cracked = false): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const g = canvas.getContext("2d")!;
  const stoneBase = palette.dim;
  const stoneFleck = col(palette.dim).lerp(col(palette.ink), 0.35).getStyle();
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const fleck = (x * 13 + y * 7 + x * y) % 11 < 3;
      g.fillStyle = cracked ? (fleck ? palette.void : palette.floor) : fleck ? stoneFleck : stoneBase;
      g.fillRect(x, y, 1, 1);
    }
  }
  g.fillStyle = cracked ? palette.void : palette.grid;
  g.fillRect(0, 0, 16, 1);
  g.fillRect(0, 0, 1, 16);
  if (cracked) {
    for (let y = 1; y < 16; y++) {
      const x = 7 + (Math.floor(y / 3) % 3);
      g.fillRect(x, y, 2, 1);
      if (y === 8) g.fillRect(3, y, x - 3, 1);
    }
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

export function createView(stage: Stage, reduced: boolean, palette: Palette = NEON) {
  const NEON = palette;
  const { scene, camera } = stage;
  const cam = camera as THREE.PerspectiveCamera;
  addLights(scene);
  const camBase = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const corners = [-1, 1].flatMap((sx) => [
    ...[-1, 1].map((sz) => new THREE.Vector3(sx * (W / 2 + 0.4), 0, sz * (H / 2 + 0.4))),
    new THREE.Vector3(sx * (W / 2 + 0.4), 0.6, -H / 2 - 0.6),
    new THREE.Vector3(sx * (W / 2 + 0.4), 2.9, wz(BOSS_Y)),
  ]);
  const pv = new THREE.Vector3();
  const fitDist = () => {
    let lo = 4;
    let hi = 140;
    for (let k = 0; k < 22; k++) {
      const d = (lo + hi) / 2;
      cam.position.copy(camLook).addScaledVector(camDir, d);
      cam.lookAt(camLook);
      cam.updateMatrixWorld();
      const ok = corners.every((c) => {
        pv.copy(c).project(cam);
        return Math.abs(pv.x) <= 0.98 && Math.abs(pv.y) <= 0.96;
      });
      if (ok) hi = d;
      else lo = d;
    }
    cam.position.copy(camLook).addScaledVector(camDir, hi);
    cam.lookAt(camLook);
    cam.updateMatrixWorld();
  };
  /** Frames the block arena for the current aspect, recentering vertically. */
  const fit = () => {
    const pitch = ((cam.aspect < 1 ? 58 : 44) * Math.PI) / 180;
    camDir.set(0, Math.sin(pitch), Math.cos(pitch));
    camLook.set(0, 0, 0);
    for (let it = 0; it < 4; it++) {
      fitDist();
      let ymin = 1;
      let ymax = -1;
      for (const c of corners) {
        pv.copy(c).project(cam);
        ymin = Math.min(ymin, pv.y);
        ymax = Math.max(ymax, pv.y);
      }
      camLook.z -= ((ymin + ymax) / 2) * 5;
    }
    fitDist();
    camBase.copy(cam.position);
  };

  const matte = (color: string, map?: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ color, map, roughness: 1, metalness: 0, flatShading: true });
  const stone = stoneTex(NEON);
  const crackedStone = stoneTex(NEON, true);
  const stoneMat = matte(NEON.ink, stone);
  // Instanced floor tiles and solid block walls; the front remains open for the ball drain.
  const tileGeo = new THREE.BoxGeometry(0.94, 0.2, 0.94);
  const floor = new THREE.InstancedMesh(
    tileGeo,
    new THREE.MeshLambertMaterial({ color: NEON.floor, flatShading: true }),
    W * H,
  );
  const seams = new THREE.Mesh(
    new THREE.BoxGeometry(W, 0.04, H),
    new THREE.MeshBasicMaterial({ color: NEON.grid, toneMapped: false }),
  );
  seams.position.y = -0.04;
  scene.add(seams);
  const matrix = new THREE.Matrix4();
  let tile = 0;
  for (let z = 0; z < H; z++)
    for (let x = 0; x < W; x++)
      floor.setMatrixAt(tile++, matrix.makeTranslation(x - W / 2 + 0.5, -0.1, z - H / 2 + 0.5));
  floor.instanceMatrix.needsUpdate = true;
  scene.add(floor);
  const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.6, 0.97), stoneMat, H * 2 + W * 2);
  let wi = 0;
  for (const side of [-1, 1])
    for (let z = 0; z < H; z++)
      wall.setMatrixAt(wi++, matrix.makeTranslation(side * (W / 2 + 0.25), 0.3, z - H / 2 + 0.5));
  for (let x = 0; x < W * 2; x++)
    wall.setMatrixAt(wi++, matrix.makeTranslation(x / 2 - W / 2 + 0.25, 0.3, -H / 2 - 0.5));
  wall.instanceMatrix.needsUpdate = true;
  scene.add(wall);
  stage.onResize(fit);

  // Stone blocks and darker cracked legacy cores, each in one instanced batch.
  const brickGeo = new THREE.BoxGeometry(BRICK_W * 0.96, BRICK_Y, BRICK_H * 0.92);
  const brickBody = new THREE.InstancedMesh(brickGeo, stoneMat, MAX_BRICKS);
  const legacyBody = new THREE.InstancedMesh(brickGeo, matte(NEON.ink, crackedStone), MAX_BRICKS);
  const brickEdge = new THREE.InstancedMesh(
    frameGeo(BRICK_W * 0.96, BRICK_Y, BRICK_H * 0.92, 0.025),
    matte(NEON.red),
    MAX_BRICKS,
  );
  for (const m of [brickBody, legacyBody, brickEdge]) {
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    scene.add(m);
  }
  const squash = new Float32Array(MAX_BRICKS);
  const flash = new Float32Array(MAX_BRICKS);
  let intro = 1;

  // Camera-facing signs keep the pixel lettering legible without floor-plane foreshortening.
  const labelGeo = new THREE.PlaneGeometry(BRICK_W * 1.03, BRICK_H * 1.1);
  const labelMat = new Map<string, THREE.MeshBasicMaterial>();
  const labels = new Map<number, THREE.Mesh>();
  const labelFor = (b: Brick) => {
    let mat = labelMat.get(b.label!);
    if (!mat) {
      mat = new THREE.MeshBasicMaterial({
        map: textTex(b.label!.toUpperCase(), NEON.ink, 256, 96, 72),
        toneMapped: false,
        transparent: true,
        depthWrite: false,
      });
      labelMat.set(b.label!, mat);
    }
    const m = new THREE.Mesh(labelGeo, mat);
    m.quaternion.copy(cam.quaternion);
    scene.add(m);
    labels.set(b.id, m);
    return m;
  };

  // --- Paddle: the cyan API Gateway
  const paddle = new THREE.Group();
  paddle.position.set(0, PAD_R, wz(PADDLE_Y));
  const padMat = matte(NEON.cyan);
  const padBlocks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, PADDLE_H, PADDLE_H), padMat, 6);
  padBlocks.frustumCulled = false;
  padBlocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const gateTag = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 0.36),
    new THREE.MeshBasicMaterial({
      map: textTex("API GATEWAY", NEON.ink, 512, 80, 46),
      transparent: true,
      depthWrite: false,
    }),
  );
  gateTag.rotation.x = -Math.PI / 2;
  gateTag.position.y = PAD_R + 0.02;
  paddle.add(padBlocks, gateTag);
  scene.add(paddle);
  let halfShown = 0;
  let padSquash = 0;

  // --- Ball: a small lime cube
  const ballGeo = new THREE.BoxGeometry(BALL_R * 2, BALL_R * 2, BALL_R * 2);
  const ballMat = matte(NEON.lime);
  const balls = Array.from({ length: MAX_BALLS }, () => {
    const m = new THREE.Mesh(ballGeo, ballMat);
    m.visible = false;
    scene.add(m);
    return m;
  });
  // --- Power-up tokens with floating name tags
  const tokenGeo = new THREE.BoxGeometry(0.9, 0.34, 0.5);
  const tokenCenter = new THREE.BoxGeometry(0.58, 0.36, 0.52);
  const tokenBody = matte(NEON.floor);
  const kinds = Object.keys(POWER_COLOR) as PowerKind[];
  const tokenMats = Object.fromEntries(kinds.map((k) => [k, matte(POWER_COLOR[k])])) as Record<
    PowerKind,
    THREE.MeshStandardMaterial
  >;
  const tagMats = Object.fromEntries(
    kinds.map((k) => [
      k,
      new THREE.SpriteMaterial({ map: textTex(POWER_TAG[k], POWER_COLOR[k], 320, 64, 40), transparent: true }),
    ]),
  ) as Record<PowerKind, THREE.SpriteMaterial>;
  const tokens = Array.from({ length: MAX_POWERS }, () => {
    const g = new THREE.Group();
    const f = new THREE.Mesh(tokenCenter, tokenMats.wide);
    const s = new THREE.Sprite(tagMats.wide);
    s.scale.set(2, 0.4, 1);
    s.position.y = 0.6;
    g.add(new THREE.Mesh(tokenGeo, tokenBody), f, s);
    g.visible = false;
    scene.add(g);
    return { g, f, s };
  });

  // The Big Ball of Mud becomes a compact cluster of cracked stone voxels.
  const bossMat = matte(NEON.ink, crackedStone);
  const boss = new THREE.Group();
  const bossCore = new THREE.Group();
  const bossParts: THREE.BufferGeometry[] = [];
  for (let x = -1; x <= 1; x++)
    for (let y = -1; y <= 1; y++)
      for (let z = -1; z <= 1; z++) {
        if (x * x + y * y + z * z > 2) continue;
        bossParts.push(
          new THREE.BoxGeometry(BOSS_R * 0.62, BOSS_R * 0.62, BOSS_R * 0.62).translate(
            x * BOSS_R * 0.62,
            y * BOSS_R * 0.62,
            z * BOSS_R * 0.62,
          ),
        );
      }
  const bossGeo = mergeGeometries(bossParts);
  for (const part of bossParts) part.dispose();
  bossCore.add(new THREE.Mesh(bossGeo, bossMat));
  const bossEdge = new THREE.Mesh(frameGeo(BOSS_R * 1.86, BOSS_R * 1.86, BOSS_R * 1.86), matte(NEON.red));
  bossCore.add(bossEdge);
  const hpBlocks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), matte(NEON.red), 16);
  hpBlocks.frustumCulled = false;
  for (let i = 0; i < 16; i++) hpBlocks.setMatrixAt(i, matrix.makeTranslation((i - 7.5) * 0.19, BOSS_R + 0.35, 0));
  hpBlocks.instanceMatrix.needsUpdate = true;
  const bossTag = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: textTex("BIG BALL OF MUD", NEON.ink, 512, 64, 36), transparent: true }),
  );
  bossTag.scale.set(3, 0.38, 1);
  bossTag.position.y = BOSS_R + 0.9;
  boss.add(bossCore, hpBlocks, bossTag);
  boss.visible = false;
  scene.add(boss);
  let bossFlash = 0;
  let bossDie = 0;

  // --- Falling microservice cubes (instanced)
  const sparkMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), matte(NEON.ink), MAX_SPARKS);
  sparkMesh.frustumCulled = false;
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkMesh.count = 0;
  scene.add(sparkMesh);
  const sparks: Spark[] = [];

  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const v3 = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tmpC = new THREE.Color();
  const C = {
    red: col(NEON.red),
    lime: col(NEON.lime),
    white: col(NEON.ink),
  };
  const rowColors = [
    col(NEON.ink),
    col(NEON.ink).lerp(col(NEON.dim), 0.12),
    col(NEON.ink).lerp(col(NEON.dim), 0.24),
    col(NEON.ink).lerp(col(NEON.violet), 0.18),
    col(NEON.ink).lerp(col(NEON.dim), 0.06),
  ];
  let shake = 0;
  let time = 0;
  let bricksRef: Brick[] = [];

  const role = (b: Brick) => (b.maxHp > 1 ? C.red : C.lime);

  function burst(x: number, y: number, z: number, c: THREE.Color, n: number, pow = 1) {
    for (let k = 0; k < (reduced ? Math.ceil(n / 3) : n); k++) {
      if (sparks.length >= MAX_SPARKS) sparks.shift();
      const a = Math.random() * Math.PI * 2;
      const r = (1.5 + Math.random() * 3) * pow * (reduced ? 0.25 : 1);
      sparks.push({
        p: new THREE.Vector3(x, y, z),
        v: new THREE.Vector3(Math.cos(a) * r, (2 + Math.random() * 4) * pow * (reduced ? 0.25 : 1), Math.sin(a) * r),
        life: 1,
        c,
      });
    }
  }

  return {
    setLevel(s: State) {
      for (const m of labels.values()) scene.remove(m);
      labels.clear();
      squash.fill(0);
      flash.fill(0);
      intro = reduced ? 1 : 0;
      bricksRef = s.bricks;
      boss.visible = !!s.boss;
      bossDie = 0;
    },
    /** Full reset for a new run. */
    reset(s: State) {
      shake = bossFlash = bossDie = padSquash = time = 0;
      halfShown = 0;
      sparks.length = 0;
      this.setLevel(s);
    },

    onBreak(b: Brick) {
      const c = role(b);
      burst(b.x, BRICK_Y / 2, wz(b.y), c, 10);
    },
    onHit(b: Brick) {
      const i = bricksRef.indexOf(b);
      if (i >= 0) {
        squash[i] = 1;
        flash[i] = 1;
      }
      burst(b.x, BRICK_Y, wz(b.y), C.red, 4, 0.6);
      if (!reduced) shake = Math.max(shake, 0.12);
    },
    onShed(b: Brick, s: State) {
      if (s.boss) burst(s.boss.x, 0.9, wz(s.boss.y), C.lime, 6, 0.7);
      const i = s.bricks.indexOf(b);
      if (i >= 0) flash[i] = 1;
    },
    onBoss(s: State) {
      bossFlash = 1;
      const bs = s.boss!;
      burst(bs.x, 0.9, wz(bs.y), C.red, 14);
      if (!reduced) shake = Math.max(shake, 0.3);
      if (bs.hp <= 0) {
        bossDie = 1;
        burst(bs.x, 0.9, wz(bs.y), C.lime, 40, 1.6);
      }
    },
    onPaddle() {
      padSquash = 1;
    },
    onPower(kind: PowerKind, x: number) {
      burst(x, PAD_R * 2, wz(PADDLE_Y), kind === "debt" ? C.red : C.lime, 12, 0.7);
      if (kind === "debt" && !reduced) shake = Math.max(shake, 0.25);
    },
    onLife() {
      if (!reduced) shake = 0.55;
    },
    onLevel() {
      intro = reduced ? 1 : 0;
    },

    frame(s: State, dt: number) {
      time += dt;
      bricksRef = s.bricks;
      intro = Math.min(1, intro + dt * 1.1);

      // Reclaim labels from shield blocks removed by the boss's bounded pool.
      const ids = new Set(s.bricks.map((b) => b.id));
      for (const [id, label] of labels) {
        if (!ids.has(id)) {
          scene.remove(label);
          labels.delete(id);
        }
      }
      // Bricks
      const n = Math.min(MAX_BRICKS, s.bricks.length);
      brickBody.count = legacyBody.count = brickEdge.count = n;
      for (let i = 0; i < n; i++) {
        const b = s.bricks[i];
        squash[i] = Math.max(0, squash[i] - dt * 6);
        flash[i] = Math.max(0, flash[i] - dt * 4);
        const k = reduced ? 0 : squash[i];
        const rowT = Math.min(1, Math.max(0, intro * 1.8 - (H - b.y) * 0.08));
        const drop = (1 - rowT) ** 3 * 6;
        sc.set(b.alive ? 1 + k * 0.08 : 0, b.alive ? 1 - k * 0.3 : 0, b.alive ? 1 + k * 0.08 : 0);
        v3.set(b.x, (BRICK_Y / 2) * sc.y + drop, wz(b.y));
        m4.compose(v3, q.identity(), sc);
        if (b.maxHp > 1) {
          legacyBody.setMatrixAt(i, m4);
          brickEdge.setMatrixAt(i, m4);
          brickBody.setMatrixAt(i, hidden);
        } else {
          brickBody.setMatrixAt(i, m4);
          legacyBody.setMatrixAt(i, hidden);
          brickEdge.setMatrixAt(i, hidden);
        }
        // Damage is a short matte tint, never a pulsing light.
        const body = b.maxHp > 1 ? legacyBody : brickBody;
        const row = Math.max(0, Math.round((BRICK_TOP - b.y) / (BRICK_H + 0.1)));
        body.setColorAt(
          i,
          tmpC.copy(b.maxHp > 1 ? C.white : rowColors[row % rowColors.length]).lerp(C.red, flash[i] * 0.35),
        );
        // Labels
        let lab = labels.get(b.id);
        if (b.label && !lab && b.alive) lab = labelFor(b);
        if (lab) {
          lab.visible = b.alive;
          lab.position.set(b.x, BRICK_Y * sc.y + 0.24 + drop, wz(b.y));
          lab.quaternion.copy(cam.quaternion);
        }
      }
      for (const m of [brickBody, legacyBody, brickEdge]) {
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) m.instanceColor.needsUpdate = true;
      }

      // Paddle
      const half = paddleHalf(s);
      if (Math.abs(half - halfShown) > 1e-3) {
        halfShown += reduced ? half - halfShown : (half - halfShown) * Math.min(1, dt * 12);
        if (Math.abs(half - halfShown) < 0.01) halfShown = half;
        const width = halfShown * 2;
        for (let i = 0; i < 6; i++) {
          m4.makeScale(Math.max(0.01, width / 6 - 0.025), 1, 1);
          m4.setPosition(((i + 0.5) * width) / 6 - halfShown, 0, 0);
          padBlocks.setMatrixAt(i, m4);
        }
        padBlocks.instanceMatrix.needsUpdate = true;
        gateTag.scale.setScalar(Math.min(1, (halfShown * 2 - 0.3) / 2.2));
      }
      padSquash = Math.max(0, padSquash - dt * 7);
      const ps = reduced ? 0 : padSquash;
      paddle.scale.set(1, 1 - ps * 0.3, 1 + ps * 0.15);
      paddle.position.x = s.paddleX;

      // Balls stay lime; piercing is indicated by a slightly larger cube.
      balls.forEach((m, i) => {
        const b = s.balls[i];
        m.visible = !!b;
        if (!b) return;
        m.position.set(b.x, BALL_R + 0.05, wz(b.y));
        m.scale.setScalar(s.pierceT > 0 ? 1.3 : 1);
      });

      // Power-ups
      tokens.forEach((tk, i) => {
        const p = s.powers[i];
        tk.g.visible = !!p;
        if (!p) return;
        tk.f.material = tokenMats[p.kind];
        tk.s.material = tagMats[p.kind];
        tk.g.position.set(p.x, 0.35, wz(p.y));
        if (!reduced) tk.g.rotation.y = Math.sin(time * 3 + i) * 0.35;
      });

      // Boss
      if (s.boss) {
        const bs = s.boss;
        bossFlash = Math.max(0, bossFlash - dt * 3);
        bossDie = bossDie > 0 ? Math.min(2, bossDie + dt) : 0;
        const dying = bossDie > 0 ? Math.max(0, 1 - (bossDie - 1)) : 1;
        boss.visible = dying > 0.01;
        boss.position.set(bs.x, 1 + (reduced ? 0 : Math.sin(time * 2) * 0.12), wz(bs.y));
        boss.scale.setScalar((1 + bossFlash * 0.12) * dying);
        if (!reduced) bossCore.rotation.y = (Math.floor(time * 2) * Math.PI) / 16;
        hpBlocks.count = Math.ceil((16 * Math.max(0, bs.hp)) / bs.maxHp);
      } else boss.visible = false;

      // Microservices drop to the block floor, settle, then shrink away.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const f = sparks[i];
        f.life -= dt * 1.6;
        if (f.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        f.v.y -= 14 * dt;
        f.p.addScaledVector(f.v, dt);
        if (f.p.y < 0.11) {
          f.p.y = 0.11;
          f.v.y = 0;
          f.v.x *= 0.7;
          f.v.z *= 0.7;
        }
      }
      sparkMesh.count = sparks.length;
      sparks.forEach((f, i) => {
        e.set(reduced ? 0 : f.life * 7, reduced ? 0 : f.life * 4, 0);
        sparkMesh.setMatrixAt(i, m4.compose(f.p, q.setFromEuler(e), sc.setScalar(Math.min(1, f.life * 1.5))));
        sparkMesh.setColorAt(i, f.c);
      });
      sparkMesh.instanceMatrix.needsUpdate = true;
      if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;

      // A short shake is the only camera effect; reduced motion leaves it still.
      shake = Math.max(0, shake - dt * 1.6);
      cam.position.copy(camBase);
      if (shake > 0) cam.position.add(v3.set((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
      cam.lookAt(camLook);
    },

    /** World state point to CSS px inside the stage element (for DOM score pops). */
    project(x: number, y: number): { x: number; y: number } {
      pv.set(x, BRICK_Y, wz(y)).project(cam);
      return { x: ((pv.x + 1) / 2) * stage.size.w, y: ((1 - pv.y) / 2) * stage.size.h };
    },

    /** Converts a client point to a paddle x on the floor plane. */
    pointerX(cx: number, cy: number): number | null {
      const r = stage.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cam);
      const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -PAD_R), new THREE.Vector3());
      return hit ? hit.x : null;
    },

    dispose() {
      for (const m of [...labelMat.values(), ...Object.values(tagMats)]) {
        m.map?.dispose();
        m.dispose();
      }
      for (const m of [bossTag.material, gateTag.material as THREE.MeshBasicMaterial]) m.map?.dispose();
      stone.dispose();
      crackedStone.dispose();
      labelGeo.dispose();
      tokenCenter.dispose();
      for (const m of Object.values(tokenMats)) m.dispose();
    },
  };
}
export type View = ReturnType<typeof createView>;
