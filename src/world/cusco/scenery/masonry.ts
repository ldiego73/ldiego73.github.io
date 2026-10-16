/**
 * Fast vertex-coloured geometry builder for Inca masonry: thousands of dressed stones pushed straight into
 * typed arrays (no Object3D or BufferGeometry per block), baked into ONE non-indexed mesh for the toon
 * vertex-colour material (../../merge-colors.ts vertexToon). The thin joints between blocks give the ink
 * outline its edges, so the walls read as fitted ashlar up close and fade to plain walls in the distance.
 *
 *   box()        an oriented box (bottom face skipped: walls stand on the ground)
 *   prism()      an extruded polygon in a wall's plane (the twelve-angled stone, polygonal fillers, sun rays)
 *   ashlarWall() a wall from (x0, z0) to (x1, z1) in courses of slightly irregular blocks, with trapezoidal
 *                doorways (open), niches (recessed with a dark back) and windows; slight batter (inward lean)
 *
 * Frame: world units, +y up; a wall's local u runs along it, its normal (the "front") is +n = (−dz, dx)/len.
 */
import * as THREE from "three";

export type Rand = () => number;

export interface Opening {
  /** Centre along the wall (u, from its start). */
  s: number;
  /** Width at the sill and at the lintel (Inca trapezoid: top narrower). */
  bottom: number;
  top: number;
  /** Sill height above the wall's base, and the opening's height. */
  sill: number;
  h: number;
  /** door / window: through the wall, a dark slab at its back; niche: recessed; hole: open (filled by the caller). */
  kind: "door" | "niche" | "window" | "hole";
}

export class Masonry {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private c = new THREE.Color();

  get vertices(): number {
    return this.pos.length / 3;
  }

  private tri(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
  ) {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    this.pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    this.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    const { r, g, b } = this.c;
    this.col.push(r, g, b, r, g, b, r, g, b);
  }

  private quad(p: number[][]) {
    const [a, b, c, d] = p as [number[], number[], number[], number[]];
    this.tri(a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!, c[0]!, c[1]!, c[2]!);
    this.tri(a[0]!, a[1]!, a[2]!, c[0]!, c[1]!, c[2]!, d[0]!, d[1]!, d[2]!);
  }

  color(hex: THREE.ColorRepresentation, jitter = 0, rand?: Rand): this {
    this.c.set(hex);
    if (jitter && rand) {
      const k = 1 + (rand() - 0.5) * jitter;
      this.c.r *= k;
      this.c.g *= k;
      this.c.b *= k;
    }
    return this;
  }

  /**
   * Oriented box: centre (x, z), base y, size w (local x) × h × d (local z), turned by yaw (rotation.y).
   * `top` < 1 narrows the top face (a battered stone / a trapezoid jamb), `bottom` false skips the base.
   */
  box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
    o: { top?: number; base?: boolean } = {},
  ) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const k = o.top ?? 1;
    const P = (lx: number, ly: number, lz: number): number[] => [x + lx * c + lz * s, y + ly, z - lx * s + lz * c];
    const hw = w / 2;
    const hd = d / 2;
    const tw = hw * k;
    const td = hd * k;
    const b0 = P(-hw, 0, -hd);
    const b1 = P(hw, 0, -hd);
    const b2 = P(hw, 0, hd);
    const b3 = P(-hw, 0, hd);
    const t0 = P(-tw, h, -td);
    const t1 = P(tw, h, -td);
    const t2 = P(tw, h, td);
    const t3 = P(-tw, h, td);
    this.quad([t0, t3, t2, t1]); // top
    this.quad([b3, b2, t2, t3]); // +z
    this.quad([b1, b0, t0, t1]); // −z
    this.quad([b2, b1, t1, t2]); // +x
    this.quad([b0, b3, t3, t0]); // −x
    if (o.base) this.quad([b0, b1, b2, b3]);
    return this;
  }

  /**
   * Extruded polygon standing in a wall's plane: `pts` are (u, v) around the outline (counter-clockwise seen
   * from the front), placed at origin (x, y, z) with the wall direction yaw; it spans depth d along the
   * front normal from n0 (0 = wall face) outward. `caps` also closes the back (free-standing prisms: roofs).
   */
  prism(
    pts: ReadonlyArray<readonly [number, number]>,
    x: number,
    y: number,
    z: number,
    yaw: number,
    n0: number,
    d: number,
    caps = false,
  ) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    // Wall direction (u) is local +x; the front normal is local +z.
    const P = (u: number, v: number, n: number): number[] => [x + u * c + n * s, y + v, z - u * s + n * c];
    const front = pts.map(([u, v]) => P(u, v, n0 + d));
    const back = pts.map(([u, v]) => P(u, v, n0));
    // Front face: a fan (the outlines used here are convex or star-shaped around their centroid).
    let cu = 0;
    let cv = 0;
    for (const [u, v] of pts) {
      cu += u / pts.length;
      cv += v / pts.length;
    }
    const mid = P(cu, cv, n0 + d);
    const midB = P(cu, cv, n0);
    for (let i = 0; i < pts.length; i++) {
      const a = front[i] as number[];
      const b = front[(i + 1) % pts.length] as number[];
      this.tri(mid[0]!, mid[1]!, mid[2]!, a[0]!, a[1]!, a[2]!, b[0]!, b[1]!, b[2]!);
      if (caps) {
        const ab = back[i] as number[];
        const bb = back[(i + 1) % pts.length] as number[];
        this.tri(midB[0]!, midB[1]!, midB[2]!, bb[0]!, bb[1]!, bb[2]!, ab[0]!, ab[1]!, ab[2]!);
      }
    }
    for (let i = 0; i < pts.length; i++) {
      const a = front[i] as number[];
      const b = front[(i + 1) % pts.length] as number[];
      const bb = back[(i + 1) % pts.length] as number[];
      const ab = back[i] as number[];
      this.quad([ab, bb, b, a]);
    }
    return this;
  }

  /**
   * Ashlar wall from (x0, z0) to (x1, z1), base y0, height h, thickness t, built in courses (lower courses
   * taller, Inca style) of blocks with random lengths in [minLen, maxLen]. Openings are cut through
   * (doors, windows) or recessed (niches: a thin dark back at 70 % depth). Each course leans in by `batter`.
   */
  ashlarWall(
    rand: Rand,
    o: {
      x0: number;
      z0: number;
      x1: number;
      z1: number;
      y0: number;
      h: number;
      t: number;
      courses?: number;
      minLen?: number;
      maxLen?: number;
      batter?: number;
      colors: readonly string[];
      jitter?: number;
      openings?: ReadonlyArray<Opening>;
      /** Colour of niche backs and door shadows. */
      shade?: string;
      /** Colour of the core seen in the joints. */
      core?: string;
      /** Ground under the wall in (u) → y; the first course reaches down to it. */
      ground?: (x: number, z: number) => number;
    },
  ) {
    const dx = o.x1 - o.x0;
    const dz = o.z1 - o.z0;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return this;
    const ux = dx / len;
    const uz = dz / len;
    // Local +x along the wall: yaw = atan2(−dz, dx) (Object3D convention: local x → (cos, −sin)).
    const yaw = Math.atan2(-uz, ux);
    const courses = o.courses ?? Math.max(3, Math.round(o.h / 0.5));
    // Course heights: lower courses a little taller (sum = h).
    const weights = Array.from({ length: courses }, (_, i) => 1.25 - (0.5 * i) / Math.max(1, courses - 1));
    const wsum = weights.reduce((a, b) => a + b, 0);
    const heights = weights.map((w) => (w / wsum) * o.h);
    const minL = o.minLen ?? 0.55;
    const maxL = o.maxLen ?? 1.25;
    const batter = o.batter ?? 0.02;
    const gap = 0.04;
    const openings = o.openings ?? [];
    let y = o.y0;
    for (let ci = 0; ci < courses; ci++) {
      const ch = heights[ci] as number;
      const yc = y + ch / 2 - o.y0;
      // Free intervals of this course (openings cut them).
      const cuts: Array<[number, number, Opening]> = [];
      for (const op of openings) {
        if (yc < op.sill || yc > op.sill + op.h) continue;
        const f = (yc - op.sill) / op.h;
        const w = op.bottom + (op.top - op.bottom) * f;
        cuts.push([op.s - w / 2, op.s + w / 2, op]);
      }
      cuts.sort((a, b) => a[0] - b[0]);
      const inset = batter * ci;
      const thick = Math.max(0.2, o.t - inset * 2);
      const segs: Array<[number, number]> = [];
      let from = 0;
      for (const [a, b] of cuts) {
        if (a > from) segs.push([from, a]);
        from = Math.max(from, b);
      }
      if (from < len) segs.push([from, len]);
      for (const [a, b] of segs) {
        // A dark core behind the joints, so nothing shows through the gaps between blocks.
        const cm = (a + b) / 2;
        this.color(o.core ?? "#4f4a43").box(
          o.x0 + ux * cm,
          y,
          o.z0 + uz * cm,
          b - a - 0.02,
          ch - 0.08,
          thick * 0.8,
          yaw,
        );
        let u = a + (ci % 2 ? -rand() * 0.3 : 0);
        u = Math.max(a, u);
        while (u < b - 0.02) {
          let bl = minL + rand() * (maxL - minL);
          if (b - (u + bl) < minL * 0.6) bl = b - u;
          const mid = u + bl / 2;
          const x = o.x0 + ux * mid;
          const z = o.z0 + uz * mid;
          let base = y;
          if (ci === 0 && o.ground) base = Math.min(y, o.ground(x, z) - 0.15);
          const bh = y + ch - base - gap;
          const pal = o.colors[Math.floor(rand() * o.colors.length)] ?? "#a9a090";
          this.color(pal, o.jitter ?? 0.1, rand).box(x, base, z, bl - gap, bh, thick * (0.97 + rand() * 0.05), yaw, {
            top: 0.985,
          });
          u += bl;
        }
      }
      // Niche backs / door shadows: a dark slab across the cut at the back.
      for (const [a, b, op] of cuts) {
        if (op.kind === "hole") continue;
        const mid = (a + b) / 2;
        const back = op.kind === "niche" ? -thick * 0.15 : -thick * 0.5 + 0.03;
        const x = o.x0 + ux * mid - uz * back;
        const z = o.z0 + uz * mid + ux * back;
        this.color(o.shade ?? "#3b342d").box(x, y, z, b - a + gap, ch, op.kind === "niche" ? thick * 0.7 : 0.04, yaw);
      }
      y += ch;
    }
    return this;
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((this.pos.length / 3) * 2), 2));
    g.computeBoundingSphere();
    this.pos = [];
    this.nor = [];
    this.col = [];
    return g;
  }
}
