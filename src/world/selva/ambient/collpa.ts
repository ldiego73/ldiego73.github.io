/**
 * Collpa de guacamayos (station "collpa", kind collpa): the end of the Antisuyu road. A wooden viewpoint deck
 * on stilts at the bank edge, a bench facing the river, a carved sign ("Fin del camino — vuelve por el punku o
 * en canoa"), and across the river the collpa itself: a reddish clay-lick cliff rising from the far bank, in
 * banded strata of clay under a cap of dark soil, roots and overhanging green, with a talus of fallen clay at
 * the waterline. The macaws that come to eat the clay belong to the fauna agent: the face is placed by
 * collpa/spot.ts (pure, exported), so they can cling to `collpaCliff(layout).point(u, v)` in the clay band.
 * The massif behind the face is a keep-out for walking fauna. The deck is a raised walkable deck at its real
 * height (station.ts addDeck) on every terrain resolution, out to its railings (railing colliders keep the
 * traveler inside them; beyond the deck the bank is not walkable ground anyway).
 *
 * Draw calls: the cliff (one vertex-colored mesh), the deck/bench/sign posts (one), the sign (one).
 */
import * as THREE from "three";
import { fit } from "../../ambient/fields/signs";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { FONT, Kit, rng } from "../../props";
import type { SelvaEnv } from "../contract";
import { collpaCliff, MASSIF_DEPTH, VIEW_LOCAL } from "./collpa/spot";
import {
  A,
  bake,
  deck,
  disposeTree,
  drawCarved,
  railing,
  signBoards,
  stationCull,
  stationMaterial,
  stilt,
} from "./embarcadero/amazon";
import { addDeck, at, groundOf, segmentCircles, stationFrame, stationGroup } from "./embarcadero/station";

const STATION = "collpa";
const SIGN: { title: L; sub: L } = {
  title: { es: "FIN DEL CAMINO", en: "END OF THE ROAD" },
  sub: { es: "Vuelve por el punku o en canoa", en: "Head back through the punku or by canoe" },
};
/** Viewpoint deck (local): level, from the apron out over the bank on stilts; its top above the origin. */
const DECK = { x0: -3.4, x1: 3.4, z0: -9.8, z1: -5.0 };
const DECK_Y = 0.08;
/** The side railings stop this far short of the apron end (the deck is open toward the plaza there). */
const SIDE_OPEN = 1.4;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const f = stationFrame(env, STATION);
  const ground = groundOf(env, f);
  const rand = rng(0xc011a);
  const cliff = collpaCliff(env.selva.layout);

  const group = stationGroup(f, "selva-collpa");
  const mat = stationMaterial();

  // ------------------------------------------------------------------ viewpoint
  const kit = new Kit(env);
  deck(kit, rand, { ...DECK, y: DECK_Y, along: "x", joists: true });
  for (let x = DECK.x0 + 0.15; x <= DECK.x1; x += 1.7)
    for (const z of [DECK.z0 + 0.15, (DECK.z0 + DECK.z1) / 2, DECK.z1 - 0.2])
      stilt(kit, x, z, Math.min(ground(x, z), 0) - 1.4, 0, 0.09);
  railing(kit, [DECK.x0, DECK.z0 + 0.05], [DECK.x1, DECK.z0 + 0.05], DECK_Y, 0.95);
  railing(kit, [DECK.x0 + 0.05, DECK.z0], [DECK.x0 + 0.05, DECK.z1 - SIDE_OPEN], DECK_Y, 0.95);
  railing(kit, [DECK.x1 - 0.05, DECK.z0], [DECK.x1 - 0.05, DECK.z1 - SIDE_OPEN], DECK_Y, 0.95);
  // Bench facing the river.
  kit.box(2.4, 0.08, 0.45, VIEW_LOCAL[0], 0.48, VIEW_LOCAL[1] + 0.4, A.plank);
  kit.box(2.4, 0.4, 0.06, VIEW_LOCAL[0], 0.6, VIEW_LOCAL[1] + 0.62, A.plank, 0, 0.12);
  for (const dx of [-1.0, 1.0]) kit.box(0.1, 0.48, 0.4, VIEW_LOCAL[0] + dx, 0.08, VIEW_LOCAL[1] + 0.4, A.woodDark);
  // Sign posts at the deck entrance, left.
  for (const dx of [-1.2, 1.2]) kit.cyl(0.06, 0.07, 1.75, -5.0 + dx, ground(-5.0 + dx, -3.6), -3.6, A.woodDark, 5);
  group.add(bake(kit, "selva-collpa", mat));

  // ------------------------------------------------------------------ cliff (its own vertex-colored mesh)
  const cliffGeo = buildCliff(cliff, f.y, rand);
  const cliffMesh = new THREE.Mesh(cliffGeo, mat);
  cliffMesh.name = "selva-collpa-cliff";
  group.add(cliffMesh);

  const signs = signBoards(
    env,
    1,
    352,
    112,
    (ctx, _i, cw, ch) => {
      drawCarved(ctx, cw, ch, "#7a4a2b");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fbe9c8";
      const t = SIGN.title[lang];
      fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 46, cw - 40);
      ctx.fillText(t, cw / 2, ch * 0.38);
      ctx.fillStyle = "#e6c98f";
      const s = SIGN.sub[lang];
      fit(ctx, s, (px) => `700 ${px}px ${FONT.body}`, 24, cw - 40);
      ctx.fillText(s, cw / 2, ch * 0.72);
    },
    [{ i: 0, w: 2.7, h: 2.7 * (112 / 352), x: -5.0, y: ground(-5.0, -3.6) + 1.35, z: -3.56, ry: 0 }],
    "selva-collpa",
  );
  group.add(signs.mesh);
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  // The whole deck (a little past its apron end so it is stepped onto from the plaza) and its railings.
  const unDeck = addDeck(f, DECK.x0, DECK.z0, DECK.x1, DECK.z1 + 0.4, DECK_Y, "collpa-deck");
  for (const c of segmentCircles(f, [DECK.x0, DECK.z0 + 0.05], [DECK.x1, DECK.z0 + 0.05], 0.12)) env.addCollider(c);
  for (const x of [DECK.x0 + 0.05, DECK.x1 - 0.05])
    for (const c of segmentCircles(f, [x, DECK.z0], [x, DECK.z1 - SIDE_OPEN], 0.12)) env.addCollider(c);
  env.addCollider(at(f, VIEW_LOCAL[0] - 0.7, VIEW_LOCAL[1] + 0.4, 0.35));
  env.addCollider(at(f, VIEW_LOCAL[0] + 0.7, VIEW_LOCAL[1] + 0.4, 0.35));
  for (const dx of [-1.2, 1.2]) env.addCollider(at(f, -5.0 + dx, -3.6, 0.15));
  const keeps = [creatures.keepOut(f.x, f.z, 8), ...cliff.footprint.map((c) => creatures.keepOut(c.x, c.z, c.r))];
  const cull = stationCull(group, new THREE.Vector3(f.x, f.y, f.z), 230);

  return {
    update() {
      cull(env.camera);
    },
    dispose() {
      signs.dispose();
      for (const k of keeps) creatures.removeKeepOut(k);
      unDeck();
      disposeTree(group);
      mat.dispose();
    },
  };
};

/**
 * The cliff face (a u × v grid on collpaCliff's surface, pushed INTO the cliff only, so anything placed on
 * `point(u, v)` stays in front of the rock), strata colors by height, a soil-and-roots cap with a green
 * overhang lip, a flat massif top running back to the forest floor, closed ends, and a talus at the water.
 * Built in the station frame (y relative to the station origin height `y0`), with vertex colors.
 */
function buildCliff(cliff: ReturnType<typeof collpaCliff>, y0: number, rand: () => number): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  const tri = (a: number[], b: number[], d: number[], color: string) => {
    c.set(color);
    pos.push(...a, ...b, ...d);
    for (let i = 0; i < 3; i++) col.push(c.r, c.g, c.b);
  };
  const NU = 22;
  const NV = 12;
  const [clay0, clay1] = cliff.clayV;
  const strata = [
    A.clay,
    A.clay,
    A.clayLight,
    A.clayLight,
    A.clay,
    "#a4492f",
    "#a4492f",
    A.clayLight,
    "#d08a5c",
    A.clay,
  ];
  const back = new Map<string, number>();
  const P = (i: number, j: number) => {
    const u = -1 + (2 * i) / NU;
    const v = j / NV;
    const p = cliff.local(u, v);
    // Inward-only jitter (toward −Z of the face, i.e. into the rock), none on the outline.
    const key = `${i},${j}`;
    let k = back.get(key);
    if (k === undefined) {
      // Vertical gullies (a slow wave across u) plus per-vertex roughness.
      const gully = 0.45 * (0.5 + 0.5 * Math.sin(i * 1.3 + Math.sin(i * 0.37) * 2));
      k = i === 0 || i === NU || j === 0 || j === NV ? 0 : gully + rand() * 0.35;
      back.set(key, k);
    }
    return [p.lx, p.y - y0, p.lz - k];
  };
  for (let i = 0; i < NU; i++) {
    for (let j = 0; j < NV; j++) {
      const a = P(i, j);
      const b = P(i + 1, j);
      const d = P(i + 1, j + 1);
      const e = P(i, j + 1);
      const v = (j + 0.5) / NV;
      // Horizontal strata whose boundaries wander a row up or down across the face; dark streaks in gullies.
      const wander = Math.round(Math.sin(i * 0.45 + 1.3) * 0.8);
      const streak = Math.sin(i * 1.3 + Math.sin(i * 0.37) * 2) > 0.82 && v < clay1;
      const color =
        v > clay1
          ? v > 0.93
            ? A.leafDark
            : A.mud
          : v < clay0
            ? A.clayDark
            : streak
              ? A.clayDark
              : (strata[(((j + wander) % strata.length) + strata.length) % strata.length] as string);
      tri(a, b, d, color);
      tri(a, d, e, color);
    }
  }
  // Massif top: from the top edge straight back, then down to the forest floor (well below it, hidden).
  const topY = cliff.top - y0;
  for (let i = 0; i < NU; i++) {
    const a = P(i, NV);
    const b = P(i + 1, NV);
    const a2 = [a[0], topY, a[2] - MASSIF_DEPTH];
    const b2 = [b[0], topY, b[2] - MASSIF_DEPTH];
    tri(a, a2, b2, A.leafDark);
    tri(a, b2, b, A.leafDark);
    const a3 = [a[0], topY - 6, a[2] - MASSIF_DEPTH - 3];
    const b3 = [b[0], topY - 6, b[2] - MASSIF_DEPTH - 3];
    tri(a2, a3, b3, A.leafDark);
    tri(a2, b3, b2, A.leafDark);
  }
  // Ends: close each side with a wedge back into the massif.
  for (const [i, s] of [
    [0, -1],
    [NU, 1],
  ] as const) {
    for (let j = 0; j < NV; j++) {
      const a = P(i, j);
      const b = P(i, j + 1);
      const a2 = [a[0] + s * 0.4, a[1], a[2] - MASSIF_DEPTH];
      const b2 = [b[0] + s * 0.4, b[1], b[2] - MASSIF_DEPTH];
      if (s < 0) {
        tri(a, b, b2, A.clayDark);
        tri(a, b2, a2, A.clayDark);
      } else {
        tri(a, b2, b, A.clayDark);
        tri(a, a2, b2, A.clayDark);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();

  // Overhang lip, roots and talus: boxes merged in with their own colors.
  const extra: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, ry = 0, rx = 0) => {
    const b = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    b.rotateX(rx);
    b.rotateY(ry);
    b.translate(x, y, z);
    c.set(color);
    const n = b.getAttribute("position").count;
    const cc = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) cc.set([c.r, c.g, c.b], k * 3);
    b.setAttribute("color", new THREE.BufferAttribute(cc, 3));
    b.deleteAttribute("uv");
    extra.push(b);
  };
  for (let u = -0.95; u <= 0.95; u += 0.1) {
    const top = cliff.local(u, 1);
    box(
      1.6,
      0.5,
      1.3,
      top.lx,
      top.y - y0 + 0.05,
      top.lz + 0.35,
      rand() < 0.5 ? A.leaf : A.leafDark,
      rand() * 0.3,
      0.15,
    );
    // Hanging roots.
    if (rand() < 0.6) {
      const r = cliff.local(u + 0.03, 0.9);
      box(0.06, 1.0 + rand() * 0.9, 0.06, r.lx, r.y - y0 - 0.6, r.lz + 0.25, A.woodDark);
    }
  }
  for (let u = -0.9; u <= 0.9; u += 0.12) {
    const b0 = cliff.local(u + (rand() - 0.5) * 0.05, 0);
    box(
      0.7 + rand() * 0.8,
      0.5 + rand() * 0.5,
      0.8,
      b0.lx,
      b0.y - y0 + 0.45,
      b0.lz + 0.55,
      rand() < 0.5 ? A.clayDark : A.clay,
      rand(),
    );
  }
  const all = [g, ...extra].map((x) => {
    const n = x.index ? x.toNonIndexed() : x;
    if (!n.getAttribute("normal")) n.computeVertexNormals();
    for (const k of Object.keys(n.attributes))
      if (k !== "position" && k !== "normal" && k !== "color") n.deleteAttribute(k);
    return n;
  });
  const merged = mergeGeoms(all);
  for (const x of all) x.dispose();
  return merged;
}

function mergeGeoms(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of list) n += g.getAttribute("position").count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute("position") as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, o * 3);
    nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
    col.set(g.getAttribute("color").array as Float32Array, o * 3);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
