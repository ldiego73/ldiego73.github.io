/**
 * Cloth of the Kuntisuyu on the shared wind (../style-gl.ts `windSway` mode "cloth"): flags on poles, strings
 * of festive pennants (banderines) and streamers tied to a cross or a pole. `ClothKit` collects them in world
 * space as one vertex-coloured geometry with a `flex` attribute (0 where the cloth is tied, 1 at the free
 * edge), so every flag and pennant of a station is ONE draw call that ripples with the gusts the grass shows.
 * The strings and poles they hang from go in the same geometry with flex 0 (`tube`), so they stay put and
 * cost no extra draw.
 *
 * Each piece is a small grid (not a single quad) so the travelling wave of the cloth mode can bend it. Faces
 * are double-sided; the paint is kept low (blotches the size of a field on a 1 u flag read as dirt).
 */
import * as THREE from "three";
import { vertexToon } from "../merge-colors";
import { paintStrength, windSway } from "../style-gl";

type V3 = { x: number; y: number; z: number };

export class ClothKit {
  private pos: number[] = [];
  private col: number[] = [];
  private flx: number[] = [];
  private nrm: number[] = [];
  private c = new THREE.Color();

  /**
   * A quad patch: `o` is the tied corner, `u` runs along the tied edge, `v` from the tied edge to the free one.
   * `color(i, j)` colours cell (i along u, j along v); `free(fu, fv)` is the flex at a grid point (0..1 each).
   */
  private patch(
    o: V3,
    u: V3,
    v: V3,
    nu: number,
    nv: number,
    color: (i: number, j: number) => THREE.ColorRepresentation,
    free: (fu: number, fv: number) => number,
    taper?: (fv: number) => number,
  ) {
    const n = new THREE.Vector3(u.x, u.y, u.z).cross(new THREE.Vector3(v.x, v.y, v.z)).normalize();
    const P = (i: number, j: number): [number, number, number, number] => {
      const fv = j / nv;
      // Taper (pennants): the u extent shrinks toward the free edge, centred on the patch's axis.
      const w = taper ? taper(fv) : 1;
      const fu = 0.5 + (i / nu - 0.5) * w;
      return [o.x + u.x * fu + v.x * fv, o.y + u.y * fu + v.y * fv, o.z + u.z * fu + v.z * fv, free(i / nu, fv)];
    };
    for (let j = 0; j < nv; j++)
      for (let i = 0; i < nu; i++) {
        this.c.set(color(i, j));
        const a = P(i, j);
        const b = P(i + 1, j);
        const cc = P(i + 1, j + 1);
        const d = P(i, j + 1);
        for (const q of [a, b, cc, a, cc, d]) {
          this.pos.push(q[0], q[1], q[2]);
          this.flx.push(q[3]);
          this.col.push(this.c.r, this.c.g, this.c.b);
          this.nrm.push(n.x, n.y, n.z);
        }
      }
  }

  /**
   * A flag tied along a vertical pole edge: top of the tied edge at `top`, flying horizontally along `dir`
   * (unit, xz), `w` long and `h` tall. `stripes` are vertical bands from the pole outward (Peru's flag is
   * red-white-red).
   */
  flag(top: V3, dir: { x: number; z: number }, w: number, h: number, stripes: THREE.ColorRepresentation[]) {
    const nu = 3;
    const nv = Math.max(4, stripes.length * 2);
    this.patch(
      { x: top.x, y: top.y - h, z: top.z },
      { x: 0, y: h, z: 0 },
      { x: dir.x * w, y: 0, z: dir.z * w },
      nu,
      nv,
      (_i, j) => stripes[Math.min(stripes.length - 1, Math.floor((j / nv) * stripes.length))] as string,
      (_fu, fv) => fv,
    );
  }

  /** One triangular pennant hanging from a string at `at` (its top edge along `along`, unit), `w` × `h`. */
  pennant(at: V3, along: V3, w: number, h: number, color: THREE.ColorRepresentation) {
    this.patch(
      { x: at.x - (along.x * w) / 2, y: at.y, z: at.z - (along.z * w) / 2 },
      { x: along.x * w, y: along.y * w, z: along.z * w },
      { x: 0, y: -h, z: 0 },
      2,
      3,
      () => color,
      // Tied along the whole top edge: the tip moves most (a small pennant swings less far than a flag).
      (_fu, fv) => fv * 0.55,
      (fv) => Math.max(0.02, 1 - fv),
    );
  }

  /**
   * A cloth hung by its top edge (a manta on a cord): centre of the top edge at `at`, the edge along `along`
   * (unit), `w` × `h`, in horizontal `bands` from the top down.
   */
  drape(at: V3, along: V3, w: number, h: number, bands: ReadonlyArray<THREE.ColorRepresentation>) {
    const nv = Math.max(4, bands.length);
    this.patch(
      { x: at.x - (along.x * w) / 2, y: at.y, z: at.z - (along.z * w) / 2 },
      { x: along.x * w, y: along.y * w, z: along.z * w },
      { x: 0, y: -h, z: 0 },
      3,
      nv,
      (_i, j) => bands[Math.min(bands.length - 1, Math.floor((j / nv) * bands.length))] as string,
      (_fu, fv) => fv * 0.7,
    );
  }

  /**
   * A string of pennants from `a` to `b` with a sag (parabolic, world units at mid-span), one every `step` u,
   * cycling through `colors`, on a thin string (static).
   */
  bunting(a: V3, b: V3, sag: number, step: number, colors: ReadonlyArray<THREE.ColorRepresentation>, size = 0.42) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const n = Math.max(2, Math.floor(len / step));
    const at = (t: number): V3 => ({ x: a.x + dx * t, y: a.y + dy * t - sag * 4 * t * (1 - t), z: a.z + dz * t });
    const pts: V3[] = [];
    for (let k = 0; k <= 10; k++) pts.push(at(k / 10));
    this.line(pts, 0.025, "#e9e1cf");
    for (let k = 1; k < n; k++) {
      const t = k / n;
      const p = at(t);
      const q = at(Math.min(1, t + 0.01));
      const l = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) || 1;
      this.pennant(
        p,
        { x: (q.x - p.x) / l, y: (q.y - p.y) / l, z: (q.z - p.z) / l },
        size,
        size * 1.35,
        colors[k % colors.length] as string,
      );
    }
  }

  /** A streamer tied at `top`, hanging down `len` u (slightly out along `out`, unit xz), `w` wide. */
  ribbon(top: V3, out: { x: number; z: number }, len: number, w: number, color: THREE.ColorRepresentation) {
    // The face turns across `out`, so the wave of the cloth mode swings it toward and away from `out`.
    this.patch(
      { x: top.x - (out.z * w) / 2, y: top.y, z: top.z + (out.x * w) / 2 },
      { x: out.z * w, y: 0, z: -out.x * w },
      { x: out.x * len * 0.25, y: -len, z: out.z * len * 0.25 },
      1,
      6,
      () => color,
      (_fu, fv) => fv,
    );
  }

  /** A static tube from `a` to `b` (a string, a pole), radius `r`; flex 0, so it never moves. */
  tube(a: V3, b: V3, r: number, color: THREE.ColorRepresentation, seg = 5) {
    const A = new THREE.Vector3(a.x, a.y, a.z);
    const B = new THREE.Vector3(b.x, b.y, b.z);
    const axis = B.clone().sub(A).normalize();
    const side = Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const e1 = side.cross(axis).normalize();
    const e2 = axis.clone().cross(e1).normalize();
    this.c.set(color);
    const ring = (k: number) => {
      const t = (k / seg) * Math.PI * 2;
      return e1
        .clone()
        .multiplyScalar(Math.cos(t))
        .add(e2.clone().multiplyScalar(Math.sin(t)));
    };
    for (let k = 0; k < seg; k++) {
      const n0 = ring(k);
      const n1 = ring(k + 1);
      const quad: Array<[THREE.Vector3, THREE.Vector3]> = [
        [A.clone().addScaledVector(n0, r), n0],
        [B.clone().addScaledVector(n0, r), n0],
        [B.clone().addScaledVector(n1, r), n1],
        [A.clone().addScaledVector(n1, r), n1],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        const [p, n] = quad[i] as [THREE.Vector3, THREE.Vector3];
        this.pos.push(p.x, p.y, p.z);
        this.nrm.push(n.x, n.y, n.z);
        this.col.push(this.c.r, this.c.g, this.c.b);
        this.flx.push(0);
      }
    }
  }

  /** A polyline of tubes (a sagging string from `bunting`). */
  line(pts: ReadonlyArray<V3>, r: number, color: THREE.ColorRepresentation) {
    for (let i = 0; i + 1 < pts.length; i++) this.tube(pts[i] as V3, pts[i + 1] as V3, r, color, 4);
  }

  get empty() {
    return this.pos.length === 0;
  }

  /** The merged geometry (position, normal, color, flex). */
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("flex", new THREE.Float32BufferAttribute(this.flx, 1));
    g.computeBoundingSphere();
    // The wave moves vertices up to ~0.3 u: pad the bounds so the cloth never pops out at the frustum edge.
    if (g.boundingSphere) g.boundingSphere.radius += 0.5;
    return g;
  }
}

/** The double-sided, vertex-coloured toon material every Kuntisuyu cloth uses (shared wind, cloth mode). */
export function clothMaterial(): THREE.MeshToonMaterial {
  const m = vertexToon();
  m.side = THREE.DoubleSide;
  paintStrength(m, 0.3);
  return windSway(m, { mode: "cloth", flex: true, amp: 1.4 });
}

/** A cloth mesh from a kit (no shadows: the cloth's shadow would not ripple with it). */
export function clothMesh(kit: ClothKit, name: string): { mesh: THREE.Mesh; dispose(): void } {
  const geo = kit.build();
  const mat = clothMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = name;
  mesh.receiveShadow = true;
  return {
    mesh,
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
