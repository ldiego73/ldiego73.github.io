/**
 * Where the scenery's repeated things go: totora clumps on the shallow shelf and round the Uros islands, ichu
 * tufts and rocks on open land. Pure (no three.js meshes): seeded, so every visit sees the same shore. The
 * rules keep the reeds off the boardwalk, the piers and the balsa's mooring water, and the grass off roads,
 * plazas, fields and terraces (layout.isGround).
 */
import { segQuery, type TiticacaLayout } from "../layout";
import { boardwalks, DOCKS, ISLANDS } from "../plan";
import { parcelAt } from "./fields";

export interface Spot {
  x: number;
  z: number;
  yaw: number;
  scale: number;
  /** 0..1 extra height / variant. */
  tall: number;
}

/** Seeded PRNG (mulberry32). */
export function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Open water the reeds must leave clear: boardwalks, the island decks, both piers and their approaches. */
export function reedFree(x: number, z: number): boolean {
  for (const [a, b] of boardwalks()) if (segQuery(a, b, x, z).d < 2.6) return false;
  for (const i of ISLANDS) if (Math.hypot(x - i.x, z - i.z) < i.r + 1.2) return false;
  if (Math.hypot(x - DOCKS.uros.x, z - DOCKS.uros.z) < 11) return false;
  if (segQuery([DOCKS.taquile.landX, DOCKS.taquile.landZ], [DOCKS.taquile.x, DOCKS.taquile.z - 8], x, z).d < 7)
    return false;
  return true;
}

export function reedSpots(L: TiticacaLayout, count: number): Spot[] {
  const R = rng(0x7070a);
  const out: Spot[] = [];
  const { x0, x1 } = L.bounds;
  // Most clumps along the shore's shallow shelf…
  for (let k = 0; k < count * 30 && out.length < count * 0.72; k++) {
    const x = x0 + R() * (x1 - x0);
    const z = -330 + R() * 360;
    const land = L.landField(x, z);
    if (land > -0.6 || land < -20) continue;
    const depth = L.level - L.heightAt(x, z);
    if (depth < 0.15 || depth > 1.35) continue;
    // Beds, not a lawn: thin out where a slow noise is low.
    if (Math.sin(x * 0.045 + Math.cos(z * 0.05) * 2) < -0.35) continue;
    if (!reedFree(x, z)) continue;
    out.push({ x, z, yaw: R() * Math.PI * 2, scale: 0.8 + R() * 0.55, tall: R() });
  }
  // …and the beds the Uros islands are anchored in.
  for (let k = 0; k < count * 30 && out.length < count; k++) {
    const isl = ISLANDS[Math.floor(R() * ISLANDS.length)];
    if (!isl) break;
    const a = R() * Math.PI * 2;
    const r = isl.r + 1.6 + R() ** 1.5 * 16;
    const x = isl.x + Math.cos(a) * r;
    const z = isl.z + Math.sin(a) * r;
    if (!reedFree(x, z) || L.landField(x, z) > -1) continue;
    out.push({ x, z, yaw: R() * Math.PI * 2, scale: 0.85 + R() * 0.5, tall: R() });
  }
  return out;
}

/** Ichu tufts on open puna (more by the road, fewer up the hills), never on the chacras. */
export function grassSpots(L: TiticacaLayout, count: number): Spot[] {
  const R = rng(0x1c40);
  const out: Spot[] = [];
  const { x0, x1, z0, z1 } = L.bounds;
  for (let k = 0; k < count * 12 && out.length < count; k++) {
    // Biased toward the road's band (z ≈ 0..120) where the traveler looks.
    const x = x0 + R() * (x1 - x0);
    const z = R() < 0.7 ? -120 + R() * 260 : z0 + R() * (z1 - z0);
    if (!L.isGround(x, z) || parcelAt(x, z) >= 0) continue;
    const q = L.trailQuery(x, z);
    if (q.d > 60 && R() < 0.6) continue;
    out.push({ x, z, yaw: R() * Math.PI * 2, scale: 0.7 + R() * 0.7, tall: R() });
  }
  return out;
}

/** Scattered boulders on open land and the beaches. */
export function rockSpots(L: TiticacaLayout, count: number): Spot[] {
  const R = rng(0x50c4);
  const out: Spot[] = [];
  const { x0, x1, z0, z1 } = L.bounds;
  for (let k = 0; k < count * 20 && out.length < count; k++) {
    const x = x0 + R() * (x1 - x0);
    const z = z0 + R() * (z1 - z0);
    if (!L.isGround(x, z) || parcelAt(x, z) >= 0) continue;
    out.push({ x, z, yaw: R() * Math.PI * 2, scale: 0.4 + R() ** 2 * 1.6, tall: R() });
  }
  return out;
}
