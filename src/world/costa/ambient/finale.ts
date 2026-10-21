/**
 * Inti and the Mamacocha (the coast's finale): at the very end of the road, on the cliff-top promontory, a small
 * adobe platform of two walkable tiers faces the open Pacific to the west, and on its sea edge a frame of two
 * posts and a lintel holds a golden ring, so that from the platform the sun sets into the sea through it. Dyed
 * banners on poles stand round the platform; two braziers burn at night.
 *
 * Arrival: the first time in a page session the traveler steps onto the platform, the coast celebrates: the sky
 * turns to the sunset (a few seconds' sweep; instant with reduced motion), the ring glows, a flock of seabirds
 * glides past along the cliff, a burst of shells and yellow amancae petals (the lomas flower) springs from the
 * ring and drifts down on the sea wind (./finale/logic.ts), the summit stinger plays, the passport gets
 * `costa:summit` and, a moment later, the reward panel opens. With prefers-reduced-motion: no burst and no
 * flock (the sunset, the glow and the panel remain). Afterwards "E · Ver tu premio" on the platform reopens it.
 *
 * The panel ("¡Lo lograste, {name}!", the name from ../../traveler.ts, renamed live on `world:traveler`) says
 * "Fin del Chinchaysuyu" and shows four true career numbers, computed exactly as the mountain summit's panel:
 * years on the road, companies, artifacts and knots (./finale/logic.ts careerStats), then: make my postcard
 * (`world:postcard`), book 60 min (SITE.calendly), download the resume (SITE.resume), back to Qusqu
 * (../../travel.ts) and back to the site.
 *
 * Draw calls: the platform, frame, poles and banners (one vertex-coloured mesh), the ring (one, glowing), the
 * burst (one instanced, only during it), the flock (one instanced, only during it), braziers' glows at night.
 */
import * as THREE from "three";
import { getMusic } from "../../../audio";
import { SITE } from "../../../data/site";
import { CATALOG } from "../../../lib/passport";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import { arcDir } from "../../ambient/sky/moon";
import type { Ambient, CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { decks } from "../../decks";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import { glowSprite } from "../../props";
import { noPaint, windSway } from "../../style-gl";
import type { SuyuEnv } from "../../suyu/contract";
import { travelTo } from "../../travel";
import { loadTraveler } from "../../traveler";
import { liveWind } from "../../wind";
import { Geo } from "../kit";
import type { CostaLayout } from "../layout";
import { FINALE_T } from "../plan";
import "./finale/finale.css";
import {
  arrived,
  type Bit,
  BURST,
  burstScale,
  careerStats,
  finaleFrame,
  finaleTitle,
  glowAt,
  PLATFORM,
  prng,
  SUNSET,
  spawnBurst,
  stepBit,
  towardSunset,
} from "./finale/logic";
import { type Frame, toLocal, toWorld } from "./huacas/logic";

export const STAMP_ID = "costa:summit";

const S = {
  kicker: { es: "Fin del Chinchaysuyu", en: "End of the Chinchaysuyu" },
  lede: {
    es: "Recorriste todo el Chinchaysuyu: del punku de Qusqu a este promontorio, una huaca por cada empresa de mi carrera, hasta ver al Inti hundirse en la Mamacocha, la madre mar.",
    en: "You walked the whole Chinchaysuyu: from Qusqu's punku to this headland, one huaca for each company of my career, until Inti sank into the Mamacocha, the mother sea.",
  },
  stats: { es: "Lo que viste en el camino", en: "What you saw on the road" },
  years: { es: "años de camino", en: "years on the road" },
  companies: { es: "huacas (empresas)", en: "huacas (companies)" },
  artifacts: { es: "artefactos en el mercado", en: "artifacts at the market" },
  knots: { es: "nudos en producción", en: "knots in production" },
  postcard: { es: "Crear mi postal", en: "Make my postcard" },
  book: { es: "Agendar 60 min", en: "Book 60 min" },
  cv: { es: "Descargar CV", en: "Download resume" },
  cusco: { es: "Volver a Qusqu", en: "Back to Qusqu" },
  site: { es: "Volver al sitio", en: "Back to the site" },
  view: { es: "E · Ver tu premio", en: "E · See your reward" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
} satisfies Record<string, L>;

/** Platform tiers (local, centred at PLAT): half size and top. Each tier is one walkable step. */
const PLAT = { z: PLATFORM.z } as const;
const TIERS = [
  { half: PLATFORM.half, top: 0.6 },
  { half: 3.4, top: 1.2 },
] as const;
const ARRIVE_R = 3.4;
const PROMPT_R = PLATFORM.prompt;
const PANEL_DELAY = 1.7;
const SKY_SECS = 4.5;
/** The golden ring: on the platform's sea edge. */
const RING = { z: PLAT.z + 2.4, y: 1.2 + 2.0, r: 1.15 } as const;

export const create: CreateAmbient = (baseEnv, hudRoot): Ambient => {
  const env = baseEnv as SuyuEnv;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const Lay = env.suyu.layout as CostaLayout;

  // Frame: origin at the road's end, +Z toward where the sun sets into the sea (the shared sky's sunset azimuth),
  // so from the platform the sun goes down through the ring.
  const end = Lay.trail.pointAt(FINALE_T);
  const sunAt = arcDir(SUNSET, 0, { x: 0, y: 0, z: 0 });
  const f: Frame = finaleFrame({ x: end.x, z: end.z, y: Lay.groundAt(end.x, end.z) }, sunAt);
  const group = new THREE.Group();
  group.name = "costa-finale";
  group.position.set(f.x, f.y, f.z);
  group.rotation.y = f.yaw;

  // ------------------------------------------------------------------ build
  const g = new Geo();
  const adobe = ["#c99a6a", "#bd8e60"];
  g.box(TIERS[0].half * 2 + 0.6, 1.4, TIERS[0].half * 2 + 0.6, 0, -1.4, PLAT.z, "#a87d58");
  TIERS.forEach((t, i) => {
    const below = i > 0 ? (TIERS[i - 1]?.top ?? 0) : 0;
    g.box(t.half * 2, t.top - below, t.half * 2, 0, below, PLAT.z, adobe[i] as string);
    // A red-painted band along each tier's face.
    g.box(t.half * 2 + 0.04, 0.12, t.half * 2 + 0.04, 0, t.top - 0.2, PLAT.z, "#b5533c");
  });
  // The ring's frame: two posts and a lintel of carob wood on stone footings.
  for (const x of [-1.75, 1.75]) {
    g.box(0.6, 0.3, 0.6, x, 1.2, RING.z, "#9c9487");
    g.cyl(0.13, 0.16, 3.6, x, 1.4, RING.z, "#6b4a33", 7);
  }
  g.box(4.3, 0.3, 0.32, 0, 1.2 + 3.55, RING.z, "#5a3b24");
  for (const x of [-0.5, 0.5]) g.cyl(0.02, 0.02, 0.45, x, RING.y + RING.r - 0.05, RING.z, "#3a2a20", 4);
  // Banner poles round the lower tier, with dyed cloths.
  const dyes = ["#c4383f", "#dda63c", "#2a9d8f", "#3446a6", "#efe6d6", "#c4383f"];
  // Angles from the road side round both flanks to the sea-side corners (the sea side itself stays open).
  [-2.4, -1.6, -0.8, 0.8, 1.6, 2.4].forEach((a, i) => {
    const r = TIERS[0].half + 1.4;
    const x = Math.sin(a) * r;
    const z = PLAT.z - Math.cos(a) * r;
    g.cyl(0.06, 0.08, 3.4, x, -0.3, z, "#5a3b24", 6);
    // Cloth: pinned at the pole, flying free toward +z (they wave in the sea wind, see the material below).
    g.cloth = { axis: "z", pinned: z, free: z + 0.84 };
    g.box(0.05, 1.3, 0.8, x, 1.75, z + 0.42, dyes[i] as string);
    g.box(0.06, 0.12, 0.82, x, 1.7, z + 0.42, "#efe6d6");
    g.cloth = null;
  });
  // Braziers at the foot of the stair (road side).
  const fires: Array<[number, number, number]> = [];
  for (const x of [-2.6, 2.6]) {
    g.cyl(0.22, 0.28, 0.9, x, 0, PLAT.z - TIERS[0].half - 1.1, "#8f7a64", 7);
    g.cyl(0.42, 0.26, 0.32, x, 0.9, PLAT.z - TIERS[0].half - 1.1, "#8f4a2e", 8);
    fires.push([x, 1.45, PLAT.z - TIERS[0].half - 1.1]);
  }
  const geo = g.build();
  const mat = vertexToon();
  // The same mesh with the banners' flex: only the cloth moves (flex 0 elsewhere), no extra draw call.
  const clothMat = windSway(vertexToon(), { mode: "cloth", flex: true, amp: 1.3 });
  const mesh = new THREE.Mesh(geo, clothMat);
  mesh.name = "costa-finale:vc";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const ringGeo = new THREE.TorusGeometry(RING.r, 0.11, 8, 40);
  const ringMat = new THREE.MeshToonMaterial({
    color: "#e8b631",
    emissive: "#ffb347",
    emissiveIntensity: 0.15,
    gradientMap: env.toon("#fff").gradientMap,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.name = "costa-finale:ring";
  ring.position.set(0, RING.y, RING.z);
  group.add(ring);
  const halo = glowSprite(env, "#ffd36b", 6);
  halo.position.copy(ring.position);
  halo.visible = false;
  group.add(halo);
  const glows = fires.map(([x, y, z]) => {
    const s = glowSprite(env, "#ffb35c", 2.2);
    s.position.set(x, y, z);
    s.visible = false;
    group.add(s);
    return s;
  });

  // Burst: shells (cream, pink, white) and amancae petals (yellow), instanced, no outline.
  const bitGeo = new THREE.IcosahedronGeometry(0.11, 0);
  bitGeo.scale(1, 0.45, 1.3);
  const bitMat = env.toon("#ffffff").clone() as THREE.MeshToonMaterial;
  const nBits = BURST.shells + BURST.petals;
  const bits = new THREE.InstancedMesh(bitGeo, bitMat, nBits);
  bits.name = "costa-finale:burst";
  bits.frustumCulled = false;
  bits.visible = false;
  env.noOutline(bits);
  const col = new THREE.Color();
  const shellCols = ["#f4ece0", "#efc9c0", "#e9dcc4", "#f7f2e8"];
  const petalCols = ["#f2c84b", "#f0b429", "#f6d36b"];
  for (let i = 0; i < nBits; i++)
    bits.setColorAt(i, col.set(i < BURST.shells ? (shellCols[i % 4] as string) : (petalCols[i % 3] as string)));
  if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
  group.add(bits);

  // Flock: seabirds gliding past in a long V (pelicans: white below, grey-brown wings, a long bill).
  const bird = new Geo();
  bird.blob(0.22, 0.2, 0.62, 0, 0, 0, "#d9d2c6", 1);
  bird.blob(0.13, 0.13, 0.16, 0, 0.12, 0.6, "#efe9dc", 1);
  bird.box(0.07, 0.07, 0.62, 0, 0.08, 0.95, "#c99a4a");
  bird.box(2.6, 0.05, 0.42, 0, 0.05, 0, "#7a6e62");
  bird.box(0.9, 0.06, 0.3, 0, 0.02, -0.55, "#8a7e70");
  const birdGeo = bird.build();
  const FLOCK = 13;
  const flock = new THREE.InstancedMesh(birdGeo, mat, FLOCK);
  flock.name = "costa-finale:flock";
  flock.frustumCulled = false;
  flock.visible = false;
  // Moving bodies: no world-space paint sliding over them.
  noPaint(flock);
  noPaint(bits);
  group.add(flock);
  env.scene.add(group);

  // ------------------------------------------------------------------ walkable tiers, colliders
  const plat = toWorld(f, 0, PLAT.z);
  const unDecks = TIERS.map((t, i) =>
    decks.add({
      shape: { kind: "obox", x: plat.x, z: plat.z, yaw: f.yaw, halfW: t.half, halfD: t.half },
      y: f.y + t.top,
      id: `costa-finale-${i}`,
    }),
  );
  // The plaza round the platform and the platform itself are walkable ground.
  env.addWalkable({ kind: "circle", x: plat.x, z: plat.z, r: TIERS[0].half + 2.6 });
  for (const x of [-1.75, 1.75]) {
    const p = toWorld(f, x, RING.z);
    env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.35 });
  }
  for (const [x, , z] of fires) {
    const p = toWorld(f, x, z);
    env.addCollider({ kind: "circle", x: p.x, z: p.z, r: 0.45 });
  }
  const keep = creatures.keepOut(plat.x, plat.z, TIERS[0].half + 3);

  // ------------------------------------------------------------------ panel
  let traveler = loadTraveler();
  const panel = createFieldPanel(hudRoot, { name: "costa-finale", closeLabel: T(S.closeAria) });
  panel.layer.classList.add("qnc-finale");
  panel.kicker.textContent = T(S.kicker);
  const lede = el("p", "qnf-lede", T(S.lede));
  const statsLabel = el("p", "qnf-label", T(S.stats));
  const stats = el("dl", "qnc-stats");
  const postcard = el("button", "qnf-btn qnf-btn-primary qnc-postcard", T(S.postcard));
  postcard.type = "button";
  postcard.addEventListener("click", () => {
    panel.close();
    emit("world:postcard", undefined);
  });
  const actions = el("div", "qnf-actions");
  const cv = linkButton(SITE.resume[lang], T(S.cv), false);
  cv.setAttribute("download", "");
  const back = el("button", "qnf-btn", T(S.cusco));
  back.type = "button";
  back.addEventListener("click", () => {
    panel.close();
    travelTo(lang, "costa", "cusco");
  });
  actions.append(linkButton(SITE.calendly, T(S.book), true), cv, back, linkButton(`/${lang}/`, T(S.site), false));
  panel.body.append(lede, statsLabel, stats, postcard, actions);
  const render = () => {
    panel.title.textContent = finaleTitle(lang, traveler);
    const s = careerStats();
    stats.replaceChildren(
      ...(
        [
          [s.years, S.years],
          [s.companies, S.companies],
          [s.artifacts, S.artifacts],
          [s.knots, S.knots],
        ] as Array<[number, L]>
      ).map(([n, label]) => {
        const d = el("div", "qnc-stat");
        d.append(el("dt", undefined, T(label)), el("dd", undefined, String(n)));
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
  ];

  // ------------------------------------------------------------------ celebration
  const rand = prng(0xc057a);
  let state: Bit[] = [];
  let age = -1;
  let celebrated = false;
  let openIn = -1;
  let skyFrom = 0;
  let skyK = -1;
  const dummy = new THREE.Object3D();
  // Bits land on the platform's tiers (local, relative to the ring's x/z origin at the platform centre).
  const floor = (x: number, z: number) => {
    const lz = z;
    for (let i = TIERS.length - 1; i >= 0; i--) {
      const t = TIERS[i] as (typeof TIERS)[number];
      if (Math.abs(x) <= t.half && Math.abs(lz) <= t.half) return t.top;
    }
    return 0.02;
  };
  const celebrate = () => {
    celebrated = true;
    const entry = CATALOG.find((s) => s.id === STAMP_ID);
    if (entry) emit("world:stamp", { id: STAMP_ID, kind: entry.kind, label: entry.label });
    try {
      getMusic().stinger("summit");
    } catch {
      /* audio unavailable */
    }
    age = 0;
    if (env.reducedMotion) env.sky.setTime(SUNSET);
    else {
      skyFrom = env.sky.time();
      skyK = 0;
      state = spawnBurst(RING.y, rand);
      // The burst starts at the ring (platform-centred coordinates: z relative to the platform's centre).
      for (const b of state) b.z += RING.z - PLAT.z;
      bits.visible = true;
      flock.visible = true;
    }
    openIn = env.reducedMotion ? 0.4 : PANEL_DELAY;
  };
  // The burst drifts on the live sea wind (the shared field, the same gusts the reeds and banners show),
  // turned into the platform's frame; under reduced motion there is no burst at all.
  const wind = { x: 0, z: -0.8 };
  const cy = Math.cos(f.yaw);
  const sy = Math.sin(f.yaw);
  const stepAll = (dt: number) => {
    if (age < 0) return;
    age += dt;
    const w = liveWind.sample(f.x, f.z);
    wind.x = (w.x * cy - w.z * sy) * 0.75;
    wind.z = (w.x * sy + w.z * cy) * 0.75;
    if (age > BURST.life + 6) {
      age = -1;
      bits.visible = false;
      flock.visible = false;
      return;
    }
    for (const b of state) stepBit(b, Math.min(dt, 0.05), age, floor, wind);
  };
  const draw = () => {
    const sc = burstScale(age);
    state.forEach((b, i) => {
      dummy.position.set(b.x, b.y, PLAT.z + b.z);
      dummy.rotation.set(b.sx * Math.min(age, 3), b.sy * Math.min(age, 3), b.ph);
      dummy.scale.setScalar(b.kind ? sc : sc * 1.2);
      dummy.updateMatrix();
      bits.setMatrixAt(i, dummy.matrix);
    });
    bits.instanceMatrix.needsUpdate = true;
    // The flock: in a V from the south along the cliff and out over the sea.
    const u = Math.min(1, age / 11);
    for (let i = 0; i < FLOCK; i++) {
      const row = Math.ceil(i / 2);
      const side = i === 0 ? 0 : i % 2 ? 1 : -1;
      const lx = -70 + u * 150 - row * 2.2;
      const lz = 26 + side * row * 1.9;
      const ly = 15 + Math.sin(age * 0.8 + i) * 0.4 - row * 0.15;
      dummy.position.set(lx, ly, lz);
      dummy.rotation.set(0, Math.PI / 2, Math.sin(age * 0.7 + i * 0.5) * 0.12);
      const s = u >= 1 ? 0 : 1;
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      flock.setMatrixAt(i, dummy.matrix);
    }
    flock.instanceMatrix.needsUpdate = true;
  };
  if (import.meta.env?.DEV)
    (window as Window & { __finale?: unknown }).__finale = {
      advance(sec: number) {
        for (let k = 0; k < Math.round(sec * 60); k++) {
          stepAll(1 / 60);
          if (openIn >= 0) openIn = Math.max(0, openIn - 1 / 60);
          if (skyK >= 0) {
            skyK = Math.min(1, skyK + 1 / 60 / SKY_SECS);
            env.sky.setTime(towardSunset(skyFrom, skyK));
            if (skyK >= 1) skyK = -1;
          }
        }
        if (age >= 0 && !env.reducedMotion) draw();
      },
      state: () => ({ age, celebrated, open: panel.isOpen(), platform: plat, frame: f }),
    };

  let inside = false;
  let near = false;
  let night: boolean | null = null;
  return {
    update(dt, avatar, t) {
      const l = toLocal(f, avatar.x, avatar.z);
      const d = Math.hypot(l.x, l.z - PLAT.z);
      const onTop = avatar.y > f.y + TIERS[0].top - 0.2;
      inside = arrived(inside, onTop ? d : Infinity, ARRIVE_R);
      if (inside && !celebrated) celebrate();
      near = d < PROMPT_R && onTop;
      if (panel.isOpen() && d > PROMPT_R + 9) panel.close();
      if (openIn >= 0) {
        openIn -= dt;
        if (openIn < 0 && !panel.isOpen() && d < PROMPT_R + 9) openPanel();
      }
      if (skyK >= 0) {
        skyK = Math.min(1, skyK + dt / SKY_SECS);
        env.sky.setTime(towardSunset(skyFrom, skyK));
        if (skyK >= 1) skyK = -1;
      }
      const g0 = age >= 0 ? glowAt(age) : 0;
      const n = env.sky.isNight();
      ringMat.emissiveIntensity = 0.15 + g0 * 1.6 + (n ? 0.35 : 0);
      halo.visible = g0 > 0.01;
      (halo.material as THREE.SpriteMaterial).opacity = g0 * 0.85;
      stepAll(dt);
      if (age >= 0 && !env.reducedMotion) draw();
      if (n !== night) {
        night = n;
        for (const s of glows) s.visible = n;
      }
      if (night && !env.reducedMotion)
        for (const [i, s] of glows.entries()) s.scale.setScalar(2.1 + Math.sin(t * 8 + i * 2) * 0.15);
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
      if (import.meta.env?.DEV) delete (window as Window & { __finale?: unknown }).__finale;
      for (const off of offs) off();
      panel.dispose();
      for (const u of unDecks) u();
      creatures.removeKeepOut(keep);
      group.removeFromParent();
      geo.dispose();
      mat.dispose();
      clothMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      bitGeo.dispose();
      bitMat.dispose();
      birdGeo.dispose();
      (halo.material as THREE.SpriteMaterial).dispose();
      for (const s of glows) (s.material as THREE.SpriteMaterial).dispose();
    },
  };
};
