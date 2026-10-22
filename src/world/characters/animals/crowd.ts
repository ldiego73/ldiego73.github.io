/**
 * Herds and flocks: many animals of one species drawn as ONE InstancedMesh per LOD (so a herd of 40 vicuñas
 * is three draw calls plus their ink and shadow passes, whatever their number), skinned on the GPU from a bone
 * texture (./crowd-material.ts), with a coat variant and an eye cell per instance.
 *
 *   const herd = createHerd("vicuna", { max: 30 });
 *   scene.add(herd.group);
 *   const id = herd.add({ seed: 7, variant: 0 });
 *   // every frame, from the world's own sim:
 *   herd.set(id, x, y, z, yaw, { speed, rm, look });
 *   herd.update(dt, t, camera);
 *
 * How the poses are made: one template skeleton (three Bones, never drawn) is shared by every instance; each
 * instance owns an animator (its gait phase, springs, idles) that poses the template, and the skeleton's bone
 * matrices are copied into the instance's texture row. Far instances are posed less often (./lod.ts
 * POSE_EVERY: every 2nd frame at LOD 1, every 4th at LOD 2, staggered so the cost is flat), and instances
 * beyond the far band are not drawn at all.
 *
 * LOD geometry comes from ./assets.ts: LODs not built yet (they build off the main thread) borrow the
 * nearest built one, so a herd shows up at once and sharpens a moment later.
 */
import * as THREE from "three";
import type { Built } from "../build";
import type { BirdState } from "./anim-bird";
import type { AnimalState, Rig } from "./anim-quad";
import { type Animator, animatorFor, paletteOf } from "./animal";
import { requestAnimal } from "./assets";
import type { IdleAction } from "./behaviour";
import { boneTexture, type CrowdUniforms, crowdDepthMaterial, crowdMaterial, paletteTexture } from "./crowd-material";
import { EYE_CELLS, eyeAtlas } from "./eyes";
import { type Lod, lodFor, poseThisFrame } from "./lod";
import type { AnimalSpec } from "./spec";
import { type SpeciesKey, speciesOf } from "./species";

export interface HerdOptions {
  /** Most instances at once. */
  max: number;
  /** Coat variants (spec.variants keys or palettes); an instance picks one by index. Default: the base palette. */
  variants?: ReadonlyArray<string | readonly string[]>;
  /** Cast shadows (default true). */
  shadows?: boolean;
  /** LOD distance multiplier (phones: < 1). */
  lodScale?: number;
  /** Optional parts on every instance (the llama's "tika", "pack"). */
  features?: Record<string, boolean>;
}

export interface HerdMember {
  seed?: number;
  /** Index into `variants`. */
  variant?: number;
  features?: Record<string, boolean>;
}

/** Optional per-instance body pose for `herd.set`: uniform scale (young animals, a bigger-than-life bird; LOD
 * distances are divided by it) and body pitch / roll (radians, applied after the yaw: a hopping agouti, a
 * turtle climbing a log, a dolphin's arc, a teal tipping up to feed). */
export interface HerdPose {
  scale?: number;
  pitch?: number;
  roll?: number;
}

export interface Herd {
  spec: AnimalSpec;
  group: THREE.Group;
  add(m?: HerdMember): number;
  remove(id: number): void;
  /** Place an instance (feet at x, y, z facing yaw) and give its animator this frame's state. */
  set(
    id: number,
    x: number,
    y: number,
    z: number,
    yaw: number,
    s: AnimalState & Partial<BirdState>,
    pose?: HerdPose,
  ): void;
  /** Hide one instance (out of the world's range) without removing it. */
  hide(id: number): void;
  play(id: number, a: Exclude<IdleAction, "none">, seconds?: number): void;
  lunge(id: number): void;
  update(dt: number, t: number, camera: THREE.Camera): void;
  stats(): { count: number; lod: [number, number, number]; posed: number };
  dispose(): void;
}

interface Inst {
  id: number;
  anim: Animator;
  cell: number;
  variant: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
  pitch: number;
  roll: number;
  state: AnimalState & Partial<BirdState>;
  visible: boolean;
  lod: Lod | -1;
  /** Seconds since its last pose (decimated posing). */
  acc: number;
}

export function createHerd(key: SpeciesKey | string, o: HerdOptions): Herd {
  const spec = speciesOf(key);
  const variants = (o.variants?.length ? o.variants : [spec.palette]).map((v) => paletteOf(spec, v));
  const group = new THREE.Group();
  group.name = `herd:${spec.key}`;

  // Template skeleton from the cheapest build (the bones are the same at every LOD).
  const proto = requestAnimal(spec, 2, true) as Built;
  const defs = proto.bones;
  const nb = defs.length;
  const bones: THREE.Bone[] = [];
  const byName: Record<string, THREE.Bone> = {};
  const rest: Record<string, THREE.Vector3> = {};
  const root = new THREE.Group();
  for (const d of defs) {
    const b = new THREE.Bone();
    b.name = d.name;
    const p = d.parent >= 0 ? defs[d.parent] : null;
    b.position.set(d.at[0] - (p?.at[0] ?? 0), d.at[1] - (p?.at[1] ?? 0), d.at[2] - (p?.at[2] ?? 0));
    bones.push(b);
    byName[d.name] = b;
    rest[d.name] = new THREE.Vector3(...d.at);
    if (d.parent >= 0) bones[d.parent]?.add(b);
    else root.add(b);
  }
  const inverses = defs.map((d) => new THREE.Matrix4().makeTranslation(-d.at[0], -d.at[1], -d.at[2]));
  const skeleton = new THREE.Skeleton(bones, inverses);
  let cellOut = 0;
  const rig: Rig = { bones: byName, rest, setFace: (c) => (cellOut = c) };

  const u: CrowdUniforms = {
    chBones: { value: boneTexture(nb, o.max) },
    chPalTex: { value: paletteTexture(variants) },
    chFace: { value: eyeAtlas(spec.eye) },
    chFaceK: { value: new THREE.Vector2(1 / EYE_CELLS, 1) },
  };
  const mat = crowdMaterial(u);
  const depth = crowdDepthMaterial(u);
  const boneData = u.chBones.value.image.data as Float32Array;

  // One InstancedMesh per LOD (geometry swapped in when a finer build arrives).
  const meshes: THREE.InstancedMesh[] = [];
  const rows: THREE.InstancedBufferAttribute[] = [];
  const vars: THREE.InstancedBufferAttribute[] = [];
  const cells: THREE.InstancedBufferAttribute[] = [];
  const have: Array<Built | null> = [null, null, null];
  const geos: Array<THREE.BufferGeometry | null> = [null, null, null];
  const makeGeo = (b: Built, l: Lod) => {
    const d = b.body;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(d.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(d.normal, 3));
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(d.skinIndex, 4));
    g.setAttribute("skinWeight", new THREE.BufferAttribute(d.skinWeight, 4));
    g.setAttribute("aSlots", new THREE.BufferAttribute(d.slots, 2));
    g.setAttribute("aCut", new THREE.BufferAttribute(d.cut, 1));
    g.setAttribute("aFace", new THREE.BufferAttribute(d.face, 3));
    g.setAttribute("color", new THREE.BufferAttribute(d.shade, 3));
    g.setIndex(new THREE.BufferAttribute(d.index, 1));
    g.setAttribute("aRow", rows[l] as THREE.InstancedBufferAttribute);
    g.setAttribute("aVar", vars[l] as THREE.InstancedBufferAttribute);
    g.setAttribute("aCell", cells[l] as THREE.InstancedBufferAttribute);
    g.computeBoundingSphere();
    return g;
  };
  for (const l of [0, 1, 2] as Lod[]) {
    rows.push(new THREE.InstancedBufferAttribute(new Float32Array(o.max), 1).setUsage(THREE.DynamicDrawUsage));
    vars.push(new THREE.InstancedBufferAttribute(new Float32Array(o.max), 1).setUsage(THREE.DynamicDrawUsage));
    cells.push(new THREE.InstancedBufferAttribute(new Float32Array(o.max), 1).setUsage(THREE.DynamicDrawUsage));
    const placeholder = new THREE.BufferGeometry();
    const m = new THREE.InstancedMesh(placeholder, mat, o.max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.name = `herd:${spec.key}:lod${l}`;
    m.castShadow = o.shadows ?? true;
    m.receiveShadow = true;
    m.customDepthMaterial = depth;
    // The bounding sphere is recomputed from the instances every frame (see update).
    m.frustumCulled = true;
    group.add(m);
    meshes.push(m);
  }
  const attach = (l: Lod, b: Built) => {
    have[l] = b;
    const g = makeGeo(b, l);
    geos[l]?.dispose();
    geos[l] = g;
    const m = meshes[l] as THREE.InstancedMesh;
    m.geometry.dispose();
    m.geometry = g;
  };
  attach(2, proto);
  for (const l of [1, 0] as Lod[]) {
    const r = requestAnimal(spec, l, false, (b) => attach(l, b));
    if (r) attach(l, r);
  }
  /** The LOD actually drawn for a wanted LOD (the nearest built one). */
  const drawn = (l: Lod): Lod => {
    if (have[l]) return l;
    if (l === 0) return have[1] ? 1 : 2;
    if (l === 1) return have[0] ? 0 : 2;
    return 2;
  };

  const list: Array<Inst | null> = [];
  const free: number[] = [];
  let frame = 0;
  let posed = 0;
  const lodCount: [number, number, number] = [0, 0, 0];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3(1, 1, 1);
  const eul = new THREE.Euler();
  const maxScale = [0, 0, 0];
  const cam = new THREE.Vector3();
  const sphere = [new THREE.Sphere(), new THREE.Sphere(), new THREE.Sphere()];

  const herd: Herd = {
    spec,
    group,
    add(mb = {}) {
      const id = free.length ? (free.pop() as number) : list.length;
      if (id >= o.max) throw new Error(`animals: herd ${spec.key} is full (${o.max})`);
      const anim = animatorFor(spec, rig, mb.seed ?? id + 1);
      anim.features = { tika: true, pack: false, ...spec.features, ...o.features, ...mb.features };
      list[id] = {
        id,
        anim,
        cell: 0,
        variant: Math.min(variants.length - 1, Math.max(0, mb.variant ?? 0)),
        x: 0,
        y: -1e4,
        z: 0,
        yaw: 0,
        scale: 1,
        pitch: 0,
        roll: 0,
        state: { speed: 0, rm: false },
        visible: false,
        lod: -1,
        acc: 1,
      };
      return id;
    },
    remove(id) {
      if (!list[id]) return;
      list[id] = null;
      free.push(id);
    },
    set(id, x, y, z, yaw, s, pose) {
      const it = list[id];
      if (!it) return;
      it.x = x;
      it.y = y;
      it.z = z;
      it.yaw = yaw;
      it.scale = pose?.scale ?? 1;
      it.pitch = pose?.pitch ?? 0;
      it.roll = pose?.roll ?? 0;
      it.state = s;
      it.visible = true;
    },
    hide(id) {
      const it = list[id];
      if (it) it.visible = false;
    },
    play(id, a, seconds) {
      list[id]?.anim.play(a, seconds);
    },
    lunge(id) {
      list[id]?.anim.lunge?.();
    },
    update(dt, t, camera) {
      frame++;
      posed = 0;
      camera.getWorldPosition(cam);
      lodCount[0] = lodCount[1] = lodCount[2] = 0;
      for (const m of meshes) m.count = 0;
      for (const s of sphere) s.makeEmpty();
      maxScale.fill(0);
      for (const it of list) {
        if (!it) continue;
        it.acc += dt;
        if (!it.visible) {
          it.lod = -1;
          continue;
        }
        const d = Math.hypot(it.x - cam.x, it.y - cam.y, it.z - cam.z);
        const want = lodFor(d / Math.max(0.05, it.scale), spec.size, undefined, o.lodScale ?? 1);
        it.lod = want;
        if (want === -1) continue;
        lodCount[want]++;
        // Pose (decimated far away; always on the first frame it shows).
        if (poseThisFrame(want, it.id, frame) || it.acc >= 0.5) {
          it.anim.update(it.acc, t, it.state);
          it.acc = 0;
          it.cell = cellOut;
          root.updateMatrixWorld(true);
          skeleton.update();
          boneData.set(skeleton.boneMatrices as Float32Array, it.id * nb * 16);
          posed++;
        }
        const l = drawn(want);
        const mesh = meshes[l] as THREE.InstancedMesh;
        const k = mesh.count++;
        if (it.pitch || it.roll) q.setFromEuler(eul.set(it.pitch, it.yaw, it.roll, "YXZ"));
        else q.setFromAxisAngle(up, it.yaw);
        pos.set(it.x, it.y, it.z);
        scl.setScalar(it.scale);
        m4.compose(pos, q, scl);
        maxScale[l] = Math.max(maxScale[l] as number, it.scale);
        mesh.setMatrixAt(k, m4);
        (rows[l] as THREE.InstancedBufferAttribute).setX(k, it.id);
        (vars[l] as THREE.InstancedBufferAttribute).setX(k, it.variant);
        (cells[l] as THREE.InstancedBufferAttribute).setX(k, it.cell);
        (sphere[l] as THREE.Sphere).expandByPoint(pos);
      }
      u.chBones.value.needsUpdate = true;
      meshes.forEach((m, l) => {
        if (!m.count) return;
        m.instanceMatrix.needsUpdate = true;
        for (const a of [rows[l], vars[l], cells[l]]) if (a) a.needsUpdate = true;
        const s = sphere[l] as THREE.Sphere;
        s.radius += spec.size * 1.2 * (maxScale[l] as number);
        // Kept spheres (no per-frame allocation): the mesh holds its own copy target.
        m.boundingSphere ??= new THREE.Sphere();
        m.boundingSphere.copy(s);
      });
    },
    stats: () => ({ count: list.filter(Boolean).length, lod: [...lodCount] as [number, number, number], posed }),
    dispose() {
      group.removeFromParent();
      for (const m of meshes) m.dispose();
      for (const g of geos) g?.dispose();
      mat.dispose();
      depth.dispose();
      u.chBones.value.dispose();
      u.chPalTex.value.dispose();
      skeleton.dispose();
    },
  };
  return herd;
}
