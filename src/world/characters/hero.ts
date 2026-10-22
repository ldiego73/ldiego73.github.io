/**
 * One human drawn on its own (a SkinnedMesh, 1–2 draw calls): the traveler, and any NPC that is always close to
 * the camera (a storyteller, a vendor you talk to). Crowds use ./crowd.ts instead.
 *
 * The first frame never waits on a full build: the character starts with whatever LOD is ready (or builds the
 * far LOD on the spot, a few milliseconds), asks the pipeline (./pipeline.ts, a worker) for the LOD it wants,
 * and swaps the geometry in when it arrives. The skeleton is the same at every LOD, so the swap is invisible
 * apart from the detail sharpening.
 */
import type * as THREE from "three";
import { HumanAnimator, type HumanState } from "./anim-human";
import { type HumanSpec, type Lod, rigOf } from "./archetype";
import { type CharacterInstance, createCharacter } from "./character";
import { humanFace } from "./face";
import { FACE_STYLES } from "./faces";
import { clothAtlas } from "./patterns";
import { bestHuman, buildHumanNow, requestHuman } from "./pipeline";
import { type Dress, dress } from "./slots";

let atlas: THREE.CanvasTexture | null = null;
const faces = new Map<number, THREE.CanvasTexture>();

/** The shared cloth pattern atlas (./patterns.ts). */
export function sharedClothAtlas(): THREE.CanvasTexture {
  atlas ??= clothAtlas();
  return atlas;
}

/** A face atlas (4 expression cells) for a face row of ./faces.ts, cached. */
export function faceTexture(row: number): THREE.CanvasTexture {
  let t = faces.get(row);
  if (!t) {
    t = humanFace(FACE_STYLES[row] ?? (FACE_STYLES[0] as (typeof FACE_STYLES)[number]));
    faces.set(row, t);
  }
  return t;
}

export interface Human {
  group: THREE.Group;
  inst: CharacterInstance;
  anim: HumanAnimator;
  meta: ReturnType<typeof rigOf>;
  /** LOD drawn now. */
  readonly lod: Lod;
  update(dt: number, t: number, s: HumanState): void;
  /** Ask for another LOD (swapped in when built). */
  setLod(lod: Lod): void;
  /** Resolves when the wanted LOD is drawn. */
  ready(): Promise<void>;
  dispose(): void;
}

export interface HumanOpts {
  /** LOD to show (default 0, near). */
  lod?: Lod;
  seed?: number;
  /** Cloth wind amplitude (wool ≈ 0.3). */
  clothAmp?: number;
}

export function createHuman(spec: HumanSpec, palette: readonly string[] | Dress, o: HumanOpts = {}): Human {
  const meta = rigOf(spec);
  let want: Lod = o.lod ?? 0;
  const first = bestHuman(spec, want) ?? buildHumanNow(spec, 2);
  let lod = first.lod;
  const pal = Array.isArray(palette) ? (palette as readonly string[]) : dress(palette as Dress);
  const inst = createCharacter(first, {
    palette: pal,
    face: faceTexture(meta.face),
    pattern: sharedClothAtlas(),
    clothAmp: o.clothAmp ?? 0.3,
  });
  const anim = new HumanAnimator(inst, meta.style, { seed: o.seed ?? 0 });
  let disposed = false;
  let waiting: Promise<void> = Promise.resolve();
  const fetch = () => {
    if (lod === want) return;
    const target = want;
    waiting = requestHuman(spec, target, 0)
      .then((a) => {
        if (disposed || want !== target) return;
        inst.setAsset(a);
        lod = a.lod;
      })
      .catch((e) => console.warn("characters: build failed", e));
  };
  fetch();
  return {
    group: inst.group,
    inst,
    anim,
    meta,
    get lod() {
      return lod;
    },
    update: (dt, t, s) => anim.update(dt, t, s),
    setLod(l) {
      want = l;
      fetch();
    },
    ready: () => waiting,
    dispose() {
      disposed = true;
      inst.dispose();
    },
  };
}
