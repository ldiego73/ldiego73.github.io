/**
 * Contract of the Antisuyu jungle world ("selva", page /{lang}/world/selva/). The mountain's types are reused
 * (Trail, Pose, Collider, WorldEnv, CreateAmbient from ../contract), so ambients are written the same way;
 * jungle-only helpers live on `env.selva` (type SelvaEnv).
 *
 * Shape of the world: not a climb but a long, mostly flat road through the lowland forest, west → east,
 * following a wide brown river. Stations sit along the road like the mountain's tambos (t, side, offset).
 * Between the embarcadero and the palafitos the river can be travelled by canoe (optional shortcut, a stamp);
 * near the end the road climbs onto a canopy walkway of hanging bridges between ceibas.
 *
 * Module map (each file has one owner):
 *   layout.ts      pure heightfield, trail, river, stations, walkable, canoe route, canopy deck (tested)
 *   scenery.ts     terrain mesh, river water, forest, ceibas, palms, mist, canopy walkway, landings
 *   index.ts       runtime: engine, sky, camera, input, avatar, HUD, ambients, travel back to the mountain
 *   ambient/*.ts   drop-in systems exporting `create: CreateAmbient` (fauna, stations content, canoe)
 * Keep this file stable; change it only by agreement (the lead edits it).
 */
import type * as THREE from "three";
import type { Collider, L, Pose, Trail, WorldEnv } from "../contract";

export type SelvaStationKind = "gate" | "uses" | "blog" | "landing" | "projects" | "arcade" | "collpa";

export interface SelvaStation {
  id: string;
  kind: SelvaStationKind;
  /** Position along the road, 0 (punku arrival, west) → 1 (collpa, east). */
  t: number;
  side: -1 | 1;
  offset: number;
  label: L;
}

/** West → east. Passport stamps are `selva:station:<id>`. */
export const SELVA_STATIONS: SelvaStation[] = [
  {
    id: "puerto",
    kind: "gate",
    t: 0.02,
    side: 1,
    offset: 4,
    label: { es: "Punku del Antisuyu", en: "Antisuyu gateway" },
  },
  {
    id: "regaton",
    kind: "uses",
    t: 0.15,
    side: -1,
    offset: 7,
    label: { es: "Bote del regatón · Lo que uso", en: "Trader's boat · What I use" },
  },
  {
    id: "maloca",
    kind: "blog",
    t: 0.3,
    side: 1,
    offset: 9,
    label: { es: "Maloca de relatos · Blog", en: "Story maloca · Blog" },
  },
  {
    id: "embarcadero",
    kind: "landing",
    t: 0.42,
    side: -1,
    offset: 6,
    label: { es: "Embarcadero", en: "Canoe landing" },
  },
  {
    id: "palafitos",
    kind: "projects",
    t: 0.6,
    side: -1,
    offset: 9,
    label: { es: "Palafitos de proyectos", en: "Project stilt houses" },
  },
  {
    id: "arcade",
    kind: "arcade",
    t: 0.76,
    side: 1,
    offset: 9,
    label: { es: "Arcade flotante", en: "Floating arcade" },
  },
  {
    id: "collpa",
    kind: "collpa",
    t: 0.97,
    side: -1,
    offset: 8,
    label: { es: "Collpa de guacamayos", en: "Macaw clay lick" },
  },
];

/** Canoe stretch: from the embarcadero landing down the river to the palafitos landing. */
export const CANOE_STRETCH = { fromStation: "embarcadero", toStation: "palafitos" } as const;
/** Canopy walkway: the road leaves the ground on hanging bridges between ceibas over this t range. */
export const CANOPY_T: readonly [number, number] = [0.83, 0.9];

export interface SelvaPlaza {
  id: string;
  x: number;
  z: number;
  r: number;
  y: number;
}

export interface River {
  /** Centerline polyline [x, z], upstream (west) → downstream (east). */
  pts: Array<[number, number]>;
  /** Half width of the water at each point (same length as pts). */
  halfWidth: number[];
  /** Water surface height (flat lowland river). */
  level: number;
}

export interface SelvaLayout {
  trail: Trail;
  heightAt(x: number, z: number): number;
  /** Ground of the road: heightAt, except on the canopy walkway. Station decks come from ../decks.ts. */
  groundAt(x: number, z: number): number;
  stationPose(id: string): Pose;
  walkable(x: number, z: number): boolean;
  addWalkable(c: Collider): void;
  addCollider(c: Collider): void;
  colliders: Collider[];
  plazas: SelvaPlaza[];
  river: River;
  isWater(x: number, z: number): boolean;
  /** Distance to the river's bank line (negative inside the water). */
  riverDist(x: number, z: number): number;
  /** Open forest floor: not road, plaza, water, deck or steep bank. Vegetation and fauna use it. */
  isGround(x: number, z: number): boolean;
  /** Distance to the road centerline, the closest t and the road height there. */
  trailQuery(x: number, z: number): { d: number; t: number; y: number };
  /** Canoe route on the water between the two landings: polyline [x, z] at river level, and both ends. */
  canoe: { path: Array<[number, number]>; from: THREE.Vector3; to: THREE.Vector3 };
  /** Walkway deck height for a road t inside CANOPY_T (null outside). */
  canopyDeckAt(t: number): number | null;
  grid: { n: number; size: number; h: Float32Array };
  bounds: { x0: number; z0: number; x1: number; z1: number };
}

/** Jungle helpers handed to ambients next to the WorldEnv contract. */
export interface SelvaExtra {
  layout: SelvaLayout;
  groundAt(x: number, z: number): number;
  isGround(x: number, z: number): boolean;
  /** Random open-floor point (y on the ground), optionally within r of (x, z); null if none found. */
  randomGroundPoint(rand?: () => number, near?: { x: number; z: number; r: number }): THREE.Vector3 | null;
  isWater(x: number, z: number): boolean;
  riverDist(x: number, z: number): number;
  trailDistance(x: number, z: number): { d: number; t: number };
}

export type SelvaEnv = WorldEnv & { selva: SelvaExtra };
