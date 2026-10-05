import * as THREE from "three";
import { ARCADE_FONT, NEON } from "../core/neon";
import { addLights, type Stage } from "../core/stage";
import type { Difficulty } from "../core/types";
import type { Cell, PowerKind } from "./state";

export interface Frame {
  body: Cell[];
  yaw: number;
  showSnake: boolean;
  food: Cell | null;
  bonus: (Cell & { life: number }) | null;
  power: (Cell & { kind: PowerKind; life: number }) | null;
  walls: Cell[];
  bug: (Cell & { yaw: number }) | null;
  focus: Cell;
  slow: boolean;
}

type Role = "cyan" | "lime" | "amber" | "red";
const color = (role: Role) => new THREE.Color(NEON[role]);
// Stone is a muted shade mixed from the same four-role palette, not another accent.
const stone = color("cyan").lerp(color("red"), 0.5).multiplyScalar(0.22);
export const STONE = stone.getStyle();
const MAX_SEG = 400;
const MAX_PARTICLES = 180;
const PITCH = THREE.MathUtils.degToRad(58);

/** Small, deterministic pixel faces. No assets, gradients or luminous borders. */
function pixelTexture(kind: "grass" | "stone" | "brick"): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const base = kind === "grass" ? color("lime").multiplyScalar(0.42) : kind === "brick" ? color("red") : stone;
  ctx.fillStyle = base.getStyle();
  ctx.fillRect(0, 0, 16, 16);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const value = (x * 13 + y * 7 + x * y) % 11;
      if (value < 4) {
        ctx.fillStyle = base
          .clone()
          .multiplyScalar(value < 2 ? 0.75 : 1.2)
          .getStyle();
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  if (kind === "brick") {
    ctx.fillStyle = stone.getStyle();
    for (let y = 0; y < 16; y += 4) {
      ctx.fillRect(0, y, 16, 1);
      for (let x = y % 8 === 0 ? 0 : 4; x < 16; x += 8) ctx.fillRect(x, y, 1, 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  size: number;
  color: THREE.Color;
}

export class SnakeView {
  readonly hud: HTMLDivElement;
  private cols = 20;
  private rows = 15;
  private reserve = 0;
  private dist = 20;
  private time = 0;
  private shakeAmp = 0;
  private board = new THREE.Group();
  private cube = new THREE.BoxGeometry(1, 1, 1);
  private dummy = new THREE.Object3D();
  private textures = [pixelTexture("grass"), pixelTexture("stone"), pixelTexture("brick")];
  private materials: THREE.MeshLambertMaterial[] = [];
  private boardSide: THREE.MeshLambertMaterial;
  private boardTop: THREE.MeshLambertMaterial;
  private borderMaterial: THREE.MeshLambertMaterial;
  private segs: THREE.InstancedMesh;
  private head = new THREE.Group();
  private food = new THREE.Group();
  private bonus = new THREE.Group();
  private power = new THREE.Group();
  private timerBlocks: THREE.Mesh[] = [];
  private walls: THREE.InstancedMesh;
  private bug = new THREE.Group();
  private legs: THREE.Mesh[] = [];
  private parts: THREE.InstancedMesh;
  private particles: Particle[] = [];
  private label: HTMLDivElement;
  private flashEl: HTMLDivElement;
  private animations = new Set<Animation>();

  constructor(
    private stage: Stage,
    private reduced: boolean,
  ) {
    addLights(stage.scene);
    stage.renderer.setClearColor(stone.clone().multiplyScalar(0.5), 1);
    stage.scene.add(this.board);
    const cyan = this.material(color("cyan"));
    const dark = this.material(stone);
    const lime = this.material(color("lime"));
    const amber = this.material(color("amber"));
    const red = this.material(color("red"));
    this.boardSide = this.material(undefined, this.textures[1]);
    this.boardTop = this.material(undefined, this.textures[0]);
    this.borderMaterial = cyan;
    this.segs = new THREE.InstancedMesh(this.cube, cyan, MAX_SEG);
    this.segs.count = 0;
    this.segs.frustumCulled = false;
    this.block(this.head, cyan, [0.9, 0.9, 0.9]);
    // Two square eyes on the forward top edge, readable from the overhead camera.
    for (const z of [-0.22, 0.22]) {
      this.block(this.head, dark, [0.16, 0.025, 0.16], [0.26, 0.46, z]);
    }
    this.block(this.food, lime, [0.48, 0.48, 0.48]);
    this.block(this.bonus, amber, [0.64, 0.64, 0.64]);
    for (let i = 0; i < 12; i++) {
      const side = Math.floor(i / 3);
      const along = ((i % 3) - 1) * 0.3;
      const x = side === 0 || side === 2 ? along : side === 1 ? 0.48 : -0.48;
      const z = side === 1 || side === 3 ? along : side === 0 ? -0.48 : 0.48;
      this.timerBlocks.push(this.block(this.bonus, amber, [0.2, 0.1, 0.2], [x, -0.29, z]));
    }
    this.block(this.power, cyan, [0.56, 0.56, 0.56]);
    // Raised crate straps distinguish power-ups from the snake without an extra hue.
    this.block(this.power, dark, [0.59, 0.12, 0.59]);
    this.block(this.power, dark, [0.12, 0.59, 0.59]);
    this.walls = new THREE.InstancedMesh(this.cube, this.material(undefined, this.textures[2]), 64);
    this.walls.count = 0;
    this.walls.frustumCulled = false;
    this.block(this.bug, red, [0.55, 0.36, 0.54], [-0.08, 0.3, 0]);
    this.block(this.bug, red, [0.28, 0.26, 0.34], [0.33, 0.27, 0]);
    this.block(this.bug, dark, [0.045, 0.025, 0.54], [-0.08, 0.49, 0]);
    for (const side of [-1, 1]) {
      this.block(this.bug, dark, [0.09, 0.09, 0.09], [0.48, 0.35, side * 0.11]);
      this.block(this.bug, red, [0.08, 0.22, 0.08], [0.38, 0.48, side * 0.14]);
      for (const x of [-0.24, -0.02, 0.2]) {
        this.legs.push(this.block(this.bug, red, [0.1, 0.12, 0.24], [x, 0.12, side * 0.35]));
        this.block(this.bug, dark, [0.1, 0.14, 0.1], [x, 0.07, side * 0.45]);
      }
    }
    this.parts = new THREE.InstancedMesh(this.cube, this.material(), MAX_PARTICLES);
    this.parts.count = 0;
    this.parts.frustumCulled = false;
    stage.scene.add(this.segs, this.head, this.food, this.bonus, this.power, this.walls, this.bug, this.parts);
    this.hud = document.createElement("div");
    this.hud.style.cssText = `position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:${ARCADE_FONT}`;
    this.label = document.createElement("div");
    this.label.style.cssText = `position:absolute;transform:translate(-50%,-100%);font-size:12px;font-weight:800;color:${NEON.cyan};background:${STONE};padding:2px 4px;white-space:nowrap`;
    this.flashEl = document.createElement("div");
    this.flashEl.style.cssText = `position:absolute;inset:0;border:4px solid ${NEON.red};opacity:0`;
    this.hud.append(this.flashEl, this.label);
    stage.canvas.parentElement?.appendChild(this.hud);
  }

  private material(tint?: THREE.Color, map?: THREE.Texture): THREE.MeshLambertMaterial {
    const material = new THREE.MeshLambertMaterial({
      flatShading: true,
      ...(tint ? { color: tint } : {}),
      ...(map ? { map } : {}),
    });
    this.materials.push(material);
    return material;
  }

  private block(group: THREE.Group, material: THREE.Material, size: number[], at = [0, 0, 0]): THREE.Mesh {
    const mesh = new THREE.Mesh(this.cube, material);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.position.set(at[0], at[1], at[2]);
    group.add(mesh);
    return mesh;
  }

  world(cell: Cell, height = 0): THREE.Vector3 {
    return new THREE.Vector3(cell.x - (this.cols - 1) / 2, height, cell.y - (this.rows - 1) / 2);
  }

  setBoard(cols: number, rows: number, diff: Difficulty): void {
    this.cols = cols;
    this.rows = rows;
    for (const child of [...this.board.children]) {
      this.board.remove(child);
      if (child instanceof THREE.InstancedMesh) child.dispose();
    }
    const side = this.boardSide;
    const top = this.boardTop;
    const tiles = new THREE.InstancedMesh(this.cube, [side, side, top, side, side, side], cols * rows);
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++) {
        this.dummy.position.copy(this.world({ x, y }, -0.22));
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.set(0.97, 0.44, 0.97);
        this.dummy.updateMatrix();
        tiles.setMatrixAt(y * cols + x, this.dummy.matrix);
      }
    this.board.add(tiles);
    // Open cyan boundary posts on easy; solid stone blocks mark lethal edges.
    const border = new THREE.InstancedMesh(this.cube, diff === "easy" ? this.borderMaterial : side, 2 * (cols + rows));
    let index = 0;
    for (const horizontal of [true, false])
      for (const sign of [-1, 1]) {
        const length = horizontal ? cols : rows;
        for (let i = 0; i < length; i++) {
          const along = i - (length - 1) / 2;
          const offset = sign * ((horizontal ? rows : cols) / 2 + 0.2);
          this.dummy.position.set(horizontal ? along : offset, 0.12, horizontal ? offset : along);
          this.dummy.scale.set(
            horizontal ? (diff === "easy" ? 0.35 : 0.97) : 0.32,
            0.24,
            horizontal ? 0.32 : diff === "easy" ? 0.35 : 0.97,
          );
          this.dummy.updateMatrix();
          border.setMatrixAt(index++, this.dummy.matrix);
        }
      }
    this.board.add(border);
    this.particles = [];
    this.parts.count = 0;
    this.fit();
  }

  setReserve(px: number): void {
    this.reserve = px;
    this.fit();
  }

  fit(): void {
    const cam = this.stage.camera as THREE.PerspectiveCamera;
    const { w, h } = this.stage.size;
    const available = Math.max(1, h - this.reserve);
    cam.clearViewOffset();
    cam.aspect = w / available;
    cam.updateProjectionMatrix();
    const corners = [-1, 1].flatMap((x) =>
      [-1, 1].map((z) => new THREE.Vector3(x * (this.cols / 2 + 0.6), 0.9, z * (this.rows / 2 + 0.6))),
    );
    let distance = 8;
    for (let i = 0; i < 300; i++, distance *= 1.015) {
      this.place(distance);
      cam.updateMatrixWorld();
      if (
        corners.every((c) => {
          const p = c.clone().project(cam);
          return Math.abs(p.x) < 0.91 && Math.abs(p.y) < 0.88 && Math.abs(p.z) < 1;
        })
      )
        break;
    }
    this.dist = distance;
    cam.setViewOffset(w, available, 0, 0, w, h);
    cam.updateProjectionMatrix();
  }

  private place(distance: number): void {
    this.stage.camera.position.set(0, Math.sin(PITCH) * distance, Math.cos(PITCH) * distance);
    this.stage.camera.lookAt(0, 0, 0);
  }

  burst(cell: Cell, role: Role, count: number, force = 1): void {
    if (this.reduced) return;
    for (let i = 0; i < Math.min(count, 18); i++) {
      if (this.particles.length >= MAX_PARTICLES) this.particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = (1 + Math.random() * 2) * force;
      this.particles.push({
        position: this.world(cell, 0.4),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 2 + Math.random() * 2, Math.sin(angle) * speed),
        life: 0.4 + Math.random() * 0.25,
        size: 0.1 + Math.random() * 0.08,
        color: color(role),
      });
    }
  }

  shatter(body: Cell[]): void {
    for (const cell of body) this.burst(cell, "cyan", 3, 0.7);
  }
  shake(amount: number): void {
    if (!this.reduced) this.shakeAmp = Math.max(this.shakeAmp, Math.min(0.2, amount));
  }

  private animate(el: HTMLElement, frames: Keyframe[], duration: number, remove = false): void {
    const animation = el.animate(frames, { duration, easing: "steps(4,end)" });
    this.animations.add(animation);
    animation.onfinish = () => {
      this.animations.delete(animation);
      if (remove) el.remove();
    };
  }

  flash(): void {
    if (!this.reduced) this.animate(this.flashEl, [{ opacity: 0.6 }, { opacity: 0 }], 240);
  }

  popup(text: string, cell: Cell, role: Role, big = false): void {
    const screen = this.toScreen(this.world(cell, 1));
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `position:absolute;left:${screen.x}px;top:${screen.y}px;transform:translate(-50%,-50%);font-weight:800;font-size:${big ? 24 : 18}px;color:${NEON[role]};background:${STONE};padding:2px 4px`;
    this.hud.appendChild(el);
    this.animate(
      el,
      [{ opacity: 1 }, { opacity: 0, transform: `translate(-50%,calc(-50% - ${this.reduced ? 0 : 24}px))` }],
      800,
      true,
    );
  }

  banner(text: string, role: Role): void {
    const el = document.createElement("div");
    el.textContent = text;
    el.style.cssText = `position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);font-weight:800;font-size:clamp(56px,14vw,120px);line-height:1;color:${NEON[role]};background:${STONE};padding:4px 12px`;
    this.hud.appendChild(el);
    this.animate(el, [{ opacity: 1 }, { opacity: 0 }], 520, true);
  }

  clearHud(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations.clear();
    for (const el of [...this.hud.children]) if (el !== this.label && el !== this.flashEl) el.remove();
    this.label.textContent = "";
    this.particles = [];
    this.parts.count = 0;
    this.shakeAmp = 0;
  }

  private toScreen(position: THREE.Vector3): { x: number; y: number } {
    const p = position.project(this.stage.camera);
    return { x: ((p.x + 1) * this.stage.size.w) / 2, y: ((1 - p.y) * this.stage.size.h) / 2 };
  }

  draw(frame: Frame, dt: number): void {
    this.time += dt;
    this.place(this.dist);
    if (this.shakeAmp > 0.001) {
      this.stage.camera.position.x += (Math.random() - 0.5) * this.shakeAmp;
      this.shakeAmp *= Math.exp(-dt * 12);
    }
    this.stage.camera.updateMatrixWorld();
    const d = this.dummy;
    const count = frame.showSnake ? Math.min(MAX_SEG, frame.body.length) : 0;
    for (let i = 1; i < count; i++) {
      d.position.copy(this.world(frame.body[i], 0.39));
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(0.78);
      d.updateMatrix();
      this.segs.setMatrixAt(i - 1, d.matrix);
    }
    this.segs.count = Math.max(0, count - 1);
    this.segs.instanceMatrix.needsUpdate = true;
    this.head.visible = count > 0;
    if (count) {
      this.head.position.copy(this.world(frame.body[0], 0.45));
      this.head.rotation.y = -frame.yaw;
    }
    const pickup = (group: THREE.Group, cell: Cell | null, phase: number) => {
      group.visible = !!cell;
      if (cell)
        group.position.copy(
          this.world(cell, 0.42 + (this.reduced ? 0 : [0, 0.06, 0.12, 0.06][Math.floor(this.time * 4 + phase) % 4])),
        );
    };
    pickup(this.food, frame.food, 0);
    pickup(this.bonus, frame.bonus, 1);
    pickup(this.power, frame.power, 2);
    this.timerBlocks.forEach((block, i) => {
      block.visible = !!frame.bonus && i < Math.ceil(frame.bonus.life * 12);
    });
    if (frame.power) {
      const p = this.toScreen(this.world(frame.power, 1));
      this.label.textContent = frame.power.kind === "cache" ? "CACHE" : "ZIP";
      this.label.style.left = `${p.x}px`;
      this.label.style.top = `${p.y}px`;
    } else this.label.textContent = "";
    frame.walls.slice(0, 64).forEach((cell, i) => {
      d.position.copy(this.world(cell, 0.45));
      d.rotation.set(0, 0, 0);
      d.scale.set(0.92, 0.9, 0.92);
      d.updateMatrix();
      this.walls.setMatrixAt(i, d.matrix);
    });
    this.walls.count = Math.min(64, frame.walls.length);
    this.walls.instanceMatrix.needsUpdate = true;
    this.bug.visible = !!frame.bug;
    if (frame.bug) {
      this.bug.position.copy(this.world(frame.bug));
      this.bug.rotation.y = -frame.bug.yaw;
      this.legs.forEach((leg, i) => {
        leg.position.y = 0.12 + (this.reduced ? 0 : ((Math.floor(this.time * 8) + i) % 2) * 0.04);
      });
    }
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      return p.life > 0;
    });
    this.particles.forEach((p, i) => {
      p.velocity.y -= dt * 12;
      p.position.addScaledVector(p.velocity, dt);
      p.position.y = Math.max(p.size / 2, p.position.y);
      d.position.copy(p.position);
      d.rotation.set(0, 0, 0);
      d.scale.setScalar(p.size * Math.min(1, p.life * 5));
      d.updateMatrix();
      this.parts.setMatrixAt(i, d.matrix);
      this.parts.setColorAt(i, p.color);
    });
    this.parts.count = this.particles.length;
    this.parts.instanceMatrix.needsUpdate = true;
    if (this.parts.instanceColor) this.parts.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.clearHud();
    this.stage.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
    });
    for (const texture of this.textures) texture.dispose();
    for (const material of this.materials) material.dispose();
    this.hud.remove();
  }
}
