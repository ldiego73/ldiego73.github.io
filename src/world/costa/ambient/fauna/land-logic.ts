/**
 * Pure behaviour of the coast's land and shore animals (../tierra.ts). No DOM, no three.js (tested in
 * land-logic.test.ts).
 *  - Grazers and dogs wander round a home spot (`stepWander`): pick a point within their range that the
 *    world allows, walk (or trot) there, then stand, graze or sit a while; they turn their head to a
 *    traveler close by and step aside when bumped (the module resolves bodies).
 *  - Sanderlings follow the edge of the water up and down the sand (`waterEdge`): where the drawn sea
 *    (its swell, breakers and swash run-up) meets the beach; the birds keep just above it at their quick run.
 */

export type WanderState = "walk" | "idle" | "graze";

export interface Wanderer {
  /** Home spot and range. */
  hx: number;
  hz: number;
  range: number;
  x: number;
  z: number;
  tx: number;
  tz: number;
  yaw: number;
  speed: number;
  state: WanderState;
  timer: number;
}

export interface WanderOpts {
  /** Walking speed (units/s). */
  pace: number;
  /** Share of the rests spent grazing (head down) rather than standing / sitting. */
  graze: number;
  /** Rest length range (seconds). */
  rest: [number, number];
}

export function wanderer(hx: number, hz: number, range: number, yaw = 0): Wanderer {
  return { hx, hz, range, x: hx, z: hz, tx: hx, tz: hz, yaw, speed: 0, state: "idle", timer: 0 };
}

/** Shortest-arc turn of `a` toward `b` by at most `max` radians. */
export function turnToward(a: number, b: number, max: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + Math.max(-max, Math.min(max, d));
}

/**
 * One step: rests count down, then a new target within range is tried (a few tries against `ok`); walking
 * moves toward the target, turning first. Returns the same object (mutated).
 */
export function stepWander(
  w: Wanderer,
  dt: number,
  o: WanderOpts,
  rand: () => number,
  ok: (x: number, z: number) => boolean,
): Wanderer {
  if (w.state !== "walk") {
    w.speed = Math.max(0, w.speed - dt * 3);
    w.timer -= dt;
    if (w.timer > 0) return w;
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * w.range;
      const x = w.hx + Math.cos(a) * r;
      const z = w.hz + Math.sin(a) * r;
      if (Math.hypot(x - w.x, z - w.z) < 1 || !ok(x, z)) continue;
      w.tx = x;
      w.tz = z;
      w.state = "walk";
      return w;
    }
    w.timer = 1;
    return w;
  }
  const dx = w.tx - w.x;
  const dz = w.tz - w.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.3) {
    w.state = rand() < o.graze ? "graze" : "idle";
    w.timer = o.rest[0] + rand() * (o.rest[1] - o.rest[0]);
    return w;
  }
  const want = Math.atan2(dx, dz);
  w.yaw = turnToward(w.yaw, want, dt * 3);
  // Turn before setting off; slow down on arrival.
  const facing = Math.cos(want - w.yaw);
  const target = o.pace * Math.max(0, facing) * Math.min(1, d / 0.8);
  w.speed += (target - w.speed) * Math.min(1, dt * 4);
  const step = Math.min(d, w.speed * dt);
  const nx = w.x + Math.sin(w.yaw) * step;
  const nz = w.z + Math.cos(w.yaw) * step;
  if (ok(nx, nz)) {
    w.x = nx;
    w.z = nz;
  } else {
    // Blocked (water, a wall of the world): give up this target.
    w.state = "idle";
    w.timer = 0.5;
  }
  return w;
}

/**
 * Where the water's edge is along a line across the beach: the first distance d (from `from` seaward to `to`,
 * in `step`s) where `wet(d)` holds (the sea surface above the sand there), refined by halving; `to` if dry all
 * the way. The caller samples the drawn sea (../../scenery/waves.ts seaHeight) against the ground.
 */
export function waterEdge(wet: (d: number) => boolean, from: number, to: number, step: number): number {
  let prev = from;
  for (let d = from; d <= to; d += step) {
    if (wet(d)) {
      if (d === from) return d;
      let a = prev;
      let b = d;
      for (let k = 0; k < 4; k++) {
        const m = (a + b) / 2;
        if (wet(m)) b = m;
        else a = m;
      }
      return b;
    }
    prev = d;
  }
  return to;
}

/** Moves `cur` toward `target` at most `speed * dt` (a 1-D chase: the sanderlings' scurry). */
export function chase(cur: number, target: number, speed: number, dt: number): number {
  const d = target - cur;
  const s = speed * dt;
  return Math.abs(d) <= s ? target : cur + Math.sign(d) * s;
}
