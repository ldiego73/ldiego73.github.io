/**
 * Deck registry: raised walkable surfaces that ambients add on top of the layout ground (a house plinth and
 * its steps, piers, boardwalks, stilt-house floors, a raft, a viewpoint). Pure: no three.js, no DOM.
 *
 * Why: the layouts' ground is terrain (+ the mountain's bridge deck through content, + the jungle canopy
 * walkway). Before this registry an ambient could not raise the ground, so floors had to follow the slope and
 * walkable areas had to stop where the terrain fell away. Now an ambient registers a deck once and both
 * runtimes (src/world/index.ts, src/world/selva/index.ts) stand the traveler on it:
 *
 *   ground = deck height when the point is on a deck the walker can reach (top ≤ feet + MAX_STEP when
 *            grounded, ≤ feet while airborne), otherwise the existing ground. You walk up steps and ramps but
 *            stand on the terrain under a high deck (a pier seen from the water, a viewpoint on stilts).
 *   walkable = the layout's walkable test OR a reachable deck (so a deck over water or steep bank needs no
 *            walkable area; its open edges act as walls unless the ground beyond is walkable).
 *
 * `env.extra.groundAt` (mountain) and `env.selva.groundAt` (jungle) include the HIGHEST deck at a point (no
 * reach cap), so fauna and people placed on a deck stand on its planks. The follow cameras keep above decks
 * too. With no deck registered every query returns null and both runtimes behave exactly as before.
 *
 * Shapes: the contract's `Collider` (world circle / axis-aligned box) or an oriented box `obox` in a local
 * frame (same convention as Object3D.rotation.y = yaw and ambient/fields/geo.ts station frames: world =
 * (x + lx·cos + lz·sin, z − lx·sin + lz·cos)), |lx| ≤ halfW, |lz| ≤ halfD. Height: a constant y or a function
 * of the world point (ramps, stairs, decks that follow a slope).
 *
 * Cost: a few dozen decks; `heightAt` is a linear scan with a precomputed bounding-box reject, no allocation
 * per call. The runtimes `clear()` it at start and on dispose (like creatures.ts), and every `add` returns its
 * own remover.
 */
import type { Collider } from "./contract";

/** Oriented box in a local frame turned by `yaw` around (x, z) (see the header for the convention). */
export interface OBox {
  kind: "obox";
  x: number;
  z: number;
  yaw: number;
  halfW: number;
  halfD: number;
}

export type DeckShape = Collider | OBox;

export interface DeckSpec {
  shape: DeckShape;
  /** Top of the deck (world y): constant or per world point (only called for points inside the shape). */
  y: number | ((x: number, z: number) => number);
  id?: string;
}

interface Entry {
  spec: DeckSpec;
  /** World bounding box (cheap reject). */
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  cos: number;
  sin: number;
}

export interface Decks {
  /** Registers a deck; returns its remover. */
  add(spec: DeckSpec): () => void;
  /**
   * Height of the highest deck containing (x, z) whose top is ≤ maxY (default: any height), or null when
   * no deck qualifies.
   */
  heightAt(x: number, z: number, maxY?: number): number | null;
  /** Number of registered decks. */
  readonly size: number;
  clear(): void;
}

function bounds(s: DeckShape): [number, number, number, number] {
  if (s.kind === "circle") return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
  if (s.kind === "box") return [s.x0, s.z0, s.x1, s.z1];
  const c = Math.abs(Math.cos(s.yaw));
  const n = Math.abs(Math.sin(s.yaw));
  const ex = s.halfW * c + s.halfD * n;
  const ez = s.halfW * n + s.halfD * c;
  return [s.x - ex, s.z - ez, s.x + ex, s.z + ez];
}

function inside(e: Entry, x: number, z: number): boolean {
  if (x < e.x0 || x > e.x1 || z < e.z0 || z > e.z1) return false;
  const s = e.spec.shape;
  if (s.kind === "box") return true;
  if (s.kind === "circle") return (x - s.x) ** 2 + (z - s.z) ** 2 <= s.r * s.r;
  const dx = x - s.x;
  const dz = z - s.z;
  return Math.abs(dx * e.cos - dz * e.sin) <= s.halfW && Math.abs(dx * e.sin + dz * e.cos) <= s.halfD;
}

export function createDecks(): Decks {
  const list: Entry[] = [];
  return {
    add(spec) {
      const [x0, z0, x1, z1] = bounds(spec.shape);
      const yaw = spec.shape.kind === "obox" ? spec.shape.yaw : 0;
      const e: Entry = { spec, x0, z0, x1, z1, cos: Math.cos(yaw), sin: Math.sin(yaw) };
      list.push(e);
      return () => {
        const i = list.indexOf(e);
        if (i >= 0) list.splice(i, 1);
      };
    },
    heightAt(x, z, maxY = Number.POSITIVE_INFINITY) {
      let best: number | null = null;
      for (let i = 0; i < list.length; i++) {
        const e = list[i] as Entry;
        if (!inside(e, x, z)) continue;
        const y = e.spec.y;
        const h = typeof y === "number" ? y : y(x, z);
        if (h <= maxY && (best === null || h > best)) best = h;
      }
      return best;
    },
    get size() {
      return list.length;
    },
    clear() {
      list.length = 0;
    },
  };
}

/** The shared registry both runtimes and every ambient use. */
export const decks: Decks = createDecks();

/**
 * Ground for a walker whose feet are at `feetY` (see the header): the reachable deck when it is above
 * `base`, else `base`. `reach` is how far above the feet a deck still counts (MAX_STEP when grounded, ~0 in
 * the air).
 */
export function standOn(reg: Decks, base: number, x: number, z: number, feetY: number, reach: number): number {
  const d = reg.heightAt(x, z, feetY + reach);
  return d !== null && d > base ? d : base;
}

/** Highest deck at the point or `base`, whichever is higher (fauna, people, props: no reach cap). */
export function topOf(reg: Decks, base: number, x: number, z: number): number {
  const d = reg.heightAt(x, z);
  return d !== null && d > base ? d : base;
}
