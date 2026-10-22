/**
 * Crowd renderer: many skinned people in TWO draw calls (plus their shadow and ink passes), whatever their
 * archetypes and levels of detail. Every archetype × LOD geometry lives in one BatchedMesh for bodies and one
 * for cloth; each person is one instance in both (same instance id = their row in the crowd textures), skinned
 * on the GPU from a bone texture and dressed from a palette texture (./crowd-material.ts).
 *
 *   const crowd = new HumanCrowd({ capacity: 40 });
 *   scene.add(crowd.group);
 *   const m = crowd.add(PEOPLE.campesina, dress(wardrobe.andeanWoman(rng)), { scale: 0.97 });
 *   // every frame: pose m.rig (an animator), then
 *   m.place(x, y, z, yaw); m.commit();
 *   crowd.update(camera);          // LOD switching, uploads
 *
 * LOD: each person draws the archetype at LOD 0 within `lodDist[0]` of the camera, LOD 1 within `lodDist[1]`,
 * LOD 2 beyond, up to `maxDist`. A LOD that has not been built yet (builds are asynchronous, ./pipeline.ts)
 * falls back to the nearest one that has; a person with nothing built yet is simply not drawn yet. Far LODs
 * are requested first, so a crowd appears within a few frames and sharpens as the near LODs arrive.
 *
 * Shadows (custom depth material with the same skinning) and the ink outline (ink-aware materials) work as for
 * any mesh; paint blotches are off; cloth sways on the shared wind.
 */
import * as THREE from "three";
import { type HumanSpec, type Lod, rigOf } from "./archetype";
import type { GeoData } from "./build";
import { toGeometry } from "./character";
import {
  BONE_TEXELS,
  type CrowdUniforms,
  crowdBodyMaterial,
  crowdClothMaterial,
  crowdDepthMaterial,
  crowdUniforms,
  MAX_BONES,
  PAL_W,
} from "./crowd-material";
import { CELLS, crowdFaceAtlas } from "./face";
import { FACE_STYLES } from "./faces";
import { clothAtlas } from "./patterns";
import { bestHuman, type HumanAsset, requestHuman } from "./pipeline";
import { makeSkeleton, type Rig, type Skeleton, writeSkinRows } from "./rig";
import { type Dress, dress, PALETTE_SIZE } from "./slots";

export interface CrowdOptions {
  /** Most people this crowd will ever hold (textures and batches are sized once). */
  capacity: number;
  name?: string;
  /** LOD switch distances (camera to person): LOD 0 within [0], LOD 1 within [1], else LOD 2. */
  lodDist?: [number, number];
  /** Beyond this distance a person is not drawn. */
  maxDist?: number;
  /** Cast shadows (bodies and cloth). */
  shadows?: boolean;
  /** Cloth wind amplitude (wool ≈ 0.3). */
  clothAmp?: number;
}

let atlasShared: THREE.CanvasTexture | null = null;
let facesShared: THREE.CanvasTexture | null = null;
const sharedAtlas = () => {
  atlasShared ??= clothAtlas();
  return atlasShared;
};
const sharedFaces = () => {
  facesShared ??= crowdFaceAtlas();
  return facesShared;
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const tmpC = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const camPos = new THREE.Vector3();

/** A degenerate one-triangle geometry with every attribute of a body (or cloth) blob: the batch's layout. */
function placeholder(cloth: boolean): THREE.BufferGeometry {
  const d: GeoData = {
    position: new Float32Array(9),
    normal: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    index: new Uint32Array([0, 1, 2]),
    skinIndex: new Uint16Array(12),
    skinWeight: new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    slots: new Uint8Array(6),
    cut: new Float32Array(3),
    face: new Float32Array(9),
    shade: new Float32Array(9).fill(1),
  };
  if (cloth) {
    d.uv = new Float32Array(6);
    d.flex = new Float32Array(3);
    d.cloth = new Float32Array(12);
  }
  return toGeometry(d);
}

interface GeoIds {
  body: number;
  cloth: number;
}

export class CrowdMember implements Rig {
  /** Instance id in both batches = row in the crowd textures. */
  readonly row: number;
  readonly spec: HumanSpec;
  readonly skeleton: Skeleton;
  readonly bones: Record<string, THREE.Bone>;
  readonly rest: Record<string, THREE.Vector3>;
  /** Archetype metadata (springs, gait style, face row, body options). */
  readonly meta: ReturnType<typeof rigOf>;
  /** World placement. */
  readonly position = new THREE.Vector3();
  yaw = 0;
  scale = 1;
  /** Drawn at all (owner switch: home at night, out of the scene). */
  shown = true;
  /** LOD currently drawn (−1 = nothing yet), and the one wanted by distance. */
  lod: Lod | -1 = -1;
  want: Lod = 2;
  /** Distance to the camera at the last crowd update. */
  dist = 0;
  private faceRow: number;
  private faceCell = 0;

  constructor(
    private crowd: HumanCrowd,
    row: number,
    spec: HumanSpec,
    meta: ReturnType<typeof rigOf>,
  ) {
    this.row = row;
    this.spec = spec;
    this.meta = meta;
    this.skeleton = makeSkeleton(meta.bones);
    this.bones = this.skeleton.bones;
    this.rest = this.skeleton.rest;
    this.faceRow = meta.face;
    for (const n of ["thighL", "thighR", "armL", "armR", "footL", "footR", "hips", "spine", "chest", "head", "neck"])
      if (this.bones[n]) (this.bones[n] as THREE.Bone).rotation.order = "ZXY";
  }

  setFace(cell: number) {
    if (cell === this.faceCell) return;
    this.faceCell = cell;
    this.crowd.writeInfo(this.row, cell, this.faceRow);
  }

  /** Face atlas row (./faces.ts order), e.g. to give a child an older face. */
  setFaceRow(row: number) {
    this.faceRow = row;
    this.crowd.writeInfo(this.row, this.faceCell, row);
  }

  setPalette(p: readonly string[] | Dress) {
    this.crowd.writePalette(this.row, Array.isArray(p) ? (p as readonly string[]) : dress(p as Dress));
  }

  /** Put the person in the world (feet at x, y, z, facing yaw; uniform scale for height jitter). */
  place(x: number, y: number, z: number, yaw = this.yaw, scale = this.scale) {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.scale = scale;
    this.crowd.writeMatrix(this);
  }

  /** Copy the posed skeleton into the bone texture (call after animating, before `crowd.update`). */
  commit() {
    this.crowd.writeBones(this);
  }

  show(on: boolean) {
    if (this.shown === on) return;
    this.shown = on;
    this.crowd.refreshVisibility(this);
  }

  /** World matrix of a bone (held props, speech bubbles, look-at). */
  boneWorld(name: string, out: THREE.Matrix4): THREE.Matrix4 {
    const b = this.bones[name];
    this.skeleton.root.updateMatrixWorld(true);
    tmpQ.setFromAxisAngle(UP, this.yaw);
    tmpM.compose(this.position, tmpQ, tmpS.setScalar(this.scale));
    return out.multiplyMatrices(tmpM, b ? b.matrixWorld : tmpM.identity());
  }
}

export class HumanCrowd {
  readonly group = new THREE.Group();
  readonly body: THREE.BatchedMesh;
  readonly cloth: THREE.BatchedMesh;
  readonly members: CrowdMember[] = [];
  readonly capacity: number;
  lodDist: [number, number];
  maxDist: number;
  private u: CrowdUniforms;
  private mats: THREE.Material[] = [];
  private geos = new Map<string, GeoIds>();
  private empty: GeoIds;
  private used = { bv: 0, bi: 0, cv: 0, ci: 0 };
  private room = { bv: 0, bi: 0, cv: 0, ci: 0 };
  private boneData: Float32Array;
  private palData: Float32Array;
  private bonesDirty = false;
  private palDirty = false;

  constructor(o: CrowdOptions) {
    this.capacity = Math.max(1, o.capacity);
    this.lodDist = o.lodDist ?? [9, 26];
    this.maxDist = o.maxDist ?? 160;
    this.u = crowdUniforms(this.capacity);
    this.u.chFace.value = sharedFaces();
    this.u.chFaceGrid.value.set(1 / CELLS, 1 / FACE_STYLES.length);
    this.boneData = this.u.chBones.value.image.data as Float32Array;
    this.palData = this.u.chPalT.value.image.data as Float32Array;
    const amp = o.clothAmp ?? 0.32;
    const bodyMat = crowdBodyMaterial(this.u);
    const clothMat = crowdClothMaterial(this.u, sharedAtlas(), amp);
    this.mats.push(bodyMat, clothMat);
    this.room = { bv: 60000, bi: 240000, cv: 20000, ci: 80000 };
    this.body = new THREE.BatchedMesh(this.capacity, this.room.bv, this.room.bi, bodyMat);
    this.cloth = new THREE.BatchedMesh(this.capacity, this.room.cv, this.room.ci, clothMat);
    this.group.name = o.name ?? "characters:crowd";
    for (const [m, isCloth] of [
      [this.body, false],
      [this.cloth, true],
    ] as const) {
      m.name = `${this.group.name}:${isCloth ? "cloth" : "body"}`;
      m.sortObjects = false;
      m.perObjectFrustumCulled = true;
      // The batch's own bounds go stale as people move: per-instance culling does the work.
      m.frustumCulled = false;
      m.castShadow = o.shadows ?? true;
      m.receiveShadow = true;
      const depth = crowdDepthMaterial(this.u, isCloth, amp);
      m.customDepthMaterial = depth;
      this.mats.push(depth);
      this.group.add(m);
    }
    const eb = placeholder(false);
    const ec = placeholder(true);
    this.empty = { body: this.body.addGeometry(eb), cloth: this.cloth.addGeometry(ec) };
    eb.dispose();
    ec.dispose();
    this.used = { bv: 3, bi: 3, cv: 3, ci: 3 };
  }

  /** Add a person (dressed from a palette or a Dress). Throws when the crowd is full. */
  add(spec: HumanSpec, palette: readonly string[] | Dress, o: { scale?: number } = {}): CrowdMember {
    if (this.members.length >= this.capacity) throw new Error("characters: crowd is full");
    const rowB = this.body.addInstance(this.empty.body);
    const rowC = this.cloth.addInstance(this.empty.cloth);
    if (rowB !== rowC) throw new Error("characters: crowd batches out of step");
    const m = new CrowdMember(this, rowB, spec, rigOf(spec));
    m.scale = o.scale ?? 1;
    this.members.push(m);
    this.body.setVisibleAt(rowB, false);
    this.cloth.setVisibleAt(rowC, false);
    m.setPalette(palette);
    this.writeInfo(rowB, 0, m.meta.face);
    // Rest pose until animated.
    m.commit();
    // Far LOD first: the person can be drawn as soon as it is in.
    for (const l of [2, 1, 0] as const) this.need(spec, l);
    return m;
  }

  /** Queue an archetype's build (shared across crowds through the pipeline cache; `update` picks it up). */
  private need(spec: HumanSpec, lod: Lod) {
    requestHuman(spec, lod).catch((e) => console.warn("characters: build failed", e));
  }

  private register(a: HumanAsset): GeoIds {
    const hit = this.geos.get(a.key);
    if (hit) return hit;
    const bv = a.body.getAttribute("position").count;
    const bi = a.body.index?.count ?? 0;
    this.grow(this.body, "b", bv, bi);
    const body = this.body.addGeometry(a.body);
    this.used.bv += bv;
    this.used.bi += bi;
    let cloth = this.empty.cloth;
    if (a.cloth) {
      const cv = a.cloth.getAttribute("position").count;
      const ci = a.cloth.index?.count ?? 0;
      this.grow(this.cloth, "c", cv, ci);
      cloth = this.cloth.addGeometry(a.cloth);
      this.used.cv += cv;
      this.used.ci += ci;
    }
    const ids = { body, cloth };
    this.geos.set(a.key, ids);
    return ids;
  }

  private grow(m: THREE.BatchedMesh, which: "b" | "c", v: number, i: number) {
    const kv = which === "b" ? "bv" : "cv";
    const ki = which === "b" ? "bi" : "ci";
    if (this.used[kv] + v <= this.room[kv] && this.used[ki] + i <= this.room[ki]) return;
    this.room[kv] = Math.max(this.room[kv] * 1.5, this.used[kv] + v + 1000) | 0;
    this.room[ki] = Math.max(this.room[ki] * 1.5, this.used[ki] + i + 3000) | 0;
    m.setGeometrySize(this.room[kv], this.room[ki]);
  }

  /** LOD per person from the camera distance, geometry swaps, visibility and texture uploads. */
  update(camera: THREE.Camera) {
    camera.getWorldPosition(camPos);
    const [d0, d1] = this.lodDist;
    for (const m of this.members) {
      const d = m.position.distanceTo(camPos);
      m.dist = d;
      // Hysteresis: a person near a threshold does not flicker between LODs.
      const h = 1.2;
      const cur = m.want;
      let want: Lod = d < d0 ? 0 : d < d1 ? 1 : 2;
      if (cur === 0 && want === 1 && d < d0 + h) want = 0;
      if (cur === 1 && want === 2 && d < d1 + h) want = 1;
      if (cur === 1 && want === 0 && d > d0 - h) want = 1;
      if (cur === 2 && want === 1 && d > d1 - h) want = 2;
      m.want = want;
      this.refreshVisibility(m);
    }
    if (this.bonesDirty) {
      this.u.chBones.value.needsUpdate = true;
      this.bonesDirty = false;
    }
    if (this.palDirty) {
      this.u.chPalT.value.needsUpdate = true;
      this.palDirty = false;
    }
  }

  /** Re-pick a member's geometry and visibility (after `show`, a distance change, a build arriving). */
  refreshVisibility(m: CrowdMember) {
    const visible = m.shown && m.dist <= this.maxDist;
    let lod: Lod | -1 = -1;
    let ids: GeoIds | null = null;
    if (visible) {
      const a = bestHuman(m.spec, m.want);
      if (a) {
        ids = this.register(a);
        lod = a.lod;
      }
    }
    const on = visible && ids !== null;
    if (ids && lod !== m.lod) {
      this.body.setGeometryIdAt(m.row, ids.body);
      this.cloth.setGeometryIdAt(m.row, ids.cloth);
    }
    m.lod = lod;
    this.body.setVisibleAt(m.row, on);
    this.cloth.setVisibleAt(m.row, on && ids !== null && ids.cloth !== this.empty.cloth);
  }

  writeMatrix(m: CrowdMember) {
    tmpQ.setFromAxisAngle(UP, m.yaw);
    tmpM.compose(tmpP.copy(m.position), tmpQ, tmpS.setScalar(m.scale));
    this.body.setMatrixAt(m.row, tmpM);
    this.cloth.setMatrixAt(m.row, tmpM);
  }

  writeBones(m: CrowdMember) {
    writeSkinRows(m.skeleton, this.boneData, m.row * MAX_BONES * BONE_TEXELS * 4);
    this.bonesDirty = true;
  }

  writePalette(row: number, hex: readonly string[]) {
    const o = row * PAL_W * 4;
    for (let i = 0; i < PALETTE_SIZE; i++) {
      tmpC.set(hex[i] ?? "#ff00ff");
      this.palData[o + i * 4] = tmpC.r;
      this.palData[o + i * 4 + 1] = tmpC.g;
      this.palData[o + i * 4 + 2] = tmpC.b;
      this.palData[o + i * 4 + 3] = 1;
    }
    this.palDirty = true;
  }

  writeInfo(row: number, cell: number, faceRow: number) {
    const o = (row * PAL_W + PALETTE_SIZE) * 4;
    this.palData[o] = cell;
    this.palData[o + 1] = faceRow;
    this.palData[o + 2] = 1;
    this.palDirty = true;
  }

  /** Draw calls per render pass (0, 1 or 2). */
  drawCalls() {
    let n = 0;
    for (const m of this.members)
      if (m.shown && m.lod >= 0) {
        n = 1;
        break;
      }
    for (const m of this.members)
      if (m.shown && m.lod >= 0 && this.cloth.getVisibleAt(m.row)) {
        n++;
        break;
      }
    return n;
  }

  /** Triangles drawn per pass at the current LODs (dev stats). */
  stats() {
    const lods = [0, 0, 0];
    for (const m of this.members) if (m.shown && m.lod >= 0) lods[m.lod] = (lods[m.lod] ?? 0) + 1;
    return {
      people: this.members.length,
      lods,
      geometries: this.geos.size,
      used: { ...this.used },
      room: { ...this.room },
    };
  }

  dispose() {
    this.body.dispose();
    this.cloth.dispose();
    for (const m of this.mats) m.dispose();
    this.u.chBones.value.dispose();
    this.u.chPalT.value.dispose();
    this.group.removeFromParent();
  }
}
