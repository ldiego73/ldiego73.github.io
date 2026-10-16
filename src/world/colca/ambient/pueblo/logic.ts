/**
 * Pure plan of the village (../pueblo.ts) and of who lives there (../gente.ts, ../picaflores.ts): the frame
 * of its plaza, where the church, houses, fountain and flowering kantu bushes stand, and the spots people
 * walk between. Local frame: origin at the plaza centre, +z toward the road (south), x east. No DOM, no
 * three.js (tested in logic.test.ts).
 */

export interface HouseSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** Facing (yaw) toward the plaza. */
  yaw: number;
  wall: "white" | "adobe" | "stone";
  roof: "thatch" | "tin" | "tile";
}

/** Church: nave behind the facade on the north side of the plaza, facing the plaza and the road. */
export const CHURCH = { z: -25.5, w: 9.5, d: 20, h: 8.5, facade: 11.5, towers: 13.5 } as const;

export const HOUSES: ReadonlyArray<HouseSpec> = [
  { x: -17.5, z: -9, w: 6, d: 5, h: 3.2, yaw: Math.PI / 2, wall: "white", roof: "tile" },
  { x: -18.5, z: 1, w: 7, d: 5, h: 3.4, yaw: Math.PI / 2, wall: "stone", roof: "thatch" },
  { x: -17, z: 10.5, w: 5.5, d: 5, h: 3, yaw: Math.PI / 2, wall: "adobe", roof: "tin" },
  { x: 17.5, z: -9.5, w: 6.5, d: 5, h: 3.3, yaw: -Math.PI / 2, wall: "adobe", roof: "thatch" },
  { x: 18.5, z: 0.5, w: 7, d: 5.5, h: 3.6, yaw: -Math.PI / 2, wall: "white", roof: "tin" },
  { x: 17, z: 10, w: 5.5, d: 5, h: 3, yaw: -Math.PI / 2, wall: "stone", roof: "tile" },
  { x: -11, z: -18, w: 5, d: 5, h: 3, yaw: 0.5, wall: "stone", roof: "thatch" },
  { x: 11.5, z: -18, w: 5, d: 5, h: 3, yaw: -0.5, wall: "white", roof: "thatch" },
];

/** Stone fountain (pileta) in the middle of the plaza. */
export const FOUNTAIN = { x: 0, z: 0, r: 1.6 } as const;

/** Flowering kantu bushes round the plaza (hummingbirds feed at them). */
export const FLOWERS: ReadonlyArray<readonly [number, number]> = [
  [-9.5, -9.5],
  [9.5, -9.5],
  [-11.5, 4],
  [11.5, 4],
  [-6, 11.5],
  [6.5, 11.8],
];

/** Where villagers stop: by the church door, the fountain, the houses' doors and the plaza's mouth. */
export const STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, -9.5],
  [-3.2, 2.6],
  [3.4, -2.2],
  [-11.6, -5.6],
  [-12.4, 2.5],
  [11.6, -5.8],
  [12.6, 1.4],
  [0, 12],
  [-7, 7],
  [7.5, 6.5],
];

/** Local → world for a frame at (x, z) facing yaw (Object3D.rotation.y convention). */
export function toWorld(f: { x: number; z: number; yaw: number }, lx: number, lz: number): { x: number; z: number } {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return { x: f.x + lx * c + lz * s, z: f.z - lx * s + lz * c };
}
