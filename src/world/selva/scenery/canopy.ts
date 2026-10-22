/**
 * Canopy walkway over CANOPY_T: the road leaves the ground on a plank deck that rises to ~9.5 u and comes back
 * down, past three ceibas with plank platforms around their trunks.
 *
 * The deck follows the walkable surface exactly: x, z from `trail.pointAt(t)` and y from
 * `layout.canopyDeckAt(t)` (what `groundAt` returns on the road band), so feet meet the planks. Parts:
 * planks across the band, two stringers below, posts on both edges, a top and a mid rope rail with a slight sag
 * between posts, stilts down to the forest floor where the deck is high, suspension cables from the walkway
 * ceibas to the nearby posts, and the trunk platforms: a plank ring around each walkway ceiba (./platforms.ts
 * is the pure geometry), tilted with the walkway beside it so the planks meet the bridge without a step, with
 * posts and a rope rail on its outer rim. The walkway railing on the tree's side opens where the ring meets the
 * bridge (`railGap`), and ambient/canopy-platforms.ts registers the rings as walkable decks with rim colliders.
 *
 * Draws: everything solid is one vertex-colored merged mesh (casts shadows); the rope netting between the rails
 * is one alpha-tested mesh on the no-outline layer (a net would ink as a solid sheet in the prepass).
 *
 * Wind: the merged mesh rides the shared wind (style-gl.ts windSway, "grass" mode on a `flex` weight): the
 * deck, posts, stilts and beams have weight 0 (feet must meet the planks exactly), the rope rails swing a few
 * centimetres between their posts and the long cables from the trunks sway at mid-span. The traveler's body
 * pushes the rails beside them a little as they pass (the shared pushers). The net stays put: its panels
 * only touch the ropes at the posts, where the ropes do not move.
 */
import * as THREE from "three";
import { mergeColored } from "../../merge-colors";
import { windSway } from "../../style-gl";
import { canvasTex, rng } from "../../tex";
import type { ToonCache } from "../../toon";
import { noOutline } from "../../toon";
import { CANOPY_T, type SelvaLayout } from "../contract";
import { canopyLiftAt } from "./ground";
import { canopyPlatforms, platformY, railGap, rimOutside, ringSpan } from "./platforms";

const C = (hex: string) => new THREE.Color(hex);
const WOOD = [C("#9b7550"), C("#8a6440"), C("#a8835a"), C("#7e5a38")];
const POST = C("#6e4c30");
const ROPE = C("#cdb88c");
const BEAM = C("#5b4029");
/** Largest sway weight (u of swing at full wind) of a rope rail mid-span and of a long cable from a trunk. */
const RAIL_SWING = 0.2;
const CABLE_SWING = 0.3;

/** Sway weight along a rope rail: 0 at its posts, RAIL_SWING half way between two posts (spacing `step`). */
export function railFlex(posts: readonly THREE.Vector3[], step: number) {
  return (p: THREE.Vector3) => {
    let d = Number.POSITIVE_INFINITY;
    for (const q of posts) d = Math.min(d, (p.x - q.x) ** 2 + (p.z - q.z) ** 2);
    const u = Math.min(1, Math.sqrt(d) / (step / 2));
    return RAIL_SWING * Math.sin((u * Math.PI) / 2) ** 2;
  };
}

/** Sway weight of a straight cable from a to b: 0 at both ends, `max` at mid-span. */
export function cableFlex(a: THREE.Vector3, b: THREE.Vector3, max = CABLE_SWING) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const l2 = ab.lengthSq() || 1;
  const t = new THREE.Vector3();
  return (p: THREE.Vector3) => {
    const u = Math.min(1, Math.max(0, t.subVectors(p, a).dot(ab) / l2));
    return max * Math.sin(u * Math.PI);
  };
}

/** Rope net (diamond mesh) for the walkway sides; alpha-tested. */
function netTexture() {
  return canvasTex(
    "selva-net",
    64,
    64,
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "#d8c49a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.moveTo(w, 0);
      ctx.lineTo(0, h);
      ctx.stroke();
    },
    { repeat: true },
  );
}

export interface Walkway {
  objects: THREE.Object3D[];
  dispose(): void;
}

export function buildWalkway(L: SelvaLayout, toon: ToonCache): Walkway {
  const { trail } = L;
  const len = trail.length;
  const hw = trail.halfWidth;
  const R = rng(97);
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix?: THREE.Matrix4 }> = [];
  /** Sway weight per part (same order as `parts`; null = rigid). */
  const flexes: Array<((p: THREE.Vector3) => number) | null> = [];
  const owned: THREE.BufferGeometry[] = [];
  const box = new THREE.BoxGeometry(1, 1, 1);
  const pole = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  owned.push(box, pole);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const tg = new THREE.Vector3();
  const s = new THREE.Vector3();
  const add = (
    geometry: THREE.BufferGeometry,
    color: THREE.Color,
    matrix?: THREE.Matrix4,
    flex: ((p: THREE.Vector3) => number) | null = null,
  ) => {
    parts.push({ geometry, color, matrix: matrix?.clone() });
    flexes.push(flex);
  };
  /** Rope / beam as a thin tube through points (`flex`: its sway weight at a world point). */
  const rope = (
    pts: THREE.Vector3[],
    r: number,
    color: THREE.Color,
    sides = 4,
    flex: ((p: THREE.Vector3) => number) | null = null,
  ) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, Math.max(2, pts.length * 2), r, sides, false);
    owned.push(g);
    add(g, color, undefined, flex);
  };
  const deckAt = (t: number) => L.canopyDeckAt(t) ?? L.heightAt(trail.pointAt(t).x, trail.pointAt(t).z);
  // Deck extent: where the walkway leaves the ground (matches the road ribbon's gap, with a small overlap).
  let t0 = CANOPY_T[0];
  let t1 = CANOPY_T[1];
  for (let t = CANOPY_T[0]; t < CANOPY_T[1]; t += 0.0002)
    if (canopyLiftAt(L, t) > 0.05) {
      t0 = t;
      break;
    }
  for (let t = CANOPY_T[1]; t > CANOPY_T[0]; t -= 0.0002)
    if (canopyLiftAt(L, t) > 0.05) {
      t1 = t;
      break;
    }
  const span = (t1 - t0) * len;

  // ---------------------------------------------------------------- planks + stringers
  const plankStep = 0.42;
  const planks = Math.ceil(span / plankStep);
  for (let i = 0; i <= planks; i++) {
    const t = t0 + ((t1 - t0) * i) / planks;
    trail.pointAt(t, p);
    trail.tangentAt(t, tg);
    const y = deckAt(t);
    // Pitch the plank with the deck's slope (not the road's) so it lies flat on the ramp.
    const h = 0.4 / len;
    const slope = (deckAt(t + h) - deckAt(t - h)) / 0.8;
    e.set(-Math.atan(slope), Math.atan2(tg.x, tg.z), (R() - 0.5) * 0.03, "YXZ");
    q.setFromEuler(e);
    m.compose(p.set(p.x, y - 0.035, p.z), q, s.set(hw * 2 + 0.25, 0.08, 0.36));
    add(box, WOOD[Math.floor(R() * WOOD.length)] as THREE.Color, m);
  }
  const edge = (t: number, side: number, off: number, dy: number) => {
    trail.pointAt(t, p);
    trail.tangentAt(t, tg);
    const f = Math.hypot(tg.x, tg.z) || 1;
    return new THREE.Vector3(p.x - (tg.z / f) * side * off, deckAt(t) + dy, p.z + (tg.x / f) * side * off);
  };
  const along = (side: number, off: number, dy: number, n: number) =>
    Array.from({ length: n + 1 }, (_, k) => edge(t0 + ((t1 - t0) * k) / n, side, off, dy));
  const segs = Math.ceil(span / 2);
  for (const side of [-1, 1]) rope(along(side, hw - 0.35, -0.2, segs), 0.12, BEAM, 5);

  // ---------------------------------------------------------------- posts, rails, stilts, netting
  // The railing on a ceiba's side opens where its platform ring meets the bridge (no posts, rope or net there).
  const platforms = canopyPlatforms(L);
  const gaps = platforms.map((pf) => ({ side: pf.side, t: railGap(L, pf) }));
  const inGap = (t: number, side: number) => gaps.some((g) => g.side === side && t > g.t[0] && t < g.t[1]);
  const postStep = 3.2;
  const posts = Math.max(2, Math.round(span / postStep));
  const netPos: number[] = [];
  const netUv: number[] = [];
  const RAIL = 1.15;
  for (const side of [-1, 1]) {
    let top: THREE.Vector3[] = [];
    let mid: THREE.Vector3[] = [];
    let prev: THREE.Vector3 | null = null;
    let dist = 0;
    const flush = () => {
      if (top.length > 1) {
        // Every other point is a post (the ones between are the sag points).
        const at = railFlex(
          top.filter((_, i) => i % 2 === 0),
          (span / posts) * 1.02,
        );
        rope(top, 0.045, ROPE, 4, at);
        rope(mid, 0.035, ROPE, 4, at);
      }
      top = [];
      mid = [];
      prev = null;
    };
    for (let k = 0; k <= posts; k++) {
      const t = t0 + ((t1 - t0) * k) / posts;
      const base = edge(t, side, hw + 0.12, -0.1);
      // Stilts where the deck is well above the forest floor (also under the railing openings).
      const ground = L.heightAt(base.x, base.z);
      const h = base.y - ground;
      if (h > 1.2 && k % 2 === 0) {
        m.compose(base.clone().setY(ground + h / 2 - 0.1), q.identity(), s.set(0.22, h + 0.2, 0.22));
        add(pole, POST, m);
      }
      if (inGap(t, side)) {
        flush();
        continue;
      }
      m.compose(base.clone().setY(base.y + (RAIL + 0.1) / 2), q.identity(), s.set(0.16, RAIL + 0.2, 0.16));
      add(pole, POST, m);
      // Rails sag a little between posts.
      if (top.length) {
        const a = top[top.length - 1] as THREE.Vector3;
        const b = base.clone().setY(base.y + RAIL);
        top.push(
          a
            .clone()
            .lerp(b, 0.5)
            .setY((a.y + b.y) / 2 - 0.08),
        );
        const am = mid[mid.length - 1] as THREE.Vector3;
        const bm = base.clone().setY(base.y + RAIL * 0.5);
        mid.push(
          am
            .clone()
            .lerp(bm, 0.5)
            .setY((am.y + bm.y) / 2 - 0.06),
        );
      }
      top.push(base.clone().setY(base.y + RAIL));
      mid.push(base.clone().setY(base.y + RAIL * 0.5));
      // Net panel between this post and the previous one (deck edge → top rope).
      const before = prev as THREE.Vector3 | null;
      if (before) {
        const seg = before.distanceTo(base);
        for (const [a, ua] of [
          [before, dist],
          [base, dist + seg],
        ] as const) {
          netPos.push(a.x, a.y + 0.12, a.z, a.x, a.y + RAIL + 0.05, a.z);
          netUv.push(ua / 0.35, 0, ua / 0.35, RAIL / 0.35);
        }
        dist += seg;
      }
      prev = base;
    }
    flush();
  }

  // ---------------------------------------------------------------- platforms around the walkway ceibas
  // Plank rings tilted with the walkway (platformY): each plank box sits on the deck plane at its centre.
  const up = new THREE.Vector3(0, 1, 0);
  const nrm = new THREE.Vector3();
  const tilt = new THREE.Quaternion();
  const deckY = (x: number, z: number) => platformY(L, x, z);
  const lay = (x: number, z: number, yaw: number) => {
    const d = 0.3;
    nrm.set(deckY(x - d, z) - deckY(x + d, z), 2 * d, deckY(x, z - d) - deckY(x, z + d)).normalize();
    tilt.setFromUnitVectors(up, nrm);
    e.set(0, yaw, 0);
    return q.setFromEuler(e).premultiply(tilt);
  };
  for (const pf of platforms) {
    const n = 40;
    for (let k = 0; k < n; k++) {
      const a = ((k + 0.5) / n) * Math.PI * 2;
      const [r0, r1] = ringSpan(L, pf, a);
      if (r1 - r0 < 0.25) continue;
      const rr = (r0 + r1) / 2;
      const x = pf.x + Math.cos(a) * rr;
      const z = pf.z + Math.sin(a) * rr;
      m.compose(
        new THREE.Vector3(x, deckY(x, z) - 0.04, z),
        lay(x, z, -a),
        s.set(r1 - r0, 0.09, ((Math.PI * 2 * r1) / n) * 0.94),
      );
      add(box, WOOD[k % WOOD.length] as THREE.Color, m);
    }
    // Rim posts and rope where the rim clears the bridge; cables from high on the trunk to the posts.
    const rimN = 28;
    let ring: THREE.Vector3[] = [];
    const rimPosts: THREE.Vector3[] = [];
    const rimFlush = () => {
      if (ring.length > 1)
        rope(ring, 0.045, ROPE, 4, railFlex(rimPosts.slice(), ((Math.PI * 2 * pf.outer) / rimN) * 2));
      ring = [];
      rimPosts.length = 0;
    };
    for (let k = 0; k <= rimN; k++) {
      const a = (k / rimN) * Math.PI * 2;
      if (!rimOutside(L, pf, a)) {
        rimFlush();
        continue;
      }
      const bx = pf.x + Math.cos(a) * (pf.outer - 0.1);
      const bz = pf.z + Math.sin(a) * (pf.outer - 0.1);
      const by = deckY(bx, bz);
      const b = new THREE.Vector3(bx, by, bz);
      ring.push(b.clone().setY(by + RAIL));
      if (k % 2 === 0 || ring.length === 1) {
        m.compose(b.clone().setY(by + RAIL / 2), q.identity(), s.set(0.14, RAIL, 0.14));
        add(pole, POST, m);
        rimPosts.push(b.clone().setY(by + RAIL));
      }
      if (k % 4 === 0) {
        const c0 = new THREE.Vector3(pf.x, pf.y + 6, pf.z);
        const c1 = b.clone().setY(by + RAIL);
        rope([c0, c1], 0.035, ROPE, 3, cableFlex(c0, c1, CABLE_SWING * 0.5));
      }
    }
    rimFlush();
    // Knee braces under the platform, into the trunk.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const bx = pf.x + Math.cos(a) * (pf.outer - 0.4);
      const bz = pf.z + Math.sin(a) * (pf.outer - 0.4);
      rope(
        [
          new THREE.Vector3(pf.x + Math.cos(a) * pf.inner, pf.y - 2.6, pf.z + Math.sin(a) * pf.inner),
          new THREE.Vector3(bx, deckY(bx, bz) - 0.1, bz),
        ],
        0.1,
        BEAM,
        5,
      );
    }
    // Suspension cables from the trunk to the walkway posts nearby, both directions along the deck.
    for (const dt of [-7, -3.5, 3.5, 7]) {
      const t = pf.t + dt / len;
      if (t < t0 || t > t1) continue;
      for (const side of [-1, 1]) {
        if (inGap(t, side)) continue;
        const a = edge(t, side, hw + 0.12, RAIL);
        const c0 = new THREE.Vector3(pf.x, pf.y + 7.5, pf.z);
        rope([c0, a], 0.03, ROPE, 3, cableFlex(c0, a));
      }
    }
  }

  // Sway weights in merge order (mergeColored concatenates the parts de-indexed, in order).
  const counts = parts.map((pt) => pt.geometry.index?.count ?? pt.geometry.getAttribute("position").count);
  const merged = mergeColored(parts);
  for (const g of owned) g.dispose();
  const objects: THREE.Object3D[] = [];
  const mats: THREE.Material[] = [];
  if (merged) {
    const pos = merged.getAttribute("position") as THREE.BufferAttribute;
    const flex = new Float32Array(pos.count);
    const v = new THREE.Vector3();
    let o = 0;
    counts.forEach((n, i) => {
      const f = flexes[i];
      if (f) for (let k = o; k < o + n && k < pos.count; k++) flex[k] = f(v.fromBufferAttribute(pos, k));
      o += n;
    });
    merged.setAttribute("flex", new THREE.BufferAttribute(flex, 1));
    // Own material (the toon cache's vertex material is shared): rails and cables on the shared wind.
    const mat = windSway(
      new THREE.MeshToonMaterial({ color: "#ffffff", vertexColors: true, gradientMap: toon.toon("#fff").gradientMap }),
      { mode: "grass", flex: true },
    );
    mats.push(mat);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = "selva-walkway";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    objects.push(mesh);
  }
  if (netPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(netPos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(netUv, 2));
    const idx: number[] = [];
    for (let k = 0; k < netPos.length / 3; k += 4) idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    g.setIndex(idx);
    g.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({
      map: netTexture().tex,
      gradientMap: toon.toon("#fff").gradientMap,
      alphaTest: 0.5,
      side: THREE.DoubleSide,
    });
    mats.push(mat);
    const net = new THREE.Mesh(g, mat);
    net.name = "selva-walkway-net";
    noOutline(net);
    objects.push(net);
  }
  return {
    objects,
    dispose() {
      for (const o of objects) (o as THREE.Mesh).geometry.dispose();
      for (const mt of mats) mt.dispose();
    },
  };
}
