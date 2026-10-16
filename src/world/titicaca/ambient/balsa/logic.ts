/**
 * Pure rules of the balsa de totora (../balsa.ts): its two landings (a jetty off the far Uros island, a pier from
 * the shore below Taquile), where open water lets it sail, the steering (thrust along the bow, turning from the
 * sideways input, inertia, a little drift), docking, the one-boat logic (the boatman brings it to the landing the
 * traveler is heading for) and when the ride earns its stamp. No DOM, no three.js (tested in logic.test.ts).
 */
import { landField, segQuery } from "../../layout";
import { DOCKS, HALF, ISLAND_Y, ISLANDS, type Island, type P2 } from "../../plan";
import { spans } from "../uros/logic";

export type End = 0 | 1;

export interface Dock {
  end: End;
  /** Where the jetty / pier leaves the walkable floor and where its far end is (the boat moors there). */
  root: P2;
  tip: P2;
  /** Deck height along the pier (root → tip). */
  rootY: number;
  tipY: number;
  halfW: number;
  /** Unit direction root → tip (out over the water). */
  dir: P2;
  /** Mooring: the boat's centre beside the tip, bow pointing out. */
  moor: { x: number; z: number; yaw: number };
  /** Boarding spot on the deck, at the tip. */
  stand: { x: number; z: number };
}

const unit = (a: P2, b: P2): P2 => {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};

/** The two landings: 0 the Uros jetty, 1 the Taquile pier. `landY` is the shore ground at the pier's root. */
export function docks(landY: number): [Dock, Dock] {
  const isl = ISLANDS[DOCKS.uros.island] as Island;
  const mk = (end: End, root: P2, tip: P2, rootY: number, tipY: number, side: 1 | -1): Dock => {
    const dir = unit(root, tip);
    // Moored alongside the tip, on the given side (right of the pier seen walking out is −dir⊥).
    const nx = -dir[1] * side;
    const nz = dir[0] * side;
    return {
      end,
      root,
      tip,
      rootY,
      tipY,
      halfW: 1.1,
      dir,
      moor: {
        x: tip[0] + nx * 2.7 - dir[0] * 1.2,
        z: tip[1] + nz * 2.7 - dir[1] * 1.2,
        yaw: Math.atan2(dir[0], dir[1]),
      },
      stand: { x: tip[0] - dir[0] * 0.9, z: tip[1] - dir[1] * 0.9 },
    };
  };
  return [
    mk(0, [isl.x, isl.z - isl.r + 0.6], [DOCKS.uros.x, DOCKS.uros.z], ISLAND_Y - 0.06, ISLAND_Y - 0.1, 1),
    mk(1, [DOCKS.taquile.landX, DOCKS.taquile.landZ - 2], [DOCKS.taquile.x, DOCKS.taquile.z], landY, 0.42, -1),
  ];
}

/** Deck height of a pier at (x, z) (linear root → tip). */
export function pierY(d: Dock, x: number, z: number): number {
  const q = segQuery(d.root, d.tip, x, z);
  return d.rootY + (d.tipY - d.rootY) * Math.min(1, q.u * 1.6);
}

/** Half beam and half length of the hull (for the clearance tests). */
export const HULL = { halfW: 1.0, halfL: 3.4 } as const;

/** Open water the balsa may float on: clear of land, islands, the boardwalk and the piers, inside the map. */
export function canSail(x: number, z: number, piers: ReadonlyArray<Dock>, margin = HULL.halfW + 0.7): boolean {
  if (Math.abs(x) > HALF - 12 || Math.abs(z) > HALF - 12) return false;
  if (landField(x, z) > -margin - 0.6) return false;
  for (const i of ISLANDS) if (Math.hypot(x - i.x, z - i.z) < i.r + margin) return false;
  for (const s of spans()) if (segQuery(s.a, s.b, x, z).d < 1.2 + margin) return false;
  for (const p of piers) if (segQuery(p.root, p.tip, x, z).d < p.halfW + HULL.halfW + 0.3) return false;
  return true;
}

export interface Boat {
  x: number;
  z: number;
  yaw: number;
  /** Speed along the bow (negative: backing). */
  v: number;
  /** Turn rate (rad/s). */
  w: number;
}

export const SAIL = { max: 3.8, run: 5.6, back: 1.2, accel: 1.1, brake: 2.2, turn: 0.95 } as const;

/**
 * One step of the steering: `intent` is the world-space movement wish (|·| ≤ 1, camera-rotated). Its component
 * along the bow drives forward (or brakes / backs), its sideways component turns (also at rest, more slowly).
 * The hull is checked at its bow, middle and stern; a blocked step stops the boat (a soft bump).
 */
export function stepBoat(
  b: Boat,
  intent: { x: number; z: number; running: boolean },
  dt: number,
  ok: (x: number, z: number) => boolean,
): Boat {
  const fx = Math.sin(b.yaw);
  const fz = Math.cos(b.yaw);
  // Screen-right of the bow (camera behind the boat): (−cos, sin).
  const f = intent.x * fx + intent.z * fz;
  const l = intent.x * -Math.cos(b.yaw) + intent.z * Math.sin(b.yaw);
  const top = intent.running ? SAIL.run : SAIL.max;
  let v = b.v;
  if (f > 0.05) v += (f * top - v) * Math.min(1, SAIL.accel * dt);
  else if (f < -0.05) v += (-SAIL.back * -f - v) * Math.min(1, SAIL.brake * dt);
  else v *= Math.max(0, 1 - 0.45 * dt);
  const grip = 0.45 + 0.55 * Math.min(1, Math.abs(v) / SAIL.max);
  const wantW = -l * SAIL.turn * grip * (v < -0.1 ? -1 : 1);
  const w = b.w + (wantW - b.w) * Math.min(1, 3 * dt);
  const yaw = b.yaw + w * dt;
  const nx = b.x + Math.sin(yaw) * v * dt;
  const nz = b.z + Math.cos(yaw) * v * dt;
  const hullOk = (x: number, z: number, y: number) =>
    ok(x, z) &&
    ok(x + Math.sin(y) * HULL.halfL, z + Math.cos(y) * HULL.halfL) &&
    ok(x - Math.sin(y) * HULL.halfL, z - Math.cos(y) * HULL.halfL);
  if (hullOk(nx, nz, yaw)) return { x: nx, z: nz, yaw, v, w };
  // Blocked: keep the turn if it fits, lose the speed.
  if (hullOk(b.x, b.z, yaw)) return { x: b.x, z: b.z, yaw, v: 0, w };
  return { x: b.x, z: b.z, yaw: b.yaw, v: 0, w: 0 };
}

/** The landing the boat can put in at: slow enough and its middle within reach of a pier's tip. */
export function dockingEnd(b: Boat, ds: ReadonlyArray<Dock>, reach = 5.2): End | null {
  if (Math.abs(b.v) > 1.6) return null;
  for (const d of ds) if (Math.hypot(b.x - d.moor.x, b.z - d.moor.z) < reach) return d.end;
  return null;
}

/** Only a trip to the other landing counts for the passport. */
export const earnsRideStamp = (from: End, to: End) => from !== to;

/** While moored: the boatman brings the boat to the other landing when the traveler is there and it is far off. */
export function idleEnd(o: { at: End; d0: number; d1: number; dBoat: number }): End {
  const near: End | null = o.d0 < 14 ? 0 : o.d1 < 14 ? 1 : null;
  if (near === null || near === o.at || o.dBoat < 70) return o.at;
  return near;
}
