/**
 * Contract between the two halves of the Andean world:
 *  - CORE (engine, terrain, Qhapaq Ñan trail, sky, day/night, toon + outline pipeline, title, camera, input)
 *    implements WorldEnv and owns src/world/index.ts orchestration.
 *  - CONTENT (avatar, stations along the trail, rope bridge, arcade house, observatory, chasqui post,
 *    construction plots, HUD panels, guided tour) consumes WorldEnv and exports the factories below.
 * Keep this file stable; change it only by agreement (the lead edits it).
 */
import type * as THREE from "three";

export type Lang = "es" | "en";
export type L = { es: string; en: string };

export type StationKind = "gate" | "company" | "bridge" | "arcade" | "ai" | "contact" | "build";

export interface Station {
  id: string;
  kind: StationKind;
  /** For kind "company": id from src/data/career.ts COMPANIES (education hangs at Xepelin's tambo). */
  companyId?: string;
  /** Position along the trail, 0 (start, valley) → 1 (summit). The trail winds; stations alternate sides. */
  t: number;
  /** Which side of the trail the station sits on (-1 left, 1 right), plus how far from the path. */
  side: -1 | 1;
  offset: number;
  label: L;
}

/** Chronological walk up the mountain: the career is the climb. */
export const STATIONS: Station[] = [
  { id: "gate", kind: "gate", t: 0.02, side: 1, offset: 4, label: { es: "Puerta del camino", en: "Trailhead" } },
  {
    id: "avances",
    kind: "company",
    companyId: "avances",
    t: 0.1,
    side: -1,
    offset: 6,
    label: { es: "Avances Tecnológicos", en: "Avances Tecnológicos" },
  },
  {
    id: "hundred",
    kind: "company",
    companyId: "hundred",
    t: 0.16,
    side: 1,
    offset: 6,
    label: { es: "Hundred", en: "Hundred" },
  },
  {
    id: "belcorp",
    kind: "company",
    companyId: "belcorp",
    t: 0.23,
    side: -1,
    offset: 7,
    label: { es: "Belcorp", en: "Belcorp" },
  },
  { id: "auna", kind: "company", companyId: "auna", t: 0.32, side: 1, offset: 8, label: { es: "Auna", en: "Auna" } },
  {
    id: "xepelin",
    kind: "company",
    companyId: "xepelin",
    t: 0.42,
    side: -1,
    offset: 8,
    label: { es: "Xepelin", en: "Xepelin" },
  },
  {
    id: "topsort",
    kind: "company",
    companyId: "topsort",
    t: 0.51,
    side: 1,
    offset: 7,
    label: { es: "TopSort", en: "TopSort" },
  },
  {
    id: "globant",
    kind: "company",
    companyId: "globant",
    t: 0.6,
    side: -1,
    offset: 8,
    label: { es: "Globant", en: "Globant" },
  },
  {
    id: "bridge",
    kind: "bridge",
    t: 0.68,
    side: 1,
    offset: 0,
    label: { es: "Puente de artefactos (Q'eswachaka)", en: "Artifact Bridge (Q'eswachaka)" },
  },
  { id: "arcade", kind: "arcade", t: 0.76, side: -1, offset: 10, label: { es: "Tambo arcade", en: "Arcade Tambo" } },
  { id: "ai", kind: "ai", t: 0.86, side: 1, offset: 9, label: { es: "Intihuatana de la IA", en: "AI Intihuatana" } },
  {
    id: "contact",
    kind: "contact",
    t: 0.96,
    side: -1,
    offset: 6,
    label: { es: "Puesto del chasqui", en: "Chasqui Post" },
  },
  {
    id: "build-1",
    kind: "build",
    t: 0.28,
    side: 1,
    offset: 16,
    label: { es: "Huerto de código", en: "Code garden" },
  },
  {
    id: "build-2",
    kind: "build",
    t: 0.55,
    side: -1,
    offset: 17,
    label: { es: "Khipu de escritos", en: "Writing khipu" },
  },
  {
    id: "build-3",
    kind: "build",
    t: 0.9,
    side: -1,
    offset: 15,
    label: { es: "En construcción", en: "Under construction" },
  },
];

export interface Pose {
  position: THREE.Vector3;
  /** Yaw (radians) the station faces: toward the trail. */
  yaw: number;
}

export type Collider =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; x0: number; z0: number; x1: number; z1: number };

export interface Trail {
  /** Total length in world units. */
  length: number;
  /** Optional `out` is filled and returned (no allocation per frame). */
  pointAt(t: number, out?: THREE.Vector3): THREE.Vector3;
  tangentAt(t: number, out?: THREE.Vector3): THREE.Vector3;
  /** Closest t on the trail to (x, z). */
  nearestT(x: number, z: number): number;
  /** Half-width of the stone path (walkable band around the spline). */
  halfWidth: number;
}

/** Day/night: 0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset. */
export interface Sky {
  time(): number;
  setTime(t: number): void;
  /** true between dusk and dawn; content turns lamps/torches on. */
  isNight(): boolean;
  onChange(cb: (t: number) => void): () => void;
}

export interface WorldEnv {
  lang: Lang;
  reducedMotion: boolean;
  quality: "low" | "high";
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Terrain height at (x, z) in world units. */
  heightAt(x: number, z: number): number;
  trail: Trail;
  /** World pose for a station from STATIONS (computed from trail + side + offset, snapped to terrain). */
  stationPose(id: string): Pose;
  /** Walkable test for the avatar (trail band, plazas, bridge deck, house interiors registered by content). */
  walkable(x: number, z: number): boolean;
  /** Content registers extra walkable areas (bridge deck, plazas) and solid colliders. */
  addWalkable(area: Collider): void;
  addCollider(c: Collider): void;
  sky: Sky;
  /** Shared toon material (3-step gradient), cached by color. Use for every lit object. */
  toon(
    color: THREE.ColorRepresentation,
    opts?: { emissive?: THREE.ColorRepresentation; emissiveIntensity?: number },
  ): THREE.MeshToonMaterial;
  /** Opt an object out of ink outlines (e.g. particles, glows, UI sprites). */
  noOutline(obj: THREE.Object3D): void;
}

/** Content side: avatar. */
export interface Avatar {
  group: THREE.Group;
  /** Called every frame by the core with movement intent; the avatar animates walk/run/idle/jump. */
  update(dt: number, state: { speed: number; running: boolean; grounded: boolean; t: number }): void;
  dispose(): void;
}

/** Content side: everything placed in the world (stations, props, panels, tour). */
export interface Content {
  /** Every frame with the avatar position; content handles proximity reactions, panels and the interact prompt. */
  update(dt: number, avatar: THREE.Vector3, t: number): void;
  /** E / tap interact pressed. */
  interact(): void;
  /** Esc pressed; returns true if it consumed it (closed a panel or a game overlay). */
  escape(): boolean;
  /** Ordered waypoints for the guided tour (world positions in front of each station). */
  tourStops(): Array<{ id: string; position: THREE.Vector3 }>;
  dispose(): void;
}

export type CreateAvatar = (env: WorldEnv) => Avatar;
export type CreateContent = (env: WorldEnv, hudRoot: HTMLElement) => Content;

/**
 * Ambient systems (fauna, NPC chasquis): self-contained, wired by core's index.ts.
 * Core calls update every frame; on E, core asks each ambient `interact()` first (an ambient
 * returns true when it consumed the press, e.g. an NPC in range starts talking), then content.
 * On Esc, core asks ambients `escape()` before content.
 */
export interface Ambient {
  update(dt: number, avatar: THREE.Vector3, t: number): void;
  /** Return true if this system handled the interact press. */
  interact?(): boolean;
  /** Return true if this system closed something (e.g. a dialog). */
  escape?(): boolean;
  /** Optional prompt text when something interactable is in range, e.g. "E · Hablar". Core may ignore. */
  prompt?(): string | null;
  dispose(): void;
}

/** src/world/fauna.ts exports `createFauna: CreateAmbient`; src/world/npcs.ts exports `createNpcs: CreateAmbient`. */
export type CreateAmbient = (env: WorldEnv, hudRoot: HTMLElement) => Ambient;
