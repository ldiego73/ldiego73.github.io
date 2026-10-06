import * as THREE from "three";

/** Objects on this layer only are drawn by the main camera but skipped by the outline prepass. */
export const NO_OUTLINE_LAYER = 1;

let gradient: THREE.DataTexture | null = null;

/** 3-step toon ramp (shadow, mid, lit), nearest-filtered so the bands stay crisp. */
export function gradientMap(): THREE.DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([96, 178, 255]);
  const t = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  gradient = t;
  return t;
}

export interface ToonCache {
  toon(
    color: THREE.ColorRepresentation,
    opts?: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number },
  ): THREE.MeshToonMaterial;
  /** A toon material with vertex colors (terrain, merged props). Not cached by color. */
  vertexToon(extra?: THREE.MeshToonMaterialParameters): THREE.MeshToonMaterial;
  dispose(): void;
}

export function createToonCache(): ToonCache {
  const cache = new Map<string, THREE.MeshToonMaterial>();
  const extras: THREE.Material[] = [];
  return {
    toon(color, opts) {
      const c = new THREE.Color(color);
      const e = opts?.emissive !== undefined ? new THREE.Color(opts.emissive).getHexString() : "";
      const key = `${c.getHexString()}|${e}|${opts?.emissiveIntensity ?? ""}`;
      let m = cache.get(key);
      if (!m) {
        m = new THREE.MeshToonMaterial({ color: c, gradientMap: gradientMap() });
        if (opts?.emissive !== undefined) {
          m.emissive.set(opts.emissive);
          m.emissiveIntensity = opts.emissiveIntensity ?? 1;
        }
        cache.set(key, m);
      }
      return m;
    },
    vertexToon(extra = {}) {
      const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(), ...extra });
      extras.push(m);
      return m;
    },
    dispose() {
      for (const m of cache.values()) m.dispose();
      for (const m of extras) m.dispose();
      cache.clear();
      gradient?.dispose();
      gradient = null;
    },
  };
}

/** Moves an object (and its descendants) to the no-outline layer. */
export function noOutline(obj: THREE.Object3D) {
  obj.traverse((o) => o.layers.set(NO_OUTLINE_LAYER));
}

type Maskable = THREE.Mesh | THREE.Sprite;
type MaskMat = THREE.SpriteMaterial | THREE.MeshBasicMaterial;
interface MaskEntry {
  src: Maskable;
  twin: Maskable;
}

/**
 * Ink masks: readable labels (canvas tags, plaques, signs) tagged with `inkMask()` get a cheap twin in
 * this private scene. The outline pass draws the visible twins into its prepass alpha (depth-tested),
 * and skips ink wherever a label is in front, so lines of the geometry behind a label never cross its
 * text. The twins live outside the world graph, so nobody's traversals (layers, disposal, colliders,
 * raycasts) ever see them; each frame they copy their label's world matrix, visibility and opacity.
 */
const maskScene = new THREE.Scene();
maskScene.matrixWorldAutoUpdate = false;
const maskEntries: MaskEntry[] = [];
const maskMats = new Map<THREE.Material, MaskMat>();

/**
 * Mask material for a label material: writes nothing to the normal channels and multiplies the
 * prepass alpha by (1 − coverage). One per source material (shared atlases share it); it and its twins
 * go away when the source material is disposed.
 */
function maskMaterial(src: THREE.Material, sprite: boolean): MaskMat {
  const hit = maskMats.get(src);
  if (hit) return hit;
  const map = (src as THREE.MeshBasicMaterial).map ?? null;
  // Opaque plates mask their whole quad; transparent tags only where the canvas has paint.
  const params = {
    map: src.transparent || src.alphaTest > 0 ? map : null,
    alphaTest: src.alphaTest,
    opacity: src.opacity,
    fog: false,
  };
  const m: MaskMat = sprite
    ? new THREE.SpriteMaterial({ ...params, sizeAttenuation: (src as THREE.SpriteMaterial).sizeAttenuation })
    : new THREE.MeshBasicMaterial({ ...params, side: src.side });
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.ZeroFactor;
  m.blendDst = THREE.OneFactor;
  m.blendSrcAlpha = THREE.ZeroFactor;
  m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  m.transparent = true;
  m.depthWrite = false;
  const onDispose = () => {
    src.removeEventListener("dispose", onDispose);
    maskMats.delete(src);
    for (let i = maskEntries.length - 1; i >= 0; i--) {
      const e = maskEntries[i];
      if (e && e.twin.material === m) {
        maskScene.remove(e.twin);
        maskEntries.splice(i, 1);
      }
    }
    m.dispose();
  };
  src.addEventListener("dispose", onDispose);
  maskMats.set(src, m);
  return m;
}

/**
 * Opt-in: the label meshes/sprites under `obj` stop the ink outline from crossing them. Only tag
 * readable labels — never particles, glows or mist. Call once the label has its final material.
 */
export function inkMask(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o.userData.inkMasked) return;
    const sprite = (o as THREE.Sprite).isSprite === true;
    const mesh = (o as THREE.Mesh).isMesh === true && !(o as THREE.InstancedMesh).isInstancedMesh;
    const src = (o as Maskable).material;
    if ((!sprite && !mesh) || !src || Array.isArray(src)) return;
    const mat = maskMaterial(src, sprite);
    let twin: Maskable;
    if (sprite) {
      const s = new THREE.Sprite(mat as THREE.SpriteMaterial);
      s.center = (o as THREE.Sprite).center;
      twin = s;
    } else twin = new THREE.Mesh((o as THREE.Mesh).geometry, mat);
    twin.matrixAutoUpdate = false;
    twin.frustumCulled = o.frustumCulled;
    twin.visible = false;
    o.userData.inkMasked = true;
    maskScene.add(twin);
    maskEntries.push({ src: o as Maskable, twin });
  });
}

/**
 * Syncs every twin with its label (call after the world's matrices are updated) and returns the mask
 * scene when at least one label of `root` is visible, else null (the outline pass then skips the draw).
 */
export function inkMaskScene(root: THREE.Object3D): THREE.Scene | null {
  let any = false;
  for (const e of maskEntries) {
    let o: THREE.Object3D | null = e.src;
    let shown = true;
    while (o.parent) {
      if (!o.visible) shown = false;
      o = o.parent;
    }
    shown &&= o === root && o.visible;
    e.twin.visible = shown;
    if (!shown) continue;
    any = true;
    e.twin.matrixWorld.copy(e.src.matrixWorld);
    (e.twin.material as MaskMat).opacity = (e.src.material as THREE.Material).opacity;
  }
  return any ? maskScene : null;
}

/** Number of tagged labels (tests / debugging). */
export function inkMaskCount() {
  return maskEntries.length;
}
