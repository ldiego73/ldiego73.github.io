/**
 * The night carnivores' renderer, shared by puma.ts and fox.ts: the shared animals (characters/animals) as one
 * herd per species (one skinned InstancedMesh per LOD, built off the main thread), driven by the ambients' own
 * sims through the animal state (speed, sit / sleep, head turn), plus the eyeshine: two additive glints per
 * animal (one Points draw for the pool) that light up at night when the head faces the camera.
 * Every animal owns a creatures Body, solid only while it is drawn.
 */
import * as THREE from "three";
import { createHerd, type Herd } from "../../characters/animals/crowd";
import type { WorldEnv } from "../../contract";
import { type Body, creatures, park } from "../../creatures";
import { noPaint } from "../../style-gl";

/** Everything that changes per frame for one animal (the owner's sim writes it, `draw` reads it). */
export interface QuadState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Ground slope under the body (pitch, positive = nose down): steadies the gait on slopes. */
  slope: number;
  /** Ground speed (units/s): the species' gait follows it. */
  speed: number;
  /** Sitting (a lookout), lying curled (asleep), or standing / moving. */
  mode: "auto" | "sit" | "sleep";
  headYaw: number;
  /** 0..1 eyeshine. */
  glint: number;
  /** 0..1 extra glint size so a far glint still reads (keep 0 up close). */
  eyeBoost: number;
  /** Collision body (set by the owner from QuadSet.bodies): walkToward steers it around others. */
  body?: Body;
}

export function makeQuadState(): QuadState {
  return { x: 0, y: -999, z: 0, yaw: 0, slope: 0, speed: 0, mode: "auto", headYaw: 0, glint: 0, eyeBoost: 0 };
}

const glintTex = (() => {
  let t: THREE.CanvasTexture | null = null;
  return () => {
    if (t) return t;
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.35, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 32, 32);
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

export interface QuadSetOptions {
  shadow: boolean;
  /** Eyeshine colour. */
  eyeGlow: THREE.ColorRepresentation;
  /** Eyes in the animal's frame when standing: height and distance ahead of its feet, half the eye gap. */
  eyes: { y: number; z: number; gap: number };
  /** Collision body: creatures kind, radius, give (see creatures.ts) and the ground it may be pushed onto. */
  body: { kind: string; r: number; give: number; ok?: (x: number, z: number) => boolean };
}

export class QuadSet {
  readonly group = new THREE.Group();
  readonly herd: Herd;
  /** World position and forward of each animal's head (facing tests), updated by draw(). */
  readonly headPos: THREE.Vector3[];
  readonly headFwd: THREE.Vector3[];
  /** One collision body per animal (solid only while drawn). */
  readonly bodies: Body[];
  private readonly ids: number[];
  private readonly okGround?: (x: number, z: number) => boolean;
  private readonly glints: THREE.Points;
  private readonly gPos: Float32Array;
  private readonly gCol: Float32Array;
  private readonly glow = new THREE.Color();
  private readonly eyes: QuadSetOptions["eyes"];

  constructor(
    env: WorldEnv,
    key: "puma" | "fox",
    readonly count: number,
    name: string,
    opts: QuadSetOptions,
  ) {
    this.bodies = Array.from({ length: count }, () => {
      const b = creatures.add(opts.body.kind, opts.body.r, { solid: false, give: opts.body.give });
      park(b);
      return b;
    });
    this.okGround = opts.body.ok;
    this.eyes = opts.eyes;
    this.group.name = name;
    this.herd = createHerd(key, { max: count, shadows: opts.shadow });
    // Animals move: no world-space painted blotches sliding over them (style-gl.ts).
    this.herd.group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) noPaint(o as THREE.Mesh);
    });
    this.group.add(this.herd.group);
    this.ids = Array.from({ length: count }, (_, i) => this.herd.add({ seed: 17 + i * 13 }));
    this.headPos = Array.from({ length: count }, () => new THREE.Vector3());
    this.headFwd = Array.from({ length: count }, () => new THREE.Vector3());
    // Eyeshine: two soft additive points per animal (unlit, no ink), dark until the night lights them.
    this.glow.set(opts.eyeGlow);
    this.gPos = new Float32Array(count * 6);
    this.gCol = new Float32Array(count * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.gPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute("color", new THREE.BufferAttribute(this.gCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.glints = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: glintTex(),
        size: 0.13,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.glints.name = `${name}-eyeshine`;
    this.glints.frustumCulled = false;
    env.noOutline(this.glints);
    this.group.add(this.glints);
    env.scene.add(this.group);
  }

  hide(i: number) {
    const b = this.bodies[i];
    if (b) park(b);
    this.herd.hide(this.ids[i] as number);
    this.gCol.fill(0, i * 6, i * 6 + 6);
  }

  draw(i: number, st: QuadState, rm: boolean) {
    // A solid body while on show: eased out of any overlap (a few cm per frame, never into water).
    const body = this.bodies[i];
    if (body) {
      body.solid = true;
      body.x = st.x;
      body.z = st.z;
      if (creatures.resolve(body, this.okGround, 0.08)) {
        st.x = body.x;
        st.z = body.z;
      }
    }
    this.herd.set(this.ids[i] as number, st.x, st.y, st.z, st.yaw, {
      speed: st.speed,
      mode: st.mode,
      look: st.headYaw,
      rm,
    });
    // Head and eyes (approximate: the standing head, a little lower when lying, turned by the look).
    const e = this.eyes;
    const low = st.mode === "sleep" ? 0.45 : st.mode === "sit" ? 1.05 : 1;
    const a = st.yaw + st.headYaw * 0.8;
    const fx = Math.sin(a);
    const fz = Math.cos(a);
    const hx = st.x + Math.sin(st.yaw) * e.z;
    const hz = st.z + Math.cos(st.yaw) * e.z;
    const hy = st.y + e.y * low;
    this.headPos[i]?.set(hx, hy, hz);
    this.headFwd[i]?.set(fx, -Math.sin(st.slope) * 0.3, fz).normalize();
    const k = st.mode === "sleep" ? 0 : st.glint * (1 + st.eyeBoost * 0.8);
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? 1 : -1;
      const o = i * 6 + s * 3;
      this.gPos[o] = hx + fx * 0.06 + fz * e.gap * side;
      this.gPos[o + 1] = hy;
      this.gPos[o + 2] = hz + fz * 0.06 - fx * e.gap * side;
      this.gCol[o] = this.glow.r * k;
      this.gCol[o + 1] = this.glow.g * k;
      this.gCol[o + 2] = this.glow.b * k;
    }
  }

  /** A one-shot idle on animal `i` (a fox sniffing the ground: "graze"). */
  play(i: number, a: Parameters<Herd["play"]>[1], seconds?: number) {
    this.herd.play(this.ids[i] as number, a, seconds);
  }

  /** Pose and upload (call once per frame after every draw / hide). */
  flush(dt: number, t: number, camera: THREE.Camera) {
    this.herd.update(dt, t, camera);
    const g = this.glints.geometry;
    (g.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("color") as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    for (const b of this.bodies) creatures.remove(b);
    scene.remove(this.group);
    this.herd.dispose();
    this.glints.geometry.dispose();
    (this.glints.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------- shared trail tracking / visibility

/** Where the traveler is along the trail and which way they're heading (sampled every 0.4 s). */
export class TrailTracker {
  t = 0;
  dir = 1;
  private last = -1;
  private clock = 1;
  constructor(private trail: WorldEnv["trail"]) {}
  update(dt: number, x: number, z: number) {
    this.clock += dt;
    if (this.clock < 0.4) return;
    this.clock = 0;
    this.t = this.trail.nearestT(x, z);
    if (this.last >= 0 && Math.abs(this.t - this.last) > 0.0004) this.dir = this.t > this.last ? 1 : -1;
    this.last = this.t;
  }
}

/** Camera frustum, refreshed once per frame; `sees(x, y, z, r)` tests a sphere. */
export class View {
  private frustum = new THREE.Frustum();
  private m = new THREE.Matrix4();
  private sphere = new THREE.Sphere();
  constructor(private camera: THREE.PerspectiveCamera) {}
  update() {
    this.camera.updateMatrixWorld();
    this.m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.m);
  }
  sees(x: number, y: number, z: number, r: number) {
    this.sphere.center.set(x, y, z);
    this.sphere.radius = r;
    return this.frustum.intersectsSphere(this.sphere);
  }
}

/** Seeded RNG (Park–Miller). */
export function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
