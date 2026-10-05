import * as THREE from "three";
import { ARCADE_FONT, NEON } from "../core/neon";
import { addLights, type Stage } from "../core/stage";
import { BONUS, type BonusKind, BUG, type Dir, type Game, H, MAZE, posOf, READY, W } from "./state";

const PITCH = (63 * Math.PI) / 180;
const YAW: Record<Dir, number> = { right: 0, up: Math.PI / 2, left: Math.PI, down: -Math.PI / 2 };
const wx = (x: number) => x - (W - 1) / 2;
const wz = (y: number) => y - (H - 1) / 2;
const C = (k: keyof typeof NEON) => new THREE.Color(NEON[k]);
const TAGS = ["NULL", "LEAK", "RACE", "LOCK"];
export const BUG_HUES = ["red", "magenta", "violet", "amber"] as const;

export interface ViewCopy {
  ready: string;
  go: string;
  level: string;
  clear: string;
  hotfix: string;
  lock: string;
  bonus: Record<BonusKind, string>;
}

export interface View {
  sync(g: Game, t: number, dt: number, live: boolean): void;
  burst(x: number, y: number, color: keyof typeof NEON, n: number, speed?: number): void;
  popup(text: string, x: number, y: number, color: keyof typeof NEON, big?: boolean): void;
  shake(a: number): void;
  pulse(a: number): void;
  dispose(): void;
}

const matte = (color: THREE.ColorRepresentation) =>
  new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true });

/** Resolve the arcade font for canvas text (canvas can't read var()). */
function fontFamily(el: HTMLElement) {
  return getComputedStyle(el).getPropertyValue("--font-arcade").trim() || '"Silkscreen", "Arial Narrow", sans-serif';
}

function canvasTex(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  const redraw = () => {
    const c = cv.getContext("2d");
    if (!c) return;
    c.clearRect(0, 0, w, h);
    draw(c);
    tex.needsUpdate = true;
  };
  redraw();
  return { tex, redraw };
}

export function createView(
  stage: Stage,
  el: HTMLElement,
  opts: { reduced: boolean; coarse: boolean; copy: ViewCopy },
): View {
  const { scene } = stage;
  const cam = stage.camera as THREE.PerspectiveCamera;
  const { reduced, copy } = opts;
  addLights(scene);
  const textures: THREE.Texture[] = [];
  const dom: HTMLElement[] = [];
  const family = fontFamily(el);
  const redraws: Array<() => void> = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);

  // A shared unit cube keeps every solid on the voxel grid.
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const block = (
    parent: THREE.Object3D,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
  ) => {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    parent.add(mesh);
    return mesh;
  };
  const inkMat = matte(NEON.ink);
  const darkMat = matte(NEON.void);
  const dimMat = matte(NEON.dim);
  const amberMat = matte(NEON.amber);
  const packetMat = matte(NEON.lime);
  const inkC = C("ink");
  const dimC = C("dim");

  // Tiny deterministic stone textures: no assets, gradients, or added hues.
  const stone = (base: keyof typeof NEON, fleck: keyof typeof NEON) => {
    const t = canvasTex(16, 16, (c) => {
      c.fillStyle = NEON[base];
      c.fillRect(0, 0, 16, 16);
      c.fillStyle = NEON[fleck];
      for (let i = 0; i < 18; i++) c.fillRect((i * 7 + 3) % 15, (i * 11 + 1) % 15, 2, 1);
      c.fillStyle = NEON.void;
      c.fillRect(0, 15, 16, 1);
      c.fillRect(15, 0, 1, 16);
    });
    textures.push(t.tex);
    return t.tex;
  };
  const floorMat = matte(new THREE.Color(1, 1, 1));
  floorMat.map = stone("floor", "void");
  const wallMat = matte(new THREE.Color(1, 1, 1));
  wallMat.map = stone("grid", "floor");
  const floor = new THREE.InstancedMesh(cube, floorMat, W * H);
  const wallsAt: Array<[number, number]> = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      floor.setMatrixAt(
        y * W + x,
        m4.compose(v3.set(wx(x), -0.16, wz(y)), q.identity(), new THREE.Vector3(0.98, 0.3, 0.98)),
      );
      if (MAZE[y][x] === "#" || MAZE[y][x] === "X") wallsAt.push([x, y]);
    }
  const walls = new THREE.InstancedMesh(cube, wallMat, wallsAt.length * 2);
  wallsAt.forEach(([x, y], i) => {
    for (let layer = 0; layer < 2; layer++)
      walls.setMatrixAt(
        i * 2 + layer,
        m4.compose(v3.set(wx(x), 0.16 + layer * 0.32, wz(y)), q.identity(), new THREE.Vector3(0.96, 0.3, 0.96)),
      );
  });
  scene.add(floor, walls);
  const gate = block(scene, dimMat, wx(9), 0.12, wz(8), 1.4, 0.24, 0.16);

  const packetIdx = new Map<number, number>();
  const hotfixAt: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (MAZE[y][x] === ".") packetIdx.set(y * W + x, packetIdx.size);
      if (MAZE[y][x] === "o") hotfixAt.push(y * W + x);
    }
  const packets = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), packetMat, packetIdx.size);
  packets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  packets.frustumCulled = false;
  scene.add(packets);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const wrench = canvasTex(16, 16, (c) => {
    c.fillStyle = NEON.amber;
    c.fillRect(0, 0, 16, 16);
    c.fillStyle = NEON.void;
    const rows = ["00100100", "00100100", "00111100", "00011000", "00011000", "00011000", "00011000", "00011000"];
    rows.forEach((row, y) => {
      [...row].forEach((p, x) => {
        if (p === "1") c.fillRect(x * 2, y * 2, 2, 2);
      });
    });
  });
  textures.push(wrench.tex);
  const wrenchMat = matte(new THREE.Color(1, 1, 1));
  wrenchMat.map = wrench.tex;
  const hotfixes = new Map<number, THREE.Group>();
  for (const k of hotfixAt) {
    const g = new THREE.Group();
    block(g, amberMat, 0, 0.24, 0, 0.5, 0.48, 0.5);
    block(g, wrenchMat, 0, 0.486, 0, 0.46, 0.012, 0.46);
    g.position.set(wx(k % W), 0, wz(Math.floor(k / W)));
    scene.add(g);
    hotfixes.set(k, g);
  }

  // Bonus cup and stamp also use square silhouettes.
  const bonusG = new THREE.Group();
  bonusG.position.set(wx(BONUS.tile.x), 0.25, wz(BONUS.tile.y));
  scene.add(bonusG);
  const coffee = new THREE.Group();
  block(coffee, inkMat, 0, 0, 0, 0.36, 0.38, 0.36);
  block(coffee, amberMat, 0, 0.195, 0, 0.3, 0.015, 0.3);
  for (const y of [-0.12, 0.12]) block(coffee, inkMat, 0.26, y, 0, 0.18, 0.07, 0.07);
  block(coffee, inkMat, 0.32, 0, 0, 0.07, 0.3, 0.07);
  const stamp = new THREE.Group();
  block(stamp, packetMat, 0, 0, 0, 0.65, 0.15, 0.42);
  block(stamp, dimMat, 0, 0.18, 0, 0.14, 0.25, 0.14);
  block(stamp, packetMat, 0, 0.34, 0, 0.28, 0.12, 0.24);
  bonusG.add(coffee, stamp);

  // Robot faces +x. The cube jaw hinges at the back of its square head.
  const bot = new THREE.Group();
  const botInner = new THREE.Group();
  bot.add(botInner);
  const shellMat = matte(NEON.cyan);
  const visorMat = matte(NEON.void);
  const R = 0.32;
  block(botInner, shellMat, -0.12, -0.14, 0, 0.32, 0.25, 0.42);
  for (const z of [-0.2, 0.2]) block(botInner, darkMat, -0.12, -0.27, z, 0.3, 0.12, 0.14);
  const headPivot = new THREE.Group();
  const jawPivot = new THREE.Group();
  headPivot.position.x = jawPivot.position.x = -0.3;
  block(headPivot, shellMat, 0.3, 0.19, 0, 0.62, 0.3, 0.56);
  block(headPivot, visorMat, 0.618, 0.2, 0, 0.025, 0.13, 0.44);
  for (const z of [-0.12, 0.12]) block(headPivot, inkMat, 0.634, 0.22, z, 0.025, 0.065, 0.065);
  block(headPivot, shellMat, 0.18, 0.43, 0, 0.08, 0.2, 0.08);
  block(headPivot, inkMat, 0.18, 0.55, 0, 0.12);
  block(jawPivot, shellMat, 0.3, -0.02, 0, 0.62, 0.16, 0.56);
  botInner.add(headPivot, jawPivot);
  const lockFrame = new THREE.Group();
  for (const z of [-0.5, 0.5]) block(lockFrame, amberMat, 0, 0.06, z, 1.05, 0.1, 0.1);
  for (const x of [-0.5, 0.5]) block(lockFrame, amberMat, x, 0.06, 0, 0.1, 0.1, 1.05);
  bot.add(lockFrame);
  scene.add(bot);

  interface BugRig {
    root: THREE.Group;
    body: THREE.Mesh[];
    legs: THREE.Group[];
    extras: THREE.Object3D[];
    mat: THREE.MeshStandardMaterial;
    tag: THREE.Sprite;
    hue: THREE.Color;
    yaw: number;
  }
  const bugs: BugRig[] = [];
  for (let id = 0; id < 4; id++) {
    const hue = C(BUG_HUES[id]);
    const mat = matte(hue);
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    const width = id === BUG.RACE ? 0.32 : id === BUG.LOCK ? 0.5 : 0.44;
    const body = [block(inner, mat, -0.08, 0.32, 0, 0.5, 0.28, width), block(inner, mat, 0.28, 0.3, 0, 0.22, 0.2, 0.3)];
    block(inner, darkMat, -0.08, 0.466, 0, 0.46, 0.02, 0.035);
    const extras: THREE.Object3D[] = [];
    for (const sign of [-1, 1]) {
      extras.push(block(inner, inkMat, 0.397, 0.34, sign * 0.09, 0.045));
      extras.push(block(inner, dimMat, 0.28, 0.49, sign * 0.12, 0.06, 0.2, 0.06));
      extras.push(block(inner, mat, 0.28, 0.62, sign * 0.12, 0.09));
    }
    const legs: THREE.Group[] = [];
    for (const sign of [-1, 1])
      for (const x of [-0.23, -0.04, 0.15]) {
        const leg = new THREE.Group();
        leg.position.set(x, 0.17, (sign * width) / 2);
        block(leg, darkMat, 0, 0, sign * 0.08, 0.09, 0.09, 0.2);
        block(leg, darkMat, 0, -0.07, sign * 0.16, 0.09, 0.18, 0.09);
        inner.add(leg);
        legs.push(leg);
      }
    const tagTex = canvasTex(64, 24, (c) => {
      c.fillStyle = NEON.void;
      c.fillRect(0, 0, 64, 24);
      c.fillStyle = NEON[BUG_HUES[id]];
      c.fillRect(0, 22, 64, 2);
      c.fillStyle = NEON.ink;
      c.font = `800 17px ${family}`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.fillText(TAGS[id], 32, 11);
    });
    redraws.push(tagTex.redraw);
    textures.push(tagTex.tex);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex.tex, depthTest: false }));
    tag.scale.set(1.2, 0.45, 1);
    tag.position.y = 1;
    tag.renderOrder = 10;
    root.add(tag);
    scene.add(root);
    bugs.push({ root, body, legs, extras, mat, tag, hue, yaw: Math.PI });
  }

  // ---------- particles ----------
  const PN = 220;
  const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), matte(NEON.ink), PN);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pp = new Float32Array(PN * 7); // x y z vx vy vz life
  let pNext = 0;
  for (let i = 0; i < PN; i++) {
    pMesh.setMatrixAt(i, zero);
    pMesh.setColorAt(i, inkC);
  }
  pMesh.frustumCulled = false;
  scene.add(pMesh);
  const burst = (x: number, y: number, color: keyof typeof NEON, n: number, speed = 3) => {
    if (reduced) return;
    n = Math.ceil(n / 2);
    const col = C(color);
    for (let k = 0; k < n; k++) {
      const i = pNext;
      pNext = (pNext + 1) % PN;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      pp.set(
        [wx(x), 0.4, wz(y), Math.cos(a) * s, 1.5 + Math.random() * 2.5, Math.sin(a) * s, 0.5 + Math.random() * 0.4],
        i * 7,
      );
      pMesh.setColorAt(i, col);
    }
    if (pMesh.instanceColor) pMesh.instanceColor.needsUpdate = true;
  };

  // ---------- DOM text ----------
  const mk = (css: string) => {
    const d = document.createElement("div");
    d.style.cssText = `position:absolute;pointer-events:none;z-index:1;font-family:${ARCADE_FONT};${css}`;
    el.appendChild(d);
    dom.push(d);
    return d;
  };
  const banner = mk(
    `left:50%;top:50%;transform:translate(-50%,-50%);text-align:center;font-weight:800;letter-spacing:.08em;color:${NEON.ink};white-space:nowrap`,
  );
  banner.hidden = true;
  const pops: Array<{ d: HTMLElement; life: number; y0: number }> = [];
  const project = (x: number, y: number) => {
    v3.set(wx(x), 0.8, wz(y)).project(cam);
    return [((v3.x + 1) / 2) * stage.size.w, ((1 - v3.y) / 2) * stage.size.h];
  };
  const popup = (text: string, x: number, y: number, color: keyof typeof NEON, big = false) => {
    const [sx, sy] = project(x, y);
    const d = mk(
      `left:${sx}px;top:${sy}px;transform:translate(-50%,-50%);font-weight:800;font-size:${big ? 22 : 15}px;color:${NEON[color]};background:${NEON.void};padding:2px 6px;white-space:nowrap`,
    );
    d.textContent = text;
    pops.push({ d, life: 0.9, y0: sy });
  };

  // ---------- camera fit ----------
  const corners: THREE.Vector3[] = [];
  for (const x of [-W / 2 - 0.2, W / 2 + 0.2])
    for (const z of [-H / 2 - 0.2, H / 2 + 0.2]) for (const y of [0, 1.1]) corners.push(new THREE.Vector3(x, y, z));
  let dist = 30;
  const place = (d: number, sx: number, sz: number) => {
    cam.position.set(sx, d * Math.sin(PITCH), d * Math.cos(PITCH) + sz);
    cam.lookAt(sx * 0.6, 0, sz * 0.3);
  };
  const measure = (d: number) => {
    place(d, 0, 0);
    cam.updateMatrixWorld();
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const c of corners) {
      v3.copy(c).project(cam);
      x0 = Math.min(x0, v3.x);
      x1 = Math.max(x1, v3.x);
      y0 = Math.min(y0, v3.y);
      y1 = Math.max(y1, v3.y);
    }
    return { sx: x1 - x0, sy: y1 - y0, cy: (y1 + y0) / 2 };
  };
  stage.onResize((w, h) => {
    const portraitPad = opts.coarse && w / h < 1 ? 0.74 : 1;
    const vh = h * portraitPad;
    cam.fov = 34;
    cam.aspect = w / vh;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
    let lo = 5;
    let hi = 200;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      const m = measure(mid);
      if (m.sx <= 1.9 && m.sy <= 1.9) hi = mid;
      else lo = mid;
    }
    dist = hi;
    const { cy } = measure(dist);
    cam.setViewOffset(w, vh, 0, (-cy * vh) / 2, w, h);
    cam.updateProjectionMatrix();
  });

  // ---------- state for effects ----------
  let shakeA = 0;
  let chomp = 0;
  let lastFood = -1;
  let lastLevel = 0;
  let deathBurst = false;

  if (document.fonts?.load)
    document.fonts
      .load(`800 52px ${family}`)
      .then(() => {
        for (const r of redraws) r();
      })
      .catch(() => {});

  const bigEl = document.createElement("div");
  const smallEl = document.createElement("div");
  bigEl.style.cssText = "font-size:clamp(34px,9vw,72px);line-height:1";
  smallEl.style.cssText = `margin-top:6px;font-size:clamp(12px,2.4vw,16px);letter-spacing:.3em;color:${NEON.amber};`;
  banner.append(bigEl, smallEl);
  const setBanner = (big: string, small = "", color: keyof typeof NEON = "ink") => {
    banner.hidden = !big;
    if (!big) return;
    if (bigEl.textContent !== big) bigEl.textContent = big;
    if (smallEl.textContent !== small) smallEl.textContent = small;
    bigEl.style.color = NEON[color];
    bigEl.style.background = NEON.void;
  };

  return {
    burst,
    popup,
    shake(a) {
      if (!reduced) shakeA = Math.max(shakeA, Math.min(0.2, a));
    },
    pulse(a) {
      if (!reduced) shakeA = Math.max(shakeA, Math.min(0.08, a * 0.06));
    },
    sync(g, t, dt, live) {
      // Packets & HOTFIX
      if (g.food.size !== lastFood || g.level !== lastLevel) {
        lastFood = g.food.size;
        lastLevel = g.level;
        for (const [k, h] of hotfixes) h.visible = g.food.has(k);
      }
      for (const [k, i] of packetIdx) {
        if (!g.food.has(k)) {
          packets.setMatrixAt(i, zero);
          continue;
        }
        const x = k % W;
        const y = (k - x) / W;
        packets.setMatrixAt(i, m4.compose(v3.set(wx(x), 0.15, wz(y)), q.identity(), one));
      }
      packets.instanceMatrix.needsUpdate = true;

      // Bonus
      const b = g.bonus;
      bonusG.visible = !!b && g.phase === "play" && (reduced || b.life > 2 || Math.floor(t * 4) % 2 === 0);
      if (b) {
        coffee.visible = b.kind === "coffee";
        stamp.visible = b.kind === "lgtm";
        bonusG.rotation.y = 0;
        bonusG.position.y = 0.25 + (reduced ? 0 : (Math.floor(t * 4) % 2) * 0.04);
      }

      // State cues stay matte and localized to the robot/bugs.
      gate.visible = g.enemies.length > 0;

      // Player
      const p = posOf(g.player);
      bot.position.set(wx(p.x), 0.02, wz(p.y));
      if (g.player.dir) bot.rotation.y = YAW[g.player.dir];
      const moving = g.phase === "play" && g.player.dir && g.freeze <= 0;
      if (moving) chomp += dt * 15;
      const open = reduced ? 0.08 : moving && Math.floor(chomp) % 2 ? 0.3 : 0.05;
      headPivot.rotation.z = open * 0.55;
      jawPivot.rotation.z = -open;
      botInner.position.set(0, R + (moving && !reduced ? (Math.floor(chomp) % 2) * 0.035 : 0), 0);
      botInner.scale.setScalar(1);
      bot.visible = true;
      visorMat.color.set(g.fright > 0 ? NEON.amber : NEON.void);
      if (g.phase === "dying") {
        const k = 1 - g.timer / 1.4; // 0 -> 1
        if (reduced) {
          botInner.scale.setScalar(Math.max(0.01, 1 - k));
        } else if (k < 0.62) {
          botInner.scale.setScalar(1 - Math.floor(k * 5) * 0.15);
        } else {
          if (!deathBurst) {
            deathBurst = true;
            burst(p.x, p.y, "cyan", 36, 3);
          }
          bot.visible = false;
        }
      } else deathBurst = false;
      if (g.phase === "over") bot.visible = false;
      lockFrame.visible = g.freeze > 0;

      // Bugs
      for (let i = 0; i < bugs.length; i++) {
        const r = bugs[i];
        const e = g.enemies[i];
        r.root.visible = !!e && g.phase !== "dying" && g.phase !== "clear" && g.phase !== "over";
        if (!e) continue;
        const ep = posOf(e);
        const hop = e.mode === "house" && !reduced ? (Math.floor(t * 4 + i) % 2) * 0.04 : 0;
        r.root.position.set(wx(ep.x), hop, wz(ep.y));
        if (e.dir) r.yaw = YAW[e.dir];
        r.root.rotation.y = r.yaw;
        const eaten = e.mode === "eaten";
        const grow = i === BUG.LEAK ? 1 + 0.45 * e.grow : 1;
        r.root.scale.setScalar((eaten ? 0.7 : grow) * 1.25);
        for (const m of r.body) m.material = eaten ? dimMat : r.mat;
        for (const l of r.legs) l.visible = !eaten;
        for (const x of r.extras) x.visible = !eaten;
        r.tag.visible = !eaten && e.mode !== "house";
        // Leg gait
        const gait = reduced ? 0 : Math.floor(t * (e.scared ? 5 : 9) + i) % 2 ? 1 : -1;
        r.legs.forEach((l, k) => {
          l.rotation.y = (k % 2 === (k < 3 ? 0 : 1) ? 1 : -1) * 0.35 * gait;
        });
        const flick = !reduced && g.fright < 1.6 && Math.floor(t * 6) % 2 === 0;
        r.mat.color.copy(e.scared ? (flick ? inkC : dimC) : r.hue);
      }

      // Particles
      for (let i = 0; i < PN; i++) {
        const o = i * 7;
        if (pp[o + 6] <= 0) continue;
        pp[o + 6] -= dt;
        pp[o + 4] -= 9 * dt;
        pp[o] += pp[o + 3] * dt;
        pp[o + 1] = Math.max(0.05, pp[o + 1] + pp[o + 4] * dt);
        pp[o + 2] += pp[o + 5] * dt;
        const s = Math.max(0, Math.min(1, pp[o + 6] * 2.5));
        pMesh.setMatrixAt(
          i,
          pp[o + 6] > 0
            ? m4.compose(v3.set(pp[o], pp[o + 1], pp[o + 2]), q.identity(), new THREE.Vector3(s, s, s))
            : zero,
        );
      }
      pMesh.instanceMatrix.needsUpdate = true;

      // Popups
      for (let i = pops.length - 1; i >= 0; i--) {
        const o = pops[i];
        o.life -= dt;
        if (o.life <= 0) {
          o.d.remove();
          pops.splice(i, 1);
          continue;
        }
        if (!reduced) o.d.style.top = `${o.y0 - (0.9 - o.life) * 40}px`;
        o.d.style.opacity = String(Math.min(1, o.life * 3));
      }

      // Banner
      if (!live) setBanner("");
      else if (g.phase === "ready") {
        if (g.timer < 0.45) setBanner(copy.go, "", "lime");
        else if (g.ready === "start") {
          const n = Math.min(3, Math.ceil((g.timer - 0.45) / ((READY.start - 0.45) / 3)));
          setBanner(String(n), copy.ready, "cyan");
        } else if (g.ready === "level") setBanner(`${copy.level} ${g.level}`, copy.ready, "cyan");
        else setBanner(copy.ready, "", "cyan");
      } else if (g.phase === "clear") setBanner(copy.clear, `${copy.level} ${g.level}`, "lime");
      else setBanner("");

      // Fixed board camera, with only short, subtle event shake.
      shakeA = Math.max(0, shakeA - dt * 1.6);
      place(dist, (Math.random() - 0.5) * shakeA, (Math.random() - 0.5) * shakeA);
    },
    dispose() {
      for (const d of dom) d.remove();
      for (const x of textures) x.dispose();
    },
  };
}
