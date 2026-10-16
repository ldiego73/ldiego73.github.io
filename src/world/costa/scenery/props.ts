/**
 * Static works of the road, merged into one vertex-coloured mesh:
 *  - the two bridges where the road crosses the rivers: adobe abutments, a timber deck on log beams and
 *    railings of lashed totora bundles (the deck height is the layout's `bridges[].y`, which `groundAt` walks);
 *  - the low tapial walls that lined long stretches of the coastal Qhapaq Ñan, on the inland shoulder (never
 *    walked: the inland desert is not walkable), with gaps at the stations, the bridges and the road's ends; on
 *    the sea side, where the traveler may step off toward the beach, only a dotted line of low marker stones.
 */
import * as THREE from "three";
import { Geo } from "../kit";
import { type CostaLayout, ROAD_HALF } from "../layout";

const ADOBE = "#c99a6a";
const ADOBE_DARK = "#a97c52";
const WOOD = "#7a5233";
const WOOD_DARK = "#5a3b24";
const REED = "#b9a35a";

export function buildRoadWorks(L: CostaLayout): THREE.BufferGeometry {
  const g = new Geo();
  // ---------------------------------------------------------------- bridges
  for (const b of L.bridges) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(b.x, 0, b.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw),
      new THREE.Vector3(1, 1, 1),
    );
    g.post = m;
    const w = ROAD_HALF + 0.2;
    const deckY = (along: number) => b.y + 0.35 * (1 - (along / b.half) ** 2);
    // Abutments at both ends (local z along the road).
    for (const e of [-1, 1]) {
      const z = e * (b.half - 0.4);
      const floor = Math.min(L.heightAt(b.x, b.z) - 1.5, b.y - 2.5);
      g.box(w * 2 + 1.2, deckY(z) - floor - 0.05, 1.6, 0, floor, z, ADOBE);
      g.box(w * 2 + 1.4, 0.18, 1.8, 0, deckY(z) - 0.15, z, ADOBE_DARK);
    }
    // Log beams and planks following the arch.
    for (const x of [-w + 0.3, -0.6, 0.6, w - 0.3]) {
      for (let k = -b.half; k < b.half; k += 2) {
        const za = k;
        const zb = Math.min(b.half, k + 2);
        g.stick({ x, y: deckY(za) - 0.32, z: za }, { x, y: deckY(zb) - 0.32, z: zb }, 0.16, WOOD_DARK, 6);
      }
    }
    for (let k = -b.half + 0.25; k < b.half; k += 0.55) {
      const y = deckY(k);
      g.box(w * 2, 0.12, 0.48, 0, y - 0.13, k, k % 1.1 < 0.55 ? WOOD : "#8a6040");
    }
    // Railings: posts and lashed totora bundles.
    for (const x of [-w - 0.1, w + 0.1]) {
      for (let k = -b.half + 0.6; k <= b.half - 0.5; k += 2.1)
        g.cyl(0.08, 0.09, 1.15, x, deckY(k) - 0.1, k, WOOD_DARK, 6);
      for (let k = -b.half + 0.6; k < b.half - 2.5; k += 2.1) {
        const k2 = Math.min(b.half - 0.5, k + 2.1);
        g.stick({ x, y: deckY(k) + 0.9, z: k }, { x, y: deckY(k2) + 0.9, z: k2 }, 0.11, REED, 7);
        g.stick({ x, y: deckY(k) + 0.45, z: k }, { x, y: deckY(k2) + 0.45, z: k2 }, 0.07, REED, 6);
      }
    }
    g.post = null;
  }

  // ---------------------------------------------------------------- tapial walls along the road
  const gaps: Array<[number, number]> = [];
  for (const pl of L.plazas) {
    const t = L.trailQuery(pl.x, pl.z).t;
    gaps.push([t - 0.03, t + 0.03]);
  }
  for (const b of L.bridges) {
    const t = L.trailQuery(b.x, b.z).t;
    gaps.push([t - 0.022, t + 0.022]);
  }
  gaps.push([0, 0.03], [0.96, 1]);
  const inGap = (t: number) => gaps.some(([a, b]) => t > a && t < b);
  const len = L.trail.length;
  const seg = 2.4;
  const n = Math.floor(len / seg);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const tg = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 0.92) / n;
    if (inGap(t0) || inGap(t1)) continue;
    // Only some stretches are walled (a slow on/off pattern), and only away from the sea-side beach approaches.
    const on = Math.sin(t0 * 41) + Math.sin(t0 * 97 + 1) > -0.3;
    if (!on) continue;
    L.trail.pointAt(t0, p);
    L.trail.pointAt(t1, q);
    L.trail.tangentAt((t0 + t1) / 2, tg);
    const nx = -tg.z;
    const nz = tg.x;
    const l = Math.hypot(nx, nz) || 1;
    {
      const side = 1;
      const off = (ROAD_HALF + 0.75) * side;
      const ax = p.x + (nx / l) * off;
      const az = p.z + (nz / l) * off;
      const bx = q.x + (nx / l) * off;
      const bz = q.z + (nz / l) * off;
      const ya = L.heightAt(ax, az);
      const yb = L.heightAt(bx, bz);
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const dl = Math.hypot(bx - ax, bz - az);
      const yaw = Math.atan2(bx - ax, bz - az);
      const base = Math.min(ya, yb) - 0.3;
      const top = Math.max(ya, yb) + 0.85;
      g.box(0.55, top - base, dl, mx, base, mz, i % 3 ? ADOBE : "#c19163", yaw);
      g.box(0.62, 0.1, dl, mx, top, mz, ADOBE_DARK, yaw);
    }
    // Sea side: a low marker stone every other segment.
    if (i % 2 === 0) {
      const off = -(ROAD_HALF + 0.55);
      const sx = p.x + (nx / l) * off;
      const sz = p.z + (nz / l) * off;
      g.box(0.42, 0.55, 0.36, sx, L.heightAt(sx, sz) - 0.2, sz, i % 4 ? "#b9a68a" : "#a8977e", t0 * 13);
    }
  }
  return g.build();
}
