/**
 * Khipu de escritos (station "build-2"): a large wooden khipu frame, a primary cord tied between two
 * posts and one pendant cord per post (up to 12, oldest on the left). Cord color says the source
 * (this site vs Medium); knots encode the date in a playful khipu-style decimal code (year tens, a long
 * knot for the year units, then the month). Cords sway gently (still on reduced motion).
 * "E · Leer el khipu" opens a dialog listing the posts, with the selected cord highlighted.
 * Stamp `field:khipu-board` on the first visit.
 */
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CreateAmbient, L } from "../contract";
import { type WorldPost, worldData } from "../data";
import { emit } from "../events";
import { C, DYE, drawBoard, FONT, Kit } from "../props";
import { circle, createMarker, disposeGeometries, lxOf, lzOf, pathToTrail, stationFrame } from "./fields/geo";
import { formatDate, isExternal, knotsFor, safeHref, wrap } from "./fields/logic";
import { createFieldPanel, el, linkButton } from "./fields/panel";
import { fit, signAtlas } from "./fields/signs";

const STATION = "build-2";
const MAX_CORDS = 12;
/** Frame line (local z), primary cord height and pendant length. */
const FZ = -1.5;
const CORD_Y = 2.5;
const CORD_LEN = 1.95;
const STAMP_RANGE = 5.4;

const SOURCE: Record<WorldPost["source"], { color: string; label: L }> = {
  site: { color: DYE.red, label: { es: "Blog del sitio", en: "Site blog" } },
  medium: { color: DYE.indigo, label: { es: "Medium", en: "Medium" } },
};
const BLANK = DYE.cotton;

const S = {
  label: { es: "Khipu de escritos", en: "Writing khipu" },
  read: { es: "E · Leer el khipu", en: "E · Read the khipu" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  kicker: { es: "Khipu de escritos · cuerda", en: "Writing khipu · cord" },
  sub: { es: "Cuerdas de blog y Medium", en: "Blog and Medium cords" },
  readSite: { es: "Leer", en: "Read" },
  readMedium: { es: "Leer en Medium", en: "Read on Medium" },
  cords: { es: "Todas las cuerdas", en: "All cords" },
  how: { es: "Cómo leer los nudos", en: "How to read the knots" },
  howText: {
    es: "Un código de juego inspirado en el sistema decimal de los khipus, no una lectura arqueológica. Junto a la cuerda principal, las decenas del año en nudos simples; más abajo, las unidades del año en un nudo largo (una vuelta por unidad; sin nudo es cero); al final, el mes en nudos pequeños. El color de la cuerda es la fuente.",
    en: "A playful code inspired by the khipu decimal system, not an archaeological reading. Next to the primary cord, the year's tens as single knots; lower, the year's units as one long knot (one turn per unit; no knot means zero); at the end, the month as small knots. The cord's color is the source.",
  },
  reads: { es: "Se lee", en: "Reads" },
  tens: { es: "decenas", en: "tens" },
  turns: { es: "vueltas", en: "turns" },
  month: { es: "mes", en: "month" },
  prev: { es: "Cuerda anterior", en: "Previous cord" },
  next: { es: "Cuerda siguiente", en: "Next cord" },
  keys: { es: "← → para recorrer", en: "← → to browse" },
  emptyTitle: { es: "Khipu sin anudar", en: "Unknotted khipu" },
  emptyLede: {
    es: "Esta vez no llegaron los escritos, así que las cuerdas esperan sus nudos. Puedes leerlos en el blog.",
    en: "The writings didn't arrive this time, so the cords are waiting for their knots. You can read them on the blog.",
  },
  blog: { es: "Ir al blog", en: "Go to the blog" },
} satisfies Record<string, L>;

interface Cord {
  pivot: THREE.Group;
  cord: THREE.Mesh;
  knots: THREE.Mesh | null;
  base: THREE.MeshToonMaterial;
  baseKnot: THREE.MeshToonMaterial;
  glow: THREE.MeshToonMaterial;
  glowKnot: THREE.MeshToonMaterial;
  phase: number;
  x: number;
}

const shade = (hex: string, k: number) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const posts: WorldPost[] = worldData()
    .posts.slice()
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .slice(0, MAX_CORDS)
    .reverse();
  const empty = posts.length === 0;
  const n = empty ? 4 : posts.length;
  const f = stationFrame(env, STATION);
  const group = new THREE.Group();
  group.name = "khipu-board";
  group.position.set(f.x, f.y, f.z);
  group.rotation.y = f.yaw;
  env.scene.add(group);

  // ------------------------------------------------------------------ frame
  const spacing = 0.42;
  const W = Math.max(3.2, n * spacing + 1.0);
  const half = W / 2;
  const kit = new Kit(env);
  for (const sx of [-half, half]) {
    kit.box(0.2, 3.1, 0.2, sx, -0.1, FZ, C.woodDark);
    kit.box(0.34, 0.18, 0.34, sx, -0.05, FZ, C.stoneDark);
    // Cord lashing on the post.
    kit.cyl(0.13, 0.13, 0.12, sx, CORD_Y - 0.06, FZ, C.cotton, 8);
  }
  kit.box(W + 0.5, 0.18, 0.24, 0, 2.92, FZ, C.wood);
  kit.box(2.0, 0.06, 0.08, 0, 3.1, FZ, C.woodDark);
  // Primary cord (natural cotton) between the posts (kit.cyl centers at y + h/2 before rotating).
  kit.cyl(0.05, 0.05, W, 0, CORD_Y - W / 2, FZ, C.cotton, 8, 0, Math.PI / 2);
  // A low stone bench in front so the frame reads as a place to stop and read.
  kit.box(1.6, 0.36, 0.5, 0, -0.05, 1.6, C.stone);
  group.add(kit.build("khipu-board"));

  // Header sign on the beam.
  const atlas = signAtlas(env, 1, 512, 128, (ctx, _i, cw, ch) => {
    drawBoard(ctx, cw, ch, "#d9b25a");
    ctx.fillStyle = C.ink;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const title = T(S.label).toUpperCase();
    fit(ctx, title, (px) => `condensed 800 ${px}px ${FONT.display}`, 64, cw - 40);
    ctx.fillText(title, cw / 2, ch * 0.4);
    fit(ctx, T(S.sub), (px) => `600 ${px}px ${FONT.mono}`, 24, cw - 60);
    ctx.fillText(T(S.sub), cw / 2, ch * 0.78);
  });
  const header = atlas.plane(0, 1.9, 0.475);
  header.position.set(0, 3.38, FZ + 0.02);
  group.add(header);
  const headerBack = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 0.05), env.toon(C.woodDark));
  headerBack.position.set(0, 3.38, FZ - 0.02);
  group.add(headerBack);

  // ------------------------------------------------------------------ pendant cords
  const sphere = new THREE.IcosahedronGeometry(1, 1);
  const knotGeo = (post: WorldPost | undefined) => {
    const code = post ? knotsFor(post.date) : null;
    if (!code) return null;
    const parts: THREE.BufferGeometry[] = [];
    const add = (y: number, r: number, sy = 1) => {
      const g = sphere.clone();
      g.scale(r, r * sy, r);
      g.translate(0, y, 0);
      parts.push(g);
    };
    for (let j = 0; j < code.tens; j++) add(-0.22 - j * 0.085, 0.045);
    for (let j = 0; j < code.units; j++) add(-0.86 - j * 0.04, 0.04, 0.75);
    for (let j = 0; j < code.month; j++) add(-1.32 - j * 0.047, 0.032);
    if (!parts.length) return null;
    const merged = mergeGeometries(parts, false);
    for (const g of parts) g.dispose();
    return merged;
  };
  const cordGeo = new THREE.CylinderGeometry(0.022, 0.018, CORD_LEN, 6).translate(0, -CORD_LEN / 2, 0);
  const tasselGeo = new THREE.ConeGeometry(0.045, 0.14, 6).translate(0, -CORD_LEN - 0.04, 0);
  const loopGeo = new THREE.TorusGeometry(0.06, 0.018, 5, 10).rotateY(Math.PI / 2);
  const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
  const cordBody = mergeGeometries([flat(cordGeo), flat(tasselGeo), flat(loopGeo)], false);
  cordGeo.dispose();
  tasselGeo.dispose();
  loopGeo.dispose();
  const cords: Cord[] = [];
  const x0 = -((n - 1) * spacing) / 2;
  for (let i = 0; i < n; i++) {
    const post = posts[i];
    const color = post ? (SOURCE[post.source]?.color ?? BLANK) : BLANK;
    const knotColor = shade(color, 0.72);
    const pivot = new THREE.Group();
    pivot.position.set(x0 + i * spacing, CORD_Y, FZ);
    const base = env.toon(color);
    const baseKnot = env.toon(knotColor);
    const cord = new THREE.Mesh(cordBody, base);
    pivot.add(cord);
    const kg = knotGeo(post);
    const knots = kg ? new THREE.Mesh(kg, baseKnot) : null;
    if (knots) pivot.add(knots);
    group.add(pivot);
    cords.push({
      pivot,
      cord,
      knots,
      base,
      baseKnot,
      glow: env.toon(color, { emissive: color, emissiveIntensity: 0.45 }),
      glowKnot: env.toon(knotColor, { emissive: color, emissiveIntensity: 0.35 }),
      phase: i * 0.7,
      x: x0 + i * spacing,
    });
  }

  // ------------------------------------------------------------------ colliders + walkables
  {
    const steps = Math.max(2, Math.ceil(W / 0.5));
    for (let k = 0; k <= steps; k++) env.addCollider(circle(f, -half + (W * k) / steps, FZ, 0.32));
    env.addCollider(circle(f, -0.45, 1.6, 0.35));
    env.addCollider(circle(f, 0.45, 1.6, 0.35));
  }
  env.addWalkable(circle(f, 0, 0, 4.7));
  for (const w of pathToTrail(env, f, 0, 3.6)) env.addWalkable(w);

  const marker = createMarker(env);
  group.add(marker.mesh);

  // ------------------------------------------------------------------ panel
  let sel = 0;
  let lit = -1;
  const highlight = (i: number) => {
    if (lit === i) return;
    const prevCord = cords[lit];
    if (prevCord) {
      prevCord.cord.material = prevCord.base;
      if (prevCord.knots) prevCord.knots.material = prevCord.baseKnot;
    }
    lit = i;
    const c = cords[i];
    if (c) {
      c.cord.material = c.glow;
      if (c.knots) c.knots.material = c.glowKnot;
      marker.place(c.x, CORD_Y + 0.3, FZ + 0.12);
    } else marker.hide();
  };
  const panel = createFieldPanel(hudRoot, {
    name: "khipu",
    closeLabel: T(S.closeAria),
    onNav: (d) => select(sel + d),
    onClose: () => highlight(-1),
  });
  const detail = el("div");
  const picks: HTMLButtonElement[] = [];
  const pickList = el("ul", "qnf-picks");
  const onPick = (e: Event) => {
    const i = Number((e.currentTarget as HTMLElement).dataset.i);
    if (Number.isFinite(i)) select(i);
  };
  posts.forEach((post, i) => {
    const li = el("li");
    const b = el("button", "qnf-pick");
    b.type = "button";
    b.dataset.i = String(i);
    b.style.setProperty("--qnf-dot", SOURCE[post.source]?.color ?? BLANK);
    const cordSw = el("span", "qnf-cord");
    cordSw.setAttribute("aria-hidden", "true");
    const time = el("time", undefined, formatDate(post.date, lang, false));
    time.dateTime = post.date.slice(0, 10);
    b.append(cordSw, el("span", "qnf-pick-title", post.title), time);
    b.addEventListener("click", onPick);
    li.append(b);
    pickList.append(li);
    picks.push(b);
  });
  const legend = el("ul", "qnf-legend");
  for (const src of Object.values(SOURCE)) {
    const li = el("li");
    const sw = el("span", "qnf-swatch");
    sw.style.setProperty("--qnf-dot", src.color);
    li.append(sw, el("span", undefined, T(src.label)));
    legend.append(li);
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
  if (empty) {
    panel.kicker.textContent = T(S.label);
    panel.title.textContent = T(S.emptyTitle);
    const actions = el("div", "qnf-actions");
    actions.append(linkButton(`/${lang}/blog/`, T(S.blog), false, true));
    panel.body.append(
      el("p", "qnf-lede", T(S.emptyLede)),
      actions,
      el("p", "qnf-label", T(S.how)),
      el("p", "qnf-note", T(S.howText)),
    );
  } else {
    panel.body.append(
      detail,
      nav,
      el("p", "qnf-label", T(S.cords)),
      pickList,
      el("p", "qnf-label", T(S.how)),
      legend,
      el("p", "qnf-note", T(S.howText)),
    );
  }

  const render = () => {
    const post = posts[sel];
    if (!post) return;
    detail.replaceChildren();
    picks.forEach((b, i) => {
      b.setAttribute("aria-pressed", String(i === sel));
    });
    const src = SOURCE[post.source] ?? SOURCE.site;
    panel.kicker.textContent = `${T(S.kicker)} ${sel + 1}/${n}`;
    panel.title.textContent = post.title;
    const meta = el("p", "qnf-meta");
    const s = el("span");
    const dot = el("span", "qnf-dot");
    dot.style.setProperty("--qnf-dot", src.color);
    s.append(dot, T(src.label));
    meta.append(s);
    const date = formatDate(post.date, lang);
    if (date) {
      const time = el("time", undefined, date);
      time.dateTime = post.date.slice(0, 10);
      meta.append(time);
    }
    detail.append(meta);
    if (post.description?.trim()) detail.append(el("p", "qnf-lede", post.description.trim()));
    if (post.tags?.length) {
      const tags = el("ul", "qnf-tags");
      for (const t of post.tags.slice(0, 8)) tags.append(el("li", undefined, t));
      detail.append(tags);
    }
    const code = knotsFor(post.date);
    if (code) {
      const monthName = new Intl.DateTimeFormat(lang === "es" ? "es-PE" : "en-US", {
        month: "long",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2000, code.month - 1, 1)));
      detail.append(
        el(
          "p",
          "qnf-code",
          `${code.tens} ${T(S.tens)} · ${code.units} ${T(S.turns)} · ${code.month} (${T(S.month)}) → ${T(S.reads)}: ${monthName} ’${String(code.year % 100).padStart(2, "0")}`,
        ),
      );
    }
    const href = safeHref(post.href);
    if (href) {
      const ext = isExternal(href);
      const actions = el("div", "qnf-actions");
      actions.append(linkButton(href, T(post.source === "medium" ? S.readMedium : S.readSite), ext, true));
      detail.append(actions);
    }
    count.textContent = `${sel + 1} / ${n} · ${T(S.keys)}`;
  };
  const select = (i: number) => {
    if (empty) return;
    sel = wrap(i, n);
    render();
    highlight(sel);
  };

  // ------------------------------------------------------------------ frame loop
  let inRange = false;
  let inStation = false;
  let stamped = false;
  let nearest = 0;
  return {
    update(dt, avatar, t) {
      const lx = lxOf(f, avatar.x, avatar.z);
      const lz = lzOf(f, avatar.x, avatar.z);
      const d = Math.hypot(lx, lz);
      inStation = d < STAMP_RANGE + 1.5;
      if (d > 45) {
        inRange = false;
        return;
      }
      if (!stamped && d < STAMP_RANGE) {
        stamped = true;
        emit("world:stamp", { id: "field:khipu-board", kind: "field", label: S.label });
      }
      inRange = lz > FZ && lz < FZ + 4.2 && Math.abs(lx) < half + 0.8;
      if (inRange) {
        const k = Math.round((lx - x0) / spacing);
        nearest = Math.min(n - 1, Math.max(0, k));
      }
      if (panel.isOpen() && d > STAMP_RANGE + 2) panel.close();
      if (!env.reducedMotion) {
        for (const c of cords) {
          c.pivot.rotation.x = Math.sin(t * 0.9 + c.phase) * 0.045;
          c.pivot.rotation.z = Math.sin(t * 0.63 + c.phase * 1.7) * 0.03;
        }
      }
      marker.update(dt, t);
    },
    prompt() {
      if (panel.isOpen()) return inStation ? T(S.close) : null;
      return inRange ? T(S.read) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (!inRange) return false;
      if (empty) {
        panel.open();
        return true;
      }
      select(nearest);
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
      for (const b of picks) b.removeEventListener("click", onPick);
      panel.dispose();
      marker.dispose();
      sphere.dispose();
      atlas.dispose();
      disposeGeometries(group);
    },
  };
};
