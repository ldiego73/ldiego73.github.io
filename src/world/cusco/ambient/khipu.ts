/**
 * The khipu of the four suyus, on top of the usnu: a wooden frame holding a primary cord with one pendant cord
 * per road out of Qusqu (../plan.ts GATES) and one for Qusqu itself, each in its dye. Knots are passport
 * stamps that count on that road's pages, tied the Inca way (tens high, units low: ./khipu/logic.ts); roads
 * not open yet hang without knots. Knots are re-tied live as stamps arrive (`world:stamp`).
 *
 * "E · Leer el khipu" (standing on the usnu's upper tiers, near the frame) opens a panel: per road its
 * bearing, open or coming soon, the progress on each of its passport pages and what the world holds, plus
 * Qusqu's own page and the passport total.
 *
 * Finale: once every passport page that exists is complete (lib/passport.ts passportComplete), the first time
 * the traveler reaches the usnu the plaza celebrates, once ever (FINALE_KEY in localStorage): the summit
 * stinger, a fountain of confetti in khipu dyes over the usnu (none with prefers-reduced-motion), and the
 * "¡Lo lograste, {name}! Recorriste el Tawantinsuyu" panel with true stats (worlds completed, stamps
 * collected / total from mergedPassport) and the summit's buttons: postcard (`world:postcard`), book 60 min
 * (SITE.calendly), download the CV (SITE.resume), back to the site. Afterwards the khipu panel offers it.
 *
 * Wind: the pendant cords hang free and sway with the shared wind (../../style-gl.ts `windSway`, "grass"
 * mode with a `flex` weight that is 0 on the frame and the primary cord and grows down each cord), and the
 * traveler standing beside them parts them. The knots are baked into one merged mesh with the same weights,
 * so they ride their cords. The finale's confetti drifts downwind (`liveWind`).
 *
 * Draw calls: frame + cords (one vertex-coloured mesh), knots (one merged mesh, rebuilt when a stamp
 * arrives), confetti (one instanced mesh, only during the burst). Colliders: the frame's two posts.
 */
import * as THREE from "three";
import { getMusic } from "../../../audio";
import { SITE } from "../../../data/site";
import {
  loadPassport,
  mergedPassport,
  type PassportState,
  passportComplete,
  requiredStamps,
  WORLD_PAGES,
} from "../../../lib/passport";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { emit, on, type WorldId } from "../../events";
import { flattenToonGroup, mergeColored, vertexToon } from "../../merge-colors";
import { Kit } from "../../props";
import { paintStrength, windSway } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { loadTraveler } from "../../traveler";
import { liveWind } from "../../wind";
import { GATES, type Gate, KHIPU, USNU, USNU_TOP } from "../plan";
import "./khipu/khipu.css";
import {
  allComplete,
  type Bit,
  CONFETTI,
  FINALE_KEY,
  finaleTiles,
  finaleTitle,
  knotOffsets,
  type PassportView,
  pageProgress,
  parseFinale,
  prng,
  roadProgress,
  shouldCelebrate,
  spawnConfetti,
  stepBit,
} from "./khipu/logic";

const S = {
  kicker: { es: "Khipu de los suyus", en: "Khipu of the suyus" },
  title: { es: "Tu camino por el Tawantinsuyu", en: "Your journey through the Tawantinsuyu" },
  lede: {
    es: "Cada cuerda es un camino que sale de Qusqu; cada nudo, un sello que cuenta en su página del pasaporte (decenas arriba, unidades abajo).",
    en: "Each cord is a road out of Qusqu; each knot, a stamp that counts on its passport page (tens above, units below).",
  },
  open: { es: "Abierto", en: "Open" },
  soon: { es: "Próximamente", en: "Coming soon" },
  done: { es: "Completo", en: "Complete" },
  qusqu: { es: "Qusqu · esta plaza", en: "Qusqu · this plaza" },
  qusquHolds: {
    es: "El centro: el usnu con este khipu, el Qorikancha, la piedra de los doce ángulos y el puesto del chasqui.",
    en: "The centre: the usnu with this khipu, the Qorikancha, the twelve-angled stone and the chasqui post.",
  },
  total: { es: "Pasaporte", en: "Passport" },
  stamps: { es: "sellos", en: "stamps" },
  reward: { es: "Ver tu premio", en: "See your reward" },
  prompt: { es: "E · Leer el khipu", en: "E · Read the khipu" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  finaleKicker: { es: "Recorriste el Tawantinsuyu", en: "You walked the Tawantinsuyu" },
  finaleLede: {
    es: "Completaste todas las páginas del pasaporte: la montaña, la Wasi, la selva, la plaza de Qusqu, la costa, el lago y el cañón del Colca con la pampa de Nasca. Gracias por recorrer mi trabajo de esta forma.",
    en: "You completed every passport page: the mountain, the Wasi, the jungle, Qusqu's plaza, the coast, the lake and the Colca canyon with the Nazca pampa. Thank you for walking through my work this way.",
  },
  stats: { es: "Tu recorrido", en: "Your journey" },
  postcard: { es: "Crear mi postal", en: "Make my postcard" },
  book: { es: "Agendar 60 min", en: "Book 60 min" },
  cv: { es: "Descargar CV", en: "Download resume" },
  site: { es: "Volver al sitio", en: "Back to the site" },
} satisfies Record<string, L>;

/** Cord order on the primary cord, left → right seen from the stair (south): the four suyus, then the rest. */
const CORDS: Array<{ id: string; gate: Gate | null; dye: string }> = [
  ...(["chinchaysuyu", "antisuyu", "collasuyu", "kuntisuyu", "qhapaq"] as const).map((id) => {
    const gate = GATES.find((g) => g.id === id) as Gate;
    return { id, gate, dye: gate.dye };
  }),
  { id: "qusqu", gate: null, dye: "#e8b631" },
];
const CORD_LEN = 1.75;
/** World units a cord's tip bends at full wind (the `flex` weight at the tassel). */
const CORD_SWAY = 0.4;
/** Confetti drift: fraction of the wind speed a falling bit takes (units per second per unit of wind). */
const CONFETTI_DRIFT = 0.9;
const FRAME_H = 2.45;
const PROMPT_R = 3.6;
const ARRIVE_R = 8.5;
const PANEL_DELAY = 1.8;

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];

  // ------------------------------------------------------------------ passport view
  let state: PassportState = loadPassport();
  const req = new Map<WorldId, string[]>();
  const view: PassportView = {
    required: (w) => {
      let r = req.get(w);
      if (!r) {
        r = requiredStamps(w).map((s) => s.id);
        req.set(w, r);
      }
      return r;
    },
    has: (id) => Number.isFinite(state.stamps[id]),
  };
  const pages = WORLD_PAGES.map((p) => p.id);
  const cordCount = (c: (typeof CORDS)[number]) =>
    c.gate ? roadProgress(view, c.gate).knots : pageProgress(view, "cusco").got;

  // ------------------------------------------------------------------ model
  const group = new THREE.Group();
  group.name = "cusco-khipu";
  group.position.set(KHIPU.x, USNU_TOP, KHIPU.z);
  const kit = new Kit(env);
  const half = KHIPU.width / 2;
  for (const sx of [-1, 1]) {
    kit.cyl(0.11, 0.13, FRAME_H, sx * half, 0, 0, "#6e4a2c", 7);
    kit.box(0.5, 0.18, 0.5, sx * half, 0, 0, "#8c867b");
  }
  // Kit.cyl puts the base at y and turns about the centre: a horizontal bar is centred h / 2 above y.
  const bar = KHIPU.width + 0.5;
  kit.cyl(0.08, 0.08, bar, 0, FRAME_H - 0.05 - bar / 2, 0, "#5e3b22", 7, 0, Math.PI / 2);
  const top = FRAME_H - 0.22;
  const primary = KHIPU.width - 0.2;
  kit.cyl(0.035, 0.035, primary, 0, top - primary / 2, 0, "#efe6d6", 6, 0, Math.PI / 2);
  const cordX = (i: number) => -half + 0.45 + (i * (KHIPU.width - 0.9)) / (CORDS.length - 1);
  CORDS.forEach((c, i) => {
    const x = cordX(i);
    kit.cyl(0.045, 0.038, CORD_LEN, x, top - CORD_LEN, 0, c.dye, 6);
    // Tied to the primary cord with a small loop, a tassel at the end.
    kit.cyl(0.05, 0.05, 0.08, x, top - 0.05, 0, c.dye, 6);
    kit.cyl(0.06, 0.02, 0.16, x, top - CORD_LEN - 0.14, 0, c.dye, 5);
  });
  const framed = kit.build("cusco-khipu-frame");
  // Sway weight in the khipu's frame: 0 on the posts, the bar and the primary cord; down a pendant cord it
  // grows from its tie to the tassel (power > 1: the cord hangs straight under the knot and swings at the end).
  const hang = top - 0.06;
  const cordFlex = (x: number, y: number) =>
    Math.abs(x) > half - 0.25 || y >= hang ? 0 : Math.min(1, (hang - y) / CORD_LEN) ** 1.3 * CORD_SWAY;
  const writeFlex = (geo: THREE.BufferGeometry) => {
    const p = geo.getAttribute("position");
    const f = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) f[i] = cordFlex(p.getX(i), p.getY(i));
    geo.setAttribute("flex", new THREE.BufferAttribute(f, 1));
  };
  const frameMat = windSway(vertexToon(), { mode: "grass", flex: true });
  const flat = flattenToonGroup(framed, frameMat);
  if (flat) writeFlex(flat.geometry);
  group.add(framed);

  // Knots: one merged, vertex-coloured mesh (re-tied on every stamp: at most ~100 small icosahedra), on the
  // cords' own sway so they stay on them. Painted like the cords (they do not move through the world).
  const knotShape = new THREE.IcosahedronGeometry(0.085, 0);
  knotShape.scale(1, 0.8, 1);
  const knotMat = windSway(vertexToon(), { mode: "grass", flex: true });
  const knots = new THREE.Mesh(new THREE.BufferGeometry(), knotMat);
  knots.name = "cusco-khipu:knots";
  group.add(knots);
  let knotCount = 0;
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  const tieKnots = () => {
    const parts: Array<{ geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }> = [];
    CORDS.forEach((c, i) => {
      for (const off of knotOffsets(cordCount(c))) {
        dummy.position.set(cordX(i), top - off, 0);
        dummy.updateMatrix();
        parts.push({
          geometry: knotShape,
          color: col.set(c.dye).multiplyScalar(0.72).clone(),
          matrix: dummy.matrix.clone(),
        });
      }
    });
    knotCount = parts.length;
    const geo = (parts.length && mergeColored(parts)) || new THREE.BufferGeometry();
    if (parts.length) writeFlex(geo);
    knots.geometry.dispose();
    knots.geometry = geo;
    knots.visible = parts.length > 0;
  };
  tieKnots();

  // Confetti (instanced, only during the burst).
  const bitGeo = new THREE.BoxGeometry(0.12, 0.012, 0.08);
  const bitMat = paintStrength(env.toon("#ffffff").clone(), 0);
  bitMat.side = THREE.DoubleSide;
  const bits = new THREE.InstancedMesh(bitGeo, bitMat, CONFETTI.n);
  bits.name = "cusco-khipu:confetti";
  bits.frustumCulled = false;
  bits.visible = false;
  env.noOutline(bits);
  const dyes = ["#c4383f", "#dda63c", "#3446a6", "#2a9d8f", "#efe6d6", "#e8b631"];
  for (let i = 0; i < CONFETTI.n; i++) bits.setColorAt(i, col.set(dyes[i % dyes.length] as string));
  group.add(bits);
  env.scene.add(group);

  // The frame's posts are solid.
  for (const sx of [-1, 1]) env.addCollider({ kind: "circle", x: KHIPU.x + sx * half, z: KHIPU.z, r: 0.3 });

  // ------------------------------------------------------------------ panels
  let traveler = loadTraveler();
  let celebratedAt: number | null = null;
  try {
    celebratedAt = parseFinale(localStorage.getItem(FINALE_KEY));
  } catch {
    /* storage unavailable: celebrate at most once this visit */
  }
  const panel = createFieldPanel(hudRoot, { name: "khipu", closeLabel: T(S.closeAria) });
  panel.layer.classList.add("qnc");
  panel.kicker.textContent = T(S.kicker);
  panel.title.textContent = T(S.title);
  const lede = el("p", "qnf-lede", T(S.lede));
  const roads = el("ul", "qnc-roads");
  const total = el("p", "qnf-note");
  const rewardBtn = el("button", "qnf-btn qnf-btn-primary qnc-wide", T(S.reward));
  rewardBtn.type = "button";
  rewardBtn.addEventListener("click", () => {
    panel.close();
    openFinale();
  });
  panel.body.append(lede, roads, total, rewardBtn);

  const pagesLine = (ps: ReturnType<typeof pageProgress>[]) => {
    const ul = el("ul", "qnc-pages");
    for (const p of ps) {
      const li = el("li");
      const label = WORLD_PAGES.find((w) => w.id === p.world)?.label ?? { es: p.world, en: p.world };
      li.append(el("span", undefined, `${T(label)}: `), el("strong", undefined, `${p.got}/${p.total}`));
      if (p.done) li.append(el("span", undefined, " ✓"));
      ul.append(li);
    }
    return ul;
  };
  const renderRoads = () => {
    const items: HTMLElement[] = [];
    for (const c of CORDS) {
      const li = el("li", "qnc-road");
      li.style.setProperty("--qnc-dye", c.dye);
      const head = el("div", "qnc-road-head");
      if (c.gate) {
        const g = c.gate;
        const rp = roadProgress(view, g);
        if (!g.available) li.classList.add("is-closed");
        head.append(
          el("h3", "qnc-road-name", `${T(g.name)}`),
          el(
            "span",
            `qnc-road-state${rp.done ? " is-done" : ""}`,
            g.available ? T(rp.done ? S.done : S.open) : T(S.soon),
          ),
        );
        const bearing = T(g.bearing);
        li.append(head, el("p", undefined, `${bearing.charAt(0).toUpperCase()}${bearing.slice(1)}. ${T(g.holds)}`));
        if (rp.pages.length) li.append(pagesLine(rp.pages));
      } else {
        const p = pageProgress(view, "cusco");
        head.append(
          el("h3", "qnc-road-name", T(S.qusqu)),
          el("span", `qnc-road-state${p.done ? " is-done" : ""}`, T(p.done ? S.done : S.open)),
        );
        li.append(head, el("p", undefined, T(S.qusquHolds)), pagesLine([p]));
      }
      items.push(li);
    }
    roads.replaceChildren(...items);
    const m = mergedPassport(state);
    total.textContent = `${T(S.total)}: ${m.worldCollected}/${m.worldTotal} ${T(S.stamps)}`;
    rewardBtn.hidden = celebratedAt === null;
  };

  const finale = createFieldPanel(hudRoot, { name: "tawantinsuyu", closeLabel: T(S.closeAria) });
  finale.layer.classList.add("qnc", "qnc-finale");
  finale.kicker.textContent = T(S.finaleKicker);
  const fLede = el("p", "qnf-lede", T(S.finaleLede));
  const fLabel = el("p", "qnf-label", T(S.stats));
  const fStats = el("dl", "qnc-stats");
  const postcard = el("button", "qnf-btn qnf-btn-primary qnc-wide", T(S.postcard));
  postcard.type = "button";
  postcard.addEventListener("click", () => {
    finale.close();
    emit("world:postcard", undefined);
  });
  const actions = el("div", "qnf-actions");
  const cv = linkButton(SITE.resume[lang], T(S.cv), false);
  cv.setAttribute("download", "");
  actions.append(linkButton(SITE.calendly, T(S.book), true), cv, linkButton(`/${lang}/`, T(S.site), false));
  finale.body.append(fLede, fLabel, fStats, postcard, actions);
  const renderFinale = () => {
    finale.title.textContent = finaleTitle(lang, traveler);
    const m = mergedPassport(state);
    const done = pages.filter((w: WorldId) => passportComplete(state, w)).length;
    const tiles = finaleTiles({
      worldsDone: done,
      worlds: pages.length,
      stamps: m.worldCollected,
      stampsTotal: m.worldTotal,
    });
    fStats.replaceChildren(
      ...tiles.map((t) => {
        const d = el("div", "qnc-stat");
        d.append(el("dt", undefined, T(t.label)), el("dd", undefined, t.value));
        return d;
      }),
    );
  };
  const openPanel = () => {
    state = loadPassport();
    renderRoads();
    panel.open();
  };
  const openFinale = () => {
    state = loadPassport();
    renderFinale();
    finale.open();
  };

  const offs = [
    on("world:stamp", () => {
      // The passport ambient (created first) has stored the stamp by now.
      state = loadPassport();
      tieKnots();
      if (panel.isOpen()) renderRoads();
    }),
    on("world:traveler", (d) => {
      traveler = d?.name ?? "";
      if (finale.isOpen()) finale.title.textContent = finaleTitle(lang, traveler);
    }),
  ];

  // ------------------------------------------------------------------ celebration
  const rand = prng(0x7a3a);
  let bitState: Bit[] = [];
  let age = -1;
  let openIn = -1;
  const floor = (x: number, z: number) => {
    // Bits are in the khipu group's frame (origin on the usnu top): land on the tiers or the plaza.
    const wx = KHIPU.x + x;
    const wz = KHIPU.z + z;
    return env.suyu.groundAt(wx, wz) - USNU_TOP;
  };
  const celebrate = () => {
    celebratedAt = Date.now();
    try {
      localStorage.setItem(FINALE_KEY, String(celebratedAt));
    } catch {
      /* storage unavailable: this visit only */
    }
    try {
      getMusic().stinger("summit");
    } catch {
      /* audio unavailable */
    }
    if (!env.reducedMotion) {
      bitState = spawnConfetti(CONFETTI.n, FRAME_H + 0.3, rand);
      age = 0;
      bits.visible = true;
    }
    openIn = env.reducedMotion ? 0.3 : PANEL_DELAY;
  };
  const drawBits = () => {
    for (let i = 0; i < bitState.length; i++) {
      const b = bitState[i] as Bit;
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(b.landed ? 0 : age * b.spin, i, b.landed ? 0 : age * b.spin * 0.7);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      bits.setMatrixAt(i, dummy.matrix);
    }
    bits.instanceMatrix.needsUpdate = true;
  };
  const stepBurst = (dt: number) => {
    if (age < 0) return;
    age += dt;
    if (age > CONFETTI.life) {
      age = -1;
      bits.visible = false;
      return;
    }
    const h = Math.min(dt, 0.05);
    for (const b of bitState) {
      stepBit(b, h, floor);
      if (b.landed) continue;
      // Paper rides the breeze while it falls (the same gust the cords show).
      const w = liveWind.sample(KHIPU.x + b.x, KHIPU.z + b.z, USNU_TOP + b.y);
      b.x += w.x * h * CONFETTI_DRIFT;
      b.z += w.z * h * CONFETTI_DRIFT;
    }
  };
  if (import.meta.env?.DEV)
    (window as Window & { __khipu?: unknown }).__khipu = {
      advance(sec: number) {
        for (let k = 0; k < Math.round(sec * 60); k++) {
          stepBurst(1 / 60);
          if (openIn >= 0) openIn = Math.max(0, openIn - 1 / 60);
        }
        if (age >= 0) drawBits();
      },
      openPanel,
      openFinale,
      state: () => ({ age, celebratedAt, knots: knotCount, open: panel.isOpen(), finale: finale.isOpen() }),
    };

  let near = false;
  return {
    update(dt, avatar) {
      const d = Math.hypot(avatar.x - KHIPU.x, avatar.z - KHIPU.z);
      const onTop = avatar.y > (USNU.tiers[1]?.top ?? 1.4) - 0.2;
      near = onTop && d < PROMPT_R;
      if (panel.isOpen() && d > PROMPT_R + 6) panel.close();
      const nearUsnu = Math.hypot(avatar.x - USNU.x, avatar.z - USNU.z) < ARRIVE_R;
      if (shouldCelebrate({ complete: celebratedAt === null && allComplete(view, pages), celebratedAt, nearUsnu }))
        celebrate();
      if (openIn >= 0) {
        openIn -= dt;
        if (openIn < 0 && !finale.isOpen()) {
          panel.close();
          openFinale();
        }
      }
      stepBurst(dt);
      if (age >= 0) drawBits();
    },
    prompt() {
      if (panel.isOpen()) return near ? T(S.close) : null;
      return near ? T(S.prompt) : null;
    },
    interact() {
      if (panel.isOpen()) {
        panel.close();
        return true;
      }
      if (finale.isOpen()) {
        finale.close();
        return true;
      }
      if (!near) return false;
      openPanel();
      return true;
    },
    escape() {
      if (finale.isOpen()) {
        finale.close();
        return true;
      }
      if (!panel.isOpen()) return false;
      panel.close();
      return true;
    },
    dispose() {
      if (import.meta.env?.DEV) delete (window as Window & { __khipu?: unknown }).__khipu;
      for (const off of offs) off();
      panel.dispose();
      finale.dispose();
      group.removeFromParent();
      framed.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      frameMat.dispose();
      knotShape.dispose();
      knots.geometry.dispose();
      knotMat.dispose();
      bitGeo.dispose();
      bitMat.dispose();
      bits.dispose();
    },
  };
};
