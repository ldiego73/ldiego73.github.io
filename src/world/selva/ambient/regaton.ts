/**
 * Bote del regatón · Lo que uso (station "regaton", kind uses): a river trader's boat, a long peke-peke motor
 * canoe with a palm-thatched cabin, moored below the bank at a floating balsa landing, steep plank stairs up
 * to a dock on the bank. On the dock the trader has laid out his wares on five stalls, one per group of the
 * /uses page (AIDLC agents, AI tools, this site's stack, daily tools, the professional stack); each stall
 * holds one small bundle per item (capped) under a carved sign. "E · Ver mercancía" at a stall opens a paper
 * panel with tabs for the five stalls (←/→ switch), each item with its reason and link, and a link to
 * /{lang}/uses/. Facts come only from src/data/uses.ts and career.ts SKILLS (regaton/logic.ts).
 *
 * Draw calls: one vertex-colored mesh for the whole station + one merged sign mesh + the selection marker.
 * Walkable (raised decks, station.ts addDeck): the level dock deck on stilts at the bank edge, the landing at
 * the top of the stairs, the stair treads down the bank and the floating balsa landing beside the boat (its
 * other edges are water and steep bank, which are not walkable). Colliders: stalls, the river-side railing.
 */
import * as THREE from "three";
import { createMarker } from "../../ambient/fields/geo";
import { createFieldPanel, el } from "../../ambient/fields/panel";
import { fit } from "../../ambient/fields/signs";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { DYE, FONT, Kit, rng } from "../../props";
import type { SelvaEnv } from "../contract";
import {
  A,
  bake,
  balsaRaft,
  deck,
  disposeTree,
  drawCarved,
  dugout,
  goods,
  irapayRoof,
  railing,
  signBoards,
  stairs,
  stairY,
  stationCull,
  stationMaterial,
  stilt,
} from "./embarcadero/amazon";
import {
  addDeck,
  at,
  groundOf,
  lxOf,
  lzOf,
  nearestSpot,
  type Spot,
  segmentCircles,
  stationFrame,
  stationGroup,
} from "./embarcadero/station";
import "./embarcadero/panels.css";
import { crateCount, runs, type Stall, stalls } from "./regaton/logic";

const STATION = "regaton";
const S = {
  kicker: { es: "Bote del regatón · Lo que uso", en: "Trader's boat · What I use" },
  view: { es: "E · Ver mercancía", en: "E · Browse wares" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  tabs: { es: "Puestos del regatón", en: "Trader's stalls" },
  page: { es: "Ver «Lo que uso» completo", en: "See the full “Uses” page" },
  keys: { es: "← → cambian de puesto", en: "← → switch stalls" },
} satisfies Record<string, L>;

/** Stall tables along the back of the dock (local x), their depth line, and the E spot in front. */
const STALL_X = [-6.0, -3.85, -1.7, 0.45, 2.6];
const STALL_Z = -7.75;
const SPOT_DZ = 1.05;
/** Level dock deck at the bank edge (stilts where the bank falls away); the stairs go down at its right end. */
const DECK = { x0: -7.2, x1: 4.9, z0: -8.9, z1: -4.7 };
/** Deck top above the station origin (the apron is flat at 0; the planks clear it everywhere). */
const DECK_Y = 0.1;
const STAIR_X = 4.05;
const BOAT_Z = -16.3;
/** Station board at the plaza's road corner, turned toward the road (keeps the stalls in view). */
const BOARD = { x: -5.4, z: 1.4, ry: 0.55 };
const boardPost = (dx: number): [number, number] => [
  BOARD.x + dx * Math.cos(BOARD.ry) - 0.06 * Math.sin(BOARD.ry),
  BOARD.z - dx * Math.sin(BOARD.ry) - 0.06 * Math.cos(BOARD.ry),
];

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const f = stationFrame(env, STATION);
  const ground = groundOf(env, f);
  const water = env.selva.layout.river.level - f.y;
  const rand = rng(0x5e9a70);
  const list = stalls();
  const dye = (s: Stall) => DYE[s.dye];

  // ------------------------------------------------------------------ build
  const group = stationGroup(f, "selva-regaton");
  const mat = stationMaterial();
  const kit = new Kit(env);
  deck(kit, rand, { ...DECK, y: DECK_Y, along: "x", joists: true });
  // Stilts under the deck down to the bank (long where the terrain falls away) and along its river edge.
  for (let x = DECK.x0 + 0.2; x <= DECK.x1; x += 1.5)
    for (const z of [DECK.z0 + 0.1, (DECK.z0 + DECK.z1) / 2])
      stilt(kit, x, z, Math.min(ground(x, z), 0) - 1.2, DECK_Y - 0.08, 0.08);
  railing(kit, [DECK.x0, DECK.z0 + 0.1], [STAIR_X - 0.75, DECK.z0 + 0.1], DECK_Y);
  // Landing at the top of the stairs (level with the dock), the stairs, and the floating balsa landing.
  const landZ0 = DECK.z0 - 1.0;
  deck(kit, rand, { x0: STAIR_X - 0.65, x1: STAIR_X + 0.65, z0: landZ0, z1: DECK.z0, y: DECK_Y, along: "z" });
  stilt(kit, STAIR_X - 0.6, DECK.z0 - 0.95, water - 2, DECK_Y - 0.08, 0.08);
  stilt(kit, STAIR_X + 0.6, DECK.z0 - 0.95, water - 2, DECK_Y - 0.08, 0.08);
  const footZ = BOAT_Z + 2.2;
  const STAIR_A: [number, number] = [STAIR_X, landZ0];
  const STAIR_B: [number, number] = [STAIR_X, footZ + 0.4];
  const RAFT_Y = water + 0.3;
  stairs(kit, STAIR_A, DECK_Y, STAIR_B, water + 0.36, 1.1);
  const RAFT = { x0: STAIR_X - 1.2, x1: STAIR_X + 1.2, z0: footZ - 1.0, z1: footZ + 0.6 };
  balsaRaft(kit, rand, { ...RAFT, y: RAFT_Y });

  // The regatón's boat: long hull along local x, cabin of thatch amidships, peke-peke motor at the stern.
  const hullLen = 11;
  dugout(kit, {
    x: -1.2,
    y: water,
    z: BOAT_Z,
    ry: Math.PI / 2,
    len: hullLen,
    w: 2.1,
    h: 0.75,
    color: "#2f6a73",
    thwarts: 0,
  });
  // Gunwale stripe and a plank floor inside.
  deck(kit, rand, { x0: -5.6, x1: 3.2, z0: BOAT_Z - 0.6, z1: BOAT_Z + 0.6, y: water + 0.42, along: "x" });
  // Cabin posts + roof.
  for (const x of [-3.2, -0.2, 2.2])
    for (const z of [-0.62, 0.62]) kit.cyl(0.05, 0.05, 1.5, x, water + 0.4, BOAT_Z + z, A.wood, 5);
  irapayRoof(kit, rand, { w: 5.4, d: 1.3, y: water + 1.9, h: 0.75, ox: -0.5, oz: BOAT_Z, over: 0.3 });
  // Peke-peke: engine block on the stern plus the long-tail shaft into the water.
  kit.box(0.5, 0.4, 0.45, 4.1, water + 0.42, BOAT_Z, "#3a3a38");
  kit.box(0.35, 0.18, 0.3, 4.1, water + 0.82, BOAT_Z, A.achiote);
  kit.stick(
    new THREE.Vector3(4.35, water + 0.6, BOAT_Z),
    new THREE.Vector3(6.6, water - 0.15, BOAT_Z),
    0.04,
    "#4a4a46",
  );
  // Cargo on board: bananas, sacks, a crate stack, clay pots.
  goods(kit, rand, -4.6, water + 0.42, BOAT_Z - 0.3, "bananas");
  goods(kit, rand, -4.2, water + 0.42, BOAT_Z + 0.35, "sack");
  goods(kit, rand, -2.4, water + 0.42, BOAT_Z, "crate");
  goods(kit, rand, -2.4, water + 0.75, BOAT_Z, "crate");
  goods(kit, rand, -1.2, water + 0.42, BOAT_Z - 0.35, "pot");
  goods(kit, rand, 1.4, water + 0.42, BOAT_Z + 0.3, "sack");
  // Mooring lines from the bow and stern to the landing posts.
  kit.stick(
    new THREE.Vector3(3.6, water + 0.7, BOAT_Z + 0.8),
    new THREE.Vector3(STAIR_X - 0.6, water + 0.9, footZ),
    0.02,
    A.rope,
  );
  kit.stick(
    new THREE.Vector3(-5.8, water + 0.7, BOAT_Z + 0.7),
    new THREE.Vector3(-4.6, ground(-4.6, -10.6) + 0.3, -10.6),
    0.02,
    A.rope,
  );
  kit.cyl(0.08, 0.1, 0.6, -4.6, ground(-4.6, -10.6) - 0.2, -10.6, A.woodDark, 6);

  // Stalls: a low table on four legs, a woven mat, one small bundle per item (capped), a carved sign behind.
  const stallYs: number[] = [];
  list.forEach((s, i) => {
    const x = STALL_X[i] as number;
    const y = DECK_Y;
    stallYs.push(y);
    kit.box(1.75, 0.08, 0.86, x, y + 0.62, STALL_Z, A.plank);
    for (const [dx, dz] of [
      [-0.78, -0.36],
      [0.78, -0.36],
      [-0.78, 0.36],
      [0.78, 0.36],
    ] as const)
      kit.box(0.08, 0.62, 0.08, x + dx, y, STALL_Z + dz, A.woodDark);
    kit.box(1.62, 0.02, 0.76, x, y + 0.7, STALL_Z, i % 2 ? A.bark : "#c9b37c");
    const n = crateCount(s, 14);
    const cols = 7;
    for (let k = 0; k < n; k++) {
      const cx = x - 0.66 + (k % cols) * 0.22;
      const cz = STALL_Z - 0.18 + Math.floor(k / cols) * 0.34;
      const h = 0.12 + rand() * 0.08;
      kit.box(
        0.17,
        h,
        0.2,
        cx,
        y + 0.72,
        cz,
        k % 3 === 0 ? dye(s) : k % 3 === 1 ? A.bark : A.plankAlt,
        (rand() - 0.5) * 0.3,
      );
      kit.box(0.18, 0.025, 0.06, cx, y + 0.72 + h, cz, dye(s));
    }
    // Sign posts.
    for (const dx of [-0.62, 0.62]) kit.cyl(0.04, 0.05, 1.9, x + dx, y, STALL_Z - 0.5, A.wood, 5);
    // A palm-leaf shade over each stall.
    irapayRoof(kit, rand, { w: 1.9, d: 1.4, y: y + 2.0, h: 0.42, ox: x, oz: STALL_Z - 0.1, over: 0.12 });
    for (const dx of [-0.85, 0.85]) kit.cyl(0.04, 0.045, 2.0, x + dx, y, STALL_Z + 0.55, A.wood, 5);
  });
  group.add(bake(kit, "selva-regaton", mat));

  // Carved signs: one per stall, plus the station board facing the road.
  const SIGN_W = 1.3;
  const signs = signBoards(
    env,
    list.length + 1,
    256,
    72,
    (ctx, i, cw, ch) => {
      drawCarved(ctx, cw, ch, i === list.length ? "#7a4a2b" : "#8a5a34");
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (i === list.length) {
        ctx.fillStyle = "#fbe9c8";
        const t = lang === "es" ? "REGATÓN · LO QUE USO" : "TRADER · WHAT I USE";
        fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 30, cw - 30);
        ctx.fillText(t, cw / 2, ch / 2 + 2);
        return;
      }
      const s = list[i] as Stall;
      ctx.fillStyle = dye(s);
      ctx.fillRect(14, ch - 18, cw - 28, 6);
      ctx.fillStyle = "#fbe9c8";
      const t = T(s.tab).toUpperCase();
      fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 34, cw - 34);
      ctx.fillText(t, cw / 2, ch / 2 - 2);
    },
    [
      ...list.map((_, i) => ({
        i,
        w: SIGN_W,
        h: SIGN_W * (72 / 256),
        x: STALL_X[i] as number,
        y: (stallYs[i] as number) + 1.4,
        z: STALL_Z - 0.46,
      })),
      {
        i: list.length,
        w: 2.6,
        h: 2.6 * (72 / 256),
        x: BOARD.x,
        y: ground(BOARD.x, BOARD.z) + 1.15,
        z: BOARD.z,
        ry: BOARD.ry,
      },
    ],
    "selva-regaton",
  );
  group.add(signs.mesh);
  // The station board stands on two posts at the plaza edge (separate tiny kit, merged too).
  {
    const k2 = new Kit(env);
    for (const dx of [-1.15, 1.15]) {
      const [px, pz] = boardPost(dx);
      k2.cyl(0.06, 0.07, 1.5, px, ground(px, pz), pz, A.woodDark, 5);
    }
    group.add(bake(k2, "selva-regaton-board", mat));
  }
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  // Raised decks: the dock (overlapping the plaza edge so it is stepped onto from the plaza), the stair
  // landing, the stair treads and the balsa landing at their foot.
  const unDeck = [
    addDeck(f, DECK.x0, DECK.z0, DECK.x1, DECK.z1 + 0.3, DECK_Y, "regaton-dock"),
    addDeck(f, STAIR_X - 0.65, landZ0, STAIR_X + 0.65, DECK.z0, DECK_Y, "regaton-landing"),
    addDeck(f, STAIR_X - 0.55, STAIR_B[1], STAIR_X + 0.55, landZ0, stairY(STAIR_A, DECK_Y, STAIR_B, water + 0.36)),
    addDeck(f, RAFT.x0, RAFT.z0, RAFT.x1, RAFT.z1, RAFT_Y, "regaton-raft"),
  ];
  for (const x of STALL_X) env.addCollider(at(f, x, STALL_Z - 0.1, 0.72));
  for (const c of segmentCircles(f, [DECK.x0, DECK.z0], [STAIR_X - 0.7, DECK.z0], 0.3)) env.addCollider(c);
  for (const dx of [-1.15, 1.15]) env.addCollider(at(f, ...boardPost(dx), 0.2));
  const keep = creatures.keepOut(f.x, f.z, 10);
  const center = new THREE.Vector3(f.x, f.y, f.z);
  const cull = stationCull(group, center);

  // ------------------------------------------------------------------ panel
  let sel = 0;
  const marker = createMarker(env);
  group.add(marker.mesh);
  const panel = createFieldPanel(hudRoot, {
    name: "regaton",
    closeLabel: T(S.closeAria),
    onNav: (d) => select(sel + d),
    onClose: () => marker.hide(),
  });
  panel.layer.classList.add("qns");
  panel.kicker.textContent = T(S.kicker);
  const tabs = el("div", "qns-tabs");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", T(S.tabs));
  const tabBtns = list.map((s, i) => {
    const b = el("button", "qns-tab", T(s.tab));
    b.type = "button";
    b.setAttribute("role", "tab");
    b.id = `qns-regaton-tab-${s.id}`;
    b.style.setProperty("--qns-dye", dye(s));
    b.addEventListener("click", () => select(i));
    tabs.append(b);
    return b;
  });
  const content = el("div");
  content.setAttribute("role", "tabpanel");
  const foot = el("div", "qnf-actions");
  const pageLink = el("a", "qnf-btn qnf-btn-primary", T(S.page));
  pageLink.href = `/${lang}/uses/`;
  foot.append(pageLink);
  const hint = el("p", "qnf-note", T(S.keys));
  panel.body.append(tabs, content, foot, hint);

  const render = () => {
    const s = list[sel] as Stall;
    panel.title.textContent = T(s.title);
    tabBtns.forEach((b, i) => {
      b.setAttribute("aria-selected", String(i === sel));
      b.tabIndex = i === sel ? 0 : -1;
    });
    content.setAttribute("aria-labelledby", tabBtns[sel]?.id ?? "");
    content.style.setProperty("--qns-dye", dye(s));
    content.replaceChildren();
    if (s.lede) content.append(el("p", "qnf-lede", T(s.lede)));
    for (const r of runs(s.wares)) {
      if (r.group) content.append(el("p", "qnf-label", T(r.group)));
      // Plain names (the professional stack) read better as chips than as an empty list of reasons.
      if (r.wares.every((w) => !w.why)) {
        const chips = el("ul", "qns-chips");
        for (const w of r.wares) chips.append(el("li", undefined, w.name));
        content.append(chips);
        continue;
      }
      const ul = el("ul", "qns-wares");
      for (const w of r.wares) {
        const li = el("li");
        const name = el("span", "qns-ware-name");
        if (w.url) {
          const a = el("a", undefined, w.name);
          a.href = w.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          name.append(a, " ↗");
        } else name.textContent = w.name;
        li.append(name);
        if (w.why) li.append(el("span", "qns-ware-why", T(w.why)));
        ul.append(li);
      }
      content.append(ul);
    }
  };
  const select = (i: number) => {
    sel = (i + list.length) % list.length;
    render();
    const x = STALL_X[sel] as number;
    marker.place(x, (stallYs[sel] as number) + 2.75, STALL_Z);
  };

  // ------------------------------------------------------------------ frame loop
  const spots: Spot[] = STALL_X.map((x) => ({ lx: x, lz: STALL_Z + SPOT_DZ, r: 1.15 }));
  let near = -1;
  let inRange = false;
  return {
    update(dt, avatar, t) {
      if (!cull(env.camera)) {
        near = -1;
        inRange = false;
        if (panel.isOpen()) panel.close();
        return;
      }
      const lx = lxOf(f, avatar.x, avatar.z);
      const lz = lzOf(f, avatar.x, avatar.z);
      inRange = Math.hypot(lx + 1, lz + 6.5) < 9;
      near = nearestSpot(spots, lx, lz);
      if (panel.isOpen() && !inRange) panel.close();
      if (!panel.isOpen()) {
        if (near >= 0) marker.place(STALL_X[near] as number, (stallYs[near] as number) + 2.75, STALL_Z);
        else marker.hide();
      }
      marker.update(dt, t);
    },
    prompt() {
      if (panel.isOpen()) return inRange ? T(S.close) : null;
      return near >= 0 ? T(S.view) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (near < 0) return false;
      select(near);
      panel.open();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      panel.dispose();
      marker.dispose();
      signs.dispose();
      creatures.removeKeepOut(keep);
      for (const off of unDeck) off();
      disposeTree(group);
      mat.dispose();
    },
  };
};
