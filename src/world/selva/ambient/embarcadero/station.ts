/**
 * Station scaffolding shared by the jungle content stations: the station frame (local +Z faces the road, the
 * river side stations have the water behind them at local −Z), local ↔ world conversion, sub-frames (a house
 * turned inside the station), raised decks (local rectangles registered in ../../../decks.ts as oriented
 * boxes at a real height: piers, boardwalks, porches, rafts), solid footprints as circle chains (the
 * contract's box colliders are world-axis-aligned, stations are not), the "E" spot picker and the ochre
 * selection marker (reused from the mountain's data stations).
 * Helpers only: this file does not export `create`.
 */
import * as THREE from "three";
import { type Frame, lxOf, lzOf, stationFrame, wx, wz } from "../../../ambient/fields/geo";
import type { Collider, WorldEnv } from "../../../contract";
import { decks } from "../../../decks";
import type { Ground } from "./amazon";

export type { Frame };
export { lxOf, lzOf, stationFrame, wx, wz };

/** Group placed at the station origin (terrain height there) and turned to the station yaw. */
export function stationGroup(f: Frame, name: string): THREE.Group {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(f.x, f.y, f.z);
  g.rotation.y = f.yaw;
  return g;
}

/**
 * A frame turned by `yaw` around the local point (lx, lz) of `f` (same origin height): e.g. a stilt house or a
 * pier in its own frame. Rotations compose (world yaw = f.yaw + yaw), so its decks are oriented boxes too.
 */
export function subFrame(f: Frame, lx: number, lz: number, yaw: number): Frame {
  const y = f.yaw + yaw;
  return { x: wx(f, lx, lz), z: wz(f, lx, lz), y: f.y, yaw: y, cos: Math.cos(y), sin: Math.sin(y) };
}

/**
 * Registers the local rectangle x0..x1 × z0..z1 of `f` as a raised walkable deck whose top is `y` above the
 * frame origin (a constant, or a function of the local point for stairs and ramps). Returns the remover.
 */
export function addDeck(
  f: Frame,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  y: number | ((lx: number, lz: number) => number),
  id?: string,
): () => void {
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return decks.add({
    shape: { kind: "obox", x: wx(f, cx, cz), z: wz(f, cx, cz), yaw: f.yaw, halfW: (x1 - x0) / 2, halfD: (z1 - z0) / 2 },
    y: typeof y === "number" ? f.y + y : (x, z) => f.y + y(lxOf(f, x, z), lzOf(f, x, z)),
    ...(id ? { id } : {}),
  });
}

/** Terrain height relative to the station origin, in local coordinates. */
export const groundOf =
  (env: WorldEnv, f: Frame): Ground =>
  (lx, lz) =>
    env.heightAt(wx(f, lx, lz), wz(f, lx, lz)) - f.y;

/** Circles (world) covering a local rectangle: a grid of radius-r circles every ~1.3 r (solid footprints). */
export function rectCircles(f: Frame, x0: number, z0: number, x1: number, z1: number, r = 0.75): Collider[] {
  const step = r * 1.3;
  const nx = Math.max(1, Math.ceil((x1 - x0 - r) / step));
  const nz = Math.max(1, Math.ceil((z1 - z0 - r) / step));
  const out: Collider[] = [];
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) {
      const lx = x0 + r * 0.6 + ((x1 - x0 - r * 1.2) * i) / nx;
      const lz = z0 + r * 0.6 + ((z1 - z0 - r * 1.2) * j) / nz;
      out.push({ kind: "circle", x: wx(f, lx, lz), z: wz(f, lx, lz), r });
    }
  }
  return out;
}

/** Circles (world) along a local segment (a wall, a railing): solid edges the avatar cannot cross. */
export function segmentCircles(f: Frame, a: [number, number], b: [number, number], r = 0.35): Collider[] {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(1, Math.ceil(len / (r * 1.4)));
  const out: Collider[] = [];
  for (let i = 0; i <= n; i++) {
    const lx = a[0] + ((b[0] - a[0]) * i) / n;
    const lz = a[1] + ((b[1] - a[1]) * i) / n;
    out.push({ kind: "circle", x: wx(f, lx, lz), z: wz(f, lx, lz), r });
  }
  return out;
}

/** A circle collider/walk area at a local point. */
export const at = (f: Frame, lx: number, lz: number, r: number): Collider => ({
  kind: "circle",
  x: wx(f, lx, lz),
  z: wz(f, lx, lz),
  r,
});

export interface Spot {
  /** Local position of the "E" spot (where the traveler stands). */
  lx: number;
  lz: number;
  r: number;
}

/** Index of the nearest spot within its radius from local (lx, lz), or -1. */
export function nearestSpot(spots: ReadonlyArray<Spot>, lx: number, lz: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < spots.length; i++) {
    const s = spots[i] as Spot;
    const d = Math.hypot(s.lx - lx, s.lz - lz);
    if (d <= s.r && d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
