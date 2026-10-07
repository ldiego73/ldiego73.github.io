/**
 * One-draw-call animal rig for the jungle mammals and reptiles (mono, perezoso, ronsoco, otorongo, caimán,
 * bufeo). Each species is ONE merged vertex-colored geometry whose vertices carry a `joint` id:
 *   0 rigid body · 1–4 legs (front-left, front-right, hind-left, hind-right) · 5 head · 6 tail.
 * The vertex shader poses the joints from two per-instance attributes, so a whole troop or herd is a single
 * InstancedMesh with no per-frame matrix work beyond the root:
 *   aPose  = (gait phase in cycles, leg swing amplitude rad, head yaw, head pitch)
 *   aPose2 = (tail yaw, tail pitch, front-leg bias, hind-leg bias)
 * Legs swing about X at their pivots (positive = foot back) with per-species phase offsets (uGait); the tail
 * bends (its rotation grows from the pivot to the tip over uTailLen), so a monkey's tail curls and a
 * caiman's tail sweeps. Normals get the same rotation (toon bands and the ink follow the pose).
 *
 * Ink: like flora/material.ts, the material opts out of the outline prepass override and writes the packed
 * view normal itself while that pass draws (flag set by `inkAwareRig` per draw), so outlines follow the
 * animated pose instead of the rest pose. A moonlight rim term (uRim, driven by the night amount) keeps dark
 * animals readable at night, as the mountain's night fauna do.
 */
import * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";

export const J = { body: 0, fl: 1, fr: 2, hl: 3, hr: 4, head: 5, tail: 6 } as const;

/** Leg phase offsets (fraction of a cycle) for FL, FR, HL, HR. */
export const GAIT_WALK: readonly [number, number, number, number] = [0.25, 0.75, 0, 0.5];
export const GAIT_BOUND: readonly [number, number, number, number] = [0, 0.08, 0.5, 0.58];
export const GAIT_TROT: readonly [number, number, number, number] = [0, 0.5, 0.5, 0];

const INK = { value: 0 };

/** Makes an InstancedMesh with the rig material ink-correct (call once per mesh). */
export function inkAwareRig(mesh: THREE.Mesh) {
  mesh.onBeforeRender = (_r, scene) => {
    INK.value = (scene as THREE.Scene).overrideMaterial ? 1 : 0;
  };
}

export interface RigSpec {
  /** Pivots in model space: legs FL, FR, HL, HR, then head, then tail root. */
  legs: [THREE.Vector3, THREE.Vector3, THREE.Vector3, THREE.Vector3];
  head: THREE.Vector3;
  tail: THREE.Vector3;
  /** Tail length along −Z (bend reaches full angle at the tip). */
  tailLen: number;
  gait: readonly [number, number, number, number];
}

export interface RigMaterial {
  material: THREE.MeshToonMaterial;
  /** 0..1 rim strength (drive with the night amount). */
  rim: { value: number };
}

export function rigMaterial(gradientMap: THREE.Texture | null, spec: RigSpec, rimColor = "#9fb4ff"): RigMaterial {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap });
  m.allowOverride = false;
  const rim = { value: 0 };
  const piv = [new THREE.Vector3(), ...spec.legs, spec.head, spec.tail];
  const uniforms = {
    uPiv: { value: piv },
    uGait: { value: new THREE.Vector4(...spec.gait) },
    uTailLen: { value: Math.max(0.01, spec.tailLen) },
    uRim: rim,
    uRimColor: { value: new THREE.Color(rimColor) },
    uInkPass: INK,
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        attribute float joint;
        attribute vec4 aPose;
        attribute vec4 aPose2;
        uniform vec3 uPiv[7];
        uniform vec4 uGait;
        uniform float uTailLen;
        mat3 swRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
        mat3 swRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        `#include <beginnormal_vertex>
        mat3 swR = mat3(1.0);
        vec3 swP = vec3(0.0);
        int swJ = int(joint + 0.5);
        if (swJ >= 1 && swJ <= 4) {
          float off = swJ == 1 ? uGait.x : swJ == 2 ? uGait.y : swJ == 3 ? uGait.z : uGait.w;
          float bias = swJ <= 2 ? aPose2.z : aPose2.w;
          swR = swRotX(bias + sin((aPose.x + off) * 6.2831853) * aPose.y);
          swP = uPiv[swJ];
        } else if (swJ == 5) {
          swR = swRotY(aPose.z) * swRotX(aPose.w);
          swP = uPiv[5];
        } else if (swJ == 6) {
          float u = clamp((uPiv[6].z - position.z) / uTailLen, 0.0, 1.0);
          swR = swRotY(aPose2.x * u) * swRotX(aPose2.y * u);
          swP = uPiv[6];
        }
        objectNormal = swR * objectNormal;`,
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\n        transformed = swR * (transformed - swP) + swP;",
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uInkPass;\nuniform float uRim;\nuniform vec3 uRimColor;",
      )
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
        if (uRim > 0.001) {
          float fr = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
          gl_FragColor.rgb += uRimColor * uRim * (pow(fr, 2.5) * 0.7 + 0.04) * (0.35 + diffuseColor.rgb);
        }`,
      )
      .replace(
        "#include <dithering_fragment>",
        `#include <dithering_fragment>
        if (uInkPass > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);`,
      );
  };
  m.customProgramCacheKey = () => "selva-fauna-rig";
  return { material: m, rim };
}

/** Builds a rig geometry from parts: `b.add(geo, { color, flex: jointId })` → attribute `joint`. */
export function buildRigGeometry(b: GeoBuilder): THREE.BufferGeometry {
  const g = b.build({ flex: true });
  const j = g.getAttribute("flex");
  g.deleteAttribute("flex");
  g.setAttribute("joint", j);
  return g;
}

export { GeoBuilder };

/**
 * A species: one InstancedMesh with the rig material and the per-instance pose buffers. `set(i, matrix,
 * pose…)` writes an instance; `hideFrom(n)` trims the draw count (a whole absent species costs nothing).
 */
export class RigSet {
  readonly mesh: THREE.InstancedMesh;
  readonly pose: THREE.InstancedBufferAttribute;
  readonly pose2: THREE.InstancedBufferAttribute;
  readonly rim: { value: number };
  private readonly mat: THREE.MeshToonMaterial;

  constructor(
    name: string,
    geo: THREE.BufferGeometry,
    spec: RigSpec,
    readonly capacity: number,
    gradientMap: THREE.Texture | null,
    o: { shadow?: boolean; rimColor?: string } = {},
  ) {
    const n = Math.max(1, capacity);
    this.pose = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.pose2 = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.pose.setUsage(THREE.DynamicDrawUsage);
    this.pose2.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aPose", this.pose);
    geo.setAttribute("aPose2", this.pose2);
    const rm = rigMaterial(gradientMap, spec, o.rimColor);
    this.mat = rm.material;
    this.rim = rm.rim;
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = !!o.shadow;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.visible = false;
    inkAwareRig(this.mesh);
  }

  /** Writes instance i (pose values default to rest). */
  set(
    i: number,
    m: THREE.Matrix4,
    phase = 0,
    swing = 0,
    headYaw = 0,
    headPitch = 0,
    tailYaw = 0,
    tailPitch = 0,
    front = 0,
    hind = 0,
  ) {
    this.mesh.setMatrixAt(i, m);
    this.pose.setXYZW(i, phase, swing, headYaw, headPitch);
    this.pose2.setXYZW(i, tailYaw, tailPitch, front, hind);
  }

  /** Number of instances drawn this frame (the first n slots). */
  commit(n: number) {
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.pose.needsUpdate = true;
      this.pose2.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      cullable(this.mesh);
    }
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.mesh.dispose();
  }
}

/**
 * Lets the renderer frustum-cull a live instanced species as a whole: the bounding sphere of this frame's
 * instances (a few dozen at most, cheap), grown a little for the posed limbs and wings the vertex shader
 * moves. A troop behind the camera then costs no draw call (nor its outline pass).
 */
export function cullable(mesh: THREE.InstancedMesh) {
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
  if (mesh.boundingSphere) mesh.boundingSphere.radius += 1;
}

const _hq = new THREE.Matrix4();
const _hv = new THREE.Vector3();
const _e = new THREE.Euler();

/**
 * World position of a point `p` on the head (model space) for an instance with root matrix `m` and the given
 * head yaw/pitch about pivot `pivot` — mirrors the shader, for eyes and eyeshine drawn by a separate mesh.
 */
export function headPoint(
  out: THREE.Vector3,
  m: THREE.Matrix4,
  pivot: THREE.Vector3,
  yaw: number,
  pitch: number,
  p: THREE.Vector3,
) {
  _hq.makeRotationFromEuler(_e.set(pitch, yaw, 0, "YXZ"));
  _hv.copy(p).sub(pivot).applyMatrix4(_hq).add(pivot);
  return out.copy(_hv).applyMatrix4(m);
}
