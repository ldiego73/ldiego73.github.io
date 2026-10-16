/**
 * Contract of the generic suyu runtime (./index.ts `mountSuyu`): what a world folder hands the runtime (a
 * `SuyuDef`) and what its ambients receive (`SuyuEnv`). The Cusco hub (../cusco/) is the first world built on
 * it; the coast (Chinchaysuyu), Lake Titicaca (Collasuyu) and the Colca canyon (Kuntisuyu) come next. The
 * Antisuyu jungle (../selva/) and the mountain keep their own runtimes; this contract borrows their shapes
 * (the mountain's Trail, Pose, Collider, WorldEnv, CreateAmbient) so ambients are written the same way.
 *
 * Shape of a suyu world: a heightfield with a road (`trail`, t 0 → 1) and stations (plazas) along or around it,
 * optional water (`isWater` / `waterDist`, e.g. the Pacific, the lake) and anything else the world adds through
 * its ambients. World-specific queries (a river, a canoe route, a canopy deck) belong in the world's own layout
 * type that extends `SuyuLayout`, never here.
 *
 * Plugging a world in (see ARCHITECTURE.md, "Adding a suyu world"):
 *   src/world/<id>/def.ts       exports a `SuyuDef` (stations, layout builder, ambients glob, copy, music, …)
 *   src/world/<id>/layout.ts    pure layout implementing (or extending) SuyuLayout, with tests
 *   src/world/<id>/ambient/*.ts `create: CreateAmbient` modules, globbed by the world (literal glob in def.ts)
 *   src/pages/[lang]/world/<id>.astro  loader + build-time text mode, then `mountSuyu(host, opts, def)`
 * Keep this file stable: every suyu world depends on it.
 */
import type * as THREE from "three";
import type { Track } from "../../audio";
import type { Outfit } from "../avatar";
import type { FollowCam } from "../camera";
import type { Collider, L, Lang, Pose, Trail, WorldEnv } from "../contract";
import type { WorldData } from "../data";
import type { Quality } from "../engine";
import type { StampKind, WorldId } from "../events";
import type { PostcardWorld } from "../journey";
import type { LoadStep } from "../loader";
import type { TextMode } from "../textmode";
import type { ToonCache } from "../toon";

export interface SuyuStation {
  /** Stable id: plazas, fast travel and the stamp `<world>:station:<id>` use it. */
  id: string;
  /** Free-form per world ("gate", "usnu", "company", …): ambients place their content by kind or id. */
  kind: string;
  /** Position along the road, 0 → 1 (the layout decides how t, side and offset become a pose). */
  t: number;
  side: -1 | 1;
  offset: number;
  label: L;
  /**
   * Passport stamp on arrival (within `visit.radius` of its plaza): `"station"` by default; another kind
   * (e.g. "egg" for a bonus find), or `false` for no stamp (a gate). Only kinds lib/passport.ts treats as
   * required gate the page's completion, so pick the kind together with the CATALOG entry.
   */
  stamp?: StampKind | false;
  /** Visit radius for this station's stamp (default SuyuDef.visit.radius); small for a hidden find. */
  visit?: number;
}

export interface SuyuPlaza {
  id: string;
  x: number;
  z: number;
  r: number;
  y: number;
}

export interface SuyuLayout {
  trail: Trail;
  heightAt(x: number, z: number): number;
  /** Ground the traveler walks on (heightAt unless the world raises it); decks come from ../decks.ts. */
  groundAt(x: number, z: number): number;
  /** Pose of a station: position on its plaza, yaw facing the way the traveler arrives (the road). */
  stationPose(id: string): Pose;
  walkable(x: number, z: number): boolean;
  addWalkable(c: Collider): void;
  addCollider(c: Collider): void;
  colliders: Collider[];
  plazas: SuyuPlaza[];
  isWater(x: number, z: number): boolean;
  /** Distance to the shore line (negative in water); a world without water returns a large positive value. */
  waterDist(x: number, z: number): number;
  /** Open ground: not road, plaza, water or steep slope. Vegetation, fauna and props use it. */
  isGround(x: number, z: number): boolean;
  /** Distance to the road centerline, the closest t and the road height there. */
  trailQuery(x: number, z: number): { d: number; t: number; y: number };
  grid: { n: number; size: number; h: Float32Array };
  bounds: { x0: number; z0: number; x1: number; z1: number };
}

/** Suyu helpers handed to ambients next to the WorldEnv contract. */
export interface SuyuExtra {
  /** Which world this is (ambients shared between suyu worlds branch on it). */
  world: WorldId;
  layout: SuyuLayout;
  /** Ground including the highest registered deck (people and animals stand on planks and platforms). */
  groundAt(x: number, z: number): number;
  isGround(x: number, z: number): boolean;
  /** Random open-ground point (y on the ground), optionally within r of (x, z); null if none found. */
  randomGroundPoint(rand?: () => number, near?: { x: number; z: number; r: number }): THREE.Vector3 | null;
  isWater(x: number, z: number): boolean;
  waterDist(x: number, z: number): number;
  trailDistance(x: number, z: number): { d: number; t: number };
}

export type SuyuEnv = WorldEnv & { suyu: SuyuExtra };

/** What the scenery builder returns (terrain, water, vegetation, far backdrop; the world's static set). */
export interface SuyuScenery {
  group: THREE.Group;
  update(dt: number, time: number, env: SuyuEnv): void;
  /** 0 day … 1 night (after the sky updated this frame). */
  setNight?(night: number): void;
  dispose(): void;
}

export type CreateSuyuScenery = (layout: SuyuLayout, toon: ToonCache, quality: Quality) => SuyuScenery;

/** Lazy module record of a literal `import.meta.glob` in the world folder (the glob must stay literal there). */
export type ModuleRecord = Record<string, () => Promise<unknown>>;

/** Where to start: road t facing along the road, or an explicit point and facing (yaw: models face +Z). */
export type SpawnPoint = { t: number } | { x: number; z: number; yaw: number };

export interface SuyuAtmosphere {
  /** Weather hook (sky.ts setWeather): 0..1 fog, 0..1 cover. */
  fog: number;
  cover: number;
  /** Daytime fog colour lerp (after the sky's own colour), faded out at night. */
  tint?: { color: THREE.ColorRepresentation; amount: number };
  /** Scales applied to the sky's fog near / far every frame (1 = the mountain's air). */
  near?: number;
  far?: number;
  /** Ink outline fade distances (the mountain uses 170..560). */
  inkFade?: [number, number];
}

/** Context handed to a world's runtime hooks (camera occluders, per-frame extras). */
export interface SuyuHookCtx<Lay extends SuyuLayout = SuyuLayout> {
  layout: Lay;
  env: SuyuEnv;
  cam: FollowCam;
  scene: THREE.Scene;
}

export interface SuyuHooks {
  /** Every frame after the traveler moved (pos is the traveler's feet). */
  update?(dt: number, time: number, pos: THREE.Vector3): void;
  dispose?(): void;
}

export interface SuyuMapDef {
  title: L;
  /** Canvas description (screen readers): what is where on the sheet. */
  canvas: L;
  /** Stamp that unlocks fast travel (null: open from the start). */
  unlockStamp: string | null;
  /** Hint while fast travel is locked (what to reach). */
  hintLocked: L;
  /** Toast when fast travel unlocks. */
  unlocked: L;
  /** Optional legend line under the station list. */
  legend?: L;
  /** Station dot colour (visited); default a khipu dye per index. */
  dye?(id: string): string;
  /** Map padding around the road and stations, in world units (default 26). */
  pad?: number;
  /** Max width / height of the sheet (default 2.2: a wide strip); 1 for a square hub. */
  maxAspect?: number;
  /** Extra vector marks drawn on the sheet (punku signs, a totem), in world coordinates. */
  marks?(layout: SuyuLayout): Array<{ x: number; z: number; label?: string; color: string }>;
  /** Draw the layout's trail as the road (default true; the hub draws its own roads instead). */
  trail?: boolean;
  /** Paved areas (the hub's plaza, a platform) as closed polygons, filled like the road and inked. */
  areas?(layout: SuyuLayout): Array<Array<{ x: number; z: number }>>;
  /** Extra polylines (the hub's five roads), drawn like the road. */
  roads?(layout: SuyuLayout): Array<Array<{ x: number; z: number }>>;
}

export interface SuyuDef<Lay extends SuyuLayout = SuyuLayout> {
  world: WorldId;
  /** Display name ("Qusqu", "Chinchaysuyu"): photo place fallback, logs. */
  name: L;
  stations: ReadonlyArray<SuyuStation>;
  buildLayout(o: { cells: number }): Lay;
  /** Heightfield cells per side by tier (default 280 / 190 / 160 like the jungle). */
  cells?: { high: number; low: number; phone: number };
  /** Static scenery; while missing or failing, ./fallback-ground.ts paints the heightfield. */
  createScenery?: (layout: Lay, toon: ToonCache, quality: Quality) => SuyuScenery;
  /** The world's own `import.meta.glob(["./ambient/*.ts", "!./ambient/*.test.ts"])` (literal in its folder). */
  ambients: ModuleRecord;
  /** Loader copy (title + the steps the runtime reports). */
  loader: Record<Lang, Record<LoadStep | "title", string>>;
  /** Accessible text mode (K, `world:textmode`, the chrome chip); the page renders the same document at build. */
  textMode(host: HTMLElement, lang: Lang, data: WorldData): TextMode;
  /** Day / night tracks through the shared audio player (default the world tracks). */
  music?: { day?: Track; night?: Track };
  atmosphere: SuyuAtmosphere;
  /** Default start, and per origin world (`?from=<world>`; the page's arrival is read by ./arrival.ts). */
  spawn: { default: SpawnPoint; from?: Partial<Record<WorldId, SpawnPoint>> };
  outfit: Outfit;
  /** Photo-mode place when no station is near. */
  place: { id: string; label: L };
  /** Station visits: plaza radius for the stamp (`<world>:station:<id>`). */
  visit: { radius: number };
  map: SuyuMapDef;
  /** Help overlay copy (controls), shown by ./hud.ts. */
  help: { title: L; lines: Record<Lang, string[]> };
  /** Which postcard the passport's "My postcard" opens (journey-card.ts; default the mountain's). */
  postcard?: PostcardWorld;
  /** Optional runtime hooks (camera occluder proxies, per-frame extras). */
  hooks?(ctx: SuyuHookCtx<Lay>): SuyuHooks | undefined;
}
