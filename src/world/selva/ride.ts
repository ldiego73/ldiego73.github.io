/**
 * Ride hook of the Antisuyu runtime: lets a vehicle ambient (the canoe) drive the traveler.
 *
 * Plain shared state, no events, read by src/world/selva/index.ts every frame (ambients must not import the
 * runtime, and the WorldEnv / SelvaEnv contracts are fixed, so this tiny module is the seam).
 *
 * Protocol for the canoe ambient (or any future vehicle):
 *   1. Boarding: emit `world:mount { riding: true, vehicle: "canoe", speedMul, seatHeight }` (as the llama does)
 *      and set `ride.active = true` with a valid `ride.pose`.
 *   2. While `ride.active`, write `ride.pose` each frame in your `update()`:
 *        x, z  world position of the traveler (the seat on the canoe)
 *        y     height of the traveler's FEET before the seat lift: the runtime draws the avatar at
 *              y + seatHeight (seatHeight from `world:mount`), so do not add the seat height yourself.
 *              Usually the river level (`env.selva.layout.river.level`) plus the hull's freeboard.
 *        yaw   facing (models face +Z; yaw = rotation.y; facing +X is π/2)
 *      The runtime copies the pose into the traveler, zeroes its velocity, skips walking, jumping, colliders,
 *      the walkable test and the push-out from bodies; it still moves the traveler's body in the creatures
 *      registry, stamps nearby stations, and the follow camera keeps following (behind `yaw` while moving).
 *   3. Steering: the runtime writes the player's movement intent to `ride.intent` every frame while riding:
 *      a WORLD-space direction (x, z) already rotated by the camera, magnitude 0..1, plus `running`
 *      (Shift / run pad). The vehicle decides what to do with it (paddle along the route, speed up, …).
 *   4. Landing: set `ride.active = false` and emit `world:mount { riding: false, speedMul: 1, seatHeight: 0 }`.
 *      Leave `ride.pose` on (or next to) the landing: on the falling edge the runtime snaps the traveler to the
 *      nearest walkable ground around the last pose and resumes walking.
 *
 * The runtime resets `ride.active` to false when the jungle mounts and when it is disposed (module state
 * outlives a remount).
 */

export interface RidePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface RideState {
  /** true while a vehicle owns the traveler's position. */
  active: boolean;
  /** Written by the vehicle every frame while active (see the header for the frame of each field). */
  pose: RidePose;
  /** Written by the runtime every frame while active: world-space movement intent (|x, z| ≤ 1) and run. */
  intent: { x: number; z: number; running: boolean };
}

export const ride: RideState = {
  active: false,
  pose: { x: 0, y: 0, z: 0, yaw: 0 },
  intent: { x: 0, z: 0, running: false },
};

/** Back to "not riding" (called by the runtime on mount and dispose). */
export function resetRide(): void {
  ride.active = false;
  ride.intent.x = 0;
  ride.intent.z = 0;
  ride.intent.running = false;
}
