/**
 * New characters (prototype, not imported by any world yet): one continuous skinned surface per body, built
 * procedurally at load time from a signed distance field (./sdf.ts, ./surface-nets.ts), with cloth on the shared
 * wind, hair and braids on springs, a painted face decal, and procedural idle / walk / run.
 *
 *   createTraveler()   the player avatar ("andean" outfit)
 *   createCampesina()  an Andean highland woman
 *   createLlama()      the mountain's llama
 *
 * Each returns { group, update(dt, t, state), stats, dispose }. Geometry is built once per archetype and
 * cached; textures (face atlases, the cloth pattern atlas) are shared.
 */
import type * as THREE from "three";
import { type Expression, HumanAnimator, type HumanStyle, type Mode } from "./anim-human";
import { LlamaAnimator } from "./anim-llama";
import { type Built, buildArchetype } from "./build";
import { CAMPESINA_PALETTE, campesinaBones, campesinaPieces } from "./campesina";
import { type CharacterInstance, characterAsset, createCharacter } from "./character";
import { type FaceStyle, humanFace, llamaFace } from "./face";
import { LLAMA_PALETTE, llamaBones, llamaPieces } from "./llama";
import { clothAtlas } from "./patterns";
import { TRAVELER_PALETTE, travelerBones, travelerPieces } from "./traveler";

export type { Expression, Mode };

export interface CharacterState {
  mode: Mode;
  rm: boolean;
  expression: Expression;
  /** Wind at the character in its own frame (x left, z forward), from liveWind. */
  windX?: number;
  windZ?: number;
}

export interface NewCharacter {
  group: THREE.Group;
  inst: CharacterInstance;
  stats: Built["stats"];
  update(dt: number, t: number, s: CharacterState): void;
  /** Freeze the gait at a cycle phase (0..1), or null to run. */
  hold(phase: number | null): void;
  dispose(): void;
}

let atlas: THREE.CanvasTexture | null = null;
const clothTex = () => {
  atlas ??= clothAtlas();
  return atlas;
};
const faces = new Map<string, THREE.CanvasTexture>();
const faceTex = (key: string, s: FaceStyle) => {
  let t = faces.get(key);
  if (!t) {
    t = humanFace(s);
    faces.set(key, t);
  }
  return t;
};

export const TRAVELER_FACE: FaceStyle = {
  iris: "#2a1810",
  irisLow: "#7a4a2a",
  lash: "#24150f",
  brow: "#3a2418",
  mouth: "#7a3a2c",
  blush: "#e2726a",
  blushK: 0.45,
  eyeX: 62,
  eyeY: -18,
  eyeW: 44,
  eyeH: 58,
  flicks: 0,
  mouthY: 76,
  browUp: 12,
};

export const TRAVELER_STYLE: HumanStyle = {
  walkCycle: 0.95,
  runCycle: 2.0,
  walkSpeed: 1.25,
  runSpeed: 3.4,
  armSwing: 0.5,
  armOut: 0.05,
  hipSway: 1,
  stance: 0.095,
  hangs: [
    { bones: ["tip"], dir: "up", k: 70, zeta: 0.3, gainAcc: 0.03, gainVel: 0.1, limit: 0.5 },
    { bones: ["pompom"], dir: "up", k: 90, zeta: 0.25, gainAcc: 0.02, gainVel: 0.06, limit: 0.4 },
    {
      bones: ["tasselL0", "tasselL1"],
      dir: "down",
      k: 45,
      zeta: 0.22,
      gainAcc: 0.04,
      gainVel: 0.22,
      limit: 1.0,
      hipSway: 0.4,
    },
    {
      bones: ["tasselR0", "tasselR1"],
      dir: "down",
      k: 45,
      zeta: 0.22,
      gainAcc: 0.04,
      gainVel: 0.22,
      limit: 1.0,
      hipSway: 0.4,
    },
    { bones: ["poncho"], dir: "down", k: 40, zeta: 0.45, gainAcc: 0.015, gainVel: 0.06, limit: 0.35, hipSway: 0.3 },
    { bones: ["pack"], dir: "down", k: 110, zeta: 0.35, gainAcc: 0.012, gainVel: 0.01, limit: 0.15 },
  ],
};

export function createTraveler(): NewCharacter {
  const asset = characterAsset("traveler", () => {
    const bones = travelerBones();
    return buildArchetype(bones, travelerPieces(bones));
  });
  const inst = createCharacter(asset, {
    palette: TRAVELER_PALETTE,
    face: faceTex("traveler", TRAVELER_FACE),
    pattern: clothTex(),
    clothAmp: 0.3,
  });
  const anim = new HumanAnimator(inst, TRAVELER_STYLE);
  return wrap(
    inst,
    asset.built.stats,
    (dt, t, s) => anim.update(dt, t, s),
    (p) => (anim.hold = p),
  );
}

export const CAMPESINA_FACE: FaceStyle = {
  ...TRAVELER_FACE,
  iris: "#24140d",
  irisLow: "#6e3f24",
  lash: "#1c100b",
  brow: "#22140e",
  mouth: "#8a3a34",
  blush: "#e0606a",
  blushK: 0.55,
  eyeH: 56,
  flicks: 2,
  browUp: 14,
};

export const CAMPESINA_STYLE: HumanStyle = {
  walkCycle: 0.85,
  runCycle: 1.8,
  walkSpeed: 1.05,
  runSpeed: 3.0,
  armSwing: 0.35,
  armOut: 0.08,
  hipSway: 1.5,
  stance: 0.085,
  arms: "clasp",
  hangs: [
    {
      bones: ["braidL0", "braidL1", "braidL2"],
      dir: "down",
      k: 28,
      zeta: 0.25,
      gainAcc: 0.03,
      gainVel: 0.08,
      limit: 0.7,
      hipSway: 0.5,
    },
    {
      bones: ["braidR0", "braidR1", "braidR2"],
      dir: "down",
      k: 28,
      zeta: 0.25,
      gainAcc: 0.03,
      gainVel: 0.08,
      limit: 0.7,
      hipSway: 0.5,
    },
    { bones: ["skirt"], dir: "down", k: 32, zeta: 0.35, gainAcc: 0.012, gainVel: 0.04, limit: 0.22, hipSway: 1.2 },
  ],
};

export function createCampesina(): NewCharacter {
  const asset = characterAsset("campesina", () => {
    const bones = campesinaBones();
    return buildArchetype(bones, campesinaPieces(bones));
  });
  const inst = createCharacter(asset, {
    palette: CAMPESINA_PALETTE,
    face: faceTex("campesina", CAMPESINA_FACE),
    pattern: clothTex(),
    clothAmp: 0.32,
  });
  const anim = new HumanAnimator(inst, CAMPESINA_STYLE);
  return wrap(
    inst,
    asset.built.stats,
    (dt, t, s) => anim.update(dt, t, s),
    (p) => (anim.hold = p),
  );
}

let llamaEyes: THREE.CanvasTexture | null = null;

export function createLlama(): NewCharacter {
  const asset = characterAsset("llama", () => {
    const bones = llamaBones();
    return buildArchetype(bones, llamaPieces(bones));
  });
  llamaEyes ??= llamaFace();
  const inst = createCharacter(asset, { palette: LLAMA_PALETTE, face: llamaEyes });
  const anim = new LlamaAnimator(inst);
  return wrap(
    inst,
    asset.built.stats,
    (dt, t, s) => anim.update(dt, t, s),
    (p) => (anim.hold = p),
  );
}

function wrap(
  inst: CharacterInstance,
  stats: Built["stats"],
  update: NewCharacter["update"],
  hold: NewCharacter["hold"],
): NewCharacter {
  return { group: inst.group, inst, stats, update, hold, dispose: () => inst.dispose() };
}
