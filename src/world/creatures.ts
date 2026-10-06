/**
 * Shared registry of moving bodies (traveler, animals, people) so they can't walk through each other.
 * Owners register a body once, write its x/z every frame, and ask for a separation push:
 *   const me = creatures.add("vicuna", 0.55);       // radius in world units
 *   me.x = …; me.z = …;                              // every frame, after moving
 *   creatures.separate(me, push);                    // push = sum of overlaps with nearby solid bodies
 *   me.x += push.x; me.z += push.z;                  // (or steer away for animals that avoid early)
 *   creatures.remove(me)                             // on dispose
 * Core registers the traveler (kind "traveler") and pushes the traveler out of solid bodies.
 * One registry per world (reset by core on mount/dispose). Linear scan: a few hundred bodies is cheap.
 *
 * Animals avoid early and settle without overlapping:
 *   creatures.steer(me, vx, vz, 0.8, v);             // look-ahead: bend the wanted velocity around bodies ahead
 *   …move by v…; me.x = …; me.z = …;
 *   creatures.resolve(me, okGround);                 // push out of overlaps (weighted by `give`), only onto ok ground
 * A body with no animal on the ground under it (hidden, flying, up a tree, diving) sets `solid = false`.
 *
 * Keep-out zones: places where people gather (a camp, a storytelling circle) that animals pick no ground in
 * and walk around. Owners register circles; the animals' ground rules reject points inside them and herds
 * bend their wanted velocity around them early:
 *   const z = creatures.keepOut(x, z, r);            // z.on = false while the place is empty (festival)
 *   creatures.inKeepOut(x, z, pad?)                  // ground predicate (pad: the animal's radius)
 *   creatures.steerKeepOut(me, vx, vz, horizon, v);  // like steer(), around the zones
 *   creatures.removeKeepOut(z)                       // on dispose (clear() also empties them)
 */

export interface Body {
  readonly id: number;
  kind: string;
  x: number;
  z: number;
  r: number;
  /** Solid bodies block others (and the traveler). Birds in flight, ghosts etc. set false. */
  solid: boolean;
  /** 0..1 how much it yields when pushed (1 = moves fully, 0 = immovable, e.g. a bear standing its ground). */
  give: number;
}

/** A circle animals keep out of (see the header). Mutable: owners may move it, resize it or switch it off. */
export interface KeepOut {
  x: number;
  z: number;
  r: number;
  on: boolean;
}

export interface CreatureRegistry {
  add(kind: string, r: number, o?: { solid?: boolean; give?: number; x?: number; z?: number }): Body;
  remove(b: Body): void;
  /** Bodies within `radius` of (x, z) (excluding `skip`), written into `out` (cleared first). */
  near(x: number, z: number, radius: number, out: Body[], skip?: Body): Body[];
  /** Sum of the minimum translations that resolve `b`'s overlaps with solid bodies (written into `out`). */
  separate(b: Body, out: { x: number; z: number }): { x: number; z: number };
  /**
   * Look-ahead avoidance: the wanted velocity (vx, vz) bent around solid bodies that `b` would reach within
   * `horizon` seconds (plus personal space), slowed when something is right ahead. Written into `out`.
   */
  steer(b: Body, vx: number, vz: number, horizon: number, out: { x: number; z: number }): { x: number; z: number };
  /**
   * Moves `b` out of its overlaps with solid bodies (minimum translation, scaled by how much `b` yields
   * relative to the other: min(1, b.give / o.give)), at most `maxStep` per call. The new spot must pass
   * `ok` (e.g. the animal's own ground rule), else each axis is tried, else `b` stays. True when it moved.
   */
  resolve(b: Body, ok?: (x: number, z: number) => boolean, maxStep?: number): boolean;
  /** Nearest body of a kind (e.g. the soundscape asking for the closest puma). */
  nearestOf(kind: string, x: number, z: number): Body | null;
  all(): readonly Body[];
  /** Registers a keep-out circle (active until removed or `on = false`). */
  keepOut(x: number, z: number, r: number): KeepOut;
  removeKeepOut(k: KeepOut): void;
  /** True when (x, z) lies inside an active keep-out zone grown by `pad`. */
  inKeepOut(x: number, z: number, pad?: number): boolean;
  /**
   * The wanted velocity (vx, vz) bent around active keep-out zones that `b` would reach within `horizon`
   * seconds (passing on the near side), or pointed out of a zone `b` is already inside. Written into `out`
   * (it may be the same object as the input). Unchanged when no zone is ahead.
   */
  steerKeepOut(
    b: Body,
    vx: number,
    vz: number,
    horizon: number,
    out: { x: number; z: number },
  ): { x: number; z: number };
  keepOuts(): readonly KeepOut[];
  /** Empties the bodies and the keep-out zones. */
  clear(): void;
}

/** Directions tried (and how far, units) when a body has to find its way out of keep-out zones. */
const ESCAPE_DIRS = 16;
const ESCAPE_MAX = 16;

/** Personal space kept on top of the two radii when steering (not when resolving). */
export const STEER_MARGIN = 0.3;

export function createCreatureRegistry(): CreatureRegistry {
  const bodies: Body[] = [];
  const zones: KeepOut[] = [];
  let nextId = 1;
  const push = { x: 0, z: 0 };
  const inKeepOut = (x: number, z: number, pad = 0) => {
    for (const k of zones) {
      if (!k.on) continue;
      const rr = k.r + pad;
      if ((x - k.x) ** 2 + (z - k.z) ** 2 < rr * rr) return true;
    }
    return false;
  };
  return {
    add(kind, r, o = {}) {
      const b: Body = { id: nextId++, kind, r, x: o.x ?? 0, z: o.z ?? 0, solid: o.solid ?? true, give: o.give ?? 1 };
      bodies.push(b);
      return b;
    },
    remove(b) {
      const i = bodies.indexOf(b);
      if (i >= 0) bodies.splice(i, 1);
    },
    near(x, z, radius, out, skip) {
      out.length = 0;
      for (const b of bodies) {
        if (b === skip) continue;
        const dx = b.x - x;
        const dz = b.z - z;
        const rr = radius + b.r;
        if (dx * dx + dz * dz < rr * rr) out.push(b);
      }
      return out;
    },
    separate(b, out) {
      out.x = 0;
      out.z = 0;
      for (const o of bodies) {
        if (o === b || !o.solid) continue;
        const dx = b.x - o.x;
        const dz = b.z - o.z;
        const min = b.r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const pen = min - d;
        if (d < 1e-5) {
          // Exactly on top of each other: push along a stable direction from the ids.
          const a = ((b.id * 2654435761) % 6283) / 1000;
          out.x += Math.cos(a) * pen;
          out.z += Math.sin(a) * pen;
        } else {
          out.x += (dx / d) * pen;
          out.z += (dz / d) * pen;
        }
      }
      return out;
    },
    steer(b, vx, vz, horizon, out) {
      out.x = vx;
      out.z = vz;
      const sp = Math.hypot(vx, vz);
      if (sp < 1e-4) return out;
      const ux = vx / sp;
      const uz = vz / sp;
      // Left normal of the heading.
      const nx = -uz;
      const nz = ux;
      const reach = sp * horizon;
      let lat = 0;
      let brake = 0;
      for (const o of bodies) {
        if (o === b || !o.solid) continue;
        const dx = o.x - b.x;
        const dz = o.z - b.z;
        const rr = b.r + o.r + STEER_MARGIN;
        const along = dx * ux + dz * uz;
        if (along <= 0 || along > reach + rr) continue;
        const side = dx * nx + dz * nz;
        const as = Math.abs(side);
        if (as >= rr) continue;
        // 1 when touching distance, fading to 0 at the edge of the look-ahead.
        const urgency = 1 - Math.max(0, along - rr) / Math.max(1e-3, reach);
        const need = (rr - as) / rr;
        // Pass on the side the obstacle is not on (ids break the tie when it is dead ahead).
        const s = side > 0.02 ? -1 : side < -0.02 ? 1 : b.id % 2 ? 1 : -1;
        lat += s * urgency * (0.4 + need);
        if (along < rr * 1.15) brake = Math.max(brake, need * urgency);
      }
      if (lat === 0 && brake === 0) return out;
      const dxn = ux + nx * lat * 1.4;
      const dzn = uz + nz * lat * 1.4;
      const m = Math.hypot(dxn, dzn) || 1;
      const k = (sp * (1 - 0.75 * Math.min(1, brake))) / m;
      out.x = dxn * k;
      out.z = dzn * k;
      return out;
    },
    resolve(b, ok, maxStep = 0.5) {
      push.x = 0;
      push.z = 0;
      if (b.give <= 0) return false;
      for (const o of bodies) {
        if (o === b || !o.solid) continue;
        const dx = b.x - o.x;
        const dz = b.z - o.z;
        const min = b.r + o.r;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        const pen = (min - d) * Math.min(1, b.give / Math.max(o.give, 1e-3));
        if (d < 1e-5) {
          const a = ((b.id * 2654435761) % 6283) / 1000;
          push.x += Math.cos(a) * pen;
          push.z += Math.sin(a) * pen;
        } else {
          push.x += (dx / d) * pen;
          push.z += (dz / d) * pen;
        }
      }
      const m = Math.hypot(push.x, push.z);
      if (m < 1e-5) return false;
      if (m > maxStep) {
        push.x *= maxStep / m;
        push.z *= maxStep / m;
      }
      const nx = b.x + push.x;
      const nz = b.z + push.z;
      if (!ok || ok(nx, nz)) {
        b.x = nx;
        b.z = nz;
      } else if (ok(nx, b.z)) b.x = nx;
      else if (ok(b.x, nz)) b.z = nz;
      else return false;
      return true;
    },
    nearestOf(kind, x, z) {
      let best: Body | null = null;
      let bd = Number.POSITIVE_INFINITY;
      for (const b of bodies) {
        if (b.kind !== kind || b.x >= PARKED) continue;
        const d = (b.x - x) ** 2 + (b.z - z) ** 2;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
      return best;
    },
    all: () => bodies,
    keepOut(x, z, r) {
      const k: KeepOut = { x, z, r, on: true };
      zones.push(k);
      return k;
    },
    removeKeepOut(k) {
      const i = zones.indexOf(k);
      if (i >= 0) zones.splice(i, 1);
    },
    inKeepOut,
    steerKeepOut(b, vx, vz, horizon, out) {
      const sp = Math.hypot(vx, vz);
      let ox = vx;
      let oz = vz;
      // Inside a zone (it appeared under us, or we were pushed in): head out of the union of zones the short
      // way (overlapping zones would cancel a plain "away from the center" push), at least at walking pace.
      if (inKeepOut(b.x, b.z, b.r * 0.5)) {
        let best = Number.POSITIVE_INFINITY;
        let bx = 0;
        let bz = 0;
        for (let i = 0; i < ESCAPE_DIRS; i++) {
          const a = (i / ESCAPE_DIRS) * Math.PI * 2;
          const ux = Math.cos(a);
          const uz = Math.sin(a);
          let s = 0.25;
          while (s < ESCAPE_MAX && inKeepOut(b.x + ux * s, b.z + uz * s, b.r * 0.5)) s += 0.25;
          // Ties: prefer the side the body wanted to go anyway.
          const cost = s - (sp > 1e-4 ? ((ux * vx + uz * vz) / sp) * 0.1 : 0);
          if (cost < best) {
            best = cost;
            bx = ux;
            bz = uz;
          }
        }
        const s = Math.max(sp, 0.6);
        out.x = bx * s;
        out.z = bz * s;
        return out;
      }
      if (sp < 1e-4) {
        out.x = vx;
        out.z = vz;
        return out;
      }
      const ux = vx / sp;
      const uz = vz / sp;
      const nx = -uz;
      const nz = ux;
      const reach = sp * horizon;
      let lat = 0;
      let brake = 0;
      for (const k of zones) {
        if (!k.on) continue;
        const dx = k.x - b.x;
        const dz = k.z - b.z;
        const rr = k.r + b.r + STEER_MARGIN;
        const along = dx * ux + dz * uz;
        // Ahead within reach (or alongside, still overlapping the corridor).
        if (along < -rr * 0.5 || along > reach + rr) continue;
        const side = dx * nx + dz * nz;
        const as = Math.abs(side);
        if (as >= rr) continue;
        const near = Math.max(0, Math.hypot(dx, dz) - rr);
        const urgency = 1 - Math.min(1, near / Math.max(1e-3, reach));
        const need = (rr - as) / rr;
        const s = side > 0.02 ? -1 : side < -0.02 ? 1 : b.id % 2 ? 1 : -1;
        lat += s * urgency * (0.5 + need);
        if (near < 0.4) brake = Math.max(brake, need * (1 - near / 0.4));
      }
      if (lat !== 0) {
        // Bend toward the tangent (at full need: almost sideways), keep the speed; slow down at the edge.
        const tx = ux + nx * lat * 1.8;
        const tz = uz + nz * lat * 1.8;
        const m = Math.hypot(tx, tz) || 1;
        const kk = (sp * (1 - 0.5 * Math.min(1, brake))) / m;
        ox = tx * kk;
        oz = tz * kk;
      }
      out.x = ox;
      out.z = oz;
      return out;
    },
    keepOuts: () => zones,
    clear() {
      bodies.length = 0;
      zones.length = 0;
    },
  };
}

/** Far outside the island: where an inactive body waits (never near anything, never "nearest"). */
export const PARKED = 1e6;
/** An animal that is not in the world right now (hidden, away, asleep): not solid and out of every query. */
export function park(b: Body): void {
  b.solid = false;
  b.x = PARKED;
  b.z = PARKED;
}
/** True while a body is parked (see park()). */
export const isParked = (b: Body) => b.x >= PARKED;

/** The world's registry (core clears it on mount/dispose). */
export const creatures: CreatureRegistry = createCreatureRegistry();
