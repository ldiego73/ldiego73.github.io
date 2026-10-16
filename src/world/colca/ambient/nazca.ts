/**
 * The Nazca pampa: each cross-company ARTIFACT of the owner's architecture work (src/data/career.ts) drawn as
 * a giant geoglyph on the reddish desert (./nazca/logic.ts figures: the spider is the API gateway, the
 * hummingbird the multi-brand design system, the monkey the event-driven architecture, the condor platform
 * engineering and the astronaut AI in the delivery cycle), seen from a mirador tower beside the road like the
 * real one on the Panamericana. The figures face the tower, so from its deck each reads upright.
 *
 *  - Lines: pale ribbons laid on the ground (one draw call, no ink outline: cleared gravel, not objects).
 *  - Tower: a rust-red steel frame with four wooden flights and a railed deck 14 u up; the flights, landings
 *    and deck are decks (../../decks.ts), so the traveler climbs it. On the deck, the prompt names the figure
 *    the camera faces (./nazca/logic.ts facedFigure) and E opens its panel.
 *  - Signposts: by the road, the board closest to each figure names it (one atlas mesh); E there opens the
 *    same panel. A board at the lookout plaza asks not to walk on the lines.
 *  - Panel: kicker "Geoglifo · Colibrí", the artifact as title, its tech, its summary, every use (company,
 *    role, years, what was built) and the real figure's size; ←/→ move between the five.
 * Draw calls: lines 1, tower 1, plaza 1, signs 1, posts 1.
 */
import * as THREE from "three";
import { createFieldPanel, el } from "../../ambient/fields/panel";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { decks } from "../../decks";
import { vertexToon } from "../../merge-colors";
import { DYE, offFontsReady, onFontsReady } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { artifactCompanies, artifactUses, span } from "../content";
import { VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { TOWER } from "../plan";
import { facedFigure, figures, onTowerTop, signInRange, signpost } from "./nazca/logic";
import { glyphRibbons, signAtlas, signPlanes, T as TW, towerDecks, towerGeometry, towerWorld } from "./nazca/model";
import "../colca.css";

const S = {
  read: { es: "E · Leer el geoglifo: {name}", en: "E · Read the geoglyph: {name}" },
  face: { es: "Gira hacia una figura para leerla", en: "Turn toward a figure to read it" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  kicker: { es: "Geoglifo · {name}", en: "Geoglyph · {name}" },
  uses: { es: "Dónde lo construí", en: "Where I built it" },
  companies: { es: "{n} empresas", en: "{n} companies" },
  one: { es: "1 empresa", en: "1 company" },
  real: { es: "La figura real", en: "The real figure" },
  prev: { es: "Anterior", en: "Previous" },
  next: { es: "Siguiente", en: "Next" },
  lookout: { es: "MIRADOR", en: "LOOKOUT" },
  lookoutSub: { es: "Líneas de Nasca · no pisar las líneas", en: "Nazca lines · keep off the lines" },
  boardSub: { es: "Geoglifo · {artifact}", en: "Geoglyph · {artifact}" },
} satisfies Record<string, L>;

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const lang = env.lang;
  const Tx = (l: L) => l[lang];
  const list = figures();
  const group = new THREE.Group();
  group.name = "colca-nazca";

  // ------------------------------------------------------------------ lines
  const linesGeo = glyphRibbons(list, layout.heightAt);
  const linesMat = vertexToon();
  linesMat.polygonOffset = true;
  linesMat.polygonOffsetFactor = -2;
  linesMat.polygonOffsetUnits = -4;
  const lines = new THREE.Mesh(linesGeo, linesMat);
  lines.name = "colca-nazca:lines";
  lines.receiveShadow = true;
  env.noOutline(lines);
  group.add(lines);

  // ------------------------------------------------------------------ tower + plaza
  const entry = towerWorld(TW.entry, (TW.lanes.a[0] + TW.lanes.a[1]) / 2);
  const baseY = layout.heightAt(entry.x, entry.z);
  const towerGeo = towerGeometry(baseY);
  const mat = vertexToon();
  const tower = new THREE.Mesh(towerGeo, mat);
  tower.name = "colca-nazca:tower";
  tower.castShadow = true;
  tower.receiveShadow = true;
  group.add(tower);
  const removers = towerDecks(baseY).map((d) => decks.add(d));
  const deckY = baseY + TOWER.top;

  const plaza = layout.plaza("nazca");
  const pk = new VKit();
  pk.cyl(plaza.r, plaza.r, 0.12, plaza.x, layout.heightAt(plaza.x, plaza.z) - 0.06, plaza.z, "#c4a27c", 22);
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12)
    pk.box(
      0.9,
      0.2,
      0.4,
      plaza.x + Math.sin(a) * plaza.r,
      layout.heightAt(plaza.x, plaza.z) - 0.05,
      plaza.z + Math.cos(a) * plaza.r,
      "#8c7461",
      a,
    );

  // ------------------------------------------------------------------ signs (atlas)
  const boards = [
    { title: Tx(S.lookout), sub: Tx(S.lookoutSub) },
    ...list.map((f) => ({
      title: f.glyph.name[lang].toUpperCase(),
      sub: Tx(S.boardSub).replace("{artifact}", f.artifact.name[lang]),
    })),
  ];
  const atlas = signAtlas(boards);
  const redraw = () => atlas.redraw();
  onFontsReady(redraw);
  const places: Array<{ x: number; y: number; z: number; yaw: number; w: number }> = [];
  {
    // The lookout's board: at the plaza's road side, facing the road.
    const r = layout.trail.pointAt(layout.trail.nearestT(plaza.x, plaza.z));
    const dx = plaza.x - r.x;
    const dz = plaza.z - r.z;
    const d = Math.hypot(dx, dz) || 1;
    const x = plaza.x - (dx / d) * (plaza.r - 0.6) + (dz / d) * 2.6;
    const z = plaza.z - (dz / d) * (plaza.r - 0.6) - (dx / d) * 2.6;
    places.push({ x, y: layout.heightAt(x, z) + 1.25, z, yaw: Math.atan2(-dx, -dz), w: 2.4 });
  }
  for (const f of list) {
    const s = signpost(f);
    places.push({ x: s.x, y: layout.heightAt(s.x, s.z) + 1.15, z: s.z, yaw: s.yaw, w: 1.9 });
  }
  const signGeo = signPlanes(places, atlas.rows);
  const signMat = (env.toon("#ffffff") as THREE.MeshToonMaterial).clone();
  signMat.map = atlas.texture;
  signMat.side = THREE.DoubleSide;
  const signs = new THREE.Mesh(signGeo, signMat);
  signs.name = "colca-nazca:signs";
  group.add(signs);
  for (const p of places) {
    for (const o of [-1, 1]) {
      const x = p.x + Math.cos(p.yaw) * o * (p.w / 2 - 0.15);
      const z = p.z - Math.sin(p.yaw) * o * (p.w / 2 - 0.15);
      pk.cyl(0.06, 0.07, 1.5, x, layout.heightAt(x, z) - 0.2, z, "#5e3b22", 5);
    }
    env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.35 });
  }
  const plazaGeo = pk.build();
  const plazaMesh = new THREE.Mesh(plazaGeo, mat);
  plazaMesh.name = "colca-nazca:plaza";
  plazaMesh.receiveShadow = true;
  group.add(plazaMesh);
  env.scene.add(group);
  const keep = creatures.keepOut(TOWER.x, TOWER.z, TOWER.half + 4);

  // ------------------------------------------------------------------ panel
  let current = 0;
  const panel = createFieldPanel(hudRoot, {
    name: "nazca",
    closeLabel: Tx(S.closeAria),
    onNav: (dir) => show((current + dir + list.length) % list.length),
  });
  panel.layer.classList.add("qnk", "qnk-nazca");
  const tech = el("p", "qnk-tech");
  const summary = el("p", "qnf-lede");
  const usesLabel = el("p", "qnf-label", Tx(S.uses));
  const uses = el("ul", "qnk-uses");
  const realLabel = el("p", "qnf-label", Tx(S.real));
  const real = el("p", "qnf-note");
  const nav = el("div", "qnf-nav");
  const prev = el("button", "qnf-btn", "←");
  prev.type = "button";
  prev.setAttribute("aria-label", Tx(S.prev));
  const next = el("button", "qnf-btn", "→");
  next.type = "button";
  next.setAttribute("aria-label", Tx(S.next));
  const counter = el("span");
  nav.append(prev, counter, next);
  prev.addEventListener("click", () => show((current - 1 + list.length) % list.length));
  next.addEventListener("click", () => show((current + 1) % list.length));
  panel.body.append(tech, summary, usesLabel, uses, realLabel, real, nav);

  function show(i: number) {
    current = i;
    const f = list[i];
    if (!f) return;
    const a = f.artifact;
    panel.kicker.textContent = Tx(S.kicker).replace("{name}", f.glyph.name[lang]);
    panel.title.textContent = a.name[lang];
    const n = artifactCompanies(a).length;
    tech.textContent = `${a.tech} · ${n === 1 ? Tx(S.one) : Tx(S.companies).replace("{n}", String(n))}`;
    summary.textContent = a.summary[lang];
    uses.replaceChildren(
      ...artifactUses(a).map((u) => {
        const li = el("li");
        li.style.setProperty("--qnf-dot", DYE[a.dye] ?? "#3446a6");
        li.append(
          el("strong", undefined, u.company),
          el("small", undefined, `${u.role[lang]} · ${span(u.start, u.end, lang)}`),
          el("span", undefined, u.text[lang]),
        );
        return li;
      }),
    );
    real.textContent = f.glyph.real[lang];
    counter.textContent = `${i + 1} / ${list.length}`;
  }

  // ------------------------------------------------------------------ frame
  const fwd = new THREE.Vector3();
  let target: (typeof list)[number] | null = null;
  let onTop = false;
  return {
    update(_dt, avatar) {
      onTop = onTowerTop(avatar, deckY);
      if (onTop) {
        env.camera.getWorldDirection(fwd);
        target = facedFigure(list, avatar, { x: fwd.x, z: fwd.z });
      } else target = signInRange(list, avatar.x, avatar.z);
      if (panel.isOpen() && !onTop && !signInRange(list, avatar.x, avatar.z)) panel.close();
    },
    prompt() {
      if (panel.isOpen()) return onTop || target ? Tx(S.close) : null;
      if (target) return Tx(S.read).replace("{name}", target.glyph.name[lang]);
      return onTop ? Tx(S.face) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!target) return false;
      show(list.indexOf(target));
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
      offFontsReady(redraw);
      for (const r of removers) r();
      creatures.removeKeepOut(keep);
      group.removeFromParent();
      linesGeo.dispose();
      linesMat.dispose();
      towerGeo.dispose();
      plazaGeo.dispose();
      mat.dispose();
      signGeo.dispose();
      signMat.dispose();
      atlas.texture.dispose();
    },
  };
};
