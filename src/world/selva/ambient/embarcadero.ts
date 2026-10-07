/**
 * Embarcadero (station "embarcadero", kind landing): the canoe landing's shore side. The pier, the bank stairs,
 * the floating jetty and the canoe itself belong to canoe.ts (they must line up with the canoe route); this
 * ambient dresses the apron around the pier head: an open palm-thatch shelter with a spare dugout upturned on
 * trestles and a rack of paddles, a carved sign naming the landing and where the canoe goes, mooring posts,
 * firewood and water pots. No panel and no prompt of its own (E on the jetty at the foot of the stairs boards
 * the canoe).
 * Local frame: +Z faces the road; the pier runs out from x = 0 toward −Z, so everything here stays off it.
 *
 * Draw calls: one vertex-colored mesh + one sign mesh.
 */
import * as THREE from "three";
import { fit } from "../../ambient/fields/signs";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { FONT, Kit, rng } from "../../props";
import type { SelvaEnv } from "../contract";
import {
  A,
  bake,
  disposeTree,
  drawCarved,
  goods,
  hullGeometries,
  irapayRoof,
  signBoards,
  stationCull,
  stationMaterial,
} from "./embarcadero/amazon";
import { at, groundOf, stationFrame, stationGroup } from "./embarcadero/station";

const STATION = "embarcadero";
const SIGN: { title: L; sub: L } = {
  title: { es: "EMBARCADERO", en: "CANOE LANDING" },
  sub: { es: "Canoa a los palafitos →", en: "Canoe to the stilt houses →" },
};
/** Shelter centre (local) and size; sign position. */
const HUT = { x: -5.2, z: -4.6, w: 3.4, d: 2.8 };
const BOARD = { x: 3.4, z: -4.2 };

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const f = stationFrame(env, STATION);
  const ground = groundOf(env, f);
  const rand = rng(0xe3bac0);

  const group = stationGroup(f, "selva-embarcadero");
  const mat = stationMaterial();
  const kit = new Kit(env);
  // Open shelter: six posts and a palm roof.
  const posts: Array<[number, number]> = [];
  for (const dx of [-HUT.w / 2, 0, HUT.w / 2])
    for (const dz of [-HUT.d / 2, HUT.d / 2]) {
      const x = HUT.x + dx;
      const z = HUT.z + dz;
      posts.push([x, z]);
      kit.cyl(0.07, 0.08, 2.4, x, ground(x, z) - 0.1, z, A.wood, 6);
    }
  irapayRoof(kit, rand, { w: HUT.w, d: HUT.d, y: 2.3, h: 1.2, ox: HUT.x, oz: HUT.z, over: 0.4 });
  // Spare dugout upturned on two trestles under the roof.
  for (const dx of [-1.0, 1.0]) {
    const x = HUT.x + dx;
    kit.box(0.08, 0.55, 0.08, x, ground(x, HUT.z) - 0.05, HUT.z - 0.3, A.woodDark, 0, 0.3);
    kit.box(0.08, 0.55, 0.08, x, ground(x, HUT.z) - 0.05, HUT.z + 0.3, A.woodDark, 0, -0.3);
    kit.box(0.08, 0.06, 0.8, x, ground(x, HUT.z) + 0.48, HUT.z, A.woodDark);
  }
  {
    // Upturned: flipped over its long axis, turned along local x, resting on the trestles.
    const { outer, inner } = hullGeometries(3.6, 0.85, 0.4);
    for (const g of [outer, inner]) {
      g.rotateZ(Math.PI);
      g.rotateY(Math.PI / 2);
    }
    const y = ground(HUT.x, HUT.z) + 0.62;
    kit.add(outer, A.weathered, HUT.x, y, HUT.z);
    kit.add(inner, A.woodDark, HUT.x, y, HUT.z);
    outer.dispose();
    inner.dispose();
  }
  // Paddle rack: a rail on two posts, paddles leaning on it.
  const rx = HUT.x - 0.2;
  const rz = HUT.z - HUT.d / 2 + 0.25;
  for (const dx of [-1.0, 1.0]) kit.cyl(0.04, 0.05, 1.1, rx + dx, ground(rx + dx, rz), rz, A.woodDark, 5);
  kit.box(2.1, 0.06, 0.06, rx, ground(rx, rz) + 1.0, rz, A.wood);
  for (let i = 0; i < 4; i++) {
    const x = rx - 0.75 + i * 0.5;
    const g = ground(x, rz + 0.25);
    kit.cyl(0.022, 0.022, 1.3, x, g + 0.2, rz + 0.15, A.plank, 5, -0.28);
    kit.box(0.17, 0.42, 0.03, x, g, rz + 0.33, i % 2 ? A.wood : A.achiote, 0, -0.28);
  }
  // Mooring posts and goods by the pier root.
  for (const [x, z] of [
    [-1.6, -7.4],
    [1.6, -7.4],
  ] as const)
    kit.cyl(0.09, 0.11, 0.8, x, ground(x, z) - 0.1, z, A.woodDark, 6);
  goods(kit, rand, -2.3, ground(-2.3, -6.4), -6.4, "pot");
  goods(kit, rand, -2.7, ground(-2.7, -6.0), -6.0, "pot");
  goods(kit, rand, 2.4, ground(2.4, -6.6), -6.6, "sack");
  goods(kit, rand, 2.8, ground(2.8, -6.2), -6.2, "bananas");
  // Firewood stack.
  for (let i = 0; i < 6; i++)
    kit.cyl(
      0.07,
      0.07,
      1.0,
      -7.0 + (i % 3) * 0.16,
      ground(-7, -3) + 0.07 + Math.floor(i / 3) * 0.13,
      -3.5,
      A.woodDark,
      5,
      Math.PI / 2,
    );
  // Sign posts.
  for (const dx of [-1.25, 1.25])
    kit.cyl(0.06, 0.07, 1.7, BOARD.x + dx, ground(BOARD.x + dx, BOARD.z), BOARD.z - 0.06, A.woodDark, 5);
  group.add(bake(kit, "selva-embarcadero", mat));

  const signs = signBoards(
    env,
    1,
    320,
    112,
    (ctx, _i, cw, ch) => {
      drawCarved(ctx, cw, ch, "#7a4a2b");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fbe9c8";
      const t = SIGN.title[lang];
      fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 44, cw - 40);
      ctx.fillText(t, cw / 2, ch * 0.38);
      ctx.fillStyle = "#e6c98f";
      const s = SIGN.sub[lang];
      fit(ctx, s, (px) => `700 ${px}px ${FONT.body}`, 24, cw - 40);
      ctx.fillText(s, cw / 2, ch * 0.72);
    },
    [{ i: 0, w: 2.6, h: 2.6 * (112 / 320), x: BOARD.x, y: ground(BOARD.x, BOARD.z) + 1.3, z: BOARD.z }],
    "selva-embarcadero",
  );
  group.add(signs.mesh);
  env.scene.add(group);

  for (const [x, z] of posts) env.addCollider(at(f, x, z, 0.14));
  env.addCollider(at(f, HUT.x, HUT.z, 1.1));
  env.addCollider(at(f, HUT.x - 1.6, HUT.z, 0.6));
  env.addCollider(at(f, HUT.x + 1.6, HUT.z, 0.6));
  for (const dx of [-1.25, 1.25]) env.addCollider(at(f, BOARD.x + dx, BOARD.z, 0.15));
  env.addCollider(at(f, -7.0, -3.5, 0.6));
  const keep = creatures.keepOut(f.x, f.z, 10);
  const cull = stationCull(group, new THREE.Vector3(f.x, f.y, f.z));

  return {
    update() {
      cull(env.camera);
    },
    dispose() {
      signs.dispose();
      creatures.removeKeepOut(keep);
      disposeTree(group);
      mat.dispose();
    },
  };
};
