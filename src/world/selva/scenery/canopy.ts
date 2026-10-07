/**
 * Canopy walkway over CANOPY_T: the road leaves the ground on a plank deck that rises to ~9.5 u and comes back
 * down, past three ceibas with plank platforms around their trunks.
 *
 * The deck follows the walkable surface exactly: x, z from `trail.pointAt(t)` and y from
 * `layout.canopyDeckAt(t)` (what `groundAt` returns on the road band), so feet meet the planks. Parts:
 * planks across the band, two stringers below, posts on both edges, a top and a mid rope rail with a slight sag
 * between posts, stilts down to the forest floor where the deck is high, suspension cables from the walkway
 * ceibas to the nearby posts, and the trunk platforms (ring of planks, posts and a rope rail). The platforms
 * are visual only: `groundAt` lifts only the road band, so they get no walkable (the traveler can't step off
 * the band anyway).
 *
 * Draws: everything solid is one vertex-colored merged mesh (casts shadows); the rope netting between the rails
 * is one alpha-tested mesh on the no-outline layer (a net would ink as a solid sheet in the prepass).
 */
import * as THREE from "three";
import { mergeColored } from "../../merge-colors";
import { canvasTex, rng } from "../../tex";
import type { ToonCache } from "../../toon";
import { noOutline } from "../../toon";
import { CANOPY_T, type SelvaLayout } from "../contract";
import { canopyLiftAt } from "./ground";
import type { SceneryPlan } from "./placement";

const C = (hex: string) => new THREE.Color(hex);
const WOOD = [C("#9b7550"), C("#8a6440"), C("#a8835a"), C("#7e5a38")];
const POST = C("#6e4c30");
const ROPE = C("#cdb88c");
const BEAM = C("#5b4029");

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

export function buildWalkway(L: SelvaLayout, toon: ToonCache, plan: SceneryPlan): Walkway {
  const { trail } = L;
  const len = trail.length;
  const hw = trail.halfWidth;
  const R = rng(97);
  const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix?: THREE.Matrix4 }> = [];
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
  const add = (geometry: THREE.BufferGeometry, color: THREE.Color, matrix?: THREE.Matrix4) =>
    parts.push({ geometry, color, matrix: matrix?.clone() });
  /** Rope / beam as a thin tube through points. */
  const rope = (pts: THREE.Vector3[], r: number, color: THREE.Color, sides = 4) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, Math.max(2, pts.length * 2), r, sides, false);
    owned.push(g);
    add(g, color);
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
  const postStep = 3.2;
  const posts = Math.max(2, Math.round(span / postStep));
  const netPos: number[] = [];
  const netUv: number[] = [];
  const RAIL = 1.15;
  for (const side of [-1, 1]) {
    const top: THREE.Vector3[] = [];
    const mid: THREE.Vector3[] = [];
    let prev: THREE.Vector3 | null = null;
    let dist = 0;
    for (let k = 0; k <= posts; k++) {
      const t = t0 + ((t1 - t0) * k) / posts;
      const base = edge(t, side, hw + 0.12, -0.1);
      m.compose(base.clone().setY(base.y + (RAIL + 0.1) / 2), q.identity(), s.set(0.16, RAIL + 0.2, 0.16));
      add(pole, POST, m);
      // Stilts where the deck is well above the forest floor.
      const ground = L.heightAt(base.x, base.z);
      const h = base.y - ground;
      if (h > 1.2 && k % 2 === 0) {
        m.compose(base.clone().setY(ground + h / 2 - 0.1), q.identity(), s.set(0.22, h + 0.2, 0.22));
        add(pole, POST, m);
      }
      // Rails sag a little between posts.
      if (k > 0) {
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
      if (prev) {
        const seg = prev.distanceTo(base);
        for (const [a, ua] of [
          [prev, dist],
          [base, dist + seg],
        ] as const) {
          netPos.push(a.x, a.y + 0.12, a.z, a.x, a.y + RAIL + 0.05, a.z);
          netUv.push(ua / 0.35, 0, ua / 0.35, RAIL / 0.35);
        }
        dist += seg;
      }
      prev = base;
    }
    rope(top, 0.045, ROPE);
    rope(mid, 0.035, ROPE);
  }

  // ---------------------------------------------------------------- platforms around the walkway ceibas
  for (const pf of plan.platforms) {
    const trunkR = 1.25;
    const outer = pf.r + 1.4;
    // A "C" wrapping the back of the trunk: the walkway itself passes on the road side.
    const tq0 = L.trailQuery(pf.x, pf.z);
    const rp = trail.pointAt(tq0.t);
    const toRoad = Math.atan2(rp.z - pf.z, rp.x - pf.x);
    const a0 = toRoad + 1.15;
    const arc = Math.PI * 2 - 2.3;
    const n = 20;
    for (let k = 0; k < n; k++) {
      const a = a0 + ((k + 0.5) / n) * arc;
      const rr = (trunkR + outer) / 2;
      e.set(0, -a, 0);
      q.setFromEuler(e);
      m.compose(
        new THREE.Vector3(pf.x + Math.cos(a) * rr, pf.y - 0.04, pf.z + Math.sin(a) * rr),
        q,
        s.set(outer - trunkR, 0.09, ((arc * outer) / n) * 0.92),
      );
      add(box, WOOD[k % WOOD.length] as THREE.Color, m);
    }
    // Rim posts and rope; cables from high on the trunk to the posts (a hanging-bridge look).
    const ring: THREE.Vector3[] = [];
    const posts = 8;
    for (let k = 0; k <= posts; k++) {
      const a = a0 + (k / posts) * arc;
      const b = new THREE.Vector3(pf.x + Math.cos(a) * (outer - 0.1), pf.y, pf.z + Math.sin(a) * (outer - 0.1));
      ring.push(b.clone().setY(pf.y + RAIL));
      m.compose(b.clone().setY(pf.y + RAIL / 2), q.identity(), s.set(0.14, RAIL, 0.14));
      add(pole, POST, m);
      if (k % 2 === 0) rope([new THREE.Vector3(pf.x, pf.y + 6, pf.z), b.clone().setY(pf.y + RAIL)], 0.035, ROPE, 3);
    }
    rope(ring, 0.045, ROPE);
    // Knee braces under the platform, into the trunk.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      rope(
        [
          new THREE.Vector3(pf.x + Math.cos(a) * trunkR, pf.y - 2.6, pf.z + Math.sin(a) * trunkR),
          new THREE.Vector3(pf.x + Math.cos(a) * (outer - 0.4), pf.y - 0.1, pf.z + Math.sin(a) * (outer - 0.4)),
        ],
        0.1,
        BEAM,
        5,
      );
    }
    // Suspension cables from the trunk to the walkway posts nearby, both directions along the deck.
    const tq = tq0;
    for (const dt of [-7, -3.5, 3.5, 7]) {
      const t = tq.t + dt / len;
      if (t < t0 || t > t1) continue;
      for (const side of [-1, 1]) {
        const a = edge(t, side, hw + 0.12, RAIL);
        rope([new THREE.Vector3(pf.x, pf.y + 7.5, pf.z), a], 0.03, ROPE, 3);
      }
    }
  }

  const merged = mergeColored(parts);
  for (const g of owned) g.dispose();
  const objects: THREE.Object3D[] = [];
  const mats: THREE.Material[] = [];
  if (merged) {
    const mesh = new THREE.Mesh(merged, toon.vertexToon());
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
