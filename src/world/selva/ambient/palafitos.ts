/**
 * Palafitos de proyectos (station "palafitos", kind projects): a row of stilt houses along the riverbank,
 * their fronts on the flat bank and their backs out over the drop to the water on tall hardwood stilts,
 * joined by a plank boardwalk with the canoe pier in the middle (canoe.ts builds the pier; this row keeps its
 * slot free). One house per project of the /projects page: the curated case studies (career.ts ARTIFACTS)
 * first, painted in their dye, then the most-starred GitHub repos from the page's data (palafitos/logic.ts).
 * Each house has a carved sign over its porch; "E · Ver proyecto" on the porch opens a paper panel with the
 * description, the timeline of uses (year, company, role) or the repo's language, stars and GitHub link,
 * plus a link to /{lang}/projects/; ←/→ walk the row. Unlike the mountain's code garden (terraces of crops)
 * and artifact bridge (cords over a gorge), these are dwellings: a project is a house you visit.
 *
 * Draw calls: one vertex-colored mesh (all houses, boardwalk, stilts) + one merged sign mesh + the marker.
 * Walkable: the level boardwalk (on short stilts where the bank dips) and every porch, at one height level
 * with the canoe pier, registered as raised decks (station.ts addDeck); the edges over the bank are not
 * walkable ground, so they hold the traveler like railings. The house bodies are colliders.
 */
import * as THREE from "three";
import { createMarker } from "../../ambient/fields/geo";
import { safeHref } from "../../ambient/fields/logic";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import { fit } from "../../ambient/fields/signs";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { worldData } from "../../data";
import { flattenToonGroup } from "../../merge-colors";
import { DYE, FONT, Kit, rng } from "../../props";
import type { SelvaEnv } from "../contract";
import {
  A,
  deck,
  disposeTree,
  drawCarved,
  goods,
  irapayRoof,
  railing,
  signBoards,
  stationCull,
  stationMaterial,
  stilt,
} from "./embarcadero/amazon";
import "./embarcadero/panels.css";
import {
  addDeck,
  at,
  groundOf,
  lxOf,
  lzOf,
  nearestSpot,
  rectCircles,
  type Spot,
  segmentCircles,
  stationFrame,
  stationGroup,
  subFrame,
} from "./embarcadero/station";
import { HOUSE_W, type Project, projectName, projects, rowSlots, type Slot } from "./palafitos/logic";

const STATION = "palafitos";
const S = {
  kicker: { es: "Palafitos de proyectos", en: "Project stilt houses" },
  caseK: { es: "Caso de estudio", en: "Case study" },
  repoK: { es: "Repositorio", en: "Repository" },
  view: { es: "E · Ver proyecto", en: "E · View project" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  uses: { es: "Dónde lo construí", en: "Where I built it" },
  stars: { es: "estrellas", en: "stars" },
  noDesc: { es: "Sin descripción.", en: "No description." },
  nolang: { es: "Sin lenguaje", en: "No language" },
  github: { es: "Ver en GitHub", en: "View on GitHub" },
  page: { es: "Ver todos los proyectos", en: "See all projects" },
  prev: { es: "Casa anterior", en: "Previous house" },
  next: { es: "Casa siguiente", en: "Next house" },
  keys: { es: "← → para recorrer", en: "← → to browse" },
  board: { es: "PALAFITOS · PROYECTOS", en: "STILT HOUSES · PROJECTS" },
} satisfies Record<string, L>;

const DEPTH = 3.2;
const PORCH = 1.05;
const WALL_H = 2.05;
/**
 * Floor of every house, its porch and the boardwalk above the station origin: level with the canoe pier's
 * deck (canoe/logic.ts PIER_Y) at the boardwalk's pier root, and above the flat apron (0) everywhere.
 */
const FLOOR_Y = 0.12;
/** Boardwalk width. */
const WALK_W = 1.25;
const REPO_TRIM = "#3c8d93";

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SelvaEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const f = stationFrame(env, STATION);
  const ground = groundOf(env, f);
  const rand = rng(0x9a1af170);
  const list = projects(worldData().repos);
  const slots = rowSlots(list.length);
  const trim = (p: Project) => (p.kind === "case" ? DYE[p.dye] : REPO_TRIM);

  // Local helpers in a house frame (slot position + yaw; +Z toward the porch/road).
  const toLocal = (s: Slot, hx: number, hz: number): [number, number] => {
    const c = Math.cos(s.yaw);
    const n = Math.sin(s.yaw);
    return [s.x + hx * c + hz * n, s.z - hx * n + hz * c];
  };

  // ------------------------------------------------------------------ build
  const group = stationGroup(f, "selva-palafitos");
  const mat = stationMaterial();
  const kit = new Kit(env);
  /** Every house is built in its own frame, then its meshes (geometry pre-transformed) join the station. */
  const kitMeshes: THREE.Mesh[] = [];
  const porchYs: number[] = [];
  list.forEach((p, i) => {
    const s = slots[i] as Slot;
    const house = new Kit(env);
    const hg = (hx: number, hz: number) => {
      const [lx, lz] = toLocal(s, hx, hz);
      return ground(lx, lz);
    };
    // One level floor for the whole row (the porches meet the level boardwalk).
    const y = FLOOR_Y;
    porchYs.push(y);
    const hw = HOUSE_W / 2;
    const z0 = -DEPTH / 2;
    const z1 = DEPTH / 2;
    // Stilts down to the bank (long at the back where the bank falls to the river).
    for (const hx of [-hw + 0.1, 0, hw - 0.1])
      for (const hz of [z0 + 0.1, 0, z1 - 0.1, z1 + PORCH - 0.1])
        stilt(house, hx, hz, Math.min(hg(hx, hz), y) - 1.2, y - 0.08, 0.085);
    // Cross bracing on the tall back stilts.
    const back = hg(0, z0);
    if (y - back > 1.5) {
      house.stick(
        new THREE.Vector3(-hw + 0.1, back + 0.4, z0 + 0.1),
        new THREE.Vector3(hw - 0.1, y - 0.3, z0 + 0.1),
        0.035,
        A.woodDark,
      );
      house.stick(
        new THREE.Vector3(hw - 0.1, back + 0.4, z0 + 0.1),
        new THREE.Vector3(-hw + 0.1, y - 0.3, z0 + 0.1),
        0.035,
        A.woodDark,
      );
    }
    deck(house, rand, { x0: -hw, x1: hw, z0, z1: z1 + PORCH, y, along: "x", joists: true });
    // Plank walls (sides and back full height; the front has a door and a shuttered window).
    const wall = (w: number, x: number, z: number, ry: number, color: string = A.weathered) =>
      house.box(w, WALL_H, 0.08, x, y, z, color, ry);
    wall(HOUSE_W, 0, z0 + 0.04, 0);
    wall(DEPTH, -hw + 0.04, 0, Math.PI / 2);
    wall(DEPTH, hw - 0.04, 0, Math.PI / 2);
    house.box(0.95, WALL_H, 0.08, -hw + 0.475, y, z1 - 0.04, A.weathered);
    house.box(0.8, WALL_H, 0.08, hw - 0.4, y, z1 - 0.04, A.weathered);
    house.box(HOUSE_W - 1.75, 0.45, 0.08, -hw + 0.95 + (HOUSE_W - 1.75) / 2, y + WALL_H - 0.45, z1 - 0.04, A.weathered);
    // Dark doorway, painted door frame and window shutters in the project's color.
    house.box(0.78, 1.6, 0.04, -hw + 0.95 + 0.39, y, z1 - 0.07, A.ink);
    house.box(0.08, 1.65, 0.1, -hw + 0.93, y, z1, trim(p));
    house.box(0.08, 1.65, 0.1, -hw + 1.77, y, z1, trim(p));
    house.box(0.92, 0.08, 0.1, -hw + 1.35, y + 1.62, z1, trim(p));
    house.box(0.56, 0.5, 0.05, hw - 0.42, y + 0.95, z1 + 0.02, A.ink);
    house.box(0.28, 0.54, 0.05, hw - 0.84, y + 0.93, z1 + 0.06, trim(p), -0.5);
    house.box(0.28, 0.54, 0.05, hw + 0.0, y + 0.93, z1 + 0.06, trim(p), 0.5);
    // Base course painted in the project's color (the house reads from the river too).
    house.box(HOUSE_W + 0.04, 0.16, DEPTH + 0.04, 0, y - 0.02, 0, trim(p));
    // Porch railing (ends only, the front is open to the boardwalk) and roof posts.
    railing(house, [-hw, z1 + 0.05], [-hw, z1 + PORCH - 0.05], y, 0.8);
    railing(house, [hw, z1 + 0.05], [hw, z1 + PORCH - 0.05], y, 0.8);
    for (const hx of [-hw + 0.06, hw - 0.06]) house.cyl(0.05, 0.06, WALL_H + 0.6, hx, y, z1 + PORCH - 0.08, A.wood, 5);
    // The eave sits well above the door so the carved sign over it shows under the leaf tips.
    irapayRoof(house, rand, {
      w: HOUSE_W + 0.2,
      d: DEPTH + PORCH,
      y: y + WALL_H + 0.55,
      h: 1.35,
      oz: PORCH / 2,
      over: 0.35,
    });
    // Gable infill between the wall top and the raised roof.
    house.box(HOUSE_W, 0.55, 0.08, 0, y + WALL_H, z0 + 0.04, A.weathered);
    house.box(HOUSE_W, 0.55, 0.08, 0, y + WALL_H, z1 - 0.04, A.weathered);
    // A little life on the porch: a pot, a stool or a hanging bunch of bananas.
    if (i % 3 === 0) goods(house, rand, hw - 0.4, y, z1 + 0.5, "pot");
    else if (i % 3 === 1) goods(house, rand, -hw + 0.35, y, z1 + 0.45, "sack");
    else house.box(0.36, 0.32, 0.36, hw - 0.4, y, z1 + 0.5, A.wood);
    const hgGroup = house.build(`selva-palafito-${i}`);
    const [lx, lz] = toLocal(s, 0, 0);
    hgGroup.position.set(lx, 0, lz);
    hgGroup.rotation.y = s.yaw;
    hgGroup.updateMatrix();
    for (const m of [...hgGroup.children]) {
      const mesh = m as THREE.Mesh;
      mesh.geometry.applyMatrix4(hgGroup.matrix);
      kitMeshes.push(mesh);
    }
  });
  // The boardwalk: along the porch fronts, from house to house and to the canoe pier root (x = 0). Level at
  // FLOOR_Y; each straight run is one raised deck (registered below).
  const runs: Array<{ a: [number, number]; b: [number, number] }> = [];
  {
    const fronts = slots
      .map((s, i) => ({ i, p: toLocal(s, 0, DEPTH / 2 + PORCH + 0.55) }))
      .sort((a, b) => a.p[0] - b.p[0]);
    const pts = fronts.map((x) => x.p);
    // Insert the pier root between the left and right halves of the row.
    const k = pts.findIndex((p) => p[0] > 0);
    pts.splice(k < 0 ? pts.length : k, 0, [0, -4.6]);
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i] as [number, number];
      const b = pts[i + 1] as [number, number];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.round(len / 0.32));
      for (let j = 0; j < n; j++) {
        const u = (j + 0.5) / n;
        const x = a[0] + (b[0] - a[0]) * u;
        const z = a[1] + (b[1] - a[1]) * u;
        const ry = Math.atan2(b[0] - a[0], b[1] - a[1]);
        const color = rand() < 0.3 ? A.plankAlt : A.plank;
        kit.box(WALK_W, 0.07, (len / n) * 0.88, x, FLOOR_Y - 0.07, z, color, ry);
      }
      // Side beams, and short stilts where the bank dips under the boards.
      const px = ((b[1] - a[1]) / len) * (WALK_W / 2 - 0.08);
      const pz = (-(b[0] - a[0]) / len) * (WALK_W / 2 - 0.08);
      for (const sd of [-1, 1])
        kit.stick(
          new THREE.Vector3(a[0] + px * sd, FLOOR_Y - 0.1, a[1] + pz * sd),
          new THREE.Vector3(b[0] + px * sd, FLOOR_Y - 0.1, b[1] + pz * sd),
          0.05,
          A.woodDark,
        );
      const posts = Math.max(1, Math.round(len / 1.6));
      for (let j = 0; j <= posts; j++) {
        const x = a[0] + ((b[0] - a[0]) * j) / posts;
        const z = a[1] + ((b[1] - a[1]) * j) / posts;
        for (const sd of [-1, 1]) {
          const g = ground(x + px * sd, z + pz * sd);
          if (g < FLOOR_Y - 0.14) stilt(kit, x + px * sd, z + pz * sd, g - 0.4, FLOOR_Y - 0.1, 0.06);
        }
      }
      runs.push({ a, b });
    }
  }
  // Station board at the road side of the plaza.
  kit.cyl(0.06, 0.07, 1.6, -1.6, ground(-1.6, 3.6), 3.6, A.woodDark, 5);
  kit.cyl(0.06, 0.07, 1.6, 1.6, ground(1.6, 3.6), 3.6, A.woodDark, 5);
  const base = kit.build("selva-palafitos");
  for (const m of kitMeshes) base.add(m);
  // Merge everything (houses + boardwalk) into one vertex-colored mesh.
  flattenToonGroup(base, mat);
  group.add(base);

  // Carved signs: one per house over its porch, plus the station board.
  const signs = signBoards(
    env,
    list.length + 1,
    320,
    96,
    (ctx, i, cw, ch) => {
      if (i === list.length) {
        drawCarved(ctx, cw, ch, "#7a4a2b");
        ctx.fillStyle = "#fbe9c8";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const t = T(S.board);
        fit(ctx, t, (px) => `800 ${px}px ${FONT.display}`, 36, cw - 36);
        ctx.fillText(t, cw / 2, ch / 2 + 2);
        return;
      }
      const p = list[i] as Project;
      drawCarved(ctx, cw, ch);
      ctx.fillStyle = trim(p);
      ctx.fillRect(16, ch - 20, cw - 32, 7);
      ctx.fillStyle = "#fbe9c8";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      carveName(ctx, projectName(p, lang), cw, ch);
    },
    [
      ...list.map((_, i) => {
        const s = slots[i] as Slot;
        // Over the door on the front wall, under the porch roof (the eave's leaf tips would hide it lower down).
        const [x, z] = toLocal(s, -0.15, DEPTH / 2 + 0.03);
        return { i, w: 1.5, h: 1.5 * (96 / 320), x, y: (porchYs[i] as number) + 2.05, z, ry: s.yaw };
      }),
      { i: list.length, w: 3.2, h: 3.2 * (96 / 320), x: 0, y: ground(0, 3.6) + 1.25, z: 3.62 },
    ],
    "selva-palafitos",
  );
  group.add(signs.mesh);
  env.scene.add(group);

  // ------------------------------------------------------------------ world registration
  const unDeck: Array<() => void> = [];
  for (const { a, b } of runs) {
    // A boardwalk run in its own frame (+Z along the run), a little longer so consecutive runs overlap.
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const run = subFrame(f, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1]));
    unDeck.push(addDeck(run, -WALK_W / 2, -len / 2 - 0.35, WALK_W / 2, len / 2 + 0.35, FLOOR_Y, "palafitos-walk"));
  }
  slots.forEach((s) => {
    // The porch (the house frame: slot position + yaw), from the front wall to the boardwalk.
    const house = subFrame(f, s.x, s.z, s.yaw);
    unDeck.push(
      addDeck(house, -HOUSE_W / 2, DEPTH / 2 - 0.1, HOUSE_W / 2, DEPTH / 2 + PORCH, FLOOR_Y, "palafitos-porch"),
    );
    // The house body: front wall line and the footprint behind it.
    const a = toLocal(s, -HOUSE_W / 2, DEPTH / 2 - 0.1);
    const b = toLocal(s, HOUSE_W / 2, DEPTH / 2 - 0.1);
    for (const c of segmentCircles(f, a, b, 0.32)) env.addCollider(c);
    const [cx, cz] = toLocal(s, 0, 0);
    env.addCollider(at(f, cx, cz, 1.3));
  });
  for (const c of rectCircles(f, -1.7, 3.5, 1.7, 3.7, 0.2)) env.addCollider(c);
  const keep = creatures.keepOut(f.x, f.z, 12);
  const cull = stationCull(group, new THREE.Vector3(f.x, f.y, f.z));

  // ------------------------------------------------------------------ panel
  let sel = 0;
  const marker = createMarker(env);
  group.add(marker.mesh);
  const panel = createFieldPanel(hudRoot, {
    name: "palafitos",
    closeLabel: T(S.closeAria),
    onNav: (d) => select(sel + d),
    onClose: () => marker.hide(),
  });
  panel.layer.classList.add("qns");
  const detail = el("div");
  const actions = el("div", "qnf-actions");
  const nav = el("div", "qnf-nav");
  const prev = el("button", "qnf-btn", "←");
  prev.type = "button";
  prev.setAttribute("aria-label", T(S.prev));
  const next = el("button", "qnf-btn", "→");
  next.type = "button";
  next.setAttribute("aria-label", T(S.next));
  const count = el("span");
  count.setAttribute("aria-live", "polite");
  nav.append(prev, count, next);
  prev.addEventListener("click", () => select(sel - 1));
  next.addEventListener("click", () => select(sel + 1));
  panel.body.append(detail, actions, nav);

  const markAt = (i: number) => {
    const s = slots[i] as Slot;
    const [x, z] = toLocal(s, 0, DEPTH / 2 + PORCH + 0.02);
    marker.place(x, (porchYs[i] as number) + WALL_H + 0.85, z);
  };
  const render = () => {
    const p = list[sel] as Project;
    detail.replaceChildren();
    actions.replaceChildren();
    detail.style.setProperty("--qns-dye", trim(p));
    panel.kicker.textContent = `${T(S.kicker)} · ${T(p.kind === "case" ? S.caseK : S.repoK)}`;
    panel.title.textContent = projectName(p, lang);
    if (p.kind === "case") {
      detail.append(el("p", "qnf-meta", p.tech), el("p", "qnf-lede", T(p.summary)), el("p", "qnf-label", T(S.uses)));
      const ul = el("ul", "qns-uses");
      for (const u of p.uses) {
        const li = el("li");
        li.append(el("span", "qns-year", u.year));
        const who = el("span", "qns-who", `${u.company} · ${T(u.role)}`);
        li.append(who, el("span", undefined, T(u.text)));
        ul.append(li);
      }
      detail.append(ul);
      actions.append(linkButton(`/${lang}/projects/#${p.id}`, T(S.page), false, true));
    } else {
      detail.append(el("p", "qnf-lede", p.description?.trim() || T(S.noDesc)));
      const meta = el("p", "qnf-meta");
      const langEl = el("span");
      const dot = el("span", "qnf-dot");
      dot.style.setProperty("--qnf-dot", REPO_TRIM);
      langEl.append(dot, p.language ?? T(S.nolang));
      const stars = el("span");
      stars.append(el("strong", undefined, `★ ${p.stars}`), ` ${T(S.stars)}`);
      meta.append(langEl, stars);
      detail.append(meta);
      const href = safeHref(p.url);
      if (href) actions.append(linkButton(href, T(S.github), true, true));
      actions.append(linkButton(`/${lang}/projects/#repos`, T(S.page), false));
    }
    count.textContent = `${sel + 1} / ${list.length} · ${T(S.keys)}`;
  };
  const select = (i: number) => {
    sel = (i + list.length) % list.length;
    render();
    markAt(sel);
  };

  // ------------------------------------------------------------------ frame loop
  const spots: Spot[] = slots.map((s) => {
    const [lx, lz] = toLocal(s, 0, DEPTH / 2 + PORCH * 0.55);
    return { lx, lz, r: 1.3 };
  });
  let near = -1;
  let inRange = false;
  return {
    update(dt, avatar, t) {
      if (!cull(env.camera)) {
        near = -1;
        if (panel.isOpen()) panel.close();
        return;
      }
      const lx = lxOf(f, avatar.x, avatar.z);
      const lz = lzOf(f, avatar.x, avatar.z);
      inRange = Math.hypot(lx, lz + 3) < 19;
      near = nearestSpot(spots, lx, lz);
      if (panel.isOpen() && !inRange) panel.close();
      if (!panel.isOpen()) {
        if (near >= 0) markAt(near);
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

/** Carves a project name on a sign: one line when it fits large enough, else two balanced lines. */
function carveName(ctx: CanvasRenderingContext2D, name: string, cw: number, ch: number) {
  const font = (px: number) => `800 ${px}px ${FONT.display}`;
  const text = name.toUpperCase();
  const one = fit(ctx, text, font, 40, cw - 40);
  if (one >= 28 || !text.includes(" ")) {
    ctx.fillText(text, cw / 2, ch / 2 - 3);
    return;
  }
  const words = text.split(" ");
  let best = 1;
  let bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const d = Math.abs(words.slice(0, k).join(" ").length - words.slice(k).join(" ").length);
    if (d < bestDiff) {
      bestDiff = d;
      best = k;
    }
  }
  const a = words.slice(0, best).join(" ");
  const b = words.slice(best).join(" ");
  const longer = a.length >= b.length ? a : b;
  const px = fit(ctx, longer, font, 32, cw - 40);
  ctx.font = font(px);
  ctx.fillText(a, cw / 2, ch / 2 - px * 0.55 - 2);
  ctx.fillText(b, cw / 2, ch / 2 + px * 0.5 - 2);
}
