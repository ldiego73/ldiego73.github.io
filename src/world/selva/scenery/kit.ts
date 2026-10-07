/**
 * Geometry + material kit for the jungle plants: a vertex-colored GeoBuilder, tapered tubes, arcing paths,
 * lumpy foliage blobs, leaf shading, and the wind-sway toon material that keeps the ink outline on the
 * swaying vertices (see the notes on `swayMaterial` / `inkAware`).
 *
 * Adapted from the mountain's flora/geom.ts and flora/material.ts. Copied rather than imported so the
 * jungle bundle never requests the mountain-only `src/world/flora/` folder (the selva runtime's shots check
 * that), and so either world can evolve its plants without touching the other.
 */
import * as THREE from "three";

export type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;
export type FlexFn = (p: THREE.Vector3) => number;

export interface AddOpts {
  /** Flat color, or a function of the (local) vertex position + normal. Defaults to the part's `color` attribute or white. */
  color?: THREE.ColorRepresentation | ColorFn;
  /** Sway weight per vertex (0 = rigid). */
  flex?: number | FlexFn;
  /** Bird rig: x = wing side (-1 left, 1 right, 0 body), y = 1 for head vertices. */
  rig?: [number, number];
}

const _p = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();

export class GeoBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private flx: number[] = [];
  private rg: number[] = [];

  private idx: number[] = [];

  /** Appends a part (disposed afterwards), keeping its index. Normals must be set (built-ins have them). */
  add(g: THREE.BufferGeometry, o: AddOpts = {}): this {
    if (!g.attributes.normal) g.computeVertexNormals();
    const pa = g.attributes.position as THREE.BufferAttribute;
    const na = g.attributes.normal as THREE.BufferAttribute;
    const ca = g.attributes.color as THREE.BufferAttribute | undefined;
    const fa = g.attributes.flex as THREE.BufferAttribute | undefined;
    const flat = o.color !== undefined && typeof o.color !== "function" ? new THREE.Color(o.color) : null;
    const base = this.pos.length / 3;
    for (let i = 0; i < pa.count; i++) {
      _p.fromBufferAttribute(pa, i);
      _n.fromBufferAttribute(na, i);
      this.pos.push(_p.x, _p.y, _p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      let c: THREE.Color;
      if (typeof o.color === "function") c = o.color(_p, _n);
      else if (flat) c = flat;
      else if (ca) c = _c.fromBufferAttribute(ca, i);
      else c = _c.setRGB(1, 1, 1);
      this.col.push(c.r, c.g, c.b);
      const f = typeof o.flex === "function" ? o.flex(_p) : (o.flex ?? (fa ? fa.getX(i) : 0));
      this.flx.push(f);
      this.rg.push(o.rig?.[0] ?? 0, o.rig?.[1] ?? 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(base + g.index.getX(i));
    else for (let i = 0; i < pa.count; i++) this.idx.push(base + i);
    g.dispose();
    return this;
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  build(o: { flex?: boolean; rig?: boolean } = {}): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.col, 3));
    if (o.flex) g.setAttribute("flex", new THREE.Float32BufferAttribute(this.flx, 1));
    if (o.rig) g.setAttribute("rig", new THREE.Float32BufferAttribute(this.rg, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(1, 0, 0);

/**
 * Tapered tube through `pts` (radius per point), `sides` around, rings perpendicular to the path.
 * Closed with a point at the end when `tip` (the last radius is ignored then). Smooth normals, open base.
 * Optional per-vertex color by (ring index 0..1 along the path, angle 0..1 around).
 */
export function tube(
  pts: THREE.Vector3[],
  radii: number[],
  sides: number,
  o: { tip?: boolean; color?: (s: number, u: number) => THREE.Color; flex?: (s: number) => number } = {},
): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const flx: number[] = [];
  const idx: number[] = [];
  const n = pts.length;
  const rings = o.tip ? n - 1 : n;
  const t = new THREE.Vector3();
  const side = new THREE.Vector3();
  const bin = new THREE.Vector3();
  let prevSide: THREE.Vector3 | null = null;
  for (let k = 0; k < rings; k++) {
    const a = pts[Math.max(0, k - 1)] as THREE.Vector3;
    const b = pts[Math.min(n - 1, k + 1)] as THREE.Vector3;
    t.subVectors(b, a).normalize();
    // Parallel-transport-ish frame: keep the previous side vector, re-orthogonalised (no twisting).
    if (prevSide) side.copy(prevSide).addScaledVector(t, -prevSide.dot(t));
    else side.crossVectors(t, Math.abs(t.y) > 0.9 ? X : UP);
    if (side.lengthSq() < 1e-8) side.crossVectors(t, X);
    side.normalize();
    prevSide = side.clone();
    bin.crossVectors(t, side).normalize();
    const p = pts[k] as THREE.Vector3;
    const r = radii[k] as number;
    const s = k / (n - 1);
    for (let j = 0; j < sides; j++) {
      const ang = (j / sides) * Math.PI * 2;
      const cx = Math.cos(ang);
      const sx = Math.sin(ang);
      pos.push(
        p.x + (side.x * cx + bin.x * sx) * r,
        p.y + (side.y * cx + bin.y * sx) * r,
        p.z + (side.z * cx + bin.z * sx) * r,
      );
      const c = o.color?.(s, j / sides);
      col.push(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1);
      flx.push(o.flex?.(s) ?? 0);
    }
  }
  for (let k = 0; k < rings - 1; k++)
    for (let j = 0; j < sides; j++) {
      const a = k * sides + j;
      const b = k * sides + ((j + 1) % sides);
      const c = (k + 1) * sides + ((j + 1) % sides);
      const d = (k + 1) * sides + j;
      idx.push(a, b, c, a, c, d);
    }
  if (o.tip) {
    const p = pts[n - 1] as THREE.Vector3;
    const ti = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    const c = o.color?.(1, 0);
    col.push(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1);
    flx.push(o.flex?.(1) ?? 0);
    const k = rings - 1;
    for (let j = 0; j < sides; j++) idx.push(k * sides + j, k * sides + ((j + 1) % sides), ti);
  } else {
    // Flat cap at the end.
    const k = rings - 1;
    const p = pts[n - 1] as THREE.Vector3;
    const ci = pos.length / 3;
    pos.push(p.x, p.y, p.z);
    const c = o.color?.(1, 0);
    col.push(c?.r ?? 1, c?.g ?? 1, c?.b ?? 1);
    flx.push(o.flex?.(1) ?? 0);
    for (let j = 0; j < sides; j++) idx.push(k * sides + j, k * sides + ((j + 1) % sides), ci);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("flex", new THREE.Float32BufferAttribute(flx, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A path that starts at `base`, heads along `dir` (horizontal) tilted `lean` from vertical, and bends by `bend` (rad) toward the tip. */
export function arcPath(base: THREE.Vector3, dirAngle: number, len: number, lean: number, bend: number, segs: number) {
  const pts = [base.clone()];
  const dx = Math.cos(dirAngle);
  const dz = Math.sin(dirAngle);
  const p = base.clone();
  const step = len / segs;
  for (let k = 1; k <= segs; k++) {
    const th = lean + bend * ((k - 0.5) / segs);
    p.x += Math.sin(th) * dx * step;
    p.z += Math.sin(th) * dz * step;
    p.y += Math.cos(th) * step;
    pts.push(p.clone());
  }
  return pts;
}

/** Lumpy foliage blob: icosahedron with seeded radial jitter, squashed vertically by `sy`. */
export function blob(r: number, sy: number, seed: number, detail = 1): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k =
      1 +
      0.11 * Math.sin((x * 9) / r + seed) * Math.cos((z * 7) / r - seed * 1.3) +
      0.06 * Math.sin((y * 13) / r + seed * 2);
    p.setXYZ(i, x * k, y * k * sy, z * k);
  }
  // Merge the seam duplicates' normals: icosahedron is non-indexed, so smooth by position.
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const merged = mergeByPosition(g);
  merged.computeVertexNormals();
  g.dispose();
  return merged;
}

/** Index a non-indexed geometry by identical positions (so computeVertexNormals smooths across faces). */
function mergeByPosition(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const p = g.attributes.position as THREE.BufferAttribute;
  const map = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let k = map.get(key);
    if (k === undefined) {
      k = pos.length / 3;
      map.set(key, k);
      pos.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    idx.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}

/** Foliage shading baked into vertex colors: darker underside, lighter sunlit top (on top of the toon bands). */
export function leafShade(under: string, mid: string, top: string): ColorFn {
  const u = new THREE.Color(under);
  const m = new THREE.Color(mid);
  const t = new THREE.Color(top);
  const out = new THREE.Color();
  return (_p, n) => (n.y < 0 ? out.copy(m).lerp(u, -n.y) : out.copy(m).lerp(t, n.y * n.y));
}

// ---------------------------------------------------------------- wind sway material

/** Shared flag: 1 while the outline prepass draws. Set by `inkAware` meshes right before their draw. */
const INK = { value: 0 };

/** Makes a mesh using one of these materials ink-correct (call once per mesh). */
export function inkAware(mesh: THREE.Mesh) {
  mesh.onBeforeRender = (_r, scene) => {
    INK.value = (scene as THREE.Scene).overrideMaterial ? 1 : 0;
  };
}

const INK_FRAG_PARS = "#include <common>\nuniform float uInkPass;";
const INK_FRAG_OUT = `#include <dithering_fragment>
  if (uInkPass > 0.5) gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);`;

function baseToon(gradientMap: THREE.Texture | null, side: THREE.Side) {
  const m = new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap, side });
  m.allowOverride = false;
  return m;
}

export interface SwayUniforms {
  uTime: { value: number };
  /** Sway amplitude multiplier (0 = still, e.g. reduced motion). */
  uWind: { value: number };
}

/**
 * Vertex-colored toon material with wind sway: each vertex moves by `flex` (attribute) × instance height
 * scale along a slowly turning world wind direction, with per-instance phase (from the instance position)
 * and travelling gusts so a meadow ripples instead of pulsing in sync.
 */
export function swayMaterial(gradientMap: THREE.Texture | null, u: SwayUniforms, side: THREE.Side = THREE.FrontSide) {
  const m = baseToon(gradientMap, side);
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = u.uTime;
    shader.uniforms.uWind = u.uWind;
    shader.uniforms.uInkPass = INK;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float flex;\nuniform float uTime, uWind;")
      .replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec2 ip = instanceMatrix[3].xz;
          float isc = length(instanceMatrix[1].xyz);
        #else
          vec2 ip = vec2(0.0);
          float isc = 1.0;
        #endif
        // Wind: a gentle prevailing direction that wanders, gusts rolling across the slope.
        vec2 wdir = normalize(vec2(0.8 + 0.3 * sin(uTime * 0.05), 0.55 + 0.3 * cos(uTime * 0.043)));
        float along = dot(ip, wdir);
        float gust = 0.55 + 0.45 * sin(along * 0.09 - uTime * 0.9) * sin(along * 0.023 + uTime * 0.31);
        float ph = uTime * 1.7 + ip.x * 0.37 + ip.y * 0.29;
        float sw = (0.6 + 0.4 * sin(ph) + 0.18 * sin(ph * 2.3 + 1.1)) * gust;
        float k = flex * isc * uWind;
        mvPosition.xz += wdir * sw * k + vec2(-wdir.y, wdir.x) * sin(ph * 1.3) * 0.25 * k;
        mvPosition.y -= sw * sw * k * 0.18;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", INK_FRAG_PARS)
      .replace("#include <dithering_fragment>", INK_FRAG_OUT);
  };
  m.customProgramCacheKey = () => "selva-sway";
  return m;
}
