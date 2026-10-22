/**
 * Characters: continuous skinned humans built procedurally from declarative specs. One surface per body
 * (signed distance field + surface nets), cloth layers on the shared wind, hair and braids on springs, a
 * painted face decal with expressions, procedural gaits and an action layer. See ARCHITECTURE.md
 * "Characters" for the whole picture; the entry points:
 *
 *   Specs and colours      HumanSpec (./archetype.ts), PEOPLE / TRAVELER presets and wardrobes (./presets.ts),
 *                          dress() and the slot table HS (./slots.ts)
 *   Builds                 requestHuman / prefetchHumans / buildHumanNow (./pipeline.ts): worker, cached, 3 LODs
 *   One character          createHuman(spec, palette) (./hero.ts): SkinnedMesh + HumanAnimator (the traveler)
 *   Crowds                 new HumanCrowd({ capacity }) (./crowd.ts): everyone in 2 draw calls, LOD by distance
 *   Animation              HumanAnimator (./anim-human.ts): locomotion, act("wave"…), look(), springs, face
 *   Held props             HeldProps (./props.ts): tools and loads in hands, instanced per kind
 */
export type { PlayOpts } from "./actions";
export { ONE_SHOT } from "./actions";
export type { Expression, HangSpec, HumanState, HumanStyle, Mode } from "./anim-human";
export { HumanAnimator } from "./anim-human";
export type {
  Age,
  BottomKind,
  Build,
  Feet,
  HairStyle,
  HatKind,
  HumanRig,
  HumanSpec,
  Layer,
  Lod,
  Sex,
  TopKind,
  TopSpec,
  WornKind,
} from "./archetype";
export { composeHuman, FACE, rigOf, specKey } from "./archetype";
export { CrowdMember, type CrowdOptions, HumanCrowd } from "./crowd";
export { createHuman, faceTexture, type Human, type HumanOpts, sharedClothAtlas } from "./hero";
export {
  bestHuman,
  buildHumanNow,
  type HumanAsset,
  peekHuman,
  pipelineStats,
  prefetchHumans,
  requestHuman,
} from "./pipeline";
export { ACTIONS, type Action } from "./poses";
export {
  CUSHMAS,
  DARKS,
  FESTIVE,
  GREY_HAIR,
  HAIRS,
  LIGHTS,
  type Outfit,
  PEOPLE,
  type PersonPreset,
  POLLERAS,
  PONCHOS,
  SKINS,
  TRAVELER,
  TRAVELER_DRESS,
  WEAVES,
  wardrobe,
} from "./presets";
export type { Rig } from "./rig";
export { DEFAULT_DRESS, type Dress, dress, HS, PALETTE_SIZE, type SlotName } from "./slots";
