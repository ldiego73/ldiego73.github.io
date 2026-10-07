/**
 * Sitting: the pure half of the shared seat mechanic (no three.js, no DOM), used by both runtimes
 * (src/world/index.ts, src/world/selva/index.ts), the avatar and the ambients that own seats.
 *
 * Protocol (`world:sit` in ./events.ts):
 *   1. An ambient that owns a seat shows `SIT_COPY.sit` while the traveler is near it (`nearSeat`) and, on E,
 *      emits `world:sit { seated: true, ...seat }` (`sitDetail(seat)`): `y` is the world height of the seat
 *      SURFACE, `yaw` the facing (models face +Z), `view` the camera facing, `stand` where to stand back up (walkable, outside colliders).
 *   2. The runtime is the source of truth: it validates the request (`seatFrom`); if it cannot sit now
 *      (riding, canoe, tour, title) it emits `world:sit { seated: false }` straight back so every listener resets
 *      in the same tick. Otherwise it pins the traveler's feet at `y − SIT_HIP`, faces `yaw`, stops walking,
 *      physics and gravity and keeps the camera following a little closer (`SIT_SQUEEZE`).
 *   3. Movement (once the stick/keys were released after sitting: `createStandLatch`), jump, Esc (when no panel
 *      took it), or E when nothing else wants it make the runtime emit `world:sit { seated: false }`; the seat
 *      owner may also emit it (its own "E · Stand up"). The runtime puts the traveler on walkable ground at
 *      `stand` (or where it sat down from). Teleports, fast travel, the tour, a llama or the canoe stand up first.
 * `emit` dispatches synchronously, so listeners must be idempotent (ignore `seated: false` when not seated).
 */
import type { L } from "./contract";
import type { SitDetail, SitPose } from "./events";

export type { SitDetail, SitPose };

/** Feet origin below the seat surface: the avatar's hip pivot is 0.56 above its feet, thighs 0.085 thick. */
export const SIT_HIP = 0.48;
/** Follow-camera squeeze while seated (0 = normal, 1 = interior close-up; see camera.ts). */
export const SIT_SQUEEZE = 0.55;
/** Movement intent (0..1) that stands the traveler up, and the "released" level that arms it. */
export const STAND_MOVE = 0.3;
export const REST_MOVE = 0.1;
/** How close (u, ground plane) the traveler must be to a seat for its prompt. */
export const SIT_RANGE = 1.2;

export const SIT_COPY = {
  sit: { es: "E · Sentarse", en: "E · Sit down" },
  stand: { es: "E · Levantarse", en: "E · Stand up" },
} as const satisfies Record<string, L>;

export interface Seat {
  id: string;
  /** World x/z of the hips, y of the seat surface. */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Camera facing while seated (the camera sits behind it): frames the seat's view, e.g. the wall khipu. */
  view: number;
  pose: SitPose;
  /** Walkable point to stand back up on (null: the runtime uses where the traveler sat down from). */
  stand: { x: number; z: number } | null;
}

const fin = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** A valid seat from a `world:sit` detail, or null (not seated / malformed). */
export function seatFrom(d: SitDetail | undefined | null): Seat | null {
  if (!d?.seated || !fin(d.x) || !fin(d.y) || !fin(d.z)) return null;
  const stand = d.stand && fin(d.stand.x) && fin(d.stand.z) ? { x: d.stand.x, z: d.stand.z } : null;
  return {
    id: typeof d.id === "string" ? d.id : "seat",
    x: d.x,
    y: d.y,
    z: d.z,
    yaw: fin(d.yaw) ? d.yaw : 0,
    view: fin(d.view) ? d.view : fin(d.yaw) ? d.yaw : 0,
    pose: d.pose === "desk" ? "desk" : "bench",
    stand,
  };
}

/** The `world:sit` detail that asks to sit on `seat`. */
export function sitDetail(seat: Seat): SitDetail {
  return {
    seated: true,
    id: seat.id,
    x: seat.x,
    y: seat.y,
    z: seat.z,
    yaw: seat.yaw,
    view: seat.view,
    pose: seat.pose,
    ...(seat.stand ? { stand: { ...seat.stand } } : {}),
  };
}

/** Feet height of a seated traveler. */
export const seatedFeetY = (seat: Pick<Seat, "y">): number => seat.y - SIT_HIP;

/** Facing (rotation.y; models face +Z) from (x, z) toward (tx, tz). */
export const yawToward = (x: number, z: number, tx: number, tz: number): number => Math.atan2(tx - x, tz - z);

/** The nearest seat within `range` of (x, z), or null. */
export function nearSeat<S extends { x: number; z: number }>(
  seats: readonly S[],
  x: number,
  z: number,
  range = SIT_RANGE,
): S | null {
  let best: S | null = null;
  let bd = range;
  for (const s of seats) {
    const d = Math.hypot(s.x - x, s.z - z);
    if (d <= bd) {
      bd = d;
      best = s;
    }
  }
  return best;
}

/**
 * Stand-up latch: movement stands the traveler up only after the controls were released once since sitting
 * (holding W while pressing E must not stand up on the next frame). Jump always stands up.
 */
export function createStandLatch() {
  let armed = false;
  return {
    /** Call when sitting down. */
    reset() {
      armed = false;
    },
    /** Per frame while seated: true when this input should stand the traveler up. */
    wantsUp(move: { x: number; y: number }, jumped: boolean): boolean {
      const m = Math.hypot(move.x, move.y);
      if (jumped) return true;
      if (!armed) {
        if (m < REST_MOVE) armed = true;
        return false;
      }
      return m > STAND_MOVE;
    },
  };
}
