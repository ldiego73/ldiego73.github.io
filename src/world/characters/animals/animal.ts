/**
 * One animal as a scene object: a skinned body (one draw call, plus its ink and shadow passes) on its own
 * skeleton, posed every frame by its family's animator. For a mount, a hero animal, a pet or a few animals
 * near the trail. Herds and flocks use ./crowd.ts instead (one instanced draw per LOD for all of them).
 *
 *   const vicuna = createAnimal("vicuna", { variant: "default", seed: 3 });
 *   scene.add(vicuna.group);
 *   // every frame, after the world moved vicuna.group:
 *   vicuna.update(dt, t, { speed, rm, look, windX });
 *
 * Geometry is built once per (species, LOD) and shared (../character.ts characterAsset); `loadAnimal` builds it
 * off the main thread first (./assets.ts). `setLod` swaps the geometry on the same skeleton; `autoLod(camera)`
 * picks it from the distance.
 */
import type * as THREE from "three";
import { type CharacterInstance, characterAsset, createCharacter } from "../character";
import { paletteColors } from "../material";
import { BirdAnimator, type BirdState } from "./anim-bird";
import { type AnimalMode, type AnimalState, QuadAnimator } from "./anim-quad";
import { SwimAnimator } from "./anim-swim";
import type { IdleAction } from "./behaviour";
import { buildAnimal } from "./build";
import { eyeAtlas } from "./eyes";
import { type Lod, lodFor } from "./lod";
import { withNightRim } from "./night";
import type { AnimalSpec } from "./spec";
import { type SpeciesKey, speciesOf } from "./species";

export type { AnimalMode, AnimalState, BirdState };

export interface AnimalOptions {
  /** Coat variant (spec.variants key) or a full palette. */
  variant?: string | readonly string[];
  /** Starting LOD (default 0). */
  lod?: Lod;
  /** Desynchronises gaits and idles between animals. */
  seed?: number;
  /** Optional parts shown: the llama's "tika" (default on) and "pack" (default off). */
  features?: Record<string, boolean>;
  /** Cast shadows (default true). */
  shadows?: boolean;
}

export interface Animator {
  hold: number | null;
  features: Record<string, boolean>;
  update(dt: number, t: number, s: AnimalState & Partial<BirdState>): void;
  play(a: Exclude<IdleAction, "none">, seconds?: number): void;
  lunge?(): void;
}

export interface Animal {
  spec: AnimalSpec;
  group: THREE.Group;
  inst: CharacterInstance;
  anim: Animator;
  lod: Lod;
  update(dt: number, t: number, s: AnimalState & Partial<BirdState>): void;
  /** Freeze the gait at a cycle phase (0..1), or null to run (harness strips). */
  hold(phase: number | null): void;
  setVariant(v: string | readonly string[]): void;
  setLod(lod: Lod): void;
  /** Pick the LOD from the camera distance (call a few times a second). Hides the animal beyond the far band. */
  autoLod(camera: THREE.Camera, k?: number): void;
  dispose(): void;
}

export function paletteOf(spec: AnimalSpec, v?: string | readonly string[]): readonly string[] {
  if (Array.isArray(v)) return v as readonly string[];
  if (typeof v === "string" && spec.variants?.[v]) return spec.variants[v] as readonly string[];
  return spec.palette;
}

export function animatorFor(spec: AnimalSpec, rig: CharacterInstance | import("./anim-quad").Rig, seed: number) {
  const m = spec.motion;
  if (m.kind === "bird") return new BirdAnimator(rig, m, seed) as Animator;
  if (m.kind === "swim") return new SwimAnimator(rig, m, seed) as Animator;
  return new QuadAnimator(rig, m, seed) as Animator;
}

/** Geometry of a species at a LOD as a cached three asset. */
export function animalAsset(spec: AnimalSpec, lod: Lod) {
  return characterAsset(`animal:${spec.key}:${lod}`, () => buildAnimal(spec, lod));
}

export function createAnimal(key: SpeciesKey | string, o: AnimalOptions = {}): Animal {
  const spec = speciesOf(key);
  let lod: Lod = o.lod ?? 0;
  const asset = animalAsset(spec, lod);
  const inst = createCharacter(asset, { palette: paletteOf(spec, o.variant), face: eyeAtlas(spec.eye) });
  inst.group.name = `animal:${spec.key}`;
  // The moonlit night rim (./night.ts), driven by setAnimalNight from the world's sky.
  withNightRim(inst.body.material as THREE.Material, "ch-night");
  if (o.shadows === false) inst.body.castShadow = false;
  const anim = animatorFor(spec, inst, o.seed ?? 1);
  anim.features = { tika: true, pack: false, ...spec.features, ...o.features };
  const tmp = { x: 0, y: 0, z: 0 };
  const a: Animal = {
    spec,
    group: inst.group,
    inst,
    anim,
    get lod() {
      return lod;
    },
    update: (dt, t, s) => anim.update(dt, t, s),
    hold: (p) => {
      anim.hold = p;
    },
    setVariant(v) {
      inst.uniforms.chPal.value = paletteColors(paletteOf(spec, v));
    },
    setLod(l) {
      if (l === lod) return;
      lod = l;
      inst.body.geometry = animalAsset(spec, l).body;
    },
    autoLod(camera, k = 1) {
      const p = inst.group.getWorldPosition(camera.position.clone());
      tmp.x = p.x - camera.position.x;
      tmp.y = p.y - camera.position.y;
      tmp.z = p.z - camera.position.z;
      const l = lodFor(Math.hypot(tmp.x, tmp.y, tmp.z), spec.size, undefined, k);
      inst.group.visible = l >= 0;
      if (l !== -1) a.setLod(l);
    },
    dispose: () => inst.dispose(),
  } as Animal;
  return a;
}
