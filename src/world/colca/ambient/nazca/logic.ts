/**
 * Pure rules of the Nazca pampa (../nazca.ts): which geoglyph draws which artifact, where each figure lies
 * round the mirador tower, its signpost at the road edge, and which figure the traveler faces from the top of
 * the tower. No DOM, no three.js (tested in logic.test.ts).
 *
 * Figures face the tower: a figure's "up" (its unit frame's +y) points away from the tower, so from the deck
 * every one reads upright, the way the real ones are best read from the air. Sizes are half-extents in world
 * units, roughly proportional to the real figures (the condor largest, the astronaut smallest).
 */
import { ARTIFACTS, type Artifact } from "../../../../data/career";
import { GLYPHS, type Glyph, type GlyphId, type V2 } from "../../glyphs";
import { ROAD_HALF, roadAt, roadT, TOWER } from "../../plan";

export interface Figure {
  artifact: Artifact;
  glyph: Glyph;
  /** Centre on the pampa (world x, z) and half-extent of the unit frame. */
  x: number;
  z: number;
  size: number;
  /** Line width on the ground. */
  width: number;
}

/** Artifact → geoglyph, and where it lies relative to the tower (world offsets). */
const PLACES: ReadonlyArray<{ artifact: string; glyph: GlyphId; dx: number; dz: number; size: number }> = [
  { artifact: "api-gateway", glyph: "arana", dx: 30, dz: -104, size: 27 },
  { artifact: "design-system", glyph: "colibri", dx: 74, dz: -16, size: 44 },
  { artifact: "event-driven", glyph: "mono", dx: -108, dz: 34, size: 40 },
  { artifact: "platform", glyph: "condor", dx: -52, dz: -84, size: 48 },
  { artifact: "ai", glyph: "astronauta", dx: -18, dz: -150, size: 21 },
];

export function figures(): Figure[] {
  const out: Figure[] = [];
  for (const p of PLACES) {
    const artifact = ARTIFACTS.find((a) => a.id === p.artifact);
    if (!artifact) continue;
    out.push({
      artifact,
      glyph: GLYPHS[p.glyph],
      x: TOWER.x + p.dx,
      z: TOWER.z + p.dz,
      size: p.size,
      width: p.size > 30 ? 1.5 : 1.2,
    });
  }
  return out;
}

/** The figure's frame: `up` points away from the tower, `right` is to the right seen from the tower. */
export function frame(f: Pick<Figure, "x" | "z">): { up: V2; right: V2 } {
  const dx = f.x - TOWER.x;
  const dz = f.z - TOWER.z;
  const d = Math.hypot(dx, dz) || 1;
  const up: V2 = [dx / d, dz / d];
  // Looking along `up` (x east, z south), the right hand is (−up.z, up.x).
  return { up, right: [-up[1], up[0]] };
}

/** A figure's lines in world x, z. */
export function worldLines(f: Figure): V2[][] {
  const { up, right } = frame(f);
  return f.glyph.lines.map((line) =>
    line.map(([u, v]): V2 => [f.x + (u * right[0] + v * up[0]) * f.size, f.z + (u * right[1] + v * up[1]) * f.size]),
  );
}

/** Signpost at the road edge closest to the figure, on its side (where E reads it). */
export function signpost(f: Pick<Figure, "x" | "z">): { x: number; z: number; t: number; yaw: number } {
  const t = roadT(f.x, f.z);
  const r = roadAt(t);
  const dx = f.x - r.x;
  const dz = f.z - r.z;
  const d = Math.hypot(dx, dz) || 1;
  const off = ROAD_HALF + 1.1;
  // Faces the road (its front toward the traveler walking by).
  return { x: r.x + (dx / d) * off, z: r.z + (dz / d) * off, t, yaw: Math.atan2(-dx, -dz) };
}

export const SIGN_R = 3.6;

/** The figure whose signpost the traveler at (x, z) stands by, if any. */
export function signInRange(list: ReadonlyArray<Figure>, x: number, z: number): Figure | null {
  let best: Figure | null = null;
  let bd = SIGN_R;
  for (const f of list) {
    const s = signpost(f);
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) {
      bd = d;
      best = f;
    }
  }
  return best;
}

/**
 * From the tower deck: the figure closest to the view direction (camera forward on the ground plane), within
 * `maxAngle`. Ties go to the nearer figure.
 */
export function facedFigure(
  list: ReadonlyArray<Figure>,
  from: { x: number; z: number },
  dir: { x: number; z: number },
  maxAngle = 0.6,
): Figure | null {
  const dl = Math.hypot(dir.x, dir.z) || 1;
  const fx = dir.x / dl;
  const fz = dir.z / dl;
  let best: Figure | null = null;
  let score = Infinity;
  for (const f of list) {
    const dx = f.x - from.x;
    const dz = f.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const a = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d)));
    if (a > maxAngle) continue;
    const s = a + d * 0.0006;
    if (s < score) {
      score = s;
      best = f;
    }
  }
  return best;
}

/** On the tower deck (top floor), by height and the tower's square. */
export function onTowerTop(p: { x: number; y: number; z: number }, deckY: number): boolean {
  const dx = p.x - TOWER.x;
  const dz = p.z - TOWER.z;
  const c = Math.cos(TOWER.yaw);
  const s = Math.sin(TOWER.yaw);
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= TOWER.half + 0.2 && Math.abs(lz) <= TOWER.half + 0.2 && p.y > deckY - 0.6;
}
