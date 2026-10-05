import * as THREE from "three";
import { NEON, type NeonRole } from "../core/neon";
import { addLights, createStage, type Stage } from "../core/stage";
import { type Kind, makeShields, PLAYER_Y, type PowerKind, SAUCER_Y, type State } from "./state";

const DISPLAY = '"Silkscreen", "Arial Narrow", sans-serif';
const KIND_ROLE: NeonRole[] = ["red", "magenta", "amber", "violet"];
const KIND_LABEL = ["GET", "SQLi", "XSS", "BOT"];
const POWER_LABEL: Record<PowerKind, string> = { spread: "RULE+", cache: "CDN", slow: "RATE" };
const MAX_EN = 90;
const MAX_PARTS = 260;
const PIXEL = 0.22;

// Two discrete poses per request type. Empty pixels form the eyes and leg gaps.
const POSES = [
  [
    ["00100000100", "00010001000", "00111111100", "01101110110", "11111111111", "10100000101", "00011011000"],
    ["00100000100", "10010001001", "10111111101", "11101110111", "01111111110", "00100000100", "01000000010"],
  ],
  [
    ["00011111000", "01111111110", "11111111111", "11001110011", "11111111111", "00011011000", "00100100100"],
    ["00011111000", "01111111110", "11111111111", "11001110011", "11111111111", "00110101100", "11000000011"],
  ],
  [
    ["00001110000", "00011111000", "00111111100", "01101110110", "01111111110", "00010101000", "00100000100"],
    ["00001110000", "00011111000", "00111111100", "01101110110", "01111111110", "00101010100", "00010001000"],
  ],
  [
    ["00011011000", "00111111100", "01101110110", "11111111111", "10111111101", "00100000100", "01000000010"],
    ["00011011000", "00111111100", "01101110110", "01111111110", "00111111100", "01000000010", "00100000100"],
  ],
];
const pixels = (rows: string[], size: number) =>
  rows.flatMap((row, y) =>
    [...row].flatMap((v, x) =>
      v === "1" ? [{ x: (x - (row.length - 1) / 2) * size, y: ((rows.length - 1) / 2 - y) * size }] : [],
    ),
  );
const FRAMES = POSES.map((poses) => poses.map((rows) => pixels(rows, PIXEL)));
const matte = (role: NeonRole) => new THREE.MeshLambertMaterial({ color: NEON[role], flatShading: true });

class Chip {
  tex: THREE.CanvasTexture;
  private canvas = document.createElement("canvas");
  constructor(
    private text: string,
    private role: NeonRole,
  ) {
    this.canvas.width = 128;
    this.canvas.height = 48;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.minFilter = this.tex.magFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.draw();
  }
  draw() {
    const g = this.canvas.getContext("2d");
    if (!g) return;
    g.imageSmoothingEnabled = false;
    g.fillStyle = NEON[this.role];
    g.fillRect(0, 0, 128, 48);
    g.fillStyle = NEON.void;
    g.fillRect(3, 3, 122, 42);
    g.fillStyle = NEON[this.role];
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 30;
    do {
      g.font = `800 ${size--}px ${DISPLAY}`;
    } while (g.measureText(this.text).width > 116 && size > 10);
    g.fillText(this.text, 64, 25);
    this.tex.needsUpdate = true;
  }
}
interface Part {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  c: THREE.Color;
}

export class View {
  stage: Stage;
  private chips: Chip[] = [];
  private disposed = false;
  private dummy = new THREE.Object3D();
  private bodies: THREE.InstancedMesh[] = [];
  private tags: THREE.InstancedMesh[] = [];
  private cells: THREE.InstancedMesh;
  private packets: THREE.InstancedMesh;
  private shots: THREE.InstancedMesh;
  private partMesh: THREE.InstancedMesh;
  private parts: Part[] = [];
  private player = new THREE.Group();
  private spreadGuns = new THREE.Group();
  private cacheWall = new THREE.Group();
  private saucer = new THREE.Group();
  private boss = new THREE.Group();
  private bossHull: THREE.InstancedMesh;
  private bossHp: THREE.InstancedMesh;
  private powers: Array<{ g: THREE.Group; tag: THREE.MeshBasicMaterial }> = [];
  private powerChips: Record<PowerKind, Chip>;
  private core: THREE.Mesh;
  private shake = 0;
  private flicker = 0;
  private bossFlash = 0;
  private center = 0;
  private dist = 50;

  constructor(
    el: HTMLElement,
    private reducedMotion: boolean,
    private gutterPx: number,
  ) {
    this.stage = createStage(el, { camera: "persp", fov: 38, bloom: false });
    const { scene } = this.stage;
    addLights(scene);
    // A low stone horizon, leaving the playfield in a dark void.
    const horizon = this.instances(NEON.floor, 48, 2);
    for (let i = 0; i < 48; i++) this.set(horizon, i, (i - 23.5) * 2, -18 + (i % 7 === 0 ? 2 : 0), -8);
    scene.add(horizon);

    for (let k = 0; k < 4; k++) {
      const body = this.instances(NEON[KIND_ROLE[k]], MAX_EN * 80, PIXEL * 0.98);
      body.count = 0;
      this.bodies.push(body);
      const tag = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1.35, 0.5),
        this.tagMaterial(this.chip(KIND_LABEL[k], KIND_ROLE[k])),
        MAX_EN,
      );
      tag.count = 0;
      tag.frustumCulled = false;
      tag.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.tags.push(tag);
      scene.add(body, tag);
    }

    // Two cubes in depth per two-hit cell: a hit removes a layer, destruction removes both.
    this.cells = this.instances(NEON.grid, makeShields().length * 2, 0.56);
    this.packets = this.instances(NEON.red, 24, 0.5);
    this.shots = this.instances(NEON.cyan, 12, 0.28);
    this.partMesh = this.instances(NEON.ink, MAX_PARTS, 0.22);
    this.partMesh.count = this.packets.count = this.shots.count = 0;
    scene.add(this.cells, this.packets, this.shots, this.partMesh);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(41, 0.3, 0.6), matte("grid"));
    rail.position.set(0, PLAYER_Y - 0.9, -0.6);
    this.core = new THREE.Mesh(new THREE.BoxGeometry(34, 1, 1), matte("floor"));
    this.core.position.set(0, -15, -0.4);
    scene.add(rail, this.core, this.label("API", "ink", 1.5, 0, -15, 0.3));

    this.player.add(this.voxels(["00011000", "00011000", "00111100", "11111111", "11111111"], "cyan", 0.36));
    this.player.add(this.label("WAF", "cyan", 1.2, 0, -0.18, 0.55));
    for (const side of [-1, 1]) {
      const gun = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), matte("cyan"));
      gun.position.set(side * 0.95, 0.7, 0);
      this.spreadGuns.add(gun);
    }
    this.cacheWall.add(
      this.voxels(
        ["11111111111", "10000000001", "10000000001", "10000000001", "10000000001", "11111111111"],
        "cyan",
        0.36,
      ),
    );
    this.cacheWall.position.z = -0.5;
    this.player.add(this.spreadGuns, this.cacheWall);
    scene.add(this.player);

    this.saucer.add(this.voxels(["000111000", "011111110", "111111111", "001000100"], "amber", 0.36));
    this.saucer.add(this.label("0-DAY", "amber", 1.8, 0, 1.2, 0.4));
    scene.add(this.saucer);

    this.bossHull = this.voxels(
      [
        "00000011111000000",
        "00011111111111000",
        "01111111111111110",
        "11111011011011111",
        "11111111111111111",
        "00111111111111100",
        "00110000000001100",
      ],
      "magenta",
      0.54,
    );
    this.boss.add(this.bossHull, this.label("DDoS", "magenta", 2.2, 0, 0.2, 0.6));
    this.bossHp = this.instances(NEON.magenta, 20, 0.32);
    for (let i = 0; i < 20; i++) this.set(this.bossHp, i, (i - 9.5) * 0.4, 2.3, 0);
    this.boss.add(this.bossHp);
    scene.add(this.boss);

    this.powerChips = {
      spread: this.chip(POWER_LABEL.spread, "lime"),
      cache: this.chip(POWER_LABEL.cache, "lime"),
      slow: this.chip(POWER_LABEL.slow, "lime"),
    };
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const tag = this.tagMaterial(this.powerChips.spread);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.64), tag);
      face.position.z = 0.46;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.9), matte("lime")), face);
      scene.add(g);
      this.powers.push({ g, tag });
    }
    this.stage.onResize((w, h) => this.fit(w, h));
    if (document.fonts?.load) {
      Promise.all([document.fonts.load(`800 30px ${DISPLAY}`), document.fonts.ready])
        .then(() => {
          if (this.disposed) return;
          for (const c of this.chips) c.draw();
          this.stage.render();
        })
        .catch(() => {});
    }
  }

  private instances(color: string, count: number, size: number) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({ color, flatShading: true }),
      count,
    );
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }
  private set(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, scale = 1) {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(i, this.dummy.matrix);
  }
  private voxels(rows: string[], role: NeonRole, size: number) {
    const points = pixels(rows, size);
    const mesh = this.instances(NEON[role], points.length, size * 0.98);
    points.forEach((p, i) => {
      this.set(mesh, i, p.x, p.y, 0);
    });
    return mesh;
  }
  private chip(text: string, role: NeonRole) {
    const c = new Chip(text, role);
    this.chips.push(c);
    return c;
  }
  private tagMaterial(c: Chip) {
    return new THREE.MeshBasicMaterial({ map: c.tex, toneMapped: false });
  }
  private label(text: string, role: NeonRole, w: number, x: number, y: number, z: number) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), this.tagMaterial(this.chip(text, role)));
    mesh.position.set(x, y, z);
    return mesh;
  }
  private fit(w: number, h: number) {
    const g = Math.min(0.3, this.gutterPx / h);
    const vh = Math.max(32.8 / (1 - g), 43.5 / (w / h));
    this.center = (-g * vh) / 2;
    this.dist = vh / 2 / Math.tan(THREE.MathUtils.degToRad(19));
    this.place();
  }
  private place() {
    const sh = this.reducedMotion ? 0 : this.shake;
    this.stage.camera.position.set(
      (Math.random() - 0.5) * sh,
      this.center + 1.5 + (Math.random() - 0.5) * sh,
      this.dist,
    );
    this.stage.camera.lookAt(0, this.center, 0);
  }
  project(x: number, y: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, 0).project(this.stage.camera);
    return { x: ((v.x + 1) / 2) * this.stage.size.w, y: ((1 - v.y) / 2) * this.stage.size.h };
  }
  burst(x: number, y: number, role: NeonRole, n = 18, speed = 9) {
    if (this.reducedMotion) return;
    const c = new THREE.Color(NEON[role]);
    for (let i = 0; i < n; i++) {
      if (this.parts.length >= MAX_PARTS) this.parts.shift();
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.3;
      this.parts.push({
        x,
        y,
        z: 0,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        vz: (Math.random() - 0.5) * v,
        life,
        max: life,
        c,
      });
    }
  }
  kindRole(k: Kind): NeonRole {
    return KIND_ROLE[k];
  }
  pulse(_amount: number, shake = 0) {
    if (!this.reducedMotion) this.shake = Math.max(this.shake, shake * 0.35);
  }
  shockwave(x: number, y: number) {
    this.burst(x, y, "grid", 8, 5);
  }
  coreHit() {
    this.flicker = 0.25;
  }
  bossHit() {
    this.bossFlash = 0.1;
  }

  draw(s: State, dt: number, t: number) {
    this.shake = Math.max(0, this.shake - dt * 3);
    this.place();
    const counts = [0, 0, 0, 0];
    const tags = [0, 0, 0, 0];
    const frame = this.reducedMotion ? 0 : Math.floor(s.time * (s.slow > 0 ? 2 : 4)) % 2;
    for (const e of s.enemies) {
      const k = e.kind;
      if (!e.alive || tags[k] >= MAX_EN) continue;
      const scale = e.dive ? 0.85 : 1;
      for (const p of FRAMES[k][frame])
        this.set(this.bodies[k], counts[k]++, e.x + p.x * scale, e.y + p.y * scale, 0, scale);
      this.set(this.tags[k], tags[k]++, e.x, e.y + 1.04, 0.3);
    }
    for (let k = 0; k < 4; k++) {
      this.bodies[k].count = counts[k];
      this.tags[k].count = tags[k];
      this.bodies[k].instanceMatrix.needsUpdate = this.tags[k].instanceMatrix.needsUpdate = true;
    }

    let cells = 0;
    for (const c of s.shields) {
      for (let layer = 0; layer < c.hp; layer++) this.set(this.cells, cells++, c.x, c.y, -(layer + 2 - c.hp) * 0.58);
    }
    this.cells.count = cells;
    this.cells.instanceMatrix.needsUpdate = true;
    this.packets.count = Math.min(s.packets.length, 24);
    s.packets.slice(0, this.packets.count).forEach((p, i) => {
      this.set(this.packets, i, p.x, p.y, 0);
    });
    this.packets.instanceMatrix.needsUpdate = true;
    this.shots.count = Math.min(s.shots.length, 12);
    s.shots.slice(0, this.shots.count).forEach((p, i) => {
      this.set(this.shots, i, p.x, p.y, 0);
    });
    this.shots.instanceMatrix.needsUpdate = true;

    this.player.position.set(s.px, PLAYER_Y, 0);
    this.player.visible = this.reducedMotion || s.over || s.invuln <= 0 || Math.floor(t * 10) % 2 === 0;
    this.spreadGuns.visible = s.spread > 0;
    this.cacheWall.visible = s.cache;
    this.flicker = Math.max(0, this.flicker - dt);
    (this.core.material as THREE.MeshLambertMaterial).color.set(NEON[this.flicker > 0 ? "red" : "floor"]);
    this.saucer.visible = !!s.saucer;
    if (s.saucer) this.saucer.position.set(s.saucer.x, SAUCER_Y, 0);
    this.bossFlash = Math.max(0, this.bossFlash - dt);
    this.boss.visible = !!s.boss;
    if (s.boss) {
      this.boss.position.set(s.boss.x, s.boss.y, 0);
      (this.bossHull.material as THREE.MeshLambertMaterial).color.set(NEON[this.bossFlash > 0 ? "ink" : "magenta"]);
      this.bossHp.count = Math.ceil((20 * s.boss.hp) / s.boss.max);
    }
    this.powers.forEach((p, i) => {
      const pw = s.powers[i];
      p.g.visible = !!pw;
      if (!pw) return;
      p.g.position.set(pw.x, pw.y, 0);
      if (p.tag.map !== this.powerChips[pw.kind].tex) {
        p.tag.map = this.powerChips[pw.kind].tex;
        p.tag.needsUpdate = true;
      }
    });

    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.parts.splice(i, 1);
        continue;
      }
      p.vy -= 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      this.set(this.partMesh, n, p.x, p.y, p.z, p.life / p.max);
      this.partMesh.setColorAt(n++, p.c);
    }
    this.partMesh.count = n;
    this.partMesh.instanceMatrix.needsUpdate = true;
    if (this.partMesh.instanceColor) this.partMesh.instanceColor.needsUpdate = true;
  }
  dispose() {
    this.disposed = true;
    for (const c of this.chips) c.tex.dispose();
    this.stage.scene.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.stage.dispose();
  }
}
