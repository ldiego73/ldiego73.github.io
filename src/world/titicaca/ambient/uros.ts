/**
 * The Uros floating islands: one island of layered totora per SKILLS group (src/data/career.ts, ../plan.ts
 * ISLANDS), floating in the bay off the Uros landing and joined by a floating reed boardwalk (shore → the hub
 * island → each of the others). Each island has a springy reed floor (a raised deck, ../../decks.ts), reed huts
 * with steep gabled roofs, a cooking hearth, a banner pole in its dye and a painted board with its group and its
 * skills; the hub island has a reed watchtower; a small balsa is moored beside some of them.
 *
 * On an island, "E · Ver habilidades · {group}" opens its panel (../../ambient/fields/panel.ts): the group, every
 * skill in it, its position among the islands, and ←/→ to browse the other islands' groups. The passport stamp
 * `titicaca:station:<island id>` comes from the runtime's station visit (the island is a plaza at deck height).
 *
 * Walkable: island floors are circle decks at ISLAND_Y, the boardwalk spans oriented boxes at WALK_Y (the first
 * span ramps down from the landing). Huts, the tower, hearths, poles and boards are colliders. Draw calls: one
 * vertex-coloured mesh for every island and the boardwalk, one for the boards. Pure rules: ./uros/logic.ts.
 */
import * as THREE from "three";
import { createFieldPanel, el } from "../../ambient/fields/panel";
import type { Ambient, CreateAmbient } from "../../contract";
import { decks } from "../../decks";
import { on } from "../../events";
import { vertexToon } from "../../merge-colors";
import { FONT } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { HUB_ISLAND, ISLAND_Y, ISLANDS, type Island, islandGroup, UROS_LANDING, WALK_Y } from "../plan";
import { Build, frameAt } from "./kit/build";
import { buildBoards, paperBoard } from "./kit/signs";
import { balsaBoat, bannerPole, hearth, islandFloor, REED, reedHut, watchtower } from "./kit/totora";
import { ISLAND_COPY, islandAt, islandPanel, islandPrompt, islandYaw, rampY, spans } from "./uros/logic";
import "./uros/uros.css";

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const group = new THREE.Group();
  group.name = "titicaca-uros";
  const b = new Build();
  const colliders: Array<{ x: number; z: number; r: number }> = [];
  const boards: Array<{ i: number; w: number; h: number; x: number; y: number; z: number; yaw: number }> = [];

  // ------------------------------------------------------------------ islands
  ISLANDS.forEach((isl, k) => {
    const yaw = islandYaw(isl);
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    /** Island-local → world. */
    const w = (lx: number, lz: number) => ({ x: isl.x + lx * c + lz * s, z: isl.z - lx * s + lz * c });
    b.frame = frameAt(isl.x, 0, isl.z, yaw);
    islandFloor(b, isl.r, ISLAND_Y, k * 1.7);
    const r = isl.r;
    const huts: Array<[number, number, number, number]> =
      k === HUB_ISLAND
        ? [
            [-r * 0.5, -r * 0.3, 0.5, 1.15],
            [r * 0.05, -r * 0.62, 0, 1.25],
            [-r * 0.1, r * 0.1, Math.PI, 0],
          ]
        : [
            [-r * 0.45, -r * 0.35, 0.55, 1],
            [r * 0.4, -r * 0.4, -0.5, 1],
          ];
    for (const [lx, lz, ly, big] of huts) {
      if (!big) continue;
      reedHut(b, lx, ISLAND_Y, lz, ly, 2.4 * big, 2 * big, 1.45 * big, k % 2 ? REED.dark : REED.deep);
      colliders.push({ ...w(lx, lz), r: 1.45 * big });
    }
    hearth(b, -r * 0.2, ISLAND_Y, r * 0.22);
    colliders.push({ ...w(-r * 0.2, r * 0.22), r: 0.7 });
    bannerPole(b, -r * 0.62, ISLAND_Y, r * 0.38, isl.dye, 0);
    colliders.push({ ...w(-r * 0.62, r * 0.38), r: 0.25 });
    if (k === HUB_ISLAND) {
      watchtower(b, r * 0.5, ISLAND_Y, -r * 0.35);
      colliders.push({ ...w(r * 0.5, -r * 0.35), r: 1.3 });
    }
    // The board with the island's skills: beside the arrival, facing the one who walks in.
    const bx = r * 0.45;
    const bz = r * 0.42;
    for (const dx of [-0.95, 0.95]) b.cyl(0.07, 0.08, 2.3, bx + dx, ISLAND_Y, bz, REED.wood, 5);
    colliders.push({ ...w(bx, bz), r: 1.1 });
    const bw = w(bx, bz);
    boards.push({ i: k, w: 2.0, h: 1.3, x: bw.x, y: ISLAND_Y + 1.5, z: bw.z, yaw: yaw - 0.35 });
    // A moored balsa beside every other island (not the one the ride leaves from).
    if (k !== 4 && k % 2 === 0) {
      const m = frameAt(r + 1.9, 0, -r * 0.2, 0.15);
      b.frame = frameAt(isl.x, 0, isl.z, yaw).multiply(m);
      balsaBoat(b, 0.55, k === 0);
    }
  });
  b.frame = null;

  // ------------------------------------------------------------------ boardwalk
  const sp = spans();
  const landY = env.heightAt(UROS_LANDING.x, UROS_LANDING.z);
  sp.forEach((span, k) => {
    const len = span.halfD * 2;
    b.frame = frameAt(span.x, 0, span.z, span.yaw);
    const yAt = (lz: number) => {
      if (k > 0) return WALK_Y;
      const c = Math.cos(span.yaw);
      const s = Math.sin(span.yaw);
      return rampY(span, landY, span.x + lz * s, span.z + lz * c);
    };
    // Three bundles side by side, laid in short lengths so the first span can follow its ramp.
    const n = Math.ceil(len / 1.6);
    for (let i = 0; i < n; i++) {
      const lz = -span.halfD + (i + 0.5) * (len / n);
      const y = yAt(lz) - 0.16;
      for (const lx of [-0.84, -0.28, 0.28, 0.84])
        b.bundle(
          len / n + 0.3,
          0.27,
          lx,
          y + 0.02,
          lz,
          (i + Math.round(lx * 3)) % 4 === 0 ? REED.dark : REED.straw,
          0,
          0,
          0.62,
        );
      // Lashings across.
      b.box(span.halfW * 2 + 0.1, 0.06, 0.1, 0, y + 0.12, lz - len / n / 2 + 0.1, REED.tie);
    }
    // Posts every few metres along both sides.
    for (let lz = -span.halfD + 1.2; lz < span.halfD - 0.8; lz += 4.2)
      for (const lx of [-1.3, 1.3]) b.cyl(0.06, 0.07, 1.6, lx, yAt(lz) - 1, lz, REED.wood, 5);
  });
  b.frame = null;

  const geo = b.build();
  const mat = vertexToon();
  if (geo) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = "titicaca-uros";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }

  // ------------------------------------------------------------------ boards (one atlas, one mesh)
  const signs = buildBoards(
    env,
    "titicaca-uros:boards",
    ISLANDS.length,
    512,
    336,
    (ctx, i, cw, ch) => {
      const isl = ISLANDS[i] as Island;
      const g = islandGroup(isl);
      paperBoard(ctx, cw, ch, isl.dye);
      ctx.fillStyle = "#1f1a17";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const title = g.group[lang].toUpperCase();
      let px = 52;
      ctx.font = `800 ${px}px ${FONT.display}`;
      while (ctx.measureText(title).width > cw - 60 && px > 20) ctx.font = `800 ${--px}px ${FONT.display}`;
      ctx.fillText(title, cw / 2, 62);
      // Skills in two columns.
      ctx.font = `600 26px ${FONT.body}`;
      ctx.textAlign = "left";
      const cols = 2;
      const rows = Math.ceil(g.items.length / cols);
      g.items.forEach((item, j) => {
        const col = Math.floor(j / rows);
        const row = j % rows;
        const x = 40 + col * ((cw - 60) / cols);
        const y = 122 + row * Math.min(44, (ch - 150) / Math.max(1, rows));
        ctx.fillStyle = isl.dye;
        ctx.fillRect(x, y - 6, 12, 12);
        ctx.fillStyle = "#1f1a17";
        let s = 26;
        ctx.font = `600 ${s}px ${FONT.body}`;
        while (ctx.measureText(item).width > (cw - 60) / cols - 34 && s > 14) ctx.font = `600 ${--s}px ${FONT.body}`;
        ctx.fillText(item, x + 22, y);
      });
    },
    boards,
  );
  group.add(signs.mesh);
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  const removers: Array<() => void> = [];
  for (const isl of ISLANDS)
    removers.push(
      decks.add({ shape: { kind: "circle", x: isl.x, z: isl.z, r: isl.r - 0.1 }, y: ISLAND_Y, id: isl.id }),
    );
  sp.forEach((span, k) => {
    removers.push(
      decks.add({
        shape: { kind: "obox", x: span.x, z: span.z, yaw: span.yaw, halfW: span.halfW, halfD: span.halfD },
        y: k === 0 ? (x, z) => rampY(span, landY, x, z) : WALK_Y,
        id: `uros-walk-${k}`,
      }),
    );
  });
  for (const c of colliders) env.addCollider({ kind: "circle", x: c.x, z: c.z, r: c.r });

  // ------------------------------------------------------------------ panel
  let index = 0;
  const panel = createFieldPanel(hudRoot, {
    name: "uros",
    closeLabel: ISLAND_COPY.closeAria[lang],
    onNav: (dir) => show(index + dir),
  });
  panel.layer.classList.add("tq-uros");
  const meta = el("p", "qnf-meta");
  const lede = el("p", "qnf-lede");
  const tags = el("ul", "qnf-tags tq-skills");
  const count = el("p", "qnf-label");
  const nav = el("div", "qnf-nav");
  const prev = el("button", "qnf-btn", ISLAND_COPY.prev[lang]);
  const next = el("button", "qnf-btn", ISLAND_COPY.next[lang]);
  prev.type = "button";
  next.type = "button";
  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  nav.append(prev, next);
  panel.body.append(meta, lede, count, tags, nav, el("p", "qnf-note", ISLAND_COPY.note[lang]));
  const show = (i: number) => {
    const n = ISLANDS.length;
    index = ((i % n) + n) % n;
    const p = islandPanel(index, lang);
    const isl = ISLANDS[index] as Island;
    panel.kicker.textContent = p.kicker;
    panel.title.textContent = p.title;
    panel.layer.style.setProperty("--tq-dye", isl.dye);
    meta.textContent = p.position;
    lede.textContent = p.lede;
    count.textContent = p.count;
    tags.replaceChildren(...p.items.map((t) => el("li", undefined, t)));
  };

  let modal = 0;
  const offs = [
    on("world:modal", (d) => {
      modal = Math.max(0, modal + (d?.open ? 1 : -1));
    }),
  ];
  let here: Island | null = null;
  return {
    update(_dt, avatar) {
      here = islandAt(avatar.x, avatar.y, avatar.z);
      if (panel.isOpen() && !here) panel.close();
    },
    prompt() {
      if (panel.isOpen()) return ISLAND_COPY.close[lang];
      if (!here || modal > 0) return null;
      return islandPrompt(here, lang);
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!here) return false;
      show(ISLANDS.indexOf(here));
      panel.open();
      return true;
    },
    escape() {
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      for (const off of offs) off();
      for (const r of removers) r();
      panel.dispose();
      signs.dispose();
      geo?.dispose();
      mat.dispose();
      group.removeFromParent();
    },
  };
};
