/**
 * Tótem kené (the Antisuyu finale): the jungle's reward at the very end of the road, its counterpart of the
 * mountain's summit (src/world/summit.ts + the hud's "¡Lo lograste!" card).
 *
 * Where: a round clearing of packed earth just past the road end (t = 1), straight ahead along the road's
 * last heading (kene/spot.ts), ~30 u beyond the collpa viewpoint. In it, on a two-step dais, a tall carved
 * hardwood pole painted with kené, the maze-like line designs of the Shipibo-Konibo (procedural, kene/pattern.ts),
 * with Ronin, the cosmic anaconda from whose skin the designs come in Shipibo tradition, coiled up it in red
 * kené and rearing in front of a crown of macaw feathers. Round it: painted chomo jars, and six feathered
 * banner poles with fluttering kené streamers and pennant cords, leaving the road side open as the entrance.
 * A carved sign at the entrance names the place. A tribute to Shipibo-Konibo art, built from geometry and
 * canvas only.
 *
 * Arrival: the first time in a page session the traveler steps up to the totem (kene/spot.ts ARRIVE_R), the
 * totem celebrates: a burst of flower petals and blue morphos springs from the crown and drifts down / away
 * (kene/logic.ts), the kené lines glow, the music plays its summit stinger, the passport gets `selva:summit`
 * and, a moment later, the reward panel opens. With prefers-reduced-motion there is no burst and the streamers
 * and feathers only sway slowly (the shared wind's reduced state; the glow and the panel remain). Afterwards
 * "E · Ver tu premio" at the totem reopens the panel.
 *
 * The panel ("¡Lo lograste, {name}!", the name from ../../traveler.ts, renamed live on `world:traveler`) shows
 * four true stats (kene/logic.ts statTiles: the trader's wares, the maloca's posts, the stilt houses'
 * projects or the arcade's games, and the jungle stamps collected / required, from the passport) and buttons:
 * the postcard (`world:postcard`), book 60 min (SITE.calendly), download the CV (SITE.resume), back to the
 * Qhapaq Ñan (travel.ts) and back to the site.
 *
 * Wind: the streamers wave as cloth, and the macaw feathers, the poles' tufts and the pennants bend, all on
 * the world's shared wind (style-gl.ts windSway), so a gust crossing the clearing lifts them together; the
 * burst's petals drift downwind as they fall (liveWind).
 *
 * Draw calls: one vertex-coloured mesh (plaza, dais, carving, poles, cords, the anaconda's head, sign posts),
 * one wind-swayed vertex-coloured mesh (feathers, tufts, pennants), one atlas mesh (pole, anaconda, jars), the
 * streamers, the sign; petals and morphos only during the burst. Walkable: the clearing is one raised circular deck (../../decks.ts) at its floor height, which
 * joins the road end; dais, poles, jars and sign posts are colliders; fauna keeps out of the clearing.
 */
import * as THREE from "three";
import { getMusic } from "../../../audio";
import { SITE } from "../../../data/site";
import { GAMES } from "../../../games/registry";
import { CATALOG, loadPassport, requiredStamps } from "../../../lib/passport";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import { fit } from "../../ambient/fields/signs";
import type { Collider, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { worldData } from "../../data";
import { decks } from "../../decks";
import { emit, on } from "../../events";
import { FONT, glowSprite, Kit, rng } from "../../props";
import { paintStrength, windSway } from "../../style-gl";
import { travelTo } from "../../travel";
import { loadTraveler } from "../../traveler";
import { liveWind } from "../../wind";
import type { SelvaEnv } from "../contract";
import { GeoBuilder } from "../scenery/kit";
import { A, bake, disposeTree, drawCarved, signBoards, stationCull, stationMaterial } from "./embarcadero/amazon";
import { morphoModel, WingSet } from "./wild/birds";
import "./embarcadero/panels.css";
import "./kene/kene.css";
import {
  arrived,
  BURST,
  burstScale,
  countStamps,
  finaleTitle,
  glowAt,
  morphoAt,
  type Petal,
  prng,
  spawnMorphos,
  spawnPetals,
  statTiles,
  stepPetal,
} from "./kene/logic";
import {
  buildFlat,
  buildPainted,
  buildStreamers,
  CROWN_Y,
  DAIS_TOP,
  K,
  keneMaterial,
  PETAL_COLORS,
  petalGeometry,
} from "./kene/model";
import {
  ARRIVE_R,
  aroundTotem,
  DAIS_R,
  keneFloorY,
  keneSpot,
  PLAZA_R,
  POLE_ANGLES,
  POLE_R,
  POTS,
  PROMPT_R,
  TOTEM_LOCAL,
} from "./kene/spot";
import { cloths } from "./maloca/logic";
import { projects } from "./palafitos/logic";
import { stalls } from "./regaton/logic";

export const STAMP_ID = "selva:summit";

const S = {
  kicker: { es: "Fin del Antisuyu", en: "End of the Antisuyu" },
  lede: {
    es: "Recorriste todo el camino del Antisuyu: del punku de piedra al tótem kené, donde termina el camino.",
    en: "You walked the whole Antisuyu road: from the stone punku to the kené totem where the road ends.",
  },
  note: {
    es: "Kené: los diseños del pueblo shipibo-konibo, que según su tradición nacen de la piel de Ronin, la gran anaconda.",
    en: "Kené: the designs of the Shipibo-Konibo people, born, in their tradition, from the skin of Ronin, the great anaconda.",
  },
  stats: { es: "Lo que viste en el camino", en: "What you saw on the road" },
  postcard: { es: "Crear mi postal", en: "Make my postcard" },
  book: { es: "Agendar 60 min", en: "Book 60 min" },
  cv: { es: "Descargar CV", en: "Download resume" },
  mountain: { es: "Volver al Qhapaq Ñan", en: "Back to the Qhapaq Ñan" },
  site: { es: "Volver al sitio", en: "Back to the site" },
  view: { es: "E · Ver tu premio", en: "E · See your reward" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  signTitle: { es: "FIN DEL ANTISUYU", en: "END OF THE ANTISUYU" },
  signSub: { es: "Tótem kené · Ronin, la gran anaconda", en: "Kené totem · Ronin, the great anaconda" },
  stampLabel: { es: "Fin del Antisuyu", en: "End of the Antisuyu" },
} satisfies Record<string, L>;

/** Entrance sign (plaza frame): left of the way in, facing the road. */
const SIGN = { x: -3.4, z: 4.6, w: 2.3, posts: 0.95 } as const;
/** Seconds between the arrival burst and the panel opening (the petals are in the air by then). */
const PANEL_DELAY = 1.7;

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const spot = keneSpot(env.selva.layout);
  // Flat floor: just above the highest terrain sample of the clearing.
  const floorY = keneFloorY(spot, env.heightAt);
  const rand = rng(0x6e4e);

  const group = new THREE.Group();
  group.name = "selva-kene";
  group.position.set(spot.x, floorY, spot.z);
  group.rotation.y = spot.yaw;
  // Plaza-local point → world collider.
  const at = (lx: number, lz: number, r: number): Collider => ({ kind: "circle", ...spot.world(lx, lz), r });

  // ------------------------------------------------------------------ build
  const paint = keneMaterial(env);
  const painted = buildPainted(paint.material, 0);
  group.add(painted.mesh);
  const vmat = stationMaterial();
  const kit = new Kit(env);
  const sway = new GeoBuilder();
  buildFlat(kit, sway, rand, { floorY: 0, plazaR: PLAZA_R, head: painted.head });
  for (const dx of [-SIGN.posts, SIGN.posts]) kit.cyl(0.06, 0.07, 1.7, SIGN.x + dx, -0.3, SIGN.z, A.woodDark, 5);
  group.add(bake(kit, "selva-kene", vmat));
  // Feathers, tufts and pennants on the shared wind (one mesh; a little paint: they are small and bright).
  const swayMat = paintStrength(
    windSway(
      new THREE.MeshToonMaterial({
        color: "#ffffff",
        vertexColors: true,
        gradientMap: env.toon("#ffffff").gradientMap,
      }),
      { mode: "grass", flex: true, amp: 1.6 },
    ),
    0.4,
  );
  const swayMesh = new THREE.Mesh(sway.build({ flex: true }), swayMat);
  swayMesh.name = "selva-kene:feathers";
  swayMesh.castShadow = true;
  swayMesh.receiveShadow = true;
  group.add(swayMesh);
  // Streamers: kené cloth waved by the wind (amplitude × 3: a light cotton ribbon, not a heavy banner).
  windSway(paint.ribbon, { mode: "cloth", flex: true, amp: 3 });
  const streamers = buildStreamers(paint.ribbon, 0);
  group.add(streamers.mesh);
  const signs = signBoards(
    env,
    1,
    384,
    112,
    (ctx, _i, cw, ch) => {
      drawCarved(ctx, cw, ch, "#6e3f24");
      // A kené-like stepped border inside the frame.
      ctx.strokeStyle = K.achiote;
      ctx.lineWidth = 4;
      ctx.strokeRect(12, 12, cw - 24, ch - 24);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fbe9c8";
      const t = T(S.signTitle);
      fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 44, cw - 48);
      ctx.fillText(t, cw / 2, ch * 0.4);
      ctx.fillStyle = "#e6c98f";
      const s = T(S.signSub);
      fit(ctx, s, (px) => `700 ${px}px ${FONT.body}`, 22, cw - 48);
      ctx.fillText(s, cw / 2, ch * 0.72);
    },
    [{ i: 0, w: SIGN.w, h: SIGN.w * (112 / 384), x: SIGN.x, y: 1.05, z: SIGN.z + 0.05, ry: 0 }],
    "selva-kene",
  );
  group.add(signs.mesh);

  // Glow halo at the crown (additive, no outline), lit with the kené lines.
  const halo = glowSprite(env, "#ffd36b", 5);
  halo.position.set(TOTEM_LOCAL[0], CROWN_Y, TOTEM_LOCAL[1]);
  halo.visible = false;
  group.add(halo);

  // Burst: instanced petals (no outline) and blue morphos (the jungle's bird rig).
  const petalGeo = petalGeometry();
  const petalMat = env.toon("#ffffff").clone() as THREE.MeshToonMaterial;
  petalMat.side = THREE.DoubleSide;
  // Petals fly: world-space painted blotches would slide over them.
  paintStrength(petalMat, 0);
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, BURST.petals);
  petals.name = "selva-kene:petals";
  petals.frustumCulled = false;
  petals.visible = false;
  env.noOutline(petals);
  const col = new THREE.Color();
  for (let i = 0; i < BURST.petals; i++) petals.setColorAt(i, col.set(PETAL_COLORS[i % PETAL_COLORS.length] as string));
  if (petals.instanceColor) petals.instanceColor.needsUpdate = true;
  group.add(petals);
  const morphoSet = new WingSet(env, "selva-kene-morpho", morphoModel(), BURST.morphos);
  group.add(morphoSet.mesh);
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  const unDeck = decks.add({
    shape: { kind: "circle", x: spot.x, z: spot.z, r: PLAZA_R },
    y: floorY,
    id: "kene-plaza",
  });
  env.addCollider(at(TOTEM_LOCAL[0], TOTEM_LOCAL[1], DAIS_R));
  for (const a of POLE_ANGLES) env.addCollider(at(Math.sin(a) * POLE_R, Math.cos(a) * POLE_R, 0.2));
  for (const [a, r, s] of POTS) {
    const [lx, lz] = aroundTotem(a, r);
    env.addCollider(at(lx, lz, 0.42 * s));
  }
  for (const dx of [-SIGN.posts, SIGN.posts]) env.addCollider(at(SIGN.x + dx, SIGN.z, 0.15));
  const keep = creatures.keepOut(spot.x, spot.z, PLAZA_R + 1);
  const cull = stationCull(group, new THREE.Vector3(spot.x, floorY, spot.z), 210);

  // ------------------------------------------------------------------ panel
  let traveler = loadTraveler();
  const seen = new Set<string>();
  const panel = createFieldPanel(hudRoot, { name: "kene", closeLabel: T(S.closeAria) });
  panel.layer.classList.add("qns", "qns-kene");
  panel.kicker.textContent = T(S.kicker);
  const lede = el("p", "qnf-lede", T(S.lede));
  const statsLabel = el("p", "qnf-label", T(S.stats));
  const stats = el("dl", "qns-stats");
  const postcard = el("button", "qnf-btn qnf-btn-primary qns-kene-postcard", T(S.postcard));
  postcard.type = "button";
  postcard.addEventListener("click", () => {
    panel.close();
    emit("world:postcard", undefined);
  });
  const actions = el("div", "qnf-actions");
  const cv = linkButton(SITE.resume[lang], T(S.cv), false);
  cv.setAttribute("download", "");
  const back = el("button", "qnf-btn", T(S.mountain));
  back.type = "button";
  back.addEventListener("click", () => {
    panel.close();
    travelTo(lang, "selva", "qhapaq");
  });
  actions.append(linkButton(SITE.calendly, T(S.book), true), cv, back, linkButton(`/${lang}/`, T(S.site), false));
  panel.body.append(lede, statsLabel, stats, postcard, actions, el("p", "qnf-note", T(S.note)));

  const render = () => {
    panel.title.textContent = finaleTitle(lang, traveler);
    const data = worldData();
    let have = new Set(seen);
    try {
      have = new Set([...Object.keys(loadPassport().stamps), ...seen]);
    } catch {
      /* storage unavailable: this visit's stamps only */
    }
    const tiles = statTiles({
      tools: stalls().reduce((n, s) => n + s.wares.length, 0),
      posts: cloths(data.posts).length,
      projects: projects(data.repos).length,
      games: GAMES.length,
      stamps: countStamps(
        requiredStamps("selva").map((s) => s.id),
        have,
      ),
    });
    stats.replaceChildren(
      ...tiles.map((t) => {
        const d = el("div", "qns-stat");
        d.append(el("dt", undefined, T(t.label)), el("dd", undefined, t.value));
        return d;
      }),
    );
  };
  const openPanel = () => {
    render();
    panel.open();
  };

  const offs = [
    on("world:traveler", (d) => {
      traveler = d?.name ?? "";
      if (panel.isOpen()) panel.title.textContent = finaleTitle(lang, traveler);
    }),
    on("world:stamp", (d) => {
      if (d?.id) seen.add(d.id);
    }),
  ];

  // ------------------------------------------------------------------ celebration
  const burstRand = prng(0xb1057);
  let petalState: Petal[] = [];
  let morphoState = spawnMorphos(BURST.morphos, burstRand);
  let age = -1;
  let celebrated = false;
  let openIn = -1;
  const dummy = new THREE.Object3D();
  const [tx, tz] = TOTEM_LOCAL;
  const crownY = CROWN_Y;
  // Petals land on the flat plaza (local 0) or on the dais top (coordinates are relative to the totem).
  const floor = (x: number, z: number) => (Math.hypot(x, z) < DAIS_R ? DAIS_TOP : 0);
  const windLocal = { x: 0, z: 0 };
  const celebrate = () => {
    celebrated = true;
    const entry = CATALOG.find((s) => s.id === STAMP_ID);
    emit("world:stamp", { id: STAMP_ID, kind: "summit", label: entry?.label ?? S.stampLabel });
    try {
      getMusic().stinger("summit");
    } catch {
      /* audio unavailable */
    }
    age = 0;
    if (!env.reducedMotion) {
      petalState = spawnPetals(BURST.petals, crownY - 0.3, PETAL_COLORS.length, burstRand);
      morphoState = spawnMorphos(BURST.morphos, burstRand);
      petals.visible = true;
    }
    openIn = env.reducedMotion ? 0.4 : PANEL_DELAY;
  };

  /** Advances the burst clock and the petals' physics (cheap; runs even while the plaza is culled). */
  const stepBurst = (dt: number) => {
    if (age < 0) return;
    age += dt;
    if (age > BURST.life) {
      age = -1;
      petals.visible = false;
      morphoSet.commit(0);
      return;
    }
    // This frame's wind at the clearing, turned into the plaza frame (group yaw), for the falling petals.
    const w = liveWind.sample(spot.x, spot.z, floorY + CROWN_Y);
    const cy = Math.cos(spot.yaw);
    const sy = Math.sin(spot.yaw);
    windLocal.x = w.x * cy - w.z * sy;
    windLocal.z = w.x * sy + w.z * cy;
    for (const p of petalState) stepPetal(p, Math.min(dt, 0.05), age, floor, windLocal);
  };
  /** Writes the petal and morpho instances for the current burst age. */
  const drawBurst = () => {
    const sc = burstScale(age);
    for (let i = 0; i < petalState.length; i++) {
      const p = petalState[i] as Petal;
      dummy.position.set(tx + p.x, p.y, tz + p.z);
      dummy.rotation.set(p.sx * age, p.sy * age, p.ph);
      dummy.scale.setScalar(sc);
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    }
    petals.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < morphoState.length; i++) {
      // From just under the crown, so they flutter out past the feathers.
      const m = morphoAt(morphoState[i] as (typeof morphoState)[number], age, crownY - 0.9);
      const beat = Math.sin(age * 22 + i);
      morphoSet.set(i, tx + m.x, m.y, tz + m.z, m.yaw, 0.15, 0, 4.5 * sc, 0.45 + beat * 0.85, 0, 0, 0);
    }
    morphoSet.commit(morphoState.length);
  };
  // Dev hook (screenshots on slow software GL): run the burst and the panel timer forward without rendering.
  if (import.meta.env?.DEV)
    (window as Window & { __kene?: unknown }).__kene = {
      advance(sec: number) {
        for (let k = 0; k < Math.round(sec * 60); k++) {
          stepBurst(1 / 60);
          if (openIn >= 0) openIn = Math.max(0, openIn - 1 / 60);
        }
        if (age >= 0 && !env.reducedMotion) drawBurst();
      },
      state: () => ({
        age,
        celebrated,
        open: panel.isOpen(),
        floorY,
        spot: { x: spot.x, z: spot.z },
        totem: spot.totem,
      }),
    };

  let inside = false;
  let near = false;
  return {
    update(dt, avatar) {
      const visible = cull(env.camera);
      const d = Math.hypot(avatar.x - spot.totem.x, avatar.z - spot.totem.z);
      const onPlaza = Math.abs(avatar.y - floorY) < 2;
      inside = arrived(inside, onPlaza ? d : Infinity, ARRIVE_R);
      if (inside && !celebrated) celebrate();
      near = onPlaza && d < PROMPT_R;
      if (panel.isOpen() && d > PROMPT_R + 8) panel.close();
      if (openIn >= 0) {
        openIn -= dt;
        if (openIn < 0 && !panel.isOpen() && d < PROMPT_R + 8) openPanel();
      }

      // Kené glow: the celebration pulse, and a faint glow of the lines at night.
      const night = env.sky.isNight() ? 0.14 : 0;
      const g = age >= 0 ? glowAt(age) : 0;
      paint.setGlow(Math.max(night, g));
      halo.visible = g > 0.01 && visible;
      (halo.material as THREE.SpriteMaterial).opacity = g * 0.75;

      stepBurst(dt);
      if (age >= 0 && visible && !env.reducedMotion) drawBurst();
    },
    prompt() {
      if (panel.isOpen()) return near ? T(S.close) : null;
      return near ? T(S.view) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!near) return false;
      openIn = -1;
      openPanel();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      if (import.meta.env?.DEV) delete (window as Window & { __kene?: unknown }).__kene;
      for (const off of offs) off();
      panel.dispose();
      signs.dispose();
      streamers.dispose();
      swayMat.dispose();
      painted.dispose();
      morphoSet.dispose();
      petals.dispose();
      petalGeo.dispose();
      petalMat.dispose();
      (halo.material as THREE.SpriteMaterial).dispose();
      creatures.removeKeepOut(keep);
      unDeck();
      disposeTree(group);
      paint.dispose();
      vmat.dispose();
    },
  };
};
