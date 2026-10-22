/**
 * Geometry of the plaza's cloth (../unanchas.ts): every pole, banner and streamer in ONE vertex-coloured
 * geometry with a `flex` attribute (style-gl.ts `clothFlex` semantics: 0 where the cloth is pinned or the
 * part is rigid, 1 at the free edge), so the shared wind ("cloth" mode) waves them all in one draw call.
 *
 *   banners    four tall poles just off the usnu's base corners, one per suyu, on the corner facing that
 *              suyu's road; each flies a long woven banner in its dye with a cream border and a band of
 *              checks (tocapu-like squares). The free edge points downwind (the world's base wind), so the
 *              wave runs the way the breeze blows.
 *   streamers  at every punku, four woollen streamers in the gate's dye with cream bands, hanging from the
 *              lintel's plaza face over the jambs (pinned at the top).
 *
 * Cloth is two-sided (the material draws both faces); the strips are built flat with their face normal
 * (the cloth wave moves along it), subdivided along the free direction so the wave bends them smoothly.
 * Per-triangle colours (non-indexed) keep the woven bands crisp.
 */
import * as THREE from "three";
import { WIND } from "../../../style";
import { GATES, type Gate, gateYaw, USNU } from "../../plan";
import { DOOR, gateWorld } from "../punkus/logic";

/** Pole spots: just outside the usnu's base, on the diagonal toward each suyu's street. */
export const POLE_OFF = USNU.tiers[0].half + 0.95;
export const POLE_H = 6.4;
const BANNER_W = 1.35;
const BANNER_H = 2.3;
const CREAM = "#efe6d6";
const DARK = "#3a2416";
const MADDER = "#a8323a";
const GOLD = "#e8b631";
const WOOD = "#6e4a2c";

export interface Pole {
  x: number;
  z: number;
  gate: Gate;
}

/** The four suyu poles (every gate but the Qhapaq Ñan's), at the usnu corner on that road's side. */
export function poles(): Pole[] {
  return GATES.filter((g) => g.id !== "qhapaq").map((g) => ({
    x: USNU.x + Math.sign(g.dir[0]) * POLE_OFF,
    z: USNU.z + Math.sign(g.dir[1]) * POLE_OFF,
    gate: g,
  }));
}

class Builder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  flex: number[] = [];
  private c = new THREE.Color();
  private v = new THREE.Vector3();
  private n = new THREE.Vector3();
  private nm = new THREE.Matrix3();

  /** Appends a rigid primitive (flex 0) in one colour, transformed by m. */
  solid(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.getAttribute("position");
    const nrm = g.getAttribute("normal");
    this.nm.getNormalMatrix(m);
    this.c.set(color);
    for (let i = 0; i < p.count; i++) {
      this.v.fromBufferAttribute(p, i).applyMatrix4(m);
      this.n.fromBufferAttribute(nrm, i).applyMatrix3(this.nm).normalize();
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.nor.push(this.n.x, this.n.y, this.n.z);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.flex.push(0);
    }
    if (g !== geo) g.dispose();
    geo.dispose();
  }

  /**
   * A flat cloth strip in local (u across 0…w, v along 0…−h, normal +z), split into nu × nv cells; colour per
   * cell from `paint(iu, iv)`, weight per vertex from `weight(u, v)`; placed by m.
   */
  cloth(
    w: number,
    h: number,
    nu: number,
    nv: number,
    m: THREE.Matrix4,
    paint: (iu: number, iv: number) => string,
    weight: (u: number, v: number) => number,
  ) {
    this.nm.getNormalMatrix(m);
    this.n.set(0, 0, 1).applyMatrix3(this.nm).normalize();
    const { x: nx, y: ny, z: nz } = this.n;
    const put = (u: number, v: number) => {
      this.v.set(u, v, 0).applyMatrix4(m);
      this.pos.push(this.v.x, this.v.y, this.v.z);
      this.nor.push(nx, ny, nz);
      this.col.push(this.c.r, this.c.g, this.c.b);
      this.flex.push(weight(u, v));
    };
    for (let iu = 0; iu < nu; iu++)
      for (let iv = 0; iv < nv; iv++) {
        const u0 = (iu / nu) * w;
        const u1 = ((iu + 1) / nu) * w;
        const v0 = -(iv / nv) * h;
        const v1 = -((iv + 1) / nv) * h;
        this.c.set(paint(iu, iv));
        // Counter-clockwise seen from +z.
        put(u0, v0);
        put(u0, v1);
        put(u1, v1);
        put(u0, v0);
        put(u1, v1);
        put(u1, v0);
      }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute("flex", new THREE.Float32BufferAttribute(this.flex, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/**
 * A suyu banner: a border, the dye field, and a band of checks (dye-dark and the border colour) across the
 * middle. The border is cream, or madder red on a pale dye (the Collasuyu's undyed alpaca) so it still reads.
 */
function bannerPaint(dye: string) {
  const NU = 9;
  const NV = 14;
  const c = new THREE.Color(dye);
  const pale = c.r + c.g + c.b > 2.1;
  const edge = pale ? MADDER : CREAM;
  const dark = pale ? DARK : `#${c.multiplyScalar(0.55).getHexString()}`;
  return {
    NU,
    NV,
    paint(iu: number, iv: number) {
      if (iv === 0 || iv === NV - 1 || iu === NU - 1) return edge;
      if (iv >= 6 && iv <= 7) return (iu + iv) % 2 ? dark : edge;
      if (iv === 5 || iv === 8) return DARK;
      return dye;
    },
  };
}

export function buildCloth(): THREE.BufferGeometry {
  const b = new Builder();
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const at = new THREE.Vector3();
  // Banners fly downwind: local +u (the free edge) along the world's base wind direction (WIND.cusco.dir is
  // the angle of the direction it blows toward in the xz plane, x = cos, z = sin).
  const windYaw = -WIND.cusco.dir;
  for (const p of poles()) {
    const pole = new THREE.CylinderGeometry(0.07, 0.1, POLE_H, 7);
    pole.translate(0, POLE_H / 2, 0);
    b.solid(pole, WOOD, m.makeTranslation(p.x, 0, p.z));
    const foot = new THREE.CylinderGeometry(0.3, 0.38, 0.35, 8);
    foot.translate(0, 0.175, 0);
    b.solid(foot, "#8c867b", m.makeTranslation(p.x, 0, p.z));
    const cap = new THREE.IcosahedronGeometry(0.16, 0);
    b.solid(cap, GOLD, m.makeTranslation(p.x, POLE_H + 0.1, p.z));
    const { NU, NV, paint } = bannerPaint(p.gate.dye);
    q.setFromAxisAngle(up, windYaw);
    m.compose(at.set(p.x, POLE_H - 0.15, p.z), q, one);
    // Weight: 0 at the pole, 1 at the free edge; the lower free corner a little freer.
    b.cloth(BANNER_W, BANNER_H, NU, NV, m, paint, (u, v) => Math.min(1, (u / BANNER_W) * (1 + (-v / BANNER_H) * 0.15)));
  }
  // Punku streamers: two each side of the lintel, the outer ones longer.
  const LEN = [2.1, 1.6];
  const W = 0.24;
  for (const g of GATES) {
    const yaw = gateYaw(g);
    q.setFromAxisAngle(up, yaw);
    const dark = `#${new THREE.Color(g.dye).multiplyScalar(0.6).getHexString()}`;
    for (const side of [-1, 1])
      LEN.forEach((len, k) => {
        const lx = side * (DOOR.outer - 0.35 - k * 0.5) - W / 2;
        const p = gateWorld(g, lx, DOOR.depth / 2 + 0.2);
        m.compose(at.set(p.x, 0.1 + DOOR.height + 0.7, p.z), q, one);
        const nv = 8;
        b.cloth(
          W,
          len,
          1,
          nv,
          m,
          (_iu, iv) => (iv % 3 === 2 ? CREAM : k ? dark : g.dye),
          (_u, v) => Math.min(1, (-v / len) ** 1.2),
        );
      });
  }
  return b.build();
}
