/**
 * Arcade flotante (station "arcade", kind arcade): a balsa-log raft house under a palm-thatch roof, floating in
 * a small oxbow pond (cocha, with giant water lilies) behind the plaza, reached by a gangplank. Five arcade
 * cabinets stand on the raft (the arcade lobby's cabinet builder, merged like the mountain tambo's by
 * arcade-merge.ts, with their attract screens and, once the passport is complete and chosen, the aguayo skin).
 * "E · Jugar …" at a cabinet plays the real game in a fullscreen overlay, exactly like the mountain's arcade
 * tambo (games/core/shell mountCabinet, `world:game {open}`; arcade/overlay.ts).
 *
 * Why a pond: this station sits on the road's dry side (side +1), ~35 u and a 4 u drop away from the river,
 * so the raft floats in its own cocha instead (a flat water disc whose back edge meets the rising forest
 * floor, giving a natural shoreline). Walkable: the gangplank and the raft deck in front of the cabinets, raised
 * decks at the raft's real height (station.ts addDeck); the pond around them is not walkable ground.
 *
 * Draw calls: one vertex-colored mesh (raft, roof, rim, lilies), the pond water, the sign, 4 per cabinet
 * (body, trim, screen, marquee), the marker.
 */
import * as THREE from "three";
import { createAttract } from "../../../arcade-lobby/attract";
import { type Cabinet, createCabinet } from "../../../arcade-lobby/cabinet";
import { activeSkin, load } from "../../../games/core/store";
import { GAMES } from "../../../games/registry";
import { createMarker } from "../../ambient/fields/geo";
import { fit } from "../../ambient/fields/signs";
import { type MergedCabinet, mergeCabinet } from "../../arcade-merge";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { on } from "../../events";
import { FONT, Kit, rng } from "../../props";
import { gradientMap } from "../../toon";
import type { SelvaEnv } from "../contract";
import { cabColor, raftGames } from "./arcade/logic";
import { createGameOverlay } from "./arcade/overlay";
import {
  A,
  bake,
  balsaRaft,
  disposeTree,
  drawCarved,
  irapayRoof,
  signBoards,
  stationCull,
  stationMaterial,
} from "./embarcadero/amazon";
import {
  addDeck,
  at,
  groundOf,
  lxOf,
  lzOf,
  nearestSpot,
  type Spot,
  stationFrame,
  stationGroup,
} from "./embarcadero/station";

const STATION = "arcade";
const T_PLAY: L = { es: "E · Jugar", en: "E · Play" };
const BOARD: L = { es: "ARCADE FLOTANTE", en: "FLOATING ARCADE" };

/** Pond centre/radius (local), raft rectangle, cabinet row. */
const POND = { x: 0, z: -11.6, r: 6.4 };
const RAFT = { x0: -4.3, x1: 4.3, z0: -12.6, z1: -6.9 };
const RAFT_TOP = 0.12;
const WATER = 0.06;
const CAB_Z = -11.5;

export const create: CreateAmbient = (baseEnv) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const f = stationFrame(env, STATION);
  const ground = groundOf(env, f);
  const rand = rng(0xa4cade);
  const games = raftGames(GAMES);

  // ------------------------------------------------------------------ build
  const group = stationGroup(f, "selva-arcade");
  const mat = stationMaterial();
  const kit = new Kit(env);
  // Mud rim round the pond's front half (where it meets the flat plaza) and reeds.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const x = POND.x + Math.sin(a) * POND.r;
    const z = POND.z + Math.cos(a) * POND.r;
    if (ground(x, z) > WATER + 0.25) continue;
    kit.box(1.25, 0.16, 0.7, x, Math.min(0, ground(x, z)) - 0.06, z, i % 2 ? A.mud : "#5a4630", a + Math.PI / 2);
    if (i % 3 === 0)
      for (let k = 0; k < 4; k++)
        kit.cyl(
          0.015,
          0.025,
          0.7 + rand() * 0.5,
          x + (rand() - 0.5) * 0.6,
          0,
          z + (rand() - 0.5) * 0.4,
          A.leaf,
          4,
          (rand() - 0.5) * 0.3,
        );
  }
  // Giant water lilies (Victoria amazonica): flat pads with an upturned rim, one flower.
  for (const [x, z, r] of [
    [-5.0, -9.4, 0.75],
    [5.2, -10.6, 0.9],
    [-4.6, -14.6, 0.85],
    [4.6, -14.0, 0.6],
    [5.6, -8.4, 0.5],
  ] as const) {
    kit.cyl(r, r, 0.04, x, WATER, z, A.leaf, 14);
    kit.cyl(r + 0.04, r + 0.04, 0.1, x, WATER, z, A.leafDark, 14);
  }
  kit.cyl(0.08, 0.14, 0.14, 5.2, WATER + 0.04, -10.6, "#f2e6ef", 7);
  // Pale ripple streaks on the dark water.
  for (const [x, z, w] of [
    [-3.2, -6.3, 1.4],
    [2.8, -6.1, 1.0],
    [-5.6, -12.0, 0.9],
    [5.4, -12.6, 1.2],
  ] as const)
    kit.box(w, 0.01, 0.08, x, WATER + 0.005, z, "#a89272", rand() * 0.4);
  // The raft, its deck planks and the gangplank to the plaza.
  balsaRaft(kit, rand, { ...RAFT, y: RAFT_TOP });
  kit.box(1.2, 0.06, 1.9, 0, Math.max(0, ground(0, -6.0)) + 0.06, -6.0, A.plank, 0, -0.04);
  // Roof posts and the palm roof over the raft (ridge along x).
  for (const x of [RAFT.x0 + 0.2, 0, RAFT.x1 - 0.2])
    for (const z of [RAFT.z0 + 0.25, RAFT.z1 - 0.25]) kit.cyl(0.07, 0.08, 2.75, x, RAFT_TOP, z, A.wood, 6);
  irapayRoof(kit, rand, {
    w: RAFT.x1 - RAFT.x0,
    d: RAFT.z1 - RAFT.z0,
    y: RAFT_TOP + 2.7,
    h: 1.5,
    oz: (RAFT.z0 + RAFT.z1) / 2,
    over: 0.45,
  });
  // A back wall of split palm behind the cabinets and a lamp line.
  kit.box(RAFT.x1 - RAFT.x0 - 0.4, 1.0, 0.08, 0, RAFT_TOP, RAFT.z0 + 0.3, A.weathered);
  // Mooring poles at the corners.
  for (const [x, z] of [
    [RAFT.x0 - 0.3, RAFT.z1 - 0.2],
    [RAFT.x1 + 0.3, RAFT.z1 - 0.2],
    [RAFT.x0 - 0.3, RAFT.z0 + 0.2],
    [RAFT.x1 + 0.3, RAFT.z0 + 0.2],
  ] as const)
    kit.cyl(0.07, 0.08, 1.8, x, -0.6, z, A.woodDark, 5);
  // Station board on two posts at the plaza edge, right of the gangplank.
  for (const dx of [-1.1, 1.1]) kit.cyl(0.06, 0.07, 1.55, 3.6 + dx, ground(3.6 + dx, -4.4), -4.4, A.woodDark, 5);
  group.add(bake(kit, "selva-arcade", mat));

  // Pond water: an irregular disc, a hair above the flat ground (polygon offset wins the depth tie).
  const pondGeo = new THREE.CircleGeometry(POND.r, 40);
  {
    const p = pondGeo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 1; i < p.count; i++) {
      const k = 1 + Math.sin(i * 1.7) * 0.05 + Math.sin(i * 0.6) * 0.04;
      p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
  }
  pondGeo.rotateX(-Math.PI / 2);
  const pondMat = new THREE.MeshToonMaterial({
    color: "#6f5b3e",
    gradientMap: gradientMap(),
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const pond = new THREE.Mesh(pondGeo, pondMat);
  pond.position.set(POND.x, WATER, POND.z);
  pond.name = "selva-arcade-pond";
  group.add(pond);

  // Cabinets in a shallow arc on the raft, facing the gangplank.
  const merged: MergedCabinet[] = [];
  const attracts = games.map((meta) => createAttract(meta.slug, meta.title[lang], cabColor(meta.neon)));
  const cabs: Cabinet[] = games.map((meta, i) => {
    const u = games.length > 1 ? i / (games.length - 1) - 0.5 : 0;
    const cab = createCabinet({ color: cabColor(meta.neon), marquee: meta.marquee, lang });
    const mc = mergeCabinet(cab);
    if (mc) merged.push(mc);
    cab.group.position.set(u * 6.6, RAFT_TOP, CAB_Z + u * u * 1.6);
    cab.group.rotation.y = -u * 0.55;
    const at0 = attracts[i];
    if (at0) {
      at0.draw(0);
      cab.setScreenTexture(at0.texture);
    }
    group.add(cab.group);
    return cab;
  });
  const syncSkin = () => {
    try {
      const skin = activeSkin(load());
      for (const c of cabs) c.setSkin(skin);
    } catch {
      /* Storage unavailable: keep the neon skin. */
    }
  };
  syncSkin();
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith("ldiego73-arcade")) syncSkin();
  };
  window.addEventListener("storage", onStorage);

  const signs = signBoards(
    env,
    1,
    320,
    80,
    (ctx, _i, cw, ch) => {
      drawCarved(ctx, cw, ch, "#7a4a2b");
      ctx.fillStyle = "#fbe9c8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const t = BOARD[lang];
      fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 40, cw - 40);
      ctx.fillText(t, cw / 2, ch / 2 + 2);
    },
    [{ i: 0, w: 2.6, h: 2.6 * (80 / 320), x: 3.6, y: ground(3.6, -4.4) + 1.15, z: -4.36 }],
    "selva-arcade",
  );
  group.add(signs.mesh);
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  // The raft in front of the cabinet row (the back strip behind them stays out of reach) and the gangplank
  // (it overlaps the plaza edge, so it is stepped onto from the plaza). The gangplank deck is a little wider
  // than its plank so the traveler can step round the roof post standing at its raft end.
  const unDeck = [
    addDeck(f, RAFT.x0, CAB_Z + 0.4, RAFT.x1, RAFT.z1, RAFT_TOP, "arcade-raft"),
    addDeck(f, -0.85, RAFT.z1 - 0.2, 0.85, -4.8, RAFT_TOP, "arcade-gangplank"),
  ];
  for (const c of cabs) env.addCollider(at(f, c.group.position.x, c.group.position.z, 0.5));
  for (const x of [RAFT.x0 + 0.2, 0, RAFT.x1 - 0.2]) env.addCollider(at(f, x, RAFT.z1 - 0.25, 0.15));
  for (const dx of [-1.1, 1.1]) env.addCollider(at(f, 3.6 + dx, -4.4, 0.18));
  const keep = creatures.keepOut(f.x, f.z, 13);
  const cull = stationCull(group, new THREE.Vector3(f.x, f.y, f.z));

  // ------------------------------------------------------------------ play
  const overlay = createGameOverlay(lang);
  const marker = createMarker(env);
  group.add(marker.mesh);
  const spots: Spot[] = cabs.map((c) => {
    const yaw = c.group.rotation.y;
    return { lx: c.group.position.x + Math.sin(yaw) * 1.05, lz: c.group.position.z + Math.cos(yaw) * 1.05, r: 1.0 };
  });
  let near = -1;
  let modal = 0;
  let lastFrame = -1;
  const focus = cabs.map(() => 0);
  const off = on("world:modal", (d) => {
    modal = Math.max(0, modal + (d?.open ? 1 : -1));
  });
  return {
    update(dt, avatar, t) {
      if (!cull(env.camera)) {
        near = -1;
        return;
      }
      const lx = lxOf(f, avatar.x, avatar.z);
      const lz = lzOf(f, avatar.x, avatar.z);
      near = overlay.isOpen() ? -1 : nearestSpot(spots, lx, lz);
      const d = Math.hypot(lx - POND.x, lz - POND.z);
      cabs.forEach((c, i) => {
        focus[i] = (focus[i] as number) + ((i === near ? 1 : 0) - (focus[i] as number)) * Math.min(1, dt * 6);
        c.setFocus(focus[i] as number);
      });
      if (near >= 0) {
        const c = cabs[near] as Cabinet;
        marker.place(c.group.position.x, RAFT_TOP + 2.25, c.group.position.z);
      } else marker.hide();
      marker.update(dt, t);
      // Attract screens at ~12 fps, only while the raft is near.
      if (d < 35) {
        const fr = Math.floor(t * 12);
        if (fr !== lastFrame) {
          lastFrame = fr;
          for (const a of attracts) a.draw(env.reducedMotion ? 0 : t);
        }
      }
      if (!env.reducedMotion) {
        // The raft rocks gently on the pond.
        group.children[0]?.position.set(0, Math.sin(t * 0.8) * 0.012, 0);
      }
    },
    prompt() {
      if (near < 0 || modal > 0 || overlay.isOpen()) return null;
      const g = games[near];
      return g ? `${T_PLAY[lang]} · ${g.title[lang]}` : null;
    },
    interact() {
      if (near < 0 || modal > 0 || overlay.isOpen()) return false;
      const g = games[near];
      if (!g) return false;
      overlay.open(g);
      return true;
    },
    escape() {
      if (!overlay.isOpen()) return false;
      overlay.close();
      return true;
    },
    dispose() {
      off();
      window.removeEventListener("storage", onStorage);
      overlay.dispose();
      marker.dispose();
      signs.dispose();
      for (const a of attracts) a.dispose();
      for (const c of cabs) c.dispose();
      for (const m of merged) m.dispose();
      creatures.removeKeepOut(keep);
      for (const u of unDeck) u();
      disposeTree(group);
      mat.dispose();
      pondMat.dispose();
    },
  };
};
