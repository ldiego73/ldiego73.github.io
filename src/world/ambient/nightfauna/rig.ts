/**
 * Instanced quadruped renderer shared by puma.ts and fox.ts. One InstancedMesh per part type (body,
 * head, upper legs, lower legs, tail segments, eyes): ~6 draw calls per species regardless of count.
 *
 * Material: a vertex-colored toon material (same 3-step ramp as env.toon) with a moonlit rim term and a
 * small night lift, so a tawny cat on a ledge still reads as a silhouette against the night sky. Eyes
 * are unlit and turn into a pale eyeshine glint at night when the head faces the camera.
 */
import * as THREE from "three";
import type { WorldEnv } from "../../contract";
import { gradientMap } from "../../toon";
import type { QuadParts, QuadRig } from "./models";
import { P, type Pose } from "./sim";

export interface RimMaterial {
  material: THREE.MeshToonMaterial;
  /** 0..1 rim strength (drive with the night amount). */
  rim: { value: number };
  dispose(): void;
}

/** Vertex-colored toon with a fresnel rim (cool moonlight) that fog still dims with distance. */
export function rimToon(rimColor: THREE.ColorRepresentation = "#9fb4ff"): RimMaterial {
  const material = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: gradientMap() });
  const rim = { value: 0 };
  const color = { value: new THREE.Color(rimColor) };
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = rim;
    sh.uniforms.uRimColor = color;
    sh.fragmentShader = `uniform float uRim;\nuniform vec3 uRimColor;\n${sh.fragmentShader}`.replace(
      "#include <opaque_fragment>",
      `#include <opaque_fragment>
      {
        float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        float up = 0.55 + 0.45 * clamp(normal.y * 0.5 + 0.5, 0.0, 1.0);
        gl_FragColor.rgb += uRimColor * uRim * (pow(fr, 2.5) * 0.75 * up + 0.035) * (0.3 + diffuseColor.rgb);
      }`,
    );
  };
  material.customProgramCacheKey = () => "nightfauna-rim";
  return { material, rim, dispose: () => material.dispose() };
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _l = new THREE.Matrix4();
const _root = new THREE.Matrix4();
const _body = new THREE.Matrix4();
const _head = new THREE.Matrix4();
const _up = new THREE.Matrix4();
const _low = new THREE.Matrix4();
const _tail = new THREE.Matrix4();
const _draw = new THREE.Matrix4();
const _sc = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _white = new THREE.Color("#ffffff");

/** out = parent × T(p) × R(pitch, yaw, roll) (YXZ). */
function child(
  out: THREE.Matrix4,
  parent: THREE.Matrix4,
  px: number,
  py: number,
  pz: number,
  pitch: number,
  yaw = 0,
  roll = 0,
) {
  _l.makeRotationFromEuler(_e.set(pitch, yaw, roll, "YXZ"));
  _l.setPosition(px, py, pz);
  return out.multiplyMatrices(parent, _l);
}

/** Everything that changes per frame for one animal. */
export interface QuadState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Ground slope under the body (pitch, positive = nose down). */
  slope: number;
  pose: Pose;
  headYaw: number;
  tailYaw: number;
  /** Breathing / idle scale wobble (0 = none). */
  breathe: number;
  /** 0..1 eyeshine. */
  glint: number;
  /** 0..1 extra eye size so a far glint still reads (keep 0 up close). */
  eyeBoost: number;
}

export function makeQuadState(pose: Pose): QuadState {
  return { x: 0, y: -999, z: 0, yaw: 0, slope: 0, pose, headYaw: 0, tailYaw: 0, breathe: 0, glint: 0, eyeBoost: 0 };
}

export class QuadSet {
  readonly group = new THREE.Group();
  readonly body: THREE.InstancedMesh;
  readonly head: THREE.InstancedMesh;
  readonly upper: THREE.InstancedMesh;
  readonly lower: THREE.InstancedMesh;
  readonly tail: THREE.InstancedMesh;
  readonly eyes: THREE.InstancedMesh;
  readonly rig: QuadRig;
  private readonly meshes: THREE.InstancedMesh[];
  private readonly nTail: number;
  private readonly eyeMat: THREE.MeshBasicMaterial;
  private readonly eyeDark = new THREE.Color();
  private readonly eyeGlow = new THREE.Color();
  private readonly eyeTmp = new THREE.Color();
  /** World position of each animal's head (for facing tests), updated by draw(). */
  readonly headPos: THREE.Vector3[];
  readonly headFwd: THREE.Vector3[];

  constructor(
    env: WorldEnv,
    readonly parts: QuadParts,
    readonly count: number,
    name: string,
    material: THREE.Material,
    readonly scale: number,
    opts: { tailTip: THREE.ColorRepresentation; tipFrom: number; eyeDark: string; eyeGlow: string; shadow: boolean },
  ) {
    this.rig = parts.rig;
    this.nTail = parts.rig.tailTaper.length;
    this.group.name = name;
    const mk = (geo: THREE.BufferGeometry, n: number, part: string, mat: THREE.Material = material) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.name = `${name}-${part}`;
      m.frustumCulled = false;
      m.castShadow = opts.shadow && part !== "eyes";
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < n; i++) {
        m.setMatrixAt(i, ZERO);
        // Every part carries instance colors (white unless tinted) so they all share one program variant.
        m.setColorAt(i, _white);
      }
      this.group.add(m);
      return m;
    };
    this.body = mk(parts.body, count, "body");
    this.head = mk(parts.head, count, "head");
    this.upper = mk(parts.upper, count * 4, "upper");
    this.lower = mk(parts.lower, count * 4, "lower");
    this.tail = mk(parts.tail, count * this.nTail, "tail");
    for (let i = 0; i < count; i++)
      for (let s = 0; s < this.nTail; s++) {
        // Dark tip: blend toward the tip color over the last segments.
        const k = s >= opts.tipFrom ? Math.min(1, (s - opts.tipFrom + 1) / (this.nTail - opts.tipFrom)) : 0;
        this.eyeTmp.copy(_white).lerp(new THREE.Color(opts.tailTip), k);
        this.tail.setColorAt(i * this.nTail + s, this.eyeTmp);
      }
    if (this.tail.instanceColor) this.tail.instanceColor.needsUpdate = true;
    this.eyeMat = new THREE.MeshBasicMaterial({ color: "#ffffff" });
    this.eyeDark.set(opts.eyeDark);
    this.eyeGlow.set(opts.eyeGlow);
    this.eyes = mk(parts.eye, count * 2, "eyes", this.eyeMat);
    for (let i = 0; i < count * 2; i++) this.eyes.setColorAt(i, this.eyeDark);
    env.noOutline(this.eyes);
    this.meshes = [this.body, this.head, this.upper, this.lower, this.tail, this.eyes];
    this.headPos = Array.from({ length: count }, () => new THREE.Vector3());
    this.headFwd = Array.from({ length: count }, () => new THREE.Vector3());
    env.scene.add(this.group);
  }

  hide(i: number) {
    this.body.setMatrixAt(i, ZERO);
    this.head.setMatrixAt(i, ZERO);
    for (let k = 0; k < 4; k++) {
      this.upper.setMatrixAt(i * 4 + k, ZERO);
      this.lower.setMatrixAt(i * 4 + k, ZERO);
    }
    for (let s = 0; s < this.nTail; s++) this.tail.setMatrixAt(i * this.nTail + s, ZERO);
    this.eyes.setMatrixAt(i * 2, ZERO);
    this.eyes.setMatrixAt(i * 2 + 1, ZERO);
  }

  draw(i: number, st: QuadState) {
    const r = this.rig;
    const p = st.pose;
    const S = this.scale;
    _q.setFromEuler(_e.set(st.slope, st.yaw, 0, "YXZ"));
    _root.compose(_v.set(st.x, st.y, st.z), _q, _s.set(S, S, S));
    child(_body, _root, 0, r.bodyY - p[P.drop]!, 0, p[P.pitch]!);
    const b = 1 + st.breathe;
    _draw.copy(_body).multiply(_sc.makeScale(1 + (b - 1) * 0.6, b, 1));
    this.body.setMatrixAt(i, _draw);

    // Head: lifted on the neck, yaw (look) then pitch.
    child(_head, _body, r.neck.x, r.neck.y + p[P.headLift]!, r.neck.z, p[P.headPitch]!, st.headYaw);
    this.head.setMatrixAt(i, _head);
    this.headPos[i]!.setFromMatrixPosition(_head);
    this.headFwd[i]!.set(_head.elements[8], _head.elements[9], _head.elements[10]).normalize();

    // Legs: FL, FR, HL, HR.
    for (let k = 0; k < 4; k++) {
      const hind = k >= 2;
      const side = k % 2 === 0 ? 1 : -1;
      const j = hind ? r.hip : r.shoulder;
      const lu = hind ? r.upperH : r.upperF;
      const ll = hind ? r.lowerH : r.lowerF;
      child(_up, _body, side * j.x, j.y, j.z, p[P.legs + k * 2]!);
      _draw.copy(_up).multiply(_sc.makeScale(hind ? 1.12 : 1, lu / r.upperGeo, hind ? 1.12 : 1));
      this.upper.setMatrixAt(i * 4 + k, _draw);
      child(_low, _up, 0, -lu, 0, p[P.legs + k * 2 + 1]!);
      _draw.copy(_low).multiply(_sc.makeScale(1, ll / r.lowerGeo, 1));
      this.lower.setMatrixAt(i * 4 + k, _draw);
    }

    // Tail: a chain hanging from the rump; each joint adds curl, the sway fades toward the tip.
    child(_tail, _body, r.tailBase.x, r.tailBase.y, r.tailBase.z, p[P.tailPitch]!, st.tailYaw);
    for (let s = 0; s < this.nTail; s++) {
      const t = r.tailTaper[s]!;
      _draw.copy(_tail).multiply(_sc.makeScale(t, t, 1));
      this.tail.setMatrixAt(i * this.nTail + s, _draw);
      child(_tail, _tail, 0, 0, -r.tailSeg, p[P.tailCurl]! * (0.6 + s * 0.15), st.tailYaw * 0.35);
    }

    // Eyes: a touch larger when shining so the glint survives distance.
    const er = r.eyeR * (1 + st.eyeBoost * 1.2);
    this.eyeTmp.copy(this.eyeDark).lerp(this.eyeGlow, st.glint);
    for (let e = 0; e < 2; e++) {
      _p.set((e === 0 ? 1 : -1) * r.eye.x, r.eye.y, r.eye.z);
      _draw
        .copy(_head)
        .multiply(_l.makeTranslation(_p.x, _p.y, _p.z))
        .multiply(_sc.makeScale(er, er, er * 0.7));
      this.eyes.setMatrixAt(i * 2 + e, _draw);
      this.eyes.setColorAt(i * 2 + e, this.eyeTmp);
    }
  }

  flush() {
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
    if (this.eyes.instanceColor) this.eyes.instanceColor.needsUpdate = true;
  }

  dispose(scene: THREE.Scene) {
    scene.remove(this.group);
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.dispose();
    }
    this.eyeMat.dispose();
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
