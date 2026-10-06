/**
 * Rendering core for the people: palette-slot geometry + instanced bipeds.
 *
 * Every body part is one merged geometry whose vertices carry either a fixed color (eyes, hair, wood) or a
 * palette *slot* (1 skin, 2 main garment, 3 accent / weave, 4 secondary garment). Each instance carries its
 * own four colors (three vec4 instance attributes), so one InstancedMesh per part draws a whole site's people
 * in their own outfits. Bones are plain Object3D hierarchies (never added to the scene); after posing, their
 * world matrices are copied into the instanced meshes (zero allocations per frame).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export const S_SKIN = 1;
export const S_MAIN = 2;
export const S_ACC = 3;
export const S_ALT = 4;
export type Slot = typeof S_SKIN | typeof S_MAIN | typeof S_ACC | typeof S_ALT;
/** A part color: a fixed hex, or a palette slot. */
export type Paint = string | Slot;

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();

/** Shared primitive prototypes. */
export function protos() {
  return {
    box: new THREE.BoxGeometry(1, 1, 1),
    sph: new THREE.SphereGeometry(1, 10, 8),
    lowSph: new THREE.IcosahedronGeometry(1, 0),
    ico: new THREE.IcosahedronGeometry(1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
    cyl6: new THREE.CylinderGeometry(1, 1, 1, 6),
    /** Truncated cone, wide at the bottom (skirts, ponchos, pots). */
    flare: new THREE.CylinderGeometry(0.62, 1, 1, 12, 1),
    cone: new THREE.ConeGeometry(1, 1, 8),
    cap: new THREE.CapsuleGeometry(1, 1, 2, 8),
    torus: new THREE.TorusGeometry(1, 0.16, 5, 14),
    halfSph: new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  };
}
export type Protos = ReturnType<typeof protos>;

/** Accumulates transformed primitives with a fixed color or a palette slot, then merges them. */
export class Part {
  private list: THREE.BufferGeometry[] = [];
  /** Optional transform applied after each primitive's own (places a whole prop in a frame). */
  post: THREE.Matrix4 | null = null;
  add(
    src: THREE.BufferGeometry,
    paint: Paint,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): this {
    const g = src.index ? src.toNonIndexed() : src.clone();
    for (const k of Object.keys(g.attributes)) if (k !== "position" && k !== "normal") g.deleteAttribute(k);
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    g.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
    if (this.post) g.applyMatrix4(this.post);
    const n = g.getAttribute("position").count;
    const col = new Float32Array(n * 3);
    const slot = new Float32Array(n);
    if (typeof paint === "string") {
      tmpC.set(paint);
      for (let i = 0; i < n; i++) {
        col[i * 3] = tmpC.r;
        col[i * 3 + 1] = tmpC.g;
        col[i * 3 + 2] = tmpC.b;
      }
    } else {
      col.fill(1);
      slot.fill(paint);
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("aSlot", new THREE.BufferAttribute(slot, 1));
    this.list.push(g);
    return this;
  }
  get empty() {
    return this.list.length === 0;
  }
  /** Merge into one geometry (the parts are disposed). */
  build(): THREE.BufferGeometry {
    const merged = mergeGeometries(this.list, false);
    for (const g of this.list) g.dispose();
    this.list = [];
    merged.computeBoundingSphere();
    return merged;
  }
}

/** Toon material with vertex colors + per-instance palette slots (shares the world's 3-step ramp). */
export function paletteMaterial(gradientMap: THREE.Texture | null): THREE.MeshToonMaterial {
  const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aSlot;\nattribute vec4 iPalA;\nattribute vec4 iPalB;\nattribute vec4 iPalC;",
      )
      .replace(
        "#include <color_vertex>",
        `#include <color_vertex>
        if (aSlot > 0.5) {
          vColor.rgb = aSlot < 1.5 ? iPalA.xyz : aSlot < 2.5 ? vec3(iPalA.w, iPalB.xy)
            : aSlot < 3.5 ? vec3(iPalB.zw, iPalC.x) : iPalC.yzw;
        }`,
      );
  };
  mat.customProgramCacheKey = () => "qn-people-palette";
  return mat;
}

/** Four outfit colors (sRGB hex) for slots 1..4. */
export type Palette = [skin: string, main: string, acc: string, alt: string];

/**
 * One InstancedMesh for a part geometry, with a per-instance palette. Instances are fixed per person
 * (index never changes); hidden ones get a zero matrix.
 */
export class PartMesh {
  readonly mesh: THREE.InstancedMesh;
  private a: THREE.InstancedBufferAttribute;
  private b: THREE.InstancedBufferAttribute;
  private c: THREE.InstancedBufferAttribute;
  private dirty = false;
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, count: number, name: string) {
    const n = Math.max(1, count);
    this.a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.b = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.c = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    geo.setAttribute("iPalA", this.a);
    geo.setAttribute("iPalB", this.b);
    geo.setAttribute("iPalC", this.c);
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.name = name;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.castShadow = true;
  }
  setPalette(i: number, p: Palette) {
    const v = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      tmpC.set(p[k] as string);
      v[k * 3] = tmpC.r;
      v[k * 3 + 1] = tmpC.g;
      v[k * 3 + 2] = tmpC.b;
    }
    this.a.array.set(v.slice(0, 4), i * 4);
    this.b.array.set(v.slice(4, 8), i * 4);
    this.c.array.set(v.slice(8, 12), i * 4);
    this.a.needsUpdate = this.b.needsUpdate = this.c.needsUpdate = true;
  }
  set(i: number, m: THREE.Matrix4) {
    this.mesh.setMatrixAt(i, m);
    this.dirty = true;
  }
  hide(i: number) {
    this.mesh.setMatrixAt(i, ZERO);
    this.dirty = true;
  }
  flush() {
    if (!this.dirty) return;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dirty = false;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Bone hierarchy of one person. Dimensions match the chasqui NPCs (adult ≈ 1.6–1.7 u). */
export interface Bones {
  root: THREE.Object3D;
  /** Bob / sit height; carries the legs and the skirt. */
  hips: THREE.Object3D;
  torso: THREE.Object3D;
  head: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  /** Held tool frame (child of root; posed by the behaviour). */
  tool: THREE.Object3D;
  /** In the right hand. */
  handR: THREE.Object3D;
}

export function makeBones(scale: number, headScale = 1, girth = 1): Bones {
  const root = new THREE.Object3D();
  const hips = new THREE.Object3D();
  hips.scale.setScalar(scale);
  root.add(hips);
  const legL = new THREE.Object3D();
  legL.position.set(0.1 * girth, 0.55, 0);
  const legR = new THREE.Object3D();
  legR.position.set(-0.1 * girth, 0.55, 0);
  hips.add(legL, legR);
  const torso = new THREE.Object3D();
  torso.position.y = 0.55;
  hips.add(torso);
  const head = new THREE.Object3D();
  head.position.y = 0.62;
  head.scale.setScalar(headScale);
  torso.add(head);
  const armL = new THREE.Object3D();
  armL.position.set(0.27 * girth, 0.47, 0);
  const armR = new THREE.Object3D();
  armR.position.set(-0.27 * girth, 0.47, 0);
  torso.add(armL, armR);
  const handR = new THREE.Object3D();
  handR.position.set(0, -0.38, 0.02);
  armR.add(handR);
  const tool = new THREE.Object3D();
  hips.add(tool);
  return { root, hips, torso, head, armL, armR, legL, legR, tool, handR };
}

/** Which bone a mesh follows. */
export type BoneName = "hips" | "torso" | "head" | "arm" | "leg" | "tool" | "handR";

export interface PartSpec {
  name: string;
  geo: THREE.BufferGeometry;
  bone: BoneName;
}

/**
 * All the people share one set of part meshes (one InstancedMesh per part for the whole world, so the draw
 * calls stay flat however many sites are in view). Persons are slots 0..n-1 (`alloc()`); arms and legs use
 * two instances each (2i left, 2i+1 right). Optional parts (hats, tools) are shown per person by a mask.
 * Hidden persons get zero matrices; a part with nobody shown is not drawn at all.
 */
export class Crowd {
  readonly group = new THREE.Group();
  private parts: Array<{ spec: PartSpec; pm: PartMesh; mask: Uint8Array }> = [];
  private shown: Uint8Array;
  private next = 0;
  constructor(
    specs: PartSpec[],
    private n: number,
    mat: THREE.Material,
    shadows: ReadonlySet<string>,
  ) {
    this.group.name = "people:crowd";
    this.shown = new Uint8Array(Math.max(1, n));
    for (const spec of specs) {
      const two = spec.bone === "arm" || spec.bone === "leg";
      const pm = new PartMesh(spec.geo, mat, two ? n * 2 : n, `people:${spec.name}`);
      // Instances span the whole map: cull by site distance in the behaviours instead.
      pm.mesh.frustumCulled = false;
      pm.mesh.castShadow = shadows.has(spec.name);
      pm.mesh.visible = false;
      this.group.add(pm.mesh);
      this.parts.push({ spec, pm, mask: new Uint8Array(Math.max(1, n)) });
    }
  }
  /** Reserve the next person slot. */
  alloc(): number {
    if (this.next >= this.n) throw new Error("people: crowd is full");
    return this.next++;
  }
  /** Person i wears / holds the named parts (others hidden for them). */
  wear(i: number, names: readonly string[], palette: Palette) {
    for (const p of this.parts) {
      p.mask[i] = names.includes(p.spec.name) ? 1 : 0;
      if (!p.mask[i]) continue;
      const two = p.spec.bone === "arm" || p.spec.bone === "leg";
      if (two) {
        p.pm.setPalette(i * 2, palette);
        p.pm.setPalette(i * 2 + 1, palette);
      } else p.pm.setPalette(i, palette);
    }
  }
  show(i: number, b: Bones | null) {
    if (!b && !this.shown[i]) return;
    this.shown[i] = b ? 1 : 0;
    for (const p of this.parts) {
      if (!p.mask[i]) continue;
      const two = p.spec.bone === "arm" || p.spec.bone === "leg";
      if (!b) {
        if (two) {
          p.pm.hide(i * 2);
          p.pm.hide(i * 2 + 1);
        } else p.pm.hide(i);
        continue;
      }
      switch (p.spec.bone) {
        case "arm":
          p.pm.set(i * 2, b.armL.matrixWorld);
          p.pm.set(i * 2 + 1, b.armR.matrixWorld);
          break;
        case "leg":
          p.pm.set(i * 2, b.legL.matrixWorld);
          p.pm.set(i * 2 + 1, b.legR.matrixWorld);
          break;
        default:
          p.pm.set(i, b[p.spec.bone].matrixWorld);
      }
    }
  }
  /** Upload this frame's matrices; parts nobody shows are skipped by the renderer. */
  flush() {
    for (const p of this.parts) {
      let any = false;
      for (let i = 0; i < this.next; i++)
        if (this.shown[i] && p.mask[i]) {
          any = true;
          break;
        }
      p.pm.mesh.visible = any;
      p.pm.flush();
    }
  }
  /** Meshes drawn this frame (per render pass). */
  drawCalls() {
    let n = 0;
    for (const p of this.parts) if (p.pm.mesh.visible) n++;
    return n;
  }
  dispose() {
    for (const p of this.parts) p.pm.dispose();
    this.group.removeFromParent();
  }
}
