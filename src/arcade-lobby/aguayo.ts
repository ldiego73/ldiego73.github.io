import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Reward skin "aguayo" for the 3D lobby cabinets (world passport complete), matching the per-game cabinet in
 * games/core/shell.css: a woven aguayo band (zig-zag diamonds in gold and green over a red ground, framed by
 * cotton and indigo stripes) runs up the front pillars and the side panels and across the kick plate; the
 * marquee carries a khipu (a twisted two-ply primary cord with knotted pendant cords in wool colors); the
 * screen gets a gold frame. Five draw calls per cabinet; built only when the skin is first worn.
 */

export const WOOL = {
  red: "#b8304f",
  gold: "#e2a83c",
  green: "#2f7d5b",
  indigo: "#34418f",
  cotton: "#efe2c4",
  cordDark: "#6b4423",
  cordLight: "#c58b4a",
  knot: "#1f1a17",
} as const;

/**
 * Woven band pattern, one tile of `w` × `h` cells along the band (row 0 and h-1 are the edges): indigo and
 * cotton edge stripes, red ground, a gold zig-zag and a green zig-zag in counter-phase that meet in diamonds.
 */
export function wovenCell(x: number, y: number, w = 16, h = 16): keyof typeof WOOL {
  if (y === 0 || y === h - 1) return "indigo";
  if (y === 1 || y === h - 2) return "cotton";
  const mid = (h - 1) / 2;
  const amp = mid - 3;
  const p = x % w;
  const tri = Math.abs((p / w) * 4 - 2) - 1; // -1..1, period w (two teeth)
  const gold = Math.round(mid + tri * amp);
  const green = Math.round(mid - tri * amp);
  if (Math.abs(y - gold) <= 0.5) return "gold";
  if (Math.abs(y - green) <= 0.5) return "green";
  // Diamond hearts where the zig-zags cross.
  if (Math.abs(tri) < 0.2 && Math.abs(y - mid) <= 1) return "gold";
  return "red";
}

function tex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The band texture: `vertical` runs the pattern along v (pillars), otherwise along u (kick plate). */
function wovenTexture(vertical: boolean) {
  const N = 16;
  return tex(N, N, (ctx) => {
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++) {
        ctx.fillStyle = WOOL[wovenCell(a, b, N, N)];
        if (vertical) ctx.fillRect(b, a, 1, 1);
        else ctx.fillRect(a, b, 1, 1);
      }
  });
}

/** A plane whose UVs repeat the band tile every `tile` units along its long side. */
function bandPlane(w: number, h: number, tile: number, vertical: boolean) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.getAttribute("uv") as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++)
    uv.setXY(i, uv.getX(i) * (vertical ? 1 : w / tile), uv.getY(i) * (vertical ? h / tile : 1));
  return g;
}

export interface AguayoTrim {
  group: THREE.Group;
  /** Brightness with the cabinet's focus (0 idle … 1 focused), like the neon trim. */
  setFocus(focus: number): void;
  dispose(): void;
}

/** Builds the trim for the lobby cabinet (cabinet.ts layout: 0.72 wide body, front pillars at x ±0.37). */
export function buildAguayoTrim(): AguayoTrim {
  const group = new THREE.Group();
  group.name = "aguayo";
  const geos: THREE.BufferGeometry[] = [];
  const texs: THREE.Texture[] = [];
  const mats: THREE.Material[] = [];
  const matte = (map?: THREE.Texture, color = "#ffffff") => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      ...(map ? { map } : {}),
    });
    mats.push(m);
    return m;
  };
  const vTex = wovenTexture(true);
  const hTex = wovenTexture(false);
  texs.push(vTex, hTex);

  // Woven pillars (front) and side bands, merged into one mesh. Band width 0.1 → one tile per 0.1 u.
  const parts: THREE.BufferGeometry[] = [];
  const m4 = new THREE.Matrix4();
  const place = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry: number) => {
    g.applyMatrix4(m4.makeRotationY(ry).setPosition(x, y, z));
    parts.push(g);
  };
  const W = 0.1;
  for (const s of [-1, 1]) {
    place(bandPlane(W, 1.36, W, true), s * 0.35, 0.82, 0.324, 0);
    // Side panels: lower body (front edge at z 0.30) and upper body (front edge at z 0.16).
    place(bandPlane(W, 0.74, W, true), s * 0.364, 0.5, 0.22, (s * Math.PI) / 2);
    place(bandPlane(W, 0.5, W, true), s * 0.364, 1.24, 0.08, (s * Math.PI) / 2);
  }
  const pillars = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  geos.push(pillars);
  const litV = matte(vTex);
  group.add(new THREE.Mesh(pillars, litV));

  // Kick plate band across the base.
  const kickGeo = bandPlane(0.6, W, W, false);
  geos.push(kickGeo);
  const litH = matte(hTex);
  const kick = new THREE.Mesh(kickGeo, litH);
  kick.position.set(0, 0.17, 0.354);
  group.add(kick);

  // Gold frame behind the screen (the screen plane is 0.56 × 0.42 at z 0.225).
  const frameGeo = new THREE.PlaneGeometry(0.61, 0.47);
  geos.push(frameGeo);
  const gold = matte(undefined, WOOL.gold);
  const frame = new THREE.Mesh(frameGeo, gold);
  frame.position.set(0, 1.27, 0.2235);
  group.add(frame);

  // Khipu marquee: the primary cord (twisted two-ply) along the marquee's lower edge.
  const cordTex = tex(16, 4, (ctx) => {
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = Math.floor((x + y) / 4) % 2 ? WOOL.cordLight : WOOL.cordDark;
        ctx.fillRect(x, y, 1, 1);
      }
  });
  cordTex.repeat.set(14, 1);
  texs.push(cordTex);
  const cordGeo = new THREE.BoxGeometry(0.72, 0.03, 0.03);
  geos.push(cordGeo);
  const cordMat = matte(cordTex);
  const cord = new THREE.Mesh(cordGeo, cordMat);
  cord.position.set(0, 1.545, 0.38);
  group.add(cord);

  // Pendant cords with knots, instanced (one draw call): 11 cords, 1–3 knots each.
  const colors = [WOOL.red, WOOL.gold, WOOL.cotton, WOOL.green, WOOL.indigo];
  const CORDS = 11;
  const knots: Array<[number, number]> = [];
  for (let i = 0; i < CORDS; i++) {
    const k = 1 + ((i * 7) % 3);
    for (let j = 0; j < k; j++) knots.push([i, 0.026 + j * 0.03 + ((i * 5) % 3) * 0.006]);
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  geos.push(box);
  const pendMat = matte();
  const pend = new THREE.InstancedMesh(box, pendMat, CORDS + knots.length);
  pend.name = "khipu-pendants";
  const o = new THREE.Object3D();
  const c = new THREE.Color();
  const cx = (i: number) => -0.3 + (0.6 * i) / (CORDS - 1);
  for (let i = 0; i < CORDS; i++) {
    const len = 0.095 + ((i * 3) % 4) * 0.01;
    o.position.set(cx(i), 1.53 - len / 2, 0.382);
    o.scale.set(0.016, len, 0.016);
    o.updateMatrix();
    pend.setMatrixAt(i, o.matrix);
    pend.setColorAt(i, c.set(colors[i % colors.length]!));
  }
  knots.forEach(([i, d], j) => {
    o.position.set(cx(i), 1.53 - d, 0.382);
    o.scale.setScalar(0.03);
    o.updateMatrix();
    pend.setMatrixAt(CORDS + j, o.matrix);
    pend.setColorAt(CORDS + j, c.set(WOOL.knot));
  });
  group.add(pend);

  const lit = [litV, litH, gold, cordMat, pendMat];
  const base = lit.map((m) => m.color.clone());
  return {
    group,
    setFocus(focus) {
      const k = 0.9 + focus * 0.1;
      for (let i = 0; i < lit.length; i++) lit[i]!.color.copy(base[i]!).multiplyScalar(k);
    },
    dispose() {
      group.removeFromParent();
      pend.dispose();
      for (const g of geos) g.dispose();
      for (const t of texs) t.dispose();
      for (const m of mats) m.dispose();
    },
  };
}
