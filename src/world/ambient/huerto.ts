/**
 * Huerto de código (station "build-1"): Inca andenes in an amphitheater around the back of the plaza,
 * one stone-walled terrace per GitHub repo (up to 8, most-starred first and highest). The crop on each
 * terrace says the repo's language, its height and density the stars (log scale). A wooden sign at the
 * foot of each terrace: "E · Ver repositorio" opens a dialog with the repo, a GitHub link and the legend;
 * ←/→ walk the terraces. Stamp `field:huerto` on the first visit.
 */
import * as THREE from "three";
import { SOCIALS } from "../../data/site";
import type { CreateAmbient, L } from "../contract";
import { type WorldRepo, worldData } from "../data";
import { emit } from "../events";
import { C, drawBoard, FONT, hashStr, Kit, rng, stoneWall } from "../props";
import {
  circle,
  createMarker,
  disposeGeometries,
  lxOf,
  lzOf,
  pathToTrail,
  sectorGeometry,
  stationFrame,
} from "./fields/geo";
import {
  arcLayout,
  CROPS,
  type CropId,
  cropById,
  cropFor,
  formatDate,
  growth,
  LEGEND_NOTE,
  plantCount,
  safeHref,
  wrap,
} from "./fields/logic";
import { createFieldPanel, el, linkButton } from "./fields/panel";
import { fit, signAtlas } from "./fields/signs";

const STATION = "build-1";
const MAX_TERRACES = 8;
/** Terrace band (local radii) and the ring of signs at its foot. */
const R0 = 2.6;
const R1 = 4.55;
const RS = 2.12;
const SIGN_RANGE = 1.35;
const STAMP_RANGE = 5.4;

const S = {
  label: { es: "Huerto de código", en: "Code garden" },
  view: { es: "E · Ver repositorio", en: "E · View repo" },
  viewEmpty: { es: "E · Ver huerto", en: "E · View garden" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  kicker: { es: "Huerto de código · andén", en: "Code garden · terrace" },
  sub: { es: "Andenes de repositorios", en: "Terraces of repositories" },
  noDesc: { es: "Sin descripción.", en: "No description." },
  stars: { es: "estrellas", en: "stars" },
  pushed: { es: "Último push", en: "Last push" },
  github: { es: "Ver en GitHub", en: "View on GitHub" },
  legend: { es: "Leyenda del huerto", en: "Garden legend" },
  scale: {
    es: "La altura y la densidad del cultivo siguen las estrellas del repositorio en escala logarítmica. El andén más alto es el más estrellado.",
    en: "Crop height and density follow the repo's stars on a log scale. The highest terrace is the most starred.",
  },
  prev: { es: "Andén anterior", en: "Previous terrace" },
  next: { es: "Andén siguiente", en: "Next terrace" },
  keys: { es: "← → para recorrer", en: "← → to browse" },
  fallowTitle: { es: "Huerto en barbecho", en: "Fallow garden" },
  fallowLede: {
    es: "Esta vez no llegaron los repositorios de GitHub, así que la tierra descansa. Puedes verlos directamente en GitHub.",
    en: "The GitHub repositories didn't arrive this time, so the soil is resting. You can see them on GitHub directly.",
  },
  profile: { es: "Perfil en GitHub", en: "GitHub profile" },
  nolang: { es: "Sin lenguaje", en: "No language" },
} satisfies Record<string, L>;

const LANG_NAMES: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  "jupyter notebook": "Jupyter",
  go: "Go",
  rust: "Rust",
  java: "Java",
  kotlin: "Kotlin",
  scala: "Scala",
  "c#": "C#",
};

/** Instanced parts of one plant (unit height ≈ 1 before the growth scale). */
interface Part {
  geo: "stalk" | "cone" | "blob" | "bead";
  color: string;
  /** Offset (y) and scale of the part, in plant units. */
  y: number;
  s: [number, number, number];
  /** Tilt (rad) around Z, e.g. a maize cob leaning out of the stalk. */
  tilt?: number;
  /** Sideways offset (x) in plant units. */
  x?: number;
}

const PLANTS: Record<CropId, Part[]> = {
  maize: [
    { geo: "stalk", color: "#6f9a4a", y: 0, s: [0.035, 1.15, 0.035] },
    { geo: "cone", color: "#5f8f55", y: 0.18, s: [0.2, 0.62, 0.2] },
    { geo: "bead", color: "#e8c23a", y: 0.5, s: [0.055, 0.14, 0.055], tilt: 0.45, x: 0.06 },
    { geo: "cone", color: C.straw, y: 1.12, s: [0.06, 0.2, 0.06] },
  ],
  potato: [
    { geo: "blob", color: "#4f7d3f", y: 0.1, s: [0.26, 0.2, 0.26] },
    { geo: "bead", color: "#b89ad6", y: 0.3, s: [0.045, 0.045, 0.045], x: 0.08 },
    { geo: "bead", color: "#f0e6f6", y: 0.28, s: [0.04, 0.04, 0.04], x: -0.1 },
  ],
  quinoa: [
    { geo: "stalk", color: "#6f9a4a", y: 0, s: [0.03, 0.75, 0.03] },
    { geo: "blob", color: "#5f8f55", y: 0.25, s: [0.12, 0.14, 0.12] },
    { geo: "cone", color: "#c4383f", y: 0.68, s: [0.1, 0.36, 0.1] },
  ],
  tarwi: [
    { geo: "blob", color: "#5f8f55", y: 0.14, s: [0.22, 0.2, 0.22] },
    { geo: "cone", color: "#3446a6", y: 0.3, s: [0.055, 0.28, 0.055] },
    { geo: "cone", color: "#efe6d6", y: 0.26, s: [0.04, 0.18, 0.04], x: 0.12 },
  ],
  oca: [
    { geo: "blob", color: "#6a9a4c", y: 0.06, s: [0.2, 0.11, 0.2] },
    { geo: "bead", color: "#dda63c", y: 0.17, s: [0.04, 0.04, 0.04], x: 0.06 },
  ],
  fallow: [{ geo: "cone", color: "#5f8f55", y: 0, s: [0.035, 0.16, 0.035] }],
};

const SOIL: Record<CropId, string> = {
  maize: "#7a5a3c",
  potato: "#6e4f35",
  quinoa: "#7a5a3c",
  tarwi: "#6e4f35",
  oca: "#7a5a3c",
  fallow: "#9a7a55",
};

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const low = env.quality === "low";
  const repos: WorldRepo[] = worldData().repos.slice(0, MAX_TERRACES);
  const empty = repos.length === 0;
  const f = stationFrame(env, STATION);
  const group = new THREE.Group();
  group.name = "huerto";
  group.position.set(f.x, f.y, f.z);
  group.rotation.y = f.yaw;
  env.scene.add(group);

  // ------------------------------------------------------------------ terraces
  const n = empty ? 3 : repos.length;
  const arc = arcLayout(n);
  const maxStars = repos.reduce((m, r) => Math.max(m, r.stars), 0);
  const crops: CropId[] = empty ? ["fallow", "fallow", "fallow"] : repos.map((r) => cropFor(r.language));
  const growths: number[] = empty ? [0.3, 0.3, 0.3] : repos.map((r) => growth(r.stars, maxStars));
  /** Terrace top height: index 0 (most stars) is the highest step. */
  const topOf = (i: number) => 0.38 + (n - 1 - i) * 0.2;
  const rand = rng(hashStr("huerto"));
  const kit = new Kit(env);
  for (let i = 0; i < n; i++) {
    const c = arc.center[i] as number;
    const a0 = c - arc.width / 2;
    const a1 = c + arc.width / 2;
    const top = topOf(i);
    kit.add(sectorGeometry(R0 + 0.1, R1, a0, a1, -0.35, top), C.stoneDark);
    kit.add(sectorGeometry(R0 + 0.2, R1 - 0.05, a0 + 0.015, a1 - 0.015, top - 0.04, top + 0.07), SOIL[crops[i]!]);
    // Ashlar front wall along the inner arc (chords), with a lip just above the soil.
    const chords = Math.max(2, Math.ceil(((a1 - a0) * R0) / 0.5));
    for (let k = 0; k < chords; k++) {
      const b0 = a0 + ((a1 - a0) * k) / chords;
      const b1 = a0 + ((a1 - a0) * (k + 1)) / chords;
      const rr = R0 + 0.12;
      stoneWall(
        kit,
        rand,
        Math.sin(b0) * rr,
        Math.cos(b0) * rr,
        Math.sin(b1) * rr,
        Math.cos(b1) * rr,
        -0.1,
        top + 0.2,
        0.26,
        {
          courses: Math.max(2, Math.round((top + 0.2) / 0.28)),
        },
      );
    }
  }
  // Retaining back wall behind the whole amphitheater.
  if (n) {
    const a0 = (arc.center[0] as number) - arc.width / 2;
    const a1 = (arc.center[n - 1] as number) + arc.width / 2;
    kit.add(sectorGeometry(R1, R1 + 0.3, a0, a1, -0.35, topOf(0) + 0.3), C.stone);
  }

  // ------------------------------------------------------------------ signs (atlas: one cell per terrace + the entrance board)
  const atlas = signAtlas(env, n + 1, 512, 224, (ctx, i, cw, ch) => {
    drawBoard(ctx, cw, ch, i === n ? "#d9b25a" : "#b98a55");
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (i === n) {
      const title = T(S.label).toUpperCase();
      fit(ctx, title, (px) => `condensed 800 ${px}px ${FONT.display}`, 76, cw - 44);
      ctx.fillText(title, cw / 2, ch * 0.42);
      fit(ctx, T(S.sub), (px) => `600 ${px}px ${FONT.mono}`, 28, cw - 60);
      ctx.fillText(T(S.sub), cw / 2, ch * 0.76);
      return;
    }
    const repo = repos[i];
    const name = repo ? repo.name : T(S.fallowTitle);
    fit(ctx, name, (px) => `condensed 800 ${px}px ${FONT.display}`, 64, cw - 40);
    ctx.fillText(name, cw / 2, ch * 0.4);
    const crop = cropById(crops[i]!);
    const sub = repo ? `★ ${repo.stars} · ${repo.language ?? T(S.nolang)}` : T(crop.label);
    fit(ctx, sub, (px) => `600 ${px}px ${FONT.mono}`, 30, cw - 60);
    ctx.fillText(sub, cw / 2, ch * 0.76);
    ctx.fillStyle = crop.swatch;
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(30, 30, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  /** Local sign positions (and world, for proximity). */
  const signs: Array<{ lx: number; lz: number }> = [];
  for (let i = 0; i < n; i++) {
    const c = arc.center[i] as number;
    const lx = Math.sin(c) * RS;
    const lz = Math.cos(c) * RS;
    const ry = c + Math.PI;
    signs.push({ lx, lz });
    // Post + backing plank; the lettered plane sits just in front.
    const bx = -Math.sin(c) * 0.04;
    const bz = -Math.cos(c) * 0.04;
    kit.box(0.08, 0.95, 0.08, lx - bx * 2, -0.05, lz - bz * 2, C.woodDark, ry);
    kit.box(0.9, 0.42, 0.05, lx - bx, 0.62, lz - bz, C.woodDark, ry);
    const plane = atlas.plane(i, 0.84, 0.368);
    plane.position.set(lx, 0.83, lz);
    plane.rotation.y = ry;
    group.add(plane);
  }
  // Entrance board by the path into the plaza, facing the trail.
  {
    const ex = 2.5;
    const ez = 3.0;
    const ry = 0.4;
    const cx = Math.cos(ry);
    const sx = Math.sin(ry);
    for (const s of [-0.7, 0.7]) kit.box(0.09, 1.55, 0.09, ex + s * cx, -0.05, ez - s * sx, C.woodDark, ry);
    kit.box(1.6, 0.66, 0.06, ex - sx * 0.03, 0.95, ez - cx * 0.03, C.woodDark, ry);
    const plane = atlas.plane(n, 1.5, 0.656);
    plane.position.set(ex + sx * 0.02, 1.28, ez + cx * 0.02);
    plane.rotation.y = ry;
    group.add(plane);
    env.addCollider(circle(f, ex, ez, 0.75));
  }
  group.add(kit.build("huerto"));

  // ------------------------------------------------------------------ crops (instanced per crop part)
  const geos = {
    stalk: new THREE.CylinderGeometry(1, 1, 1, 5).translate(0, 0.5, 0),
    cone: new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
    blob: new THREE.IcosahedronGeometry(1, 0),
    bead: new THREE.IcosahedronGeometry(1, 0),
  };
  const plantsOf = new Map<CropId, Array<{ x: number; y: number; z: number; s: number; ry: number }>>();
  for (let i = 0; i < n; i++) {
    const crop = crops[i]!;
    const g = growths[i]!;
    const count = plantCount(g, low);
    const c = arc.center[i] as number;
    const margin = 0.2 / R0;
    const a0 = c - arc.width / 2 + margin;
    const a1 = c + arc.width / 2 - margin;
    const rows = 3;
    const perRow = Math.max(1, Math.ceil(count / rows));
    const list = plantsOf.get(crop) ?? [];
    for (let r = 0; r < rows; r++) {
      const rr = R0 + 0.55 + r * ((R1 - R0 - 0.9) / (rows - 1));
      for (let k = 0; k < perRow && r * perRow + k < count; k++) {
        const a = a0 + ((a1 - a0) * (k + 0.5 + (rand() - 0.5) * 0.5)) / perRow;
        const rj = rr + (rand() - 0.5) * 0.18;
        list.push({
          x: Math.sin(a) * rj,
          y: topOf(i) + 0.06,
          z: Math.cos(a) * rj,
          s: (0.45 + 0.8 * g) * (0.85 + rand() * 0.3),
          ry: rand() * Math.PI * 2,
        });
      }
    }
    plantsOf.set(crop, list);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qt = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const instanced: THREE.InstancedMesh[] = [];
  for (const [crop, list] of plantsOf) {
    if (!list.length) continue;
    for (const part of PLANTS[crop]) {
      const mesh = new THREE.InstancedMesh(geos[part.geo], env.toon(part.color), list.length);
      mesh.name = `huerto-${crop}`;
      list.forEach((pl, k) => {
        q.setFromEuler(e.set(0, pl.ry, 0));
        qt.setFromEuler(e.set(0, 0, part.tilt ?? 0));
        q.multiply(qt);
        const ox = (part.x ?? 0) * pl.s;
        p.set(pl.x + Math.cos(pl.ry) * ox, pl.y + part.y * pl.s, pl.z - Math.sin(pl.ry) * ox);
        sc.set(part.s[0] * pl.s, part.s[1] * pl.s, part.s[2] * pl.s);
        mesh.setMatrixAt(k, m4.compose(p, q, sc));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      instanced.push(mesh);
    }
  }

  // ------------------------------------------------------------------ colliders + walkables
  if (n) {
    const a0 = (arc.center[0] as number) - arc.width / 2;
    const a1 = (arc.center[n - 1] as number) + arc.width / 2;
    const rm = (R0 + R1) / 2 + 0.1;
    const steps = Math.max(2, Math.ceil(((a1 - a0) * rm) / 0.9));
    for (let k = 0; k <= steps; k++) {
      const a = a0 + ((a1 - a0) * k) / steps;
      env.addCollider(circle(f, Math.sin(a) * rm, Math.cos(a) * rm, (R1 - R0) / 2 + 0.05));
    }
    for (const s of signs) env.addCollider(circle(f, s.lx, s.lz, 0.18));
  }
  env.addWalkable(circle(f, 0, 0, 4.7));
  for (const w of pathToTrail(env, f, 0, 3.6)) env.addWalkable(w);

  const marker = createMarker(env);
  group.add(marker.mesh);

  // ------------------------------------------------------------------ panel
  let sel = 0;
  const panel = createFieldPanel(hudRoot, {
    name: "huerto",
    closeLabel: T(S.closeAria),
    onNav: (d) => select(sel + d),
    onClose: () => marker.hide(),
  });
  const detail = el("div");
  const legendItems = new Map<CropId, HTMLLIElement>();
  const legend = el("ul", "qnf-legend");
  for (const crop of CROPS) {
    const li = el("li");
    const sw = el("span", "qnf-swatch");
    sw.style.setProperty("--qnf-dot", crop.swatch);
    const txt = el("span", undefined, T(crop.label));
    const langs =
      crop.id === "oca" || crop.id === "fallow"
        ? T(LEGEND_NOTE[crop.id])
        : crop.langs.map((l) => LANG_NAMES[l] ?? l).join(", ");
    txt.append(el("small", undefined, langs));
    li.append(sw, txt);
    legend.append(li);
    legendItems.set(crop.id, li);
  }
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
  const onPrev = () => select(sel - 1);
  const onNext = () => select(sel + 1);
  prev.addEventListener("click", onPrev);
  next.addEventListener("click", onNext);
  panel.body.append(
    detail,
    el("p", "qnf-label", T(S.legend)),
    legend,
    el("p", "qnf-note", T(S.scale)),
    ...(empty ? [] : [nav]),
  );

  const render = () => {
    detail.replaceChildren();
    for (const [id, li] of legendItems) li.setAttribute("aria-current", String(id === crops[sel]));
    if (empty) {
      panel.kicker.textContent = T(S.label);
      panel.title.textContent = T(S.fallowTitle);
      detail.append(el("p", "qnf-lede", T(S.fallowLede)));
      const gh = SOCIALS.find((s) => s.icon === "github");
      if (gh) {
        const actions = el("div", "qnf-actions");
        actions.append(linkButton(gh.url, T(S.profile), true, true));
        detail.append(actions);
      }
      return;
    }
    const repo = repos[sel]!;
    const crop = cropById(crops[sel]!);
    panel.kicker.textContent = `${T(S.kicker)} ${sel + 1}/${n}`;
    panel.title.textContent = repo.name;
    detail.append(el("p", "qnf-lede", repo.description?.trim() || T(S.noDesc)));
    const meta = el("p", "qnf-meta");
    const langEl = el("span");
    const dot = el("span", "qnf-dot");
    dot.style.setProperty("--qnf-dot", crop.swatch);
    langEl.append(dot, `${repo.language ?? T(S.nolang)} · ${T(crop.label)}`);
    const stars = el("span");
    stars.append(el("strong", undefined, `★ ${repo.stars}`), ` ${T(S.stars)}`);
    meta.append(langEl, stars);
    const pushed = formatDate(repo.pushedAt, lang);
    if (pushed) meta.append(el("span", undefined, `${T(S.pushed)}: ${pushed}`));
    detail.append(meta);
    const href = safeHref(repo.url);
    if (href) {
      const actions = el("div", "qnf-actions");
      actions.append(linkButton(href, T(S.github), true, true));
      detail.append(actions);
    }
    count.textContent = `${sel + 1} / ${n} · ${T(S.keys)}`;
  };
  const select = (i: number) => {
    sel = wrap(i, n);
    render();
    const s = signs[sel];
    if (s) marker.place(s.lx, 1.45, s.lz);
  };

  // ------------------------------------------------------------------ frame loop
  let near = -1;
  let inStation = false;
  let stamped = false;
  return {
    update(dt, avatar, t) {
      const lx = lxOf(f, avatar.x, avatar.z);
      const lz = lzOf(f, avatar.x, avatar.z);
      const d = Math.hypot(lx, lz);
      inStation = d < STAMP_RANGE + 1.5;
      if (d > 40) {
        near = -1;
        return;
      }
      if (!stamped && d < STAMP_RANGE) {
        stamped = true;
        emit("world:stamp", { id: "field:huerto", kind: "field", label: S.label });
      }
      near = -1;
      let best = SIGN_RANGE;
      for (let i = 0; i < signs.length; i++) {
        const s = signs[i]!;
        const sd = Math.hypot(s.lx - lx, s.lz - lz);
        if (sd < best) {
          best = sd;
          near = i;
        }
      }
      if (panel.isOpen() && d > STAMP_RANGE + 2) panel.close();
      if (!panel.isOpen()) {
        if (near >= 0) marker.place(signs[near]!.lx, 1.45, signs[near]!.lz);
        else marker.hide();
      }
      marker.update(dt, t);
    },
    prompt() {
      if (panel.isOpen()) return inStation ? T(S.close) : null;
      if (near < 0) return null;
      return T(empty ? S.viewEmpty : S.view);
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
      prev.removeEventListener("click", onPrev);
      next.removeEventListener("click", onNext);
      panel.dispose();
      marker.dispose();
      for (const m of instanced) m.dispose();
      for (const g of Object.values(geos)) g.dispose();
      atlas.dispose();
      disposeGeometries(group);
    },
  };
};
