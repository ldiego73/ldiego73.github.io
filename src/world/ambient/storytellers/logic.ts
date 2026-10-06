/**
 * Pure layout + schedule for the storytelling circle at the Khipu de escritos (unit-tested).
 *
 * Everything is in the khipu board's local frame (fields/geo.ts: +Z toward the bench, frame line at z = FZ).
 * The board's E prompt rectangle (lz ∈ (FZ, FZ + 4.2), |lx| < half + 0.8) and the path from (0, 3.6) to the
 * trail (toward −x) stay free: the circle sits on the +x side, readers stand behind the frame.
 */
import { within } from "../people/logic";

/** Same constants as khipu-board.ts. */
export const MAX_CORDS = 12;
export const SPACING = 0.42;
export const FZ = -1.5;
export const CORD_Y = 2.5;
export const CORD_LEN = 1.95;
/** Margin kept around the E rectangle. */
export const E_MARGIN = 0.3;

export interface P2 {
  x: number;
  z: number;
}

export interface BoardDims {
  /** Cords on the frame (4 blank ones when there are no posts). */
  n: number;
  half: number;
  /** Local x of the first cord. */
  x0: number;
}

/** Frame dimensions exactly as khipu-board.ts computes them from the post count. */
export function boardDims(posts: number): BoardDims {
  const n = posts <= 0 ? 4 : Math.min(MAX_CORDS, posts);
  const W = Math.max(3.2, n * SPACING + 1.0);
  return { n, half: W / 2, x0: -((n - 1) * SPACING) / 2 };
}

export const cordX = (d: BoardDims, i: number) => d.x0 + Math.max(0, Math.min(d.n - 1, i)) * SPACING;

/** Inside the khipu E prompt rectangle (grown by `margin`). */
export function inPromptRect(d: BoardDims, lx: number, lz: number, margin = E_MARGIN) {
  return lz > FZ - margin && lz < FZ + 4.2 + margin && Math.abs(lx) < d.half + 0.8 + margin;
}

export interface CircleLayout {
  /** The amauta's storytelling spot, beside the right post. */
  elder: P2;
  hearth: P2;
  /** Children's seats (ground), in an arc facing the elder across the hearth. */
  kids: P2[];
  /** Night seats by the fire (elder, one reader). */
  fire: [P2, P2];
  /** Readers' line behind the frame. */
  readerZ: number;
  /** Home route (from the circle toward the trail), behind the frame. */
  out: P2[];
}

/**
 * The circle: elder just outside the E rectangle beside the +x post, hearth a step away on the open side,
 * children on an arc beyond it (radius 2 from the elder, angles from +z toward +x).
 */
export function circleLayout(d: BoardDims, kids: number): CircleLayout {
  const ex = d.half + 0.8 + E_MARGIN + 0.05;
  const elder = { x: ex, z: -1.0 };
  const ha = 0.78;
  const hearth = { x: elder.x + Math.sin(ha) * 1.05, z: elder.z + Math.cos(ha) * 1.05 };
  const seats: P2[] = [];
  const a0 = 0.12;
  const a1 = 1.5;
  for (let i = 0; i < kids; i++) {
    const a = kids === 1 ? ha : a0 + ((a1 - a0) * i) / (kids - 1);
    seats.push({ x: elder.x + Math.sin(a) * 2.3, z: elder.z + Math.cos(a) * 2.3 });
  }
  // Night: sit facing each other across the fire, on the sides away from the board.
  const fire: [P2, P2] = [
    { x: hearth.x + 0.95 * Math.sin(ha + 1.2), z: hearth.z + 0.95 * Math.cos(ha + 1.2) },
    { x: hearth.x + 0.95 * Math.sin(ha - 0.9), z: hearth.z + 0.95 * Math.cos(ha - 0.9) },
  ];
  return {
    elder,
    hearth,
    kids: seats,
    fire,
    readerZ: FZ - 0.36,
    out: [
      { x: d.half + 1.3, z: FZ - 1.4 },
      { x: -5, z: FZ - 1.9 },
    ],
  };
}

/** Story by day; the fire is lit from dusk to dawn; the fire sitters stay out at night. */
export const STORY: [number, number] = [0.285, 0.705];
export const FIRE_LIT: [number, number] = [0.68, 0.27];

export type Mode = "story" | "fire" | "home";

/** Where someone should be: storytelling by day, by the fire (sitters) or gone home at night. */
export function modeAt(time: number, sitter: boolean): Mode {
  if (within(time, STORY[0], STORY[1])) return "story";
  return sitter ? "fire" : "home";
}

/**
 * The amauta's cycle (seconds): tells the story to the children, then turns and points along the cords
 * ("this knot is the year…"), then back. Returns 0 (talking) .. 1 (pointing at the cords).
 */
export function pointWeight(clock: number, period = 11) {
  const k = (clock % period) / period;
  // Talk 0..0.55, turn 0.55..0.62, point 0.62..0.9, turn back 0.9..1.
  if (k < 0.55) return 0;
  if (k < 0.62) return smooth((k - 0.55) / 0.07);
  if (k < 0.9) return 1;
  return 1 - smooth((k - 0.9) / 0.1);
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Head yaw toward a target, relative to the body, clamped to what a neck does. */
export function headYaw(bodyYaw: number, fx: number, fz: number, tx: number, tz: number, max = 1.05) {
  let d = Math.atan2(tx - fx, tz - fz) - bodyYaw;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return Math.max(-max, Math.min(max, d));
}

/** Reader's cord choice: reader 0 keeps to the left half of the cords, reader 1 to the right half. */
export function readerCords(d: BoardDims, who: 0 | 1): [number, number] {
  const mid = Math.ceil(d.n / 2);
  return who === 0 ? [0, Math.max(0, mid - 1)] : [Math.min(d.n - 1, mid), d.n - 1];
}
