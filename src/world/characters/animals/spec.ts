/**
 * What a species is, as data: its body plan (a function that fills a ./kit.ts with bones and primitives), its
 * palette and coat variants, its eye, and how it moves. The registry of every species lives in
 * ./species/index.ts; the builders (./build.ts), the animators and the crowd read only this.
 *
 * Palette slots are shared by every species of a family so the animators, bands and tack agree:
 *
 *   quadrupeds  0 coat · 1 short hair (head, legs) · 2 hoof / pad / claw · 3 nose and lips · 4 belly ·
 *               5 points (mane, dark lower legs, tail tuft) · 6 spot · 7 spot centre · 8 mask / face patch ·
 *               9 inner ear · 10 accent · 11 mouth inside · 12–15 t'ikas and tack
 *   birds       0 back · 1 head · 2 bill · 3 legs · 4 belly · 5 wing coverts · 6 flight feathers · 7 tail ·
 *               8 face skin · 9 collar / crest · 10 accent · 11 mouth inside · 12–15 extras
 *   swimmers    0 back · 1 flank · 2 belly · 3 fins / flippers · 4 snout · 5 accent · 11 mouth inside
 *
 * Pure (no DOM, no Three).
 */
import type { IdleProfile } from "./behaviour";
import type { FlightProfile } from "./flight";
import type { GaitUse } from "./gaits";
import type { Kit } from "./kit";
import type { WaveOpts } from "./swim";

export type Family = "quad" | "bird" | "swim";

export interface Names {
  es: string;
  en: string;
}

/**
 * The painted eye (./eyes.ts draws it, mirrored on both sides of the head). Gentle and readable: a big dark
 * eye with highlights for mammals; a coloured iris with a round pupil for birds and reptiles (no slit pupils:
 * the jaguar, the puma and the caiman look calm, not menacing).
 */
export interface EyeStyle {
  /** Iris colour and its warmer lower half. */
  iris: string;
  irisLow?: string;
  /** Pupil colour; 0 = the iris is all dark (mammals: one big dark eye). */
  pupil?: string;
  /** Pupil size relative to the iris (0..1). */
  pupilK?: number;
  /** Eye size in the cell (0..1 of the cell; the decal size sets the world size). */
  size: number;
  /** Eye shape: 1 round, < 1 wider than tall (almond), > 1 taller. */
  aspect?: number;
  /** Lid / lash line colour and weight (0 = none: birds, reptiles). */
  lid?: string;
  lidW?: number;
  /** Long upper lashes (camelids, deer): count. */
  lashes?: number;
  /** Bare skin ring around the eye (toucan blue, condor red, the guanay's orange) and its width (px). */
  ring?: string;
  ringW?: number;
  /** A painted patch behind the eye: the sloth's dark mask, the macaw's white face, the vicuña's pale brow. */
  patch?: { color: string; kind: "mask" | "face" | "brow" | "tear" | "stripe" };
  /** Fine lines on a face patch (the macaw's feather lines). */
  lines?: string;
  /** Sclera showing at the front corner (primates). */
  sclera?: string;
}

export interface QuadMotion {
  kind: "quad";
  /** Gaits by speed (sorted). */
  gaits: GaitUse[];
  idles: IdleProfile;
  /** Reptile legs: elbows and knees out to the side, the spine swinging. */
  sprawl?: boolean;
  /** Frog: sits folded, moves only by jumps. */
  frog?: boolean;
  /** Neck carriage offset (radians, + = head lower) and walking nod amplitude. */
  carry?: number;
  nod?: number;
  /** How far the neck and head pitch down to graze (radians, split over the neck bones and the head). */
  graze?: number;
  /** Tail: rest pitch (+ = up), spring stiffness, wag (dogs) and swish (equids, cattle) amplitudes. */
  tailRest?: number;
  tailK?: number;
  tailWag?: number;
  tailSwish?: number;
  /** Ears: spring stiffness and flick chance (0 none). */
  earK?: number;
  earFlick?: number;
  /** Can climb (primates, sloths, felines on a trunk) and hang (sloths). */
  climb?: boolean;
  hang?: boolean;
  /** Swims with the legs paddling (capybara, tapir, jaguar) or folded back with the tail driving (caiman). */
  swim?: "paddle" | "tail";
  /** Seconds per breath at rest. */
  breath?: number;
}

export interface BirdMotion {
  kind: "bird";
  flight: FlightProfile;
  idles: IdleProfile;
  /** Pigeons and doves bob the head with each step. */
  headBob?: boolean;
  /** Long necks fold into an S at rest (herons) or stand tall (flamingos). */
  neckS?: number;
  /** The body's built pitch (− = upright perched); in flight the animator levels it. */
  pitch?: number;
  /** Stands on one leg at rest (flamingos, herons). */
  oneLeg?: boolean;
}

export interface SwimMotion {
  kind: "swim";
  /** Body wave: side to side (fish) or up and down (dolphins, sea lions). */
  axis: "yaw" | "pitch";
  wave: WaveOpts;
  idles: IdleProfile;
  /** Moves on land by lolloping (sea lions). */
  land?: boolean;
  /** Surfaces to breathe in arcs (dolphins). */
  porpoise?: boolean;
}

export type Motion = QuadMotion | BirdMotion | SwimMotion;

export interface Plan {
  kit: Kit;
  /** Base voxel size of the body surface (LOD 0). */
  h: number;
  /** How much of the fur lumps the shading keeps (1 = all; lower = smooth cel bands, lumpy silhouette). */
  woolNormal?: number;
  /** Ground clearance of the feet (what the world's ground height should match), usually 0. */
  feet?: number;
  /** The seat (riders, packs): bone and offset above it. */
  seat?: { bone: string; at: [number, number, number] };
}

export interface AnimalSpec {
  key: string;
  name: Names;
  latin: string;
  family: Family;
  /** Body size for LOD distances (units: the longest of length, height, wingspan). */
  size: number;
  /** Speeds the world should use (units/s): ambling, cruising and its top speed. */
  speeds: { walk: number; run: number; max: number };
  /** Fill the kit; `lod` lets lofted parts (bird wings) coarsen with the voxel (0 = full). */
  plan(lod?: 0 | 1 | 2): Plan;
  palette: readonly string[];
  /** Coat variants (full palettes; the base palette is "default"). */
  variants?: Record<string, readonly string[]>;
  eye: EyeStyle;
  motion: Motion;
}

/** Replace some slots of a palette (variants). */
export function recolor(base: readonly string[], slots: Record<number, string>): string[] {
  const out = [...base];
  for (const [k, v] of Object.entries(slots)) out[Number(k)] = v;
  return out;
}
