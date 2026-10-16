/**
 * Ride hook of the suyu runtime: lets a vehicle ambient (a totora boat on the lake, a raft) drive the traveler.
 * Same protocol as the jungle's canoe (../selva/ride.ts), as a separate module so the worlds never share
 * state across pages:
 *   1. Boarding: emit `world:mount { riding: true, vehicle, speedMul, seatHeight }` and set `ride.active = true`
 *      with a valid `ride.pose`.
 *   2. While active, write `ride.pose` every frame: x, z of the seat, y of the traveler's FEET before the seat
 *      lift (the runtime adds `seatHeight`), yaw (models face +Z). The runtime copies it into the traveler,
 *      skips walking, jumping and colliders, keeps stamping stations and following with the camera.
 *   3. Steering: the runtime writes the movement intent (world-space x, z, |·| ≤ 1, already camera-rotated)
 *      and `running` to `ride.intent` every frame while active.
 *   4. Landing: set `ride.active = false` and emit `world:mount { riding: false, speedMul: 1, seatHeight: 0 }`,
 *      leaving `ride.pose` on (or next to) the landing: the runtime snaps the traveler to walkable ground there.
 * The runtime resets it when a suyu world mounts and when it is disposed.
 */

export interface RidePose {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export interface RideState {
  active: boolean;
  pose: RidePose;
  intent: { x: number; z: number; running: boolean };
}

export const ride: RideState = {
  active: false,
  pose: { x: 0, y: 0, z: 0, yaw: 0 },
  intent: { x: 0, z: 0, running: false },
};

export function resetRide(): void {
  ride.active = false;
  ride.intent.x = 0;
  ride.intent.z = 0;
  ride.intent.running = false;
}
