/**
 * Meshes for the waterfall cave: stepping stones (instanced), the grotto shell under an overhang (merged rock),
 * a dark flagstone floor that follows the ground, the veil of water over the mouth, glowworm specks, a
 * petroglyph panel and an old khipu on a peg. Authored in the cliff's local frame (see ./placement.ts).
 * No helper here exports `create` (it's not an ambient).
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { WorldEnv } from "../../contract";
import { DYE, WORLD } from "../../palette";
import { type CavePlan, type Frame, INSIDE_X0, INSIDE_X1, toWorld } from "./placement";

const rng = (seed: number) => {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** A jittered box (rough rock block), non-indexed, without uvs. */
function rock(R: () => number, w: number, h: number, d: number, x: number, y: number, z: number, j = 0.22) {
  const g = new THREE.BoxGeometry(w, h, d, 2, 2, 2).toNonIndexed();
  const p = g.attributes.position as THREE.BufferAttribute;
  // Same jitter for shared corners: hash by rounded position so faces stay closed.
  const off = new Map<string, [number, number, number]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = off.get(k);
    if (!o) {
      o = [(R() - 0.5) * j * 2, (R() - 0.5) * j * 2, (R() - 0.5) * j * 2];
      off.set(k, o);
    }
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  g.deleteAttribute("uv");
  g.translate(x, y, z);
  g.computeVertexNormals();
  return g;
}

function petroglyphTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 160;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#c8743a";
  ctx.fillStyle = "#c8743a";
  ctx.lineWidth = 6;
  // Sun (Inti) with rays.
  ctx.beginPath();
  ctx.arc(46, 44, 16, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(46 + Math.cos(a) * 24, 44 + Math.sin(a) * 24);
    ctx.lineTo(46 + Math.cos(a) * 33, 44 + Math.sin(a) * 33);
    ctx.stroke();
  }
  // Two llamas (stick petroglyph style).
  const llama = (x: number, y: number, s: number) => {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 34 * s, y); // back
    ctx.moveTo(x + 34 * s, y);
    ctx.lineTo(x + 40 * s, y - 26 * s); // neck
    ctx.lineTo(x + 48 * s, y - 24 * s); // head
    ctx.moveTo(x + 40 * s, y - 26 * s);
    ctx.lineTo(x + 39 * s, y - 34 * s); // ear
    for (const lx of [2, 9, 26, 33]) {
      ctx.moveTo(x + lx * s, y);
      ctx.lineTo(x + lx * s + 1, y + 22 * s);
    }
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5 * s, y - 6 * s); // tail
    ctx.stroke();
  };
  llama(104, 70, 1);
  llama(170, 84, 0.8);
  // Spiral (water / the road) and zig-zag stream.
  ctx.beginPath();
  for (let i = 0; i < 70; i++) {
    const a = i * 0.28;
    const r = 2 + i * 0.32;
    const x = 214 + Math.cos(a) * r;
    const y = 40 + Math.sin(a) * r;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(18, 136);
  for (let x = 18; x <= 236; x += 14) ctx.lineTo(x + 7, (x / 14) % 2 ? 124 : 144);
  ctx.stroke();
  // Pecked dots (knot counts).
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    ctx.arc(26 + i * 9, 98 + (i % 3) * 7, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Soft round dot for point sprites (glowworms). */
export function dotTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.8)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Falling-water streaks: white/pale-teal vertical strands on transparent, tiling vertically. */
function streakTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d") as CanvasRenderingContext2D;
  ctx.fillStyle = "rgba(120,200,210,0.55)";
  ctx.fillRect(0, 0, w, h);
  const R = rng(0x5ea);
  for (let i = 0; i < 26; i++) {
    const x = R() * w;
    const y = R() * h;
    const len = 20 + R() * 60;
    ctx.fillStyle = R() < 0.6 ? "rgba(255,255,255,0.9)" : "rgba(200,240,244,0.8)";
    ctx.fillRect(x, y, 1.5 + R() * 2, len);
    if (y + len > h) ctx.fillRect(x, y - h, 1.5, len);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 1.4);
  return t;
}

export interface CaveModels {
  group: THREE.Group;
  /** Hidden while the traveler is inside so the follow camera can see in. */
  roof: THREE.Object3D;
  veil: THREE.Mesh<THREE.BufferGeometry, THREE.MeshToonMaterial>;
  glow: THREE.Points;
  glowBase: Float32Array;
  /** Khipu position (world) for the "Explorar" prompt. */
  khipuAt: THREE.Vector3;
  dispose(): void;
}

export function buildCave(env: WorldEnv, f: Frame, plan: CavePlan, opts: { low: boolean }): CaveModels {
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const own = <T extends THREE.BufferGeometry>(g: T) => {
    geos.push(g);
    return g;
  };
  const R = rng(0xca7e);
  const w = new THREE.Vector3();
  /** Ground height in the local frame (relative to the cliff base). */
  const ground = (lx: number, lz: number) => {
    toWorld(f, lx, lz, w);
    return env.heightAt(w.x, w.z) - f.y;
  };
  const fy = plan.floorY - f.y;

  const group = new THREE.Group();
  group.name = "waterfall-cave";

  // ---------------------------------------------------------------- stepping stones (world space, instanced)
  {
    const g = new THREE.CylinderGeometry(0.4, 0.47, 0.5, 7, 1).toNonIndexed();
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i));
      const k = 1 + 0.12 * Math.sin(a * 3 + 1.3) + 0.06 * Math.cos(a * 5);
      p.setXYZ(i, p.getX(i) * k, p.getY(i) + (p.getY(i) > 0 ? 0.03 * Math.sin(a * 2) : 0), p.getZ(i) * k * 0.82);
    }
    g.deleteAttribute("uv");
    g.computeVertexNormals();
    own(g);
    const stones = new THREE.InstancedMesh(g, env.toon("#ffffff"), plan.stones.length);
    stones.name = "cave-stones";
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const tones = ["#8f877b", "#9a9184", "#7f786d", "#a39a8b"];
    plan.stones.forEach((st, i) => {
      const k = 0.85 + st.seed * 0.3;
      s.set(k, 1, k);
      q.setFromEuler(e.set(0, st.yaw, 0));
      // Top just above the ground at the centre; the downhill side shows as a step riser.
      m.compose(w.set(st.x, st.y - 0.2, st.z), q, s);
      stones.setMatrixAt(i, m);
      stones.setColorAt(i, col.set(tones[Math.floor(st.seed * tones.length) % tones.length] as string));
    });
    stones.instanceMatrix.needsUpdate = true;
    if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
    stones.receiveShadow = true;
    stones.computeBoundingSphere();
    group.add(stones);
  }

  // ---------------------------------------------------------------- grotto (local frame)
  const local = new THREE.Group();
  local.position.set(f.x, f.y, f.z);
  local.rotation.y = f.yaw;
  group.add(local);

  const top = fy + 2.65;
  const xR = INSIDE_X1 + 0.75; // right pillar, against the cliff's side rock
  const xL = INSIDE_X0 - 0.75; // left end wall
  // Walls (merged, the cliff's stone).
  const wallParts: THREE.BufferGeometry[] = [];
  for (let lx = xL + 0.4; lx < xR; lx += 1.5)
    wallParts.push(rock(R, 1.8, top - fy + 1.6, 0.9, lx + 0.5, fy + (top - fy) / 2 - 0.4, -0.95));
  wallParts.push(rock(R, 1.0, top - fy + 3.2, 2.3, xL, fy + (top - fy) / 2 - 1.2, 0.15));
  wallParts.push(rock(R, 0.9, top - fy + 2.6, 1.7, xR, fy + (top - fy) / 2 - 0.9, -0.1));
  // A low boulder at the front-left corner, so the opening reads as a mouth, not a porch.
  wallParts.push(rock(R, 1.5, 1.5, 1.0, xL + 0.9, ground(xL + 0.9, 1.35) + 0.4, 1.35, 0.25));
  const walls = new THREE.Mesh(own(mergeGeometries(wallParts) as THREE.BufferGeometry), env.toon(WORLD.stoneDark));
  for (const g of wallParts) g.dispose();
  walls.name = "cave-walls";
  walls.castShadow = true;
  walls.receiveShadow = true;
  local.add(walls);

  // Roof: an overhanging slab with a drooping front lip (hidden while inside).
  const roofParts = [
    rock(R, xR - xL + 1.4, 0.75, 2.9, (xL + xR) / 2, top + 0.32, -0.05, 0.18),
    rock(R, xR - xL + 0.6, 0.55, 0.7, (xL + xR) / 2, top + 0.05, 1.35, 0.16),
  ];
  const roof = new THREE.Mesh(own(mergeGeometries(roofParts) as THREE.BufferGeometry), env.toon(WORLD.stoneDark));
  for (const g of roofParts) g.dispose();
  roof.name = "cave-roof";
  roof.castShadow = true;
  local.add(roof);

  // Dark inner liner on the back wall (the cave's own darkness, independent of the sun angle).
  const liner = new THREE.Mesh(own(new THREE.PlaneGeometry(xR - xL - 0.6, top - fy + 0.4)), env.toon("#34302c"));
  liner.position.set((xL + xR) / 2, fy + (top - fy) / 2 - 0.1, -0.48);
  liner.name = "cave-liner";
  env.noOutline(liner);
  local.add(liner);

  // Flagstone floor following the ground.
  {
    const nx = 16;
    const nz = 6;
    const g = new THREE.PlaneGeometry(1, 1, nx, nz);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const lx = xL + 0.3 + (p.getX(i) + 0.5) * (xR - xL - 0.6);
      const lz = -0.55 + (p.getZ(i) + 0.5) * 1.75;
      p.setXYZ(i, lx, ground(lx, lz) + 0.05, lz);
    }
    g.deleteAttribute("uv");
    g.computeVertexNormals();
    const floor = new THREE.Mesh(own(g), env.toon("#4a443d"));
    floor.name = "cave-floor";
    floor.receiveShadow = true;
    env.noOutline(floor);
    local.add(floor);
  }

  // ---------------------------------------------------------------- veil of water over the mouth
  // Own translucent veil: vertical streaks scrolled by the ambient (texture offset), so the grotto shows
  // through dimly and the follow camera can see the traveler from outside.
  const veilTex = streakTexture();
  texs.push(veilTex);
  // Lit (toon) so it darkens with the night like the main waterfall.
  const veilMat = env.toon("#d9f1f2").clone();
  veilMat.map = veilTex;
  veilMat.transparent = true;
  veilMat.opacity = 0.62;
  veilMat.depthWrite = false;
  veilMat.side = THREE.DoubleSide;
  veilMat.needsUpdate = true;
  mats.push(veilMat);
  const veilW = xR - xL - 0.9;
  const vg = own(new THREE.PlaneGeometry(veilW, 1, 8, 1));
  {
    const p = vg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const lx = (xL + xR) / 2 + p.getX(i);
      const y = p.getY(i) > 0 ? top - 0.15 : ground(lx, 1.6) + 0.1;
      p.setXYZ(i, lx, y, 1.6 + 0.05 * Math.sin(lx * 3));
    }
    vg.computeVertexNormals();
  }
  const veil = new THREE.Mesh(vg, veilMat);
  veil.name = "cave-veil";
  veil.renderOrder = 2;
  env.noOutline(veil);
  local.add(veil);
  // Foam where the veil lands.
  {
    const fg = own(new THREE.IcosahedronGeometry(0.22, 0));
    const n = opts.low ? 4 : 8;
    const foam = new THREE.InstancedMesh(fg, env.toon("#ffffff"), n);
    foam.name = "cave-foam";
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const lx = xL + 0.8 + ((i + 0.5) / n) * (veilW - 0.4);
      const s = 0.8 + R() * 0.6;
      m.makeScale(s, s * 0.7, s).setPosition(lx, ground(lx, 1.75) + 0.08, 1.75 + (R() - 0.5) * 0.3);
      foam.setMatrixAt(i, m);
    }
    env.noOutline(foam);
    local.add(foam);
  }

  // ---------------------------------------------------------------- glowworms (roof underside + upper back wall)
  const gn = opts.low ? 18 : 40;
  const gpos = new Float32Array(gn * 3);
  const gcol = new Float32Array(gn * 3);
  for (let i = 0; i < gn; i++) {
    const onRoof = i % 3 !== 0;
    const lx = xL + 0.5 + R() * (xR - xL - 1.0);
    gpos[i * 3] = lx;
    gpos[i * 3 + 1] = onRoof ? top - 0.08 - R() * 0.12 : fy + 1.5 + R() * 1.0;
    gpos[i * 3 + 2] = onRoof ? -0.4 + R() * 1.6 : -0.42;
  }
  const glowGeo = own(new THREE.BufferGeometry());
  glowGeo.setAttribute("position", new THREE.BufferAttribute(gpos, 3));
  glowGeo.setAttribute("color", new THREE.BufferAttribute(gcol, 3));
  const dotTex = dotTexture();
  texs.push(dotTex);
  const glowMat = new THREE.PointsMaterial({
    map: dotTex,
    size: 0.16,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  mats.push(glowMat);
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.name = "cave-glowworms";
  env.noOutline(glow);
  local.add(glow);
  const glowBase = new Float32Array(gn);
  for (let i = 0; i < gn; i++) glowBase[i] = R() * Math.PI * 2;

  // ---------------------------------------------------------------- petroglyph panel (back wall)
  const petroTex = petroglyphTexture();
  texs.push(petroTex);
  const petroMat = env.toon("#ffffff").clone();
  petroMat.map = petroTex;
  petroMat.transparent = true;
  petroMat.alphaTest = 0.4;
  petroMat.needsUpdate = true;
  mats.push(petroMat);
  const petro = new THREE.Mesh(own(new THREE.PlaneGeometry(1.7, 1.06)), petroMat);
  petro.position.set(-8.6, fy + 1.45, -0.44);
  petro.name = "cave-petroglyph";
  env.noOutline(petro);
  local.add(petro);

  // ---------------------------------------------------------------- old khipu on a wooden peg
  const khipu = new THREE.Group();
  khipu.name = "cave-khipu";
  khipu.position.set(-6.7, fy + 1.95, -0.3);
  local.add(khipu);
  const peg = new THREE.Mesh(own(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 6)), env.toon(WORLD.bark));
  peg.rotation.x = Math.PI / 2;
  peg.position.set(0, 0.05, -0.05);
  khipu.add(peg);
  {
    const pendants = 9;
    const cordGeo = own(new THREE.CylinderGeometry(0.014, 0.014, 1, 4));
    const knotGeo = own(new THREE.IcosahedronGeometry(0.034, 0));
    const cords = new THREE.InstancedMesh(cordGeo, env.toon("#ffffff"), pendants + 1);
    const knots = new THREE.InstancedMesh(knotGeo, env.toon("#ffffff"), pendants * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const col = new THREE.Color();
    // Faded dyes: old cotton and alpaca with a few coloured cords.
    const dyes = ["#d8cdb6", DYE.alpaca, "#b5654f", "#d8cdb6", "#7d6b9e", DYE.alpaca, "#c9a25a", "#d8cdb6", "#5f8a83"];
    // Primary cord (horizontal, slightly sagging via a small tilt).
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    m.compose(new THREE.Vector3(0, 0, 0), q, new THREE.Vector3(1, 0.95, 1));
    cords.setMatrixAt(0, m);
    cords.setColorAt(0, col.set("#cbbd9f"));
    let kn = 0;
    for (let i = 0; i < pendants; i++) {
      const x = -0.4 + (i / (pendants - 1)) * 0.8;
      const len = 0.42 + ((i * 37) % 11) / 30;
      m.compose(new THREE.Vector3(x, -len / 2, 0), q.identity(), new THREE.Vector3(1, len, 1));
      cords.setMatrixAt(i + 1, m);
      cords.setColorAt(i + 1, col.set(dyes[i % dyes.length] as string));
      const nk = 1 + ((i * 5) % 3);
      for (let k = 0; k < nk; k++) {
        m.makeTranslation(x, -0.12 - k * 0.11 - ((i * 13) % 5) * 0.02, 0);
        knots.setMatrixAt(kn, m);
        knots.setColorAt(kn, col.set(dyes[i % dyes.length] as string).multiplyScalar(0.8));
        kn++;
      }
    }
    knots.count = kn;
    cords.instanceMatrix.needsUpdate = true;
    knots.instanceMatrix.needsUpdate = true;
    if (cords.instanceColor) cords.instanceColor.needsUpdate = true;
    if (knots.instanceColor) knots.instanceColor.needsUpdate = true;
    khipu.add(cords, knots);
  }
  // A clay pot (offering) on the floor below the khipu.
  {
    const pts = [
      [0.0, 0],
      [0.14, 0.02],
      [0.2, 0.12],
      [0.19, 0.24],
      [0.1, 0.33],
      [0.11, 0.38],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const pot = new THREE.Mesh(own(new THREE.LatheGeometry(pts, 10)), env.toon(WORLD.adobe));
    pot.position.set(-6.2, ground(-6.2, 0.05) + 0.02, 0.05);
    pot.name = "cave-pot";
    local.add(pot);
  }

  const khipuAt = new THREE.Vector3();
  local.updateMatrixWorld(true);
  khipu.getWorldPosition(khipuAt);
  // The petroglyph sits a couple of metres along the wall: the prompt point is between both.
  toWorld(f, -7.6, 0.3, w);
  khipuAt.set(w.x, khipuAt.y, w.z);

  return {
    group,
    roof,
    veil,
    glow,
    glowBase,
    khipuAt,
    dispose() {
      group.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
      for (const t of texs) t.dispose();
    },
  };
}
