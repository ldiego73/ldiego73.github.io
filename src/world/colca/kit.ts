/**
 * Small builders shared by the Kuntisuyu's ambients (so each station is one vertex-coloured mesh, one draw
 * call): `VKit` collects primitives with a colour (optionally inside a local frame: position + yaw) and merges
 * them with ../merge-colors.ts; `signBoard` paints a carved wooden or stone sign on a canvas (redrawn when the
 * fonts arrive); `unpainted` turns the painted blotches off on a moving model. Three.js only; no world state.
 */
import * as THREE from "three";
import { mergeColored } from "../merge-colors";
import { canvasTex, FONT, fitFont, offFontsReady, onFontsReady } from "../props";
import { noPaint } from "../style-gl";

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

export class VKit {
  private parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color }> = [];
  private protos = new Map<string, THREE.BufferGeometry>();
  /** Local frame applied after each primitive's own transform (null = world). */
  frame: THREE.Matrix4 | null = null;

  /** Places the frame at (x, y, z) turned by yaw (models face +Z). */
  at(x: number, y: number, z: number, yaw = 0): this {
    this.frame = new THREE.Matrix4().compose(
      tmpP.set(x, y, z),
      tmpQ.setFromEuler(tmpE.set(0, yaw, 0)),
      tmpS.set(1, 1, 1),
    );
    return this;
  }

  private proto(key: string, make: () => THREE.BufferGeometry) {
    let g = this.protos.get(key);
    if (!g) {
      g = make();
      this.protos.set(key, g);
    }
    return g;
  }

  /** Any geometry (cloned), transformed, in a colour. */
  add(
    geo: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    x = 0,
    y = 0,
    z = 0,
    rx = 0,
    ry = 0,
    rz = 0,
    sx = 1,
    sy = 1,
    sz = 1,
  ): this {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    tmpQ.setFromEuler(tmpE.set(rx, ry, rz));
    g.applyMatrix4(tmpM.compose(tmpP.set(x, y, z), tmpQ, tmpS.set(sx, sy, sz)));
    if (this.frame) g.applyMatrix4(this.frame);
    this.parts.push({ geometry: g, color: new THREE.Color(color) });
    return this;
  }

  /** Box with its base at y. */
  box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    ry = 0,
    rx = 0,
    rz = 0,
  ) {
    return this.add(
      this.proto("box", () => new THREE.BoxGeometry(1, 1, 1)),
      color,
      x,
      y + h / 2,
      z,
      rx,
      ry,
      rz,
      w,
      h,
      d,
    );
  }

  /** Cylinder / cone with its base at y. */
  cyl(
    rt: number,
    rb: number,
    h: number,
    x: number,
    y: number,
    z: number,
    color: THREE.ColorRepresentation,
    seg = 8,
    rx = 0,
    rz = 0,
  ) {
    const g = this.proto(`cyl:${rt}:${rb}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg));
    return this.add(g, color, x, y + h / 2, z, rx, 0, rz, 1, h, 1);
  }

  /** Sphere (or dome with `part` < 1: the top fraction of the sphere). */
  sphere(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, part = 1, sy = 1, seg = 10) {
    const g = this.proto(
      `sph:${part}:${seg}`,
      () => new THREE.SphereGeometry(1, seg, Math.max(4, Math.round(seg * 0.7)), 0, Math.PI * 2, 0, Math.PI * part),
    );
    return this.add(g, color, x, y, z, 0, 0, 0, r, r * sy, r);
  }

  /** A stick between two points. */
  stick(a: THREE.Vector3, b: THREE.Vector3, r: number, color: THREE.ColorRepresentation, seg = 6) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.applyQuaternion(q);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.translate(mid.x, mid.y, mid.z);
    this.add(g, color);
    g.dispose();
    return this;
  }

  /** Low-poly rock (jittered icosahedron), seated with its base near y. */
  rock(r: number, x: number, y: number, z: number, color: THREE.ColorRepresentation, rand: () => number, flat = 0.7) {
    const g = new THREE.IcosahedronGeometry(r, 0);
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const k = 0.8 + rand() * 0.35;
      p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * flat, p.getZ(i) * k);
    }
    this.add(g, color, x, y + r * 0.35, z, 0, rand() * 6, 0);
    g.dispose();
    return this;
  }

  get empty() {
    return this.parts.length === 0;
  }

  /** Merged, vertex-coloured geometry (flat normals); the kit is emptied. */
  build(): THREE.BufferGeometry {
    for (const p of this.parts) {
      p.geometry.deleteAttribute("normal");
      p.geometry.computeVertexNormals();
    }
    const merged = mergeColored(this.parts) ?? new THREE.BufferGeometry();
    for (const p of this.parts) p.geometry.dispose();
    this.parts = [];
    for (const g of this.protos.values()) g.dispose();
    this.protos.clear();
    return merged;
  }
}

/** A model with a moving body (a mount): no painted blotches, which would slide over it. Returns the model. */
export function unpainted<M extends { group: THREE.Object3D }>(model: M): M {
  noPaint(model.group);
  return model;
}

export interface SignBoard {
  mesh: THREE.Mesh;
  dispose(): void;
}

/**
 * A carved sign: a plane with a canvas painted as weathered wood (or stone) with a title and an optional line
 * under it. The plane is `w` wide, its height follows the canvas aspect; it faces +Z. Redrawn when the fonts
 * load. The caller places the mesh (its centre is the board's centre).
 */
export function signBoard(
  toonMat: (c: string) => THREE.Material,
  o: { w: number; title: string; sub?: string; stone?: boolean; px?: [number, number] },
): SignBoard {
  const [cw, ch] = o.px ?? [512, 160];
  const draw = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.fillStyle = o.stone ? "#a39684" : "#7a5233";
    ctx.fillRect(0, 0, w, h);
    // Grain / chisel marks.
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 ? "#000" : "#fff";
      ctx.fillRect(0, (i / 14) * h, w, 2);
    }
    ctx.globalAlpha = 1;
    ctx.strokeStyle = o.stone ? "#6f6455" : "#4a2f1b";
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = o.stone ? "#2b241e" : "#f7e6c4";
    fitFont(ctx, o.title, "800", FONT.display, Math.round(o.sub ? h * 0.34 : h * 0.44), w - 40);
    ctx.fillText(o.title, w / 2, o.sub ? h * 0.38 : h / 2);
    if (o.sub) {
      ctx.fillStyle = o.stone ? "#3e352c" : "#e6c98f";
      fitFont(ctx, o.sub, "700", FONT.body, Math.round(h * 0.2), w - 40);
      ctx.fillText(o.sub, w / 2, h * 0.72);
    }
  };
  const tex = canvasTex(cw, ch, draw);
  const mat = (toonMat("#ffffff") as THREE.MeshToonMaterial).clone();
  mat.map = tex;
  const geo = new THREE.PlaneGeometry(o.w, (o.w * ch) / cw);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-sign";
  const redraw = () => {
    const ctx = (tex.image as HTMLCanvasElement).getContext("2d");
    if (!ctx) return;
    draw(ctx, cw, ch);
    tex.needsUpdate = true;
  };
  onFontsReady(redraw);
  return {
    mesh,
    dispose() {
      offFontsReady(redraw);
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}
