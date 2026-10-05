import * as THREE from "three";
import { NEON } from "../games/core/neon";
import { addLights, createStage } from "../games/core/stage";
import { type Attract, createAttract } from "./attract";
import { arcadeFontFamily, type Cabinet, createCabinet } from "./cabinet";

/**
 * The arcade hall: a curved row of cabinets in a cozy room of matte blocks,
 * the ARCADE sign and a hi-score board on the back wall. Progressive enhancement:
 * the page owns the accessible links; this only renders and reports focus/enter.
 */
export interface LobbyGame {
  slug: string;
  marquee: string;
  title: string;
  color: string;
}

export interface LobbyOptions {
  lang: "es" | "en";
  games: LobbyGame[];
  /** Best score per slug (from the store). */
  best: Record<string, number>;
  /** Board header, e.g. "RÉCORDS". */
  boardTitle: string;
  reducedMotion: boolean;
  /** Pointer hover or swipe changed the focused cabinet. */
  onFocus(index: number): void;
  /** Click/tap on a cabinet that should open its game. */
  onEnter(index: number): void;
  /** First frame drawn. */
  onReady(): void;
}

export interface Lobby {
  /** Focus a cabinet (from keyboard/DOM focus). */
  focus(index: number): void;
  dispose(): void;
}

const R = 6; // arc radius
const ARC = (100 * Math.PI) / 180; // total arc span
const WALL_Z = -8.6;

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  return t;
}

function signTexture(): THREE.CanvasTexture {
  return canvasTex(512, 128, (x) => {
    x.fillStyle = NEON.amber;
    x.fillRect(0, 0, 512, 128);
    x.fillStyle = NEON.void;
    x.fillRect(0, 112, 512, 16);
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.font = `700 96px ${arcadeFontFamily()}`;
    x.fillText("ARCADE", 256, 62, 480);
  });
}

function boardTexture(title: string, games: LobbyGame[], best: Record<string, number>, lang: "es" | "en") {
  const fam = arcadeFontFamily();
  const mono = '"JetBrains Mono", ui-monospace, monospace';
  const nf = new Intl.NumberFormat(lang === "es" ? "es-PE" : "en-US");
  const rows = [...games].sort((a, b) => (best[b.slug] ?? 0) - (best[a.slug] ?? 0));
  return canvasTex(1024, 320, (x) => {
    x.fillStyle = NEON.floor;
    x.fillRect(0, 0, 1024, 320);
    x.strokeStyle = NEON.amber;
    x.lineWidth = 4;
    x.strokeRect(6, 6, 1012, 308);
    x.textBaseline = "middle";
    x.textAlign = "center";
    x.font = `800 44px ${fam}`;
    x.fillStyle = NEON.ink;
    x.fillText(title.toUpperCase(), 512, 46);
    x.font = `600 25px ${mono}`;
    rows.forEach((g, i) => {
      const col = Math.floor(i / 3);
      const row = i % 3;
      const cx = 32 + col * 330;
      const cy = 118 + row * 70;
      x.textAlign = "left";
      x.fillStyle = NEON.dim;
      x.fillText(String(i + 1).padStart(2, "0"), cx, cy);
      x.fillStyle = NEON.ink;
      x.fillText(g.marquee.slice(0, 11), cx + 46, cy);
      x.textAlign = "right";
      x.fillStyle = NEON.ink;
      x.fillText(nf.format(best[g.slug] ?? 0), cx + 304, cy);
    });
  });
}

/** Tiny, deterministic plank/stone texture; no asset requests or smooth sampling. */
function roomTexture(planks: boolean) {
  return canvasTex(16, 16, (x) => {
    x.fillStyle = NEON.floor;
    x.fillRect(0, 0, 16, 16);
    for (let y = 0; y < 16; y++) {
      for (let px = 0; px < 16; px++) {
        const grain = (px * 13 + y * 7) % 19;
        x.fillStyle = grain < 3 ? NEON.grid : NEON.floor;
        x.fillRect(px, y, planks ? 3 : 1, 1);
      }
    }
    x.fillStyle = NEON.void;
    x.fillRect(0, 0, 16, 1);
    x.fillRect(0, 0, 1, 16);
    if (planks) x.fillRect(0, 8, 16, 1);
  });
}

export function mountLobby(host: HTMLElement, opts: LobbyOptions): Lobby {
  const { games, reducedMotion } = opts;
  const stage = createStage(host, {
    camera: "persp",
    fov: 34,
    bloom: false,
  });
  // The hero is full-bleed: let vertical swipes scroll the page.
  stage.canvas.style.touchAction = "pan-y";
  const { scene } = stage;
  const camera = stage.camera as THREE.PerspectiveCamera;
  addLights(scene);

  const textures: THREE.Texture[] = [];
  const world = new THREE.Group();
  scene.add(world);
  const stoneTex = roomTexture(false);
  const plankTex = roomTexture(true);
  textures.push(stoneTex, plankTex);
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 1, metalness: 0, flatShading: true });
  const plank = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 1, metalness: 0, flatShading: true });
  const edge = new THREE.MeshStandardMaterial({ color: NEON.void, roughness: 1, flatShading: true });
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const block = (w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) => {
    const mesh = new THREE.Mesh(cube, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    world.add(mesh);
    return mesh;
  };
  // Repeated masonry and floor planks use one draw call each.
  const wall = new THREE.InstancedMesh(cube, stone, 24 * 6);
  const floor = new THREE.InstancedMesh(cube, plank, 24 * 20);
  const transform = new THREE.Object3D();
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 24; col++) {
      transform.position.set(col - 11.5, row + 0.5, WALL_Z - 0.3);
      transform.scale.set(0.98, 0.98, 0.5);
      transform.updateMatrix();
      wall.setMatrixAt(row * 24 + col, transform.matrix);
    }
  }
  for (let row = 0; row < 20; row++) {
    for (let col = 0; col < 24; col++) {
      transform.position.set(col - 11.5, -0.13, WALL_Z + row + 0.5);
      transform.scale.set(0.98, 0.24, 0.98);
      transform.updateMatrix();
      floor.setMatrixAt(row * 24 + col, transform.matrix);
    }
  }
  wall.instanceMatrix.needsUpdate = floor.instanceMatrix.needsUpdate = true;
  world.add(wall, floor);
  block(0.5, 6, 20, -12.25, 3, 1.1, stone);
  block(0.5, 6, 20, 12.25, 3, 1.1, stone);
  block(24, 0.3, 0.6, 0, 5.85, WALL_Z, edge);
  block(24, 0.2, 0.6, 0, 0.1, WALL_Z, edge);

  const signTex = signTexture();
  const boardTex = boardTexture(opts.boardTitle, games, opts.best, opts.lang);
  textures.push(signTex, boardTex);
  block(6.6, 1.7, 0.24, 0, 4.3, WALL_Z + 0.05, edge);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }),
  );
  sign.position.set(0, 4.3, WALL_Z + 0.18);
  world.add(sign);
  block(5.8, 1.95, 0.24, 0, 2.62, WALL_Z + 0.05, edge);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(5.6, 1.75),
    new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false }),
  );
  board.position.set(0, 2.62, WALL_Z + 0.18);
  world.add(board);

  const lampFace = new THREE.MeshBasicMaterial({ color: NEON.amber, toneMapped: false });
  for (const x of [-7, 7]) {
    block(0.8, 0.8, 0.6, x, 3.7, WALL_Z + 0.25, edge);
    block(0.56, 0.56, 0.62, x, 3.7, WALL_Z + 0.29, lampFace);
    block(0.8, 0.12, 0.68, x, 3.7, WALL_Z + 0.32, edge);
    block(0.12, 0.8, 0.68, x, 3.7, WALL_Z + 0.32, edge);
    const light = new THREE.PointLight(NEON.amber, 18, 10, 2);
    light.position.set(x, 3.7, WALL_Z + 1);
    world.add(light);
  }

  // Cabinets on an arc facing the center.
  const n = games.length;
  const cabs: Cabinet[] = [];
  const attracts: Attract[] = [];
  const home: Array<{ pos: THREE.Vector3; dir: THREE.Vector3; rotY: number }> = [];
  const lift = new Float32Array(n);
  games.forEach((g, i) => {
    const a = n > 1 ? -ARC / 2 + (ARC * i) / (n - 1) : 0;
    const cab = createCabinet({ color: g.color, marquee: g.marquee, lang: opts.lang });
    const at = createAttract(g.slug, g.title, g.color);
    at.draw(i * 0.7);
    cab.setScreenTexture(at.texture);
    const pos = new THREE.Vector3(R * Math.sin(a), 0, -R * Math.cos(a));
    const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
    cab.group.position.copy(pos);
    cab.group.rotation.y = -a;
    cab.group.userData.index = i;
    world.add(cab.group);
    cabs.push(cab);
    attracts.push(at);
    home.push({ pos, dir, rotY: -a });
  });
  // Camera rig.
  let focused = Math.floor(n / 2);
  let narrow = false;
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const computeWant = () => {
    if (narrow) {
      const h = home[focused]!;
      wantPos.copy(h.pos).addScaledVector(h.dir, 6.2).setY(1.6);
      wantLook.copy(h.pos).setY(1.0);
    } else {
      // Fit the whole arc horizontally, then add a slight parallax toward focus.
      const half = (ARC / 2) * 1.02;
      const ex = R * Math.sin(half) + 0.6;
      const ez = -R * Math.cos(half);
      const hfov = Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
      const z = Math.max(3.2, ez + ex / Math.tan(hfov));
      const fx = home[focused]!.pos.x * 0.12;
      wantPos.set(fx, 1.75, z + 1.6);
      wantLook.set(fx * 0.6, 1.45, -5);
    }
  };
  stage.onResize((w, h) => {
    narrow = w / h < 1.05;
    computeWant();
  });
  computeWant();
  // Intro glide from the hall entrance (skipped with reduced motion).
  camPos.copy(wantPos);
  camLook.copy(wantLook);
  if (!reducedMotion) camPos.add(tmp.set(-2.4, 1.1, 5));
  camera.position.copy(camPos);
  camera.lookAt(camLook);

  const setFocus = (i: number, notify: boolean) => {
    const next = Math.max(0, Math.min(n - 1, i));
    if (next === focused && !notify) return;
    focused = next;
    computeWant();
    if (notify) opts.onFocus(focused);
  };

  // Pointer: hover/click on desktop, swipe/tap on narrow.
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const targets = cabs.map((c) => c.group);
  const pick = (e: PointerEvent): number => {
    const r = stage.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(targets, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && o.userData.index === undefined) o = o.parent;
    return o ? (o.userData.index as number) : -1;
  };
  let down: { x: number; y: number; t: number } | null = null;
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const i = pick(e);
    stage.canvas.style.cursor = i >= 0 ? "pointer" : "";
    if (i >= 0 && i !== focused) setFocus(i, true);
  };
  const onDown = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  };
  const onUp = (e: PointerEvent) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    down = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      setFocus(focused + (dx < 0 ? 1 : -1), true);
      return;
    }
    if (Math.hypot(dx, dy) > 12) return;
    const i = pick(e);
    if (i < 0) return;
    if (e.pointerType === "mouse" || i === focused) opts.onEnter(i);
    else setFocus(i, true);
  };
  stage.canvas.addEventListener("pointermove", onMove);
  stage.canvas.addEventListener("pointerdown", onDown);
  stage.canvas.addEventListener("pointerup", onUp);
  const onCancel = () => {
    down = null;
  };
  stage.canvas.addEventListener("pointercancel", onCancel);

  // Frame loop.
  let attractClock = 0;
  let ready = false;
  let disposed = false;
  let readyFrame = 0;
  try {
    void document.fonts.ready.then(() => {
      if (disposed) return;
      const freshSign = signTexture();
      const freshBoard = boardTexture(opts.boardTitle, games, opts.best, opts.lang);
      signTex.image = freshSign.image;
      boardTex.image = freshBoard.image;
      signTex.needsUpdate = boardTex.needsUpdate = true;
      freshSign.dispose();
      freshBoard.dispose();
    });
  } catch {
    /* FontFaceSet unavailable. */
  }
  stage.loop((dt, t) => {
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 2.2);
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);

    for (let i = 0; i < n; i++) {
      const target = i === focused ? 1 : 0;
      lift[i] = reducedMotion ? target : lift[i]! + (target - lift[i]!) * (1 - Math.exp(-dt * 9));
      const l = lift[i]!;
      const cab = cabs[i]!;
      const h = home[i]!;
      cab.setFocus(l);
      // Keep brightness feedback without the local cabinet lift in reduced motion.
      if (reducedMotion) cab.group.position.y = h.pos.y - 0.06 * l;
      if (!reducedMotion) {
        cab.group.position.copy(h.pos).addScaledVector(h.dir, 0.3 * l);
      }
    }

    if (!reducedMotion) {
      attractClock += dt;
      if (attractClock >= 1 / 15) {
        attractClock = 0;
        for (const a of attracts) a.draw(t);
      }
    }
    if (!ready) {
      ready = true;
      readyFrame = requestAnimationFrame(() => {
        if (!disposed) opts.onReady();
      });
    }
  });

  // Pause when off-screen or the tab is hidden.
  let visible = true;
  const sync = () => (visible && !document.hidden ? stage.resume() : stage.pause());
  const io = new IntersectionObserver(([e]) => {
    visible = !!e?.isIntersecting;
    sync();
  });
  io.observe(host);
  document.addEventListener("visibilitychange", sync);

  const lobby: Lobby = {
    focus(i) {
      setFocus(i, false);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(readyFrame);
      stage.canvas.removeEventListener("pointermove", onMove);
      stage.canvas.removeEventListener("pointerdown", onDown);
      stage.canvas.removeEventListener("pointerup", onUp);
      stage.canvas.removeEventListener("pointercancel", onCancel);
      io.disconnect();
      document.removeEventListener("visibilitychange", sync);
      for (const c of cabs) c.dispose();
      for (const a of attracts) a.dispose();
      for (const tx of textures) tx.dispose();
      stage.dispose();
    },
  };
  return lobby;
}
