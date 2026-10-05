import * as THREE from "three";
import { ARCADE_FONT } from "../core/neon";
import { addLights, createStage } from "../core/stage";
import type { GameContext } from "../core/types";
import {
  type Bug,
  type BugKind,
  type CatchEvent,
  type GameState,
  isVisible,
  latAt,
  MAX_BUGS,
  type Power,
  STAGES,
} from "./state";

const BUG_SCALE = 1.3;

const COPY = {
  es: {
    incident: "INCIDENTE CREADO +1",
    flagged: "FEATURE FLAG · BUG APAGADO",
    release: "RELEASE",
    down: "PROD CAÍDO",
    regress: "REGRESIÓN ↺",
    go: "¡YA!",
    unit: ["UNIT TESTS", "DEV más lento"],
    review: ["CODE REVIEW", "auto-QA x3"],
    flag: ["FEATURE FLAG", "protege PROD"],
  },
  en: {
    incident: "INCIDENT CREATED +1",
    flagged: "FEATURE FLAG · BUG MUTED",
    release: "RELEASE",
    down: "PROD DOWN",
    regress: "REGRESSION ↺",
    go: "GO!",
    unit: ["UNIT TESTS", "DEV slowed"],
    review: ["CODE REVIEW", "auto-QA x3"],
    flag: ["FEATURE FLAG", "PROD shield"],
  },
};

// Local bitmap lettering keeps signs pixel-sharp without loading a font or asset.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01110"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  N: ["10001", "11001", "11001", "10101", "10011", "10011", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
};

interface Fragment {
  p: THREE.Vector3;
  v: THREE.Vector3;
  color: THREE.Color;
  life: number;
}

export function createView(el: HTMLElement, ctx: GameContext) {
  const stage = createStage(el, { camera: "persp", fov: 36, bloom: false });
  const { scene } = stage;
  const camera = stage.camera as THREE.PerspectiveCamera;
  const pal = ctx.palette();
  const copy = COPY[ctx.lang];
  const rm = ctx.reducedMotion;
  addLights(scene);
  const roles = [pal.cyan, pal.violet, pal.amber, pal.red];
  const kinds: Record<BugKind, { color: string; size: [number, number, number] }> = {
    normal: { color: pal.red, size: [0.8, 0.38, 0.62] },
    fast: { color: pal.amber, size: [0.9, 0.24, 0.4] },
    zigzag: { color: pal.cyan, size: [0.62, 0.32, 0.8] },
    flaky: { color: pal.violet, size: [0.88, 0.48, 0.76] },
    heisen: { color: pal.violet, size: [0.64, 0.48, 0.48] },
    regression: { color: pal.red, size: [0.9, 0.38, 0.66] },
  };
  const box = new THREE.BoxGeometry(1, 1, 1);
  const textures: THREE.Texture[] = [];
  const matte = (color: string) => {
    const m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    return m;
  };
  const stone = matte(pal.dim);
  const seam = matte(pal.grid);
  const accent = roles.map(matte);
  const mesh = (m: THREE.Material, parent: THREE.Object3D = scene) => {
    const o = new THREE.Mesh(box, m);
    parent.add(o);
    return o;
  };
  const batch = (capacity: number) => {
    const o = new THREE.InstancedMesh(box, matte(pal.ink), capacity);
    o.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    o.frustumCulled = false;
    o.count = 0;
    scene.add(o);
    return o;
  };
  const matrix = new THREE.Matrix4();
  const transform = new THREE.Object3D();
  const color = new THREE.Color();
  const put = (
    o: THREE.InstancedMesh,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    c: string | THREE.Color,
  ) => {
    transform.position.set(x, y, z);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(sx, sy, sz);
    transform.updateMatrix();
    o.setMatrixAt(o.count, transform.matrix);
    o.setColorAt(o.count++, color.set(c));
  };
  const updateBatch = (o: THREE.InstancedMesh) => {
    o.instanceMatrix.needsUpdate = true;
    if (o.instanceColor) o.instanceColor.needsUpdate = true;
  };
  const signTexture = (text: string, foreground: string) => {
    const c = document.createElement("canvas");
    c.width = Math.max(48, text.length * 6 + 8);
    c.height = 15;
    const g = c.getContext("2d");
    if (g) {
      g.fillStyle = pal.floor;
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = foreground;
      g.fillRect(0, 0, c.width, 1);
      g.fillRect(0, c.height - 1, c.width, 1);
      const left = Math.floor((c.width - (text.length * 6 - 1)) / 2);
      [...text].forEach((letter, i) => {
        GLYPHS[letter]?.forEach((row, y) => {
          [...row].forEach((pixel, x) => {
            if (pixel === "1") g.fillRect(left + i * 6 + x, y + 4, 1, 1);
          });
        });
      });
    }
    const texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    textures.push(texture);
    return texture;
  };
  const sprite = (text: string, c: string) => {
    const m = new THREE.SpriteMaterial({ map: signTexture(text, c), toneMapped: false });
    const o = new THREE.Sprite(m);
    scene.add(o);
    return o;
  };

  // Inset stone blocks expose a thick role-colored rim on all four sides.
  const tiles = batch(4 * 5 * 7);
  const platforms = STAGES.map((name, i) => ({
    base: mesh(stone),
    trim: mesh(accent[i]),
    posts: [mesh(seam), mesh(seam)],
    sign: mesh(new THREE.MeshBasicMaterial({ map: signTexture(name, roles[i]), toneMapped: false })),
  }));
  const alarmBlocks = batch(35);
  const beetles = batch(MAX_BUGS * 28);
  const particles = batch(128);
  const crate = mesh(matte(pal.amber));
  const crateBands = [mesh(seam, crate), mesh(seam, crate)];
  crateBands[0].scale.set(1.02, 0.12, 1.02);
  crateBands[1].scale.set(0.12, 1.02, 1.02);
  const icons = {
    unit: signTexture("U", pal.amber),
    review: signTexture("R", pal.amber),
    flag: signTexture("F", pal.amber),
  };
  const crateLabel = sprite("U", pal.amber);
  crate.visible = crateLabel.visible = false;

  // DOM banners and labels use the cabinet pixel font, square borders, and no glow.
  const fx = document.createElement("div");
  fx.className = "ctb-fx";
  const style = document.createElement("style");
  style.textContent = `
.ctb-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:${ARCADE_FONT}}
.ctb-pop,.ctb-big,.ctb-chip,.ctb-pickup{color:var(--c);background:${pal.void};border:2px solid ${pal.grid};padding:6px 9px}
.ctb-pop,.ctb-big,.ctb-pickup{position:absolute;transform:translate(-50%,-50%);text-align:center}
.ctb-pop{font-size:20px;white-space:nowrap}
.ctb-big{left:50%;font-size:clamp(18px,4vw,36px);max-width:calc(100% - 24px);width:max-content;line-height:1.1;border-color:var(--c)}
.ctb-count{font-size:clamp(44px,12vw,92px)}
.ctb-fx small{display:block;font-size:11px;line-height:1.4}
.ctb-chips{position:absolute;left:10px;top:10px;display:flex;flex-direction:column;gap:5px}
.ctb-chip{font-size:12px;color:${pal.amber}}
.ctb-pickup{font-size:12px;color:${pal.amber};white-space:nowrap}
`;
  const chips = document.createElement("div");
  chips.className = "ctb-chips";
  const pickupLabel = document.createElement("div");
  pickupLabel.className = "ctb-pickup";
  pickupLabel.hidden = true;
  fx.append(style, chips, pickupLabel);
  el.appendChild(fx);
  const domFx = new Map<HTMLElement, number>();
  const positions = new Map<number, THREE.Vector3>();
  const armorHits = new Map<number, number>();
  const fragments: Fragment[] = [];
  let portrait = false;
  let length = 5.2;
  let width = 7;
  let prodAlarm = 0;
  let down = false;
  let chipText = "";
  let lastState: GameState | undefined;
  let lastTime = 0;
  const world = (p: number, lat: number, out = new THREE.Vector3(), y = 0) => {
    const a = (p - 2) * length;
    const l = lat * (width / 2 - 0.9);
    return portrait ? out.set(l, y, a) : out.set(a, y, l);
  };
  const screenOf = (p: THREE.Vector3) => {
    const v = p.clone().project(camera);
    return { x: ((v.x + 1) * stage.size.w) / 2, y: ((1 - v.y) * stage.size.h) / 2 };
  };
  const place = (
    o: THREE.Object3D,
    p: number,
    lateral: number,
    y: number,
    along: number,
    height: number,
    across: number,
  ) => {
    world(p, lateral, o.position, y);
    o.scale.set(portrait ? across : along, height, portrait ? along : across);
  };
  const fit = () => {
    const target = new THREE.Vector3(0, 0.4, 0);
    const direction = new THREE.Vector3(0, portrait ? 1.4 : 1.15, 0.9).normalize();
    const hx = portrait ? width / 2 + 0.2 : length * 2 + 0.25;
    const hz = portrait ? length * 2 + 0.25 : width / 2 + 0.2;
    const v = new THREE.Vector3();
    let lo = 4;
    let hi = 180;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2;
      camera.position.copy(target).addScaledVector(direction, d);
      camera.lookAt(target);
      camera.updateMatrixWorld();
      let fits = true;
      for (const x of [-hx, hx])
        for (const z of [-hz, hz])
          for (const y of [-0.55, 1.7]) {
            v.set(x, y, z).project(camera);
            if (Math.abs(v.x) > 0.97 || v.y > 0.92 || v.y < -0.97) fits = false;
          }
      if (fits) hi = d;
      else lo = d;
    }
    camera.position.copy(target).addScaledVector(direction, hi);
    camera.lookAt(target);
    camera.updateMatrixWorld();
  };
  const layout = () => {
    portrait = stage.size.w < stage.size.h;
    length = portrait ? 4.5 : 5.2;
    width = portrait ? 6.6 : 7;
    const insetLength = length - 0.6;
    const insetWidth = width - 0.48;
    tiles.count = 0;
    platforms.forEach((platform, i) => {
      place(platform.base, i + 0.5, 0, -0.43, length - 0.12, 0.2, width);
      place(platform.trim, i + 0.5, 0, -0.16, length - 0.1, 0.44, width);
      for (let a = 0; a < 5; a++)
        for (let l = 0; l < 7; l++) {
          const p = world(i + 0.5 + ((a - 2) * insetLength) / (5 * length), 0, new THREE.Vector3(), 0.04);
          if (portrait) p.x = ((l - 3) * insetWidth) / 7;
          else p.z = ((l - 3) * insetWidth) / 7;
          put(
            tiles,
            p.x,
            p.y,
            p.z,
            portrait ? insetWidth / 7 - 0.025 : insetLength / 5 - 0.025,
            0.08,
            portrait ? insetLength / 5 - 0.025 : insetWidth / 7 - 0.025,
            (a * 3 + l + i) % 11 === 0 ? pal.ink : pal.dim,
          );
        }
      const signWidth = portrait ? 3.2 : 3.8;
      // Put signs on the rear edge, away from the camera at +Z, in both layouts.
      world(i + (portrait ? 0.06 : 0.5), 0, platform.sign.position, 1.12);
      if (!portrait) platform.sign.position.z = -width / 2 + 0.18;
      platform.sign.scale.set(signWidth, (signWidth * 15) / 48, 0.16);
      platform.posts.forEach((post, j) => {
        post.position.copy(platform.sign.position);
        post.position.x += (j === 0 ? -1 : 1) * signWidth * 0.32;
        post.position.y = 0.4;
        post.scale.set(0.22, 0.68, 0.22);
      });
    });
    updateBatch(tiles);
    fit();
  };
  const banner = (text: string, sub: string, c: string, y: number, count = false) => {
    for (const node of fx.querySelectorAll<HTMLElement>(".ctb-big")) {
      domFx.delete(node);
      node.remove();
    }
    return message(`ctb-big${count ? " ctb-count" : ""}`, text, sub, c, stage.size.w / 2, y, count ? 0.52 : 1.65);
  };
  const message = (cls: string, text: string, sub: string, c: string, x: number, y: number, life: number) => {
    const node = document.createElement("div");
    node.className = cls;
    node.style.setProperty("--c", c);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    node.textContent = text;
    if (sub) {
      const small = document.createElement("small");
      small.textContent = sub;
      node.appendChild(small);
    }
    fx.appendChild(node);
    domFx.set(node, life);
    return node;
  };
  const pop = (at: THREE.Vector3, text: string, sub: string, c: string) => {
    const p = screenOf(at);
    message("ctb-pop", text, sub, c, p.x, p.y - 16, 0.9);
  };
  const burst = (at: THREE.Vector3, c: string, n = 12) => {
    if (rm) return;
    for (let i = 0; i < n; i++) {
      if (fragments.length >= 128) fragments.shift();
      const a = (i * Math.PI * 2) / n;
      fragments.push({
        p: at.clone(),
        color: new THREE.Color(c),
        life: 0.55,
        v: new THREE.Vector3(Math.cos(a) * 2.4, 1.5 + Math.random() * 2, Math.sin(a) * 2.4),
      });
    }
  };

  const render = (s: GameState, dt: number, t: number) => {
    lastState = s;
    lastTime = t;
    positions.clear();
    beetles.count = 0;
    for (const b of s.bugs) {
      if (!isVisible(b)) continue;
      const k = kinds[b.kind];
      const [sx, sy, sz] = k.size;
      const p = world(b.p, latAt(b), new THREE.Vector3(), 0.08);
      positions.set(b.id, p.clone().setY(0.08 + 0.35 * BUG_SCALE));
      const ahead = world(b.p + 0.02, latAt(b, b.p + 0.02));
      const yaw = Math.atan2(-(ahead.z - p.z), ahead.x - p.x);
      const base = new THREE.Matrix4()
        .makeRotationY(yaw)
        .scale(new THREE.Vector3(BUG_SCALE, BUG_SCALE, BUG_SCALE))
        .setPosition(p);
      const step = rm ? 0 : Math.floor(t * (8 + b.speed * 14) + b.id) % 2;
      const bodyColor = armorHits.has(b.id) ? pal.ink : k.color;
      const block = (x: number, y: number, z: number, a: number, h: number, w: number, c: string) => {
        transform.position.set(x, y, z);
        transform.rotation.set(0, 0, 0);
        transform.scale.set(a, h, w);
        transform.updateMatrix();
        matrix.multiplyMatrices(base, transform.matrix);
        beetles.setMatrixAt(beetles.count, matrix);
        beetles.setColorAt(beetles.count++, color.set(c));
      };
      block(0, 0.19 + sy / 2, 0, sx, sy, sz, bodyColor);
      block(sx / 2 + 0.12, 0.32, 0, 0.28, 0.28, sz * 0.7, pal.grid);
      // A dark split down the shell and six square feet make a readable beetle silhouette.
      block(0, 0.2 + sy, 0, sx * 0.9, 0.04, 0.045, pal.grid);
      for (const side of [-1, 1]) {
        block(sx / 2 + 0.27, 0.38, side * sz * 0.2, 0.045, 0.07, 0.08, pal.ink);
        block(sx / 2 + 0.14, 0.53, side * sz * 0.28, 0.1, 0.18, 0.1, bodyColor);
        block(sx / 2 + 0.24, 0.65, side * sz * 0.28, 0.12, 0.12, 0.12, bodyColor);
        for (let j = 0; j < 3; j++) {
          const lift = step === (j + (side > 0 ? 1 : 0)) % 2 && !rm ? 0.065 : 0;
          block((j - 1) * sx * 0.32, 0.16 + lift, side * (sz / 2 + 0.12), 0.16, 0.12, 0.28, pal.grid);
          block((j - 1) * sx * 0.32, 0.055 + lift, side * (sz / 2 + 0.22), 0.18, 0.18, 0.18, bodyColor);
        }
      }
      if (b.kind === "flaky" && b.hp > 1) block(-0.04, 0.25 + sy, 0, sx * 0.75, 0.16, sz * 1.12, pal.grid);
      if (b.kind === "heisen") block(0, 0.28 + sy, 0, 0.28, 0.24, 0.28, bodyColor);
      if (b.kind === "zigzag") block(-sx * 0.45, 0.25, 0, 0.24, 0.16, sz * 1.15, bodyColor);
      if (b.kind === "regression")
        for (const side of [-1, 1])
          block(sx / 2 + 0.42, 0.32, side * 0.2, b.relapsed ? 0.14 : 0.3, 0.16, 0.16, bodyColor);
    }
    updateBatch(beetles);
    for (const [id, life] of armorHits) {
      if (life <= dt) armorHits.delete(id);
      else armorHits.set(id, life - dt);
    }
    particles.count = 0;
    for (let i = fragments.length - 1; i >= 0; i--) {
      const f = fragments[i];
      f.life -= dt;
      if (f.life <= 0) {
        fragments.splice(i, 1);
        continue;
      }
      f.v.y -= dt * 9;
      f.p.addScaledVector(f.v, dt);
      f.p.y = Math.max(0.14, f.p.y);
      const size = 0.13 * Math.min(1, f.life * 5);
      put(particles, f.p.x, f.p.y, f.p.z, size, size, size, f.color);
    }
    updateBatch(particles);
    prodAlarm = Math.max(0, prodAlarm - dt);
    alarmBlocks.count = 0;
    if (down || prodAlarm > 0) {
      const on = rm || down || Math.floor(t * 6) % 2 === 0;
      for (let a = 0; a < 5; a++)
        for (let l = 0; l < 7; l++) {
          if ((a + l) % 2 !== 0) continue;
          const p = world(3 + (a + 0.5) / 5, 0, new THREE.Vector3(), 0.085);
          if (portrait) p.x = ((l - 3) * width) / 7;
          else p.z = ((l - 3) * width) / 7;
          put(
            alarmBlocks,
            p.x,
            p.y,
            p.z,
            portrait ? width / 7 - 0.06 : length / 5 - 0.08,
            0.08,
            portrait ? length / 5 - 0.08 : width / 7 - 0.06,
            on ? pal.red : pal.grid,
          );
        }
    }
    updateBatch(alarmBlocks);
    const power = s.power;
    crate.visible = crateLabel.visible = !!power;
    pickupLabel.hidden = !power;
    if (power) {
      world(power.p, power.lat, crate.position, 0.48);
      crate.scale.setScalar(0.7);
      crateLabel.position.copy(crate.position).setY(0.95);
      crateLabel.scale.set(0.7, 0.3, 1);
      crateLabel.material.map = icons[power.kind];
      positions.set(-power.id, crate.position.clone());
      const sp = screenOf(crate.position);
      const [name, sub] = copy[power.kind];
      if (pickupLabel.dataset.kind !== power.kind) {
        pickupLabel.dataset.kind = power.kind;
        pickupLabel.replaceChildren(name);
        const small = document.createElement("small");
        small.textContent = sub;
        pickupLabel.appendChild(small);
      }
      const half = pickupLabel.offsetWidth / 2 + 6;
      pickupLabel.style.left = `${Math.max(half, Math.min(stage.size.w - half, sp.x))}px`;
      pickupLabel.style.top = `${Math.min(stage.size.h - 30, sp.y + 38)}px`;
    }
    const list: string[] = [];
    if (s.effects.unit > 0) list.push(`${copy.unit[0]} ${s.effects.unit.toFixed(1)}s`);
    if (s.effects.review > 0) list.push(`${copy.review[0]} x${s.effects.review}`);
    if (s.effects.flag > 0) list.push(`${copy.flag[0]} x${s.effects.flag}`);
    const text = list.join("|");
    if (text !== chipText) {
      chipText = text;
      chips.replaceChildren(
        ...list.map((value) => {
          const node = document.createElement("div");
          node.className = "ctb-chip";
          node.textContent = value;
          return node;
        }),
      );
    }
    for (const [node, life] of domFx) {
      if (life <= dt) {
        node.remove();
        domFx.delete(node);
      } else domFx.set(node, life - dt);
    }
  };
  stage.onResize(() => {
    layout();
    if (lastState) render(lastState, 0, lastTime);
  });
  const prodHead = () => {
    const p = screenOf(world(3.5, 0, new THREE.Vector3(), 1.3));
    return Math.max(50, Math.min(stage.size.h - 45, p.y));
  };
  const atBug = (b: Bug) => positions.get(b.id) ?? world(b.p, latAt(b), new THREE.Vector3(), 0.35);

  return {
    stage,
    render,
    pick(clientX: number, clientY: number, touch: boolean): { kind: "bug" | "power"; id: number } | null {
      const r = stage.canvas.getBoundingClientRect();
      const x = ((clientX - r.left) / r.width) * stage.size.w;
      const y = ((clientY - r.top) / r.height) * stage.size.h;
      let best: { kind: "bug" | "power"; id: number } | null = null;
      let distance = touch ? 46 : 34;
      for (const [id, p] of positions) {
        const sp = screenOf(p);
        const d = Math.hypot(sp.x - x, sp.y - y) * (id < 0 ? 0.7 : 1 / BUG_SCALE);
        if (d < distance) {
          distance = d;
          best = id < 0 ? { kind: "power", id: -id } : { kind: "bug", id };
        }
      }
      return best;
    },
    onCatch(e: CatchEvent) {
      const p = atBug(e.bug);
      burst(p, kinds[e.bug.kind].color);
      pop(
        p,
        e.combo > 1 ? `+${e.points} x${e.combo}` : `+${e.points}`,
        e.auto ? copy.review[0] : e.respawn ? copy.regress : "",
        pal.amber,
      );
      armorHits.delete(e.bug.id);
    },
    onArmor(b: Bug) {
      armorHits.set(b.id, 0.2);
      burst(atBug(b), pal.violet, 6);
      pop(atBug(b), "1/2", "", pal.violet);
    },
    onPower(p: Power) {
      const at = world(p.p, p.lat, new THREE.Vector3(), 0.5);
      burst(at, pal.amber);
      pop(at, copy[p.kind][0], copy[p.kind][1], pal.amber);
    },
    onIncident() {
      prodAlarm = 0.9;
      banner(copy.incident, "PROD", pal.red, prodHead());
    },
    onFlagged(b: Bug) {
      burst(world(3, latAt(b), new THREE.Vector3(), 0.35), pal.amber);
      banner(copy.flagged, "PROD", pal.amber, prodHead());
    },
    onRelease(name: string) {
      banner(name, copy.release, pal.amber, stage.size.h * 0.2);
    },
    countdown(label: string) {
      banner(label, "", pal.cyan, stage.size.h * 0.42, true);
    },
    onGameOver() {
      down = true;
      banner(copy.down, "500", pal.red, stage.size.h * 0.32);
    },
    clearFx() {
      for (const node of domFx.keys()) node.remove();
      domFx.clear();
      armorHits.clear();
      positions.clear();
      fragments.length = 0;
      particles.count = alarmBlocks.count = 0;
      prodAlarm = 0;
      down = false;
      chipText = "";
      chips.replaceChildren();
      pickupLabel.hidden = true;
    },
    pauseFx() {},
    resumeFx() {},
    dispose() {
      lastState = undefined;
      domFx.clear();
      fx.remove();
      for (const batch of [tiles, alarmBlocks, beetles, particles]) batch.dispose();
      stage.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}
