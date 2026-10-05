import * as THREE from "three";
import { NEON } from "../core/neon";
import { addLights, type Stage } from "../core/stage";
import type { GameContext } from "../core/types";
import type { Board } from "./state";

const RAISED = 0.5;
const LOWERED = 0.05;
/** Heights live in Float32Arrays: never compare them with === against a float64 constant. */
const isLow = (v: number) => v < (RAISED + LOWERED) / 2;
const CELL_PX = 32;
const PARTICLES = 96;
const ELEV = (48 * Math.PI) / 180;
const AZIMUTH = 0.22;
const DIR = new THREE.Vector3(Math.sin(AZIMUTH) * Math.cos(ELEV), Math.sin(ELEV), Math.cos(AZIMUTH) * Math.cos(ELEV));
// Classic blue/green/red/navy/maroon/teal/black/gray, mapped to cabinet roles.
const COUNT_COLORS = [NEON.cyan, NEON.lime, NEON.red, NEON.violet, NEON.red, NEON.cyan, NEON.ink, NEON.dim];
// Hand-drawn 3×5 pixel font stays readable without fetching a font asset.
const DIGITS = [
  "000000000000000",
  "010110010010111",
  "110001010100111",
  "110001010001110",
  "101101111001001",
  "111100110001110",
  "011100111101111",
  "111001010010010",
  "111101111101111",
];

export interface View {
  build(b: Board): void;
  /** Newly scanned cells dig down in flood order. */
  sync(b: Board, order?: number[], instant?: boolean, assist?: boolean): void;
  exploit(b: Board): void;
  win(b: Board): void;
  setCursor(i: number): void;
  pick(clientX: number, clientY: number): number;
  screenOf(i: number): { x: number; y: number };
  update(dt: number, t: number): void;
  redrawNumbers(): void;
  dispose(): void;
}

const pixelTexture = (canvas: HTMLCanvasElement) => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
};

export function createView(stage: Stage, ctx: GameContext): View {
  const { scene } = stage;
  const cam = stage.camera as THREE.PerspectiveCamera;
  const motion = !ctx.reducedMotion;
  addLights(scene);
  const textures: THREE.Texture[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const box = (x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(x, y, z);
    geometries.push(g);
    return g;
  };
  const matte = (color: string, map?: THREE.Texture) => {
    const m = new THREE.MeshLambertMaterial({ color, map, flatShading: true });
    materials.push(m);
    return m;
  };
  const texture = (base: string, accent: string, wool = false) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 16;
    const g = canvas.getContext("2d") as CanvasRenderingContext2D;
    g.fillStyle = base;
    g.fillRect(0, 0, 16, 16);
    g.fillStyle = accent;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        if ((x * 13 + y * 7 + x * y) % (wool ? 7 : 11) < 2) g.fillRect(x, y, 1, 1);
      }
    const t = pixelTexture(canvas);
    textures.push(t);
    return t;
  };
  const stone = texture(NEON.floor, NEON.grid);
  const grass = texture(NEON.lime, NEON.grid);
  const wool = texture(NEON.red, NEON.floor, true);
  const stoneMat = matte(NEON.ink, stone);
  const grassMat = matte(NEON.ink, grass);
  const floorMat = matte(NEON.void);
  const stickMat = matte(NEON.grid);
  const bannerMat = matte(NEON.ink, wool);
  const debrisMat = matte(NEON.ink);

  // Red wool texture with an ivory TNT band and pixel lettering on every face.
  const tntCanvas = document.createElement("canvas");
  tntCanvas.width = tntCanvas.height = 16;
  const tg = tntCanvas.getContext("2d") as CanvasRenderingContext2D;
  tg.drawImage(wool.image, 0, 0);
  tg.fillStyle = NEON.ink;
  tg.fillRect(0, 5, 16, 7);
  tg.fillStyle = NEON.void;
  const letters = ["111010010010010", "101111111111101", "111010010010010"];
  for (let l = 0; l < 3; l++)
    for (let k = 0; k < 15; k++)
      if (letters[l][k] === "1") tg.fillRect(2 + l * 4 + (k % 3), 6 + Math.floor(k / 3), 1, 1);
  const tntTex = pixelTexture(tntCanvas);
  textures.push(tntTex);
  const tntMat = matte(NEON.ink, tntTex);

  const tileGeo = box(0.94, 1, 0.94).translate(0, 0.5, 0);
  const capGeo = box(0.94, 0.08, 0.94);
  const floorGeo = box(0.94, 0.24, 0.94);
  const poleGeo = box(0.055, 0.65, 0.055).translate(0, 0.325, 0);
  const bannerGeo = box(0.32, 0.24, 0.075).translate(0.16, 0.49, 0);
  const mineGeo = box(0.48, 0.48, 0.48);
  const partGeo = box(0.085, 0.085, 0.085);
  const cursorBox = box(1, 0.04, 1);
  const cursorGeo = new THREE.EdgesGeometry(cursorBox);
  geometries.push(cursorGeo);
  const cursorMat = new THREE.LineBasicMaterial({ color: NEON.cyan, toneMapped: false });
  materials.push(cursorMat);
  const cursorMesh = new THREE.LineSegments(cursorGeo, cursorMat);
  cursorMesh.visible = false;
  scene.add(cursorMesh);

  const numCanvas = document.createElement("canvas");
  const c2d = numCanvas.getContext("2d") as CanvasRenderingContext2D;
  let numTex = pixelTexture(numCanvas);
  const numMat = new THREE.MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false, toneMapped: false });
  materials.push(numMat);

  const root = new THREE.Group();
  scene.add(root);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const parts = new THREE.InstancedMesh(partGeo, debrisMat, PARTICLES);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  parts.frustumCulled = false;
  scene.add(parts);
  const life = new Float32Array(PARTICLES);
  const pp = new Float32Array(PARTICLES * 3);
  const pv = new Float32Array(PARTICLES * 3);
  let nextPart = 0;
  const clearParts = () => {
    life.fill(0);
    for (let k = 0; k < PARTICLES; k++) {
      parts.setMatrixAt(k, m4.makeScale(0, 0, 0));
      parts.setColorAt(k, col.set(NEON.red));
    }
    parts.instanceMatrix.needsUpdate = true;
  };
  clearParts();

  let board: Board | null = null;
  let cols = 0;
  let rows = 0;
  let tiles: THREE.InstancedMesh | null = null;
  let caps: THREE.InstancedMesh | null = null;
  let floors: THREE.InstancedMesh | null = null;
  let poles: THREE.InstancedMesh | null = null;
  let banners: THREE.InstancedMesh | null = null;
  let mines: THREE.InstancedMesh | null = null;
  let boardGeos: THREE.BufferGeometry[] = [];
  let h = new Float32Array(0);
  let ht = new Float32Array(0);
  let dig = new Float32Array(0);
  let delay = new Float32Array(0);
  let flagged = new Uint8Array(0);
  let revealed = new Uint8Array(0);
  let revealDelay = new Float32Array(0);
  let cursorIdx = -1;
  let boomIn = -1;
  let detonated = false;
  let shake = 0;
  const cx = (i: number) => (i % cols) - (cols - 1) / 2;
  const cz = (i: number) => Math.floor(i / cols) - (rows - 1) / 2;

  // ── Camera fit: binary-search the distance until the board box fits the screen ─
  const target = new THREE.Vector3();
  let camDist = 20;
  const corner = new THREE.Vector3();
  const measure = (d: number) => {
    cam.position.copy(DIR).multiplyScalar(d).add(target);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    let x0 = 9;
    let x1 = -9;
    let y0 = 9;
    let y1 = -9;
    const hx = cols / 2 + 1;
    const hz = rows / 2 + 1;
    for (const sx of [-1, 1])
      for (const sy of [-0.25, 1.2])
        for (const sz of [-1, 1]) {
          corner.set(sx * hx, sy, sz * hz).project(cam);
          x0 = Math.min(x0, corner.x);
          x1 = Math.max(x1, corner.x);
          y0 = Math.min(y0, corner.y);
          y1 = Math.max(y1, corner.y);
        }
    return { x0, x1, y0, y1 };
  };
  const fit = () => {
    if (!cols) return;
    const { w, h: hh } = stage.size;
    cam.fov = 32;
    cam.clearViewOffset();
    cam.aspect = w / hh;
    cam.updateProjectionMatrix();
    let lo = 3;
    let hi = 300;
    for (let k = 0; k < 28; k++) {
      const d = (lo + hi) / 2;
      const b = measure(d);
      if (b.x1 - b.x0 <= 1.86 && b.y1 - b.y0 <= 1.62) hi = d;
      else lo = d;
    }
    camDist = hi;
    const b = measure(camDist);
    // Center the board slightly above middle (room for the Pentest button below).
    const want = 0.06;
    cam.setViewOffset(w, hh, 0, ((want - (b.y0 + b.y1) / 2) * hh) / 2, w, hh);
  };
  stage.onResize(fit);

  const disposeBoard = () => {
    for (const child of [...root.children]) {
      root.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
    for (const g of boardGeos) g.dispose();
    boardGeos = [];
  };
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number) => {
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    root.add(mesh);
    return mesh;
  };
  const debris = (i: number, count: number, explosive = false) => {
    if (!motion) return;
    for (let k = 0; k < count; k++) {
      const p = nextPart++ % PARTICLES;
      const a = Math.random() * Math.PI * 2;
      const speed = explosive ? 1.5 + Math.random() * 2 : 0.4 + Math.random();
      pp.set([cx(i), explosive ? 0.32 : RAISED, cz(i)], p * 3);
      pv.set([Math.cos(a) * speed, 1 + Math.random() * (explosive ? 3 : 1), Math.sin(a) * speed], p * 3);
      life[p] = explosive ? 0.8 : 0.35;
      parts.setColorAt(p, col.set(explosive ? (k % 3 ? NEON.red : NEON.ink) : k % 2 ? NEON.grid : NEON.lime));
    }
    if (parts.instanceColor) parts.instanceColor.needsUpdate = true;
  };
  const view: View = {
    build(b) {
      disposeBoard();
      board = b;
      cols = b.cols;
      rows = b.rows;
      cursorIdx = -1;
      cursorMesh.visible = false;
      boomIn = -1;
      detonated = false;
      shake = 0;
      clearParts();
      const n = cols * rows;
      h = new Float32Array(n).fill(RAISED);
      ht = new Float32Array(n).fill(RAISED);
      dig = new Float32Array(n);
      delay = new Float32Array(n);
      flagged = new Uint8Array(n);
      revealed = new Uint8Array(n);
      revealDelay = new Float32Array(n);
      tiles = inst(tileGeo, stoneMat, n);
      caps = inst(capGeo, grassMat, n);
      floors = inst(floorGeo, floorMat, n);
      poles = inst(poleGeo, stickMat, n);
      banners = inst(bannerGeo, bannerMat, n);
      mines = inst(mineGeo, tntMat, n);
      // A single ring of plain stone blocks forms the terrain edge.
      const edge = inst(floorGeo, stoneMat, 2 * cols + 2 * rows + 4);
      let k = 0;
      for (let r = -1; r <= rows; r++)
        for (let c = -1; c <= cols; c++) {
          if (r !== -1 && r !== rows && c !== -1 && c !== cols) continue;
          edge.setMatrixAt(k++, m4.makeTranslation(c - (cols - 1) / 2, LOWERED - 0.12, r - (rows - 1) / 2));
        }
      edge.instanceMatrix.needsUpdate = true;
      numCanvas.width = cols * CELL_PX;
      numCanvas.height = rows * CELL_PX;
      // GPU texture storage is sized on first upload: a new board size needs a new texture.
      numTex.dispose();
      numTex = pixelTexture(numCanvas);
      numMat.map = numTex;
      numMat.needsUpdate = true;
      const numGeo = new THREE.PlaneGeometry(cols, rows).rotateX(-Math.PI / 2);
      boardGeos.push(numGeo);
      const plane = new THREE.Mesh(numGeo, numMat);
      plane.position.y = LOWERED + 0.006;
      root.add(plane);
      view.update(0, 0);
      view.redrawNumbers();
      fit();
    },
    sync(b, order = [], instant = false) {
      board = b;
      const anim = motion && !instant;
      for (let k = 0; k < order.length; k++) delay[order[k]] = anim ? Math.min(k * 0.012, 0.45) : 0;
      for (let i = 0; i < cols * rows; i++) {
        ht[i] = b.scanned[i] ? LOWERED : RAISED;
        flagged[i] = b.flagged[i] && !b.scanned[i] ? 1 : 0;
        if (!anim) {
          h[i] = ht[i];
          dig[i] = isLow(ht[i] ?? RAISED) ? 1 : 0;
          delay[i] = 0;
        }
      }
      view.redrawNumbers();
    },
    exploit(b) {
      board = b;
      for (let i = 0; i < cols * rows; i++) {
        if (!b.vuln[i] || b.flagged[i]) continue;
        ht[i] = LOWERED;
        revealDelay[i] = motion ? Math.hypot(cx(i) - cx(b.exploit), cz(i) - cz(b.exploit)) * 0.04 : 0;
        delay[i] = revealDelay[i];
        revealed[i] = 1;
        if (!motion) h[i] = LOWERED;
      }
      revealed[b.exploit] = 1;
      flagged[b.exploit] = 0;
      ht[b.exploit] = LOWERED;
      boomIn = motion ? 0.36 : -1;
    },
    win(b) {
      board = b;
      for (let i = 0; i < cols * rows; i++) if (b.vuln[i]) flagged[i] = 1;
    },
    setCursor(i) {
      cursorIdx = i;
      cursorMesh.visible = i >= 0 && i < cols * rows;
    },
    pick(x, y) {
      if (!tiles || !caps || !floors) return -1;
      // Matrices must reflect the last drawn frame before raycasting block sides.
      root.updateMatrixWorld(true);
      cam.updateMatrixWorld();
      const rect = stage.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObjects([tiles, caps, floors], false)[0];
      if (hit?.instanceId !== undefined) return hit.instanceId;
      const p = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -LOWERED), pos);
      if (!p) return -1;
      const c = Math.round(p.x + (cols - 1) / 2);
      const r = Math.round(p.z + (rows - 1) / 2);
      return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : -1;
    },
    screenOf(i) {
      pos.set(cx(i), (h[i] ?? RAISED) + 0.2, cz(i)).project(cam);
      return { x: ((pos.x + 1) / 2) * stage.size.w, y: ((1 - pos.y) / 2) * stage.size.h };
    },
    update(dt) {
      if (!board || !tiles || !caps || !floors || !poles || !banners || !mines) return;
      if (boomIn >= 0) {
        boomIn -= dt;
        if (boomIn < 0) {
          detonated = true;
          debris(board.exploit, 48, true);
          shake = 0.22;
        }
      }
      for (let i = 0; i < cols * rows; i++) {
        const x = cx(i);
        const z = cz(i);
        if (delay[i] > 0) delay[i] = Math.max(0, delay[i] - dt);
        else if (isLow(ht[i] ?? RAISED) && (h[i] ?? RAISED) > LOWERED + 1e-4) {
          if (!dig[i]) debris(i, 3);
          dig[i] = Math.min(1, dig[i] + dt / 0.2);
          h[i] = RAISED - (Math.floor(dig[i] * 4) / 4) * (RAISED - LOWERED);
        }
        const height = Math.max(0, h[i] - LOWERED);
        tiles.setMatrixAt(i, m4.compose(pos.set(x, LOWERED, z), q, scl.set(1, height, 1)));
        const cap = height > 0 ? 1 : 0;
        caps.setMatrixAt(i, m4.compose(pos.set(x, h[i] - 0.04, z), q, scl.set(cap, cap, cap)));
        floors.setMatrixAt(i, m4.makeTranslation(x, LOWERED - 0.12, z));
        const f = flagged[i];
        poles.setMatrixAt(i, m4.compose(pos.set(x - 0.15, h[i], z), q, scl.set(f, f, f)));
        banners.setMatrixAt(i, m4.compose(pos.set(x - 0.15, h[i], z), q, scl.set(f, f, f)));
        revealDelay[i] = Math.max(0, revealDelay[i] - dt);
        const v = revealed[i] && revealDelay[i] <= 0 && !(i === board.exploit && detonated) ? 1 : 0;
        mines.setMatrixAt(i, m4.compose(pos.set(x, LOWERED + 0.24, z), q, scl.set(v, v, v)));
      }
      for (const mesh of [tiles, caps, floors, poles, banners, mines]) mesh.instanceMatrix.needsUpdate = true;
      if (cursorIdx >= 0 && cursorIdx < h.length)
        cursorMesh.position.set(cx(cursorIdx), h[cursorIdx] + 0.025, cz(cursorIdx));
      for (let p = 0; p < PARTICLES; p++) {
        if (life[p] <= 0) continue;
        life[p] = Math.max(0, life[p] - dt);
        const o = p * 3;
        pv[o + 1] -= 10 * dt;
        for (let a = 0; a < 3; a++) pp[o + a] += pv[o + a] * dt;
        const snap = (v: number) => Math.round(v * 16) / 16;
        const s = life[p] > 0 ? 1 : 0;
        parts.setMatrixAt(
          p,
          m4.compose(pos.set(snap(pp[o]), Math.max(LOWERED, snap(pp[o + 1])), snap(pp[o + 2])), q, scl.set(s, s, s)),
        );
      }
      parts.instanceMatrix.needsUpdate = true;
      cam.position.copy(DIR).multiplyScalar(camDist).add(target);
      if (motion && shake > 0) {
        shake = Math.max(0, shake - dt);
        cam.position.x += (Math.random() - 0.5) * shake * 0.2;
        cam.position.y += (Math.random() - 0.5) * shake * 0.2;
      }
      cam.lookAt(target);
    },
    redrawNumbers() {
      if (!board) return;
      c2d.clearRect(0, 0, numCanvas.width, numCanvas.height);
      for (let i = 0; i < cols * rows; i++) {
        const a = board.adj[i];
        if (!board.scanned[i] || board.vuln[i] || !a) continue;
        c2d.fillStyle = COUNT_COLORS[a - 1];
        const px = (i % cols) * CELL_PX + 10;
        const py = Math.floor(i / cols) * CELL_PX + 6;
        for (let k = 0; k < 15; k++)
          if (DIGITS[a][k] === "1") c2d.fillRect(px + (k % 3) * 4, py + Math.floor(k / 3) * 4, 4, 4);
      }
      numTex.needsUpdate = true;
    },
    dispose() {
      disposeBoard();
      parts.dispose();
      scene.remove(parts, cursorMesh, root);
      for (const t of textures) t.dispose();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
  return view;
}
