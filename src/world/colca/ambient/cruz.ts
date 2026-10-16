/**
 * Cruz del Cóndor (the Kuntisuyu finale): where the road ends, a paved stone platform on the canyon's north
 * rim with a low parapet over the drop and a stone cross on a stepped pedestal, like the real viewpoint over
 * the Colca. A carved sign at the way in names it.
 *
 * Arrival: the first time in a page session the traveler steps up to the cross (./cruz/logic.ts arrived), the
 * place celebrates: condors rise out of the canyon in a spiral and circle overhead (./condores/model.ts,
 * ./condores/logic.ts riseAt), condor feathers and confetti in khipu dyes burst from the cross and drift down
 * (./cruz/logic.ts), the music plays its summit stinger, the passport gets `colca:summit` and, a moment
 * later, the reward panel opens. With prefers-reduced-motion there is no burst and no rising flock; the panel
 * still opens. Afterwards "E · Ver tu premio" by the cross reopens it.
 *
 * The panel ("¡Lo lograste, {name}!", the name from ../../traveler.ts, renamed live on `world:traveler`,
 * kicker "Fin del Kuntisuyu") shows four true counts (../content.ts finaleStats: artifacts on the pampa,
 * achievements in the colcas, career stages, companies) and the buttons: the postcard (`world:postcard`),
 * book 60 min (SITE.calendly), download the CV (SITE.resume), back to Qusqu (travel.ts) and back to the site.
 *
 * Draw calls: the platform, parapet, pedestal and cross 1, the sign 1; the bits and the flock (3) only during
 * the celebration. The parapet and the pedestal are colliders; fauna keeps out.
 */
import * as THREE from "three";
import { getMusic } from "../../../audio";
import { SITE } from "../../../data/site";
import { CATALOG } from "../../../lib/passport";
import { createFieldPanel, el, linkButton } from "../../ambient/fields/panel";
import type { CreateAmbient, L } from "../../contract";
import { creatures } from "../../creatures";
import { emit, on } from "../../events";
import { vertexToon } from "../../merge-colors";
import { glowSprite } from "../../props";
import type { SuyuEnv } from "../../suyu/contract";
import { travelTo } from "../../travel";
import { loadTraveler } from "../../traveler";
import { finaleStats } from "../content";
import { signBoard, VKit } from "../kit";
import type { ColcaLayout } from "../layout";
import { CANYON, rimZ, SUMMIT_STAMP } from "../plan";
import { riseAt } from "./condores/logic";
import { CondorFlock } from "./condores/model";
import { arrived, type Bit, BURST, bitScale, finaleTitle, prng, spawnBits, statTiles, stepBit } from "./cruz/logic";
import "../colca.css";

const S = {
  kicker: { es: "Fin del Kuntisuyu", en: "End of the Kuntisuyu" },
  lede: {
    es: "Recorriste todo el camino del Kuntisuyu: del punku de piedra, por el borde del cañón del Colca y sus colcas, a la pampa de Nasca y de vuelta al borde, hasta la Cruz del Cóndor.",
    en: "You walked the whole Kuntisuyu road: from the stone punku, along the rim of the Colca canyon and its colcas, to the Nazca pampa and back to the rim, up to the Cruz del Cóndor.",
  },
  stats: { es: "Lo que viste en el camino", en: "What you saw on the road" },
  note: {
    es: "La Cruz del Cóndor es un mirador real sobre el cañón del Colca: por las mañanas los cóndores suben desde el fondo con el aire caliente.",
    en: "The Cruz del Cóndor is a real lookout over the Colca canyon: in the mornings the condors rise from its depths on the warm air.",
  },
  postcard: { es: "Crear mi postal", en: "Make my postcard" },
  book: { es: "Agendar 60 min", en: "Book 60 min" },
  cv: { es: "Descargar CV", en: "Download resume" },
  qusqu: { es: "Volver a Qusqu", en: "Back to Qusqu" },
  site: { es: "Volver al sitio", en: "Back to the site" },
  view: { es: "E · Ver tu premio", en: "E · See your reward" },
  close: { es: "E · Cerrar", en: "E · Close" },
  closeAria: { es: "Cerrar", en: "Close" },
  sign: { es: "CRUZ DEL CÓNDOR", en: "CRUZ DEL CÓNDOR" },
  signSub: { es: "Mirador del cañón del Colca", en: "Colca canyon lookout" },
  stampLabel: { es: "Fin del Kuntisuyu", en: "End of the Kuntisuyu" },
} satisfies Record<string, L>;

/** Cross on its pedestal (platform frame: +z toward the canyon). */
const CROSS = { z: 3.6, steps: [2.6, 2.0, 1.4], step: 0.42, h: 3.4 } as const;
const ARRIVE_R = 5.5;
const PROMPT_R = 4.5;
const PANEL_DELAY = 1.8;
const FLOCK = 7;
const FLOCK_LIFE = 60;
const COLORS = ["#1e1b1a", "#efe9df", "#c4383f", "#dda63c", "#2a9d8f", "#3446a6", "#e07a3a"];

export const create: CreateAmbient = (baseEnv, hudRoot) => {
  const env = baseEnv as SuyuEnv;
  const layout = env.suyu.layout as ColcaLayout;
  const lang = env.lang;
  const T = (l: L) => l[lang];
  const C = layout.cruz;
  const floorY = env.heightAt(C.x, C.z);
  const plaza = layout.plaza("cruz");
  const yaw = C.yaw;
  const cs = Math.cos(yaw);
  const sn = Math.sin(yaw);
  /** Platform-local → world. */
  const W = (lx: number, lz: number) => ({ x: C.x + lx * cs + lz * sn, z: C.z - lx * sn + lz * cs });

  // ------------------------------------------------------------------ build
  let seed = 0xc2c2;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const kit = new VKit().at(C.x, floorY, C.z, yaw);
  kit.cyl(plaza.r + 0.4, plaza.r + 0.8, 0.5, 0, -0.45, 0, "#b4a690", 28);
  // Flagstones: a ring pattern of slightly lighter slabs.
  for (let r = 1.6; r < plaza.r; r += 1.6)
    for (let a = 0; a < Math.PI * 2; a += 1.3 / r)
      kit.box(1.2, 0.06, 0.9, Math.sin(a) * r, 0.0, Math.cos(a) * r, rand() < 0.5 ? "#c2b49c" : "#a99a82", a);
  // Parapet over the canyon (a low wall on the canyon half of the rim).
  const parapet: Array<{ x: number; z: number }> = [];
  for (let a = -1.75; a <= 1.75; a += 0.11) {
    const r = plaza.r - 0.3;
    kit.box(
      0.95,
      0.85 + rand() * 0.12,
      0.6,
      Math.sin(a) * r,
      0,
      Math.cos(a) * r,
      rand() < 0.5 ? "#9c8f7b" : "#8a7e6b",
      a,
    );
    parapet.push(W(Math.sin(a) * r, Math.cos(a) * r));
  }
  // Pedestal steps and the cross.
  CROSS.steps.forEach((w, i) => {
    kit.box(w, CROSS.step, w, 0, i * CROSS.step, CROSS.z, i % 2 ? "#b8b0a0" : "#a49c8c");
  });
  const baseTop = CROSS.steps.length * CROSS.step;
  kit.box(0.36, CROSS.h, 0.36, 0, baseTop, CROSS.z, "#cfc8ba");
  kit.box(1.7, 0.34, 0.34, 0, baseTop + CROSS.h * 0.66, CROSS.z, "#cfc8ba");
  // A bench by the parapet (stone slab).
  for (const sx of [-1, 1]) kit.box(2.2, 0.45, 0.6, sx * 4.4, 0, 2.6, "#9a8e7a", sx * 0.5);
  const geo = kit.build();
  const mat = vertexToon();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "colca-cruz";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  env.scene.add(mesh);
  const sign = signBoard(env.toon as (c: string) => THREE.Material, {
    w: 2.8,
    title: T(S.sign),
    sub: T(S.signSub),
    stone: true,
  });
  const sp = W(-3.6, -plaza.r + 0.8);
  sign.mesh.position.set(sp.x, floorY + 1.1, sp.z);
  sign.mesh.rotation.y = yaw + Math.PI;
  env.scene.add(sign.mesh);
  for (const p of parapet) env.addCollider({ kind: "circle", ...p, r: 0.45 });
  const cross = W(0, CROSS.z);
  env.addCollider({ kind: "circle", ...cross, r: 1.45 });
  for (const sx of [-1, 1]) env.addCollider({ kind: "circle", ...W(sx * 4.4, 2.6), r: 0.6 });
  const keep = creatures.keepOut(C.x, C.z, plaza.r + 1);

  // ------------------------------------------------------------------ celebration
  const bitGeo = new THREE.PlaneGeometry(0.16, 0.42);
  const bitMat = (env.toon("#ffffff") as THREE.MeshToonMaterial).clone();
  bitMat.side = THREE.DoubleSide;
  const bits = new THREE.InstancedMesh(bitGeo, bitMat, BURST.bits);
  bits.name = "colca-cruz:bits";
  bits.frustumCulled = false;
  bits.visible = false;
  env.noOutline(bits);
  const col = new THREE.Color();
  let bitState: Bit[] = spawnBits(BURST.bits, 0, COLORS.length, prng(1));
  bitState.forEach((b, i) => {
    bits.setColorAt(i, col.set((b.kind === 0 ? COLORS[i % 2] : COLORS[2 + (b.c % 5)]) as string));
  });
  if (bits.instanceColor) bits.instanceColor.needsUpdate = true;
  env.scene.add(bits);
  const flock = new CondorFlock("colca-cruz-condors", FLOCK, 0.95);
  flock.group.visible = false;
  env.scene.add(flock.group);
  const halo = glowSprite(env, "#ffe2a0", 4.5);
  const top = W(0, CROSS.z);
  halo.position.set(top.x, floorY + baseTop + CROSS.h * 0.7, top.z);
  halo.visible = false;
  env.scene.add(halo);

  // ------------------------------------------------------------------ panel
  let traveler = loadTraveler();
  const panel = createFieldPanel(hudRoot, { name: "cruz", closeLabel: T(S.closeAria) });
  panel.layer.classList.add("qnk", "qnk-cruz");
  panel.kicker.textContent = T(S.kicker);
  const stats = el("dl", "qnk-stats");
  stats.append(
    ...statTiles(finaleStats()).map((t) => {
      const d = el("div", "qnk-stat");
      d.append(el("dt", undefined, T(t.label)), el("dd", undefined, t.value));
      return d;
    }),
  );
  const postcard = el("button", "qnf-btn qnf-btn-primary qnk-postcard", T(S.postcard));
  postcard.type = "button";
  postcard.addEventListener("click", () => {
    panel.close();
    emit("world:postcard", undefined);
  });
  const cv = linkButton(SITE.resume[lang], T(S.cv), false);
  cv.setAttribute("download", "");
  const back = el("button", "qnf-btn", T(S.qusqu));
  back.type = "button";
  back.addEventListener("click", () => {
    panel.close();
    travelTo(lang, "colca", "cusco");
  });
  const actions = el("div", "qnf-actions");
  actions.append(linkButton(SITE.calendly, T(S.book), true), cv, back, linkButton(`/${lang}/`, T(S.site), false));
  panel.body.append(
    el("p", "qnf-lede", T(S.lede)),
    el("p", "qnf-label", T(S.stats)),
    stats,
    postcard,
    actions,
    el("p", "qnf-note", T(S.note)),
  );
  const openPanel = () => {
    panel.title.textContent = finaleTitle(lang, traveler);
    panel.open();
  };
  const offs = [
    on("world:traveler", (d) => {
      traveler = d?.name ?? "";
      if (panel.isOpen()) panel.title.textContent = finaleTitle(lang, traveler);
    }),
  ];

  let age = -1;
  let flockAge = -1;
  let celebrated = false;
  let openIn = -1;
  const dummy = new THREE.Object3D();
  const celebrate = () => {
    celebrated = true;
    const entry = CATALOG.find((s) => s.id === SUMMIT_STAMP);
    emit("world:stamp", { id: SUMMIT_STAMP, kind: "summit", label: entry?.label ?? S.stampLabel });
    try {
      getMusic().stinger("summit");
    } catch {
      /* audio unavailable */
    }
    if (!env.reducedMotion) {
      age = 0;
      flockAge = 0;
      bitState = spawnBits(BURST.bits, baseTop + CROSS.h, COLORS.length, prng(0xc0de));
      bits.visible = true;
      flock.group.visible = true;
    }
    halo.visible = true;
    openIn = env.reducedMotion ? 0.4 : PANEL_DELAY;
  };
  // Bits land on the platform (local y 0) or the pedestal's top step.
  const floor = (x: number, z: number) => (Math.abs(x) < 0.8 && Math.abs(z) < 0.8 ? baseTop : 0.05);
  const stepBurst = (dt: number) => {
    if (age < 0) return;
    age += dt;
    if (age > BURST.life) {
      age = -1;
      bits.visible = false;
      halo.visible = false;
      return;
    }
    for (const b of bitState) stepBit(b, Math.min(dt, 0.05), age, floor);
  };
  const drawBurst = () => {
    const sc = bitScale(age);
    for (let i = 0; i < bitState.length; i++) {
      const b = bitState[i] as Bit;
      const w = W(b.x, CROSS.z + b.z);
      dummy.position.set(w.x, floorY + b.y + 0.02, w.z);
      if (b.landed) dummy.rotation.set(-Math.PI / 2, 0, b.ph);
      else dummy.rotation.set(b.sx * age, b.sy * age, b.ph);
      dummy.scale.setScalar(sc * (b.kind === 0 ? 1.4 : 0.8));
      dummy.updateMatrix();
      bits.setMatrixAt(i, dummy.matrix);
    }
    bits.instanceMatrix.needsUpdate = true;
  };
  const drawFlock = () => {
    for (let i = 0; i < FLOCK; i++) {
      const p = riseAt(i, FLOCK, flockAge);
      // Leaving: after ~45 s they widen out over the canyon and climb away.
      const leave = Math.max(0, flockAge - 45) / 15;
      const x = cross.x + p.dx * (1 + leave * 3);
      const zc = rimZ(x);
      const s = cross.z - rimZ(cross.x) + p.ds * (1 + leave * 3) + leave * 60;
      flock.set(i, {
        x,
        y: CANYON.rimY + p.y + leave * 40,
        z: zc + s,
        yaw: p.yaw,
        bank: p.bank,
        pitch: 0,
        wing: p.wing,
      });
    }
    flock.commit();
  };
  if (import.meta.env?.DEV)
    (window as Window & { __cruz?: unknown }).__cruz = {
      advance(sec: number) {
        for (let k = 0; k < Math.round(sec * 60); k++) {
          stepBurst(1 / 60);
          if (flockAge >= 0) flockAge += 1 / 60;
          if (openIn >= 0) openIn = Math.max(0, openIn - 1 / 60);
        }
        if (age >= 0) drawBurst();
        if (flockAge >= 0) drawFlock();
      },
      state: () => ({ age, flockAge, celebrated, open: panel.isOpen(), cross, floorY }),
    };

  let inside = false;
  let near = false;
  return {
    update(dt, avatar, t) {
      const d = Math.hypot(avatar.x - cross.x, avatar.z - cross.z);
      const onPlatform = Math.abs(avatar.y - floorY) < 2;
      inside = arrived(inside, onPlatform ? d : Infinity, ARRIVE_R);
      if (inside && !celebrated) celebrate();
      near = onPlatform && d < PROMPT_R;
      if (panel.isOpen() && d > PROMPT_R + 8) panel.close();
      if (openIn >= 0) {
        openIn -= dt;
        if (openIn < 0 && !panel.isOpen() && d < PROMPT_R + 8) openPanel();
      }
      stepBurst(dt);
      if (age >= 0) {
        drawBurst();
        (halo.material as THREE.SpriteMaterial).opacity = 0.8 * Math.max(0, 1 - age / BURST.life);
        halo.scale.setScalar(4 + Math.sin(t * 3) * 0.4);
      }
      if (flockAge >= 0) {
        flockAge += dt;
        if (flockAge > FLOCK_LIFE) {
          flockAge = -1;
          flock.group.visible = false;
        } else drawFlock();
      }
    },
    prompt() {
      if (panel.isOpen()) return near ? T(S.close) : null;
      return near && celebrated ? T(S.view) : null;
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
      if (import.meta.env?.DEV) delete (window as Window & { __cruz?: unknown }).__cruz;
      for (const off of offs) off();
      panel.dispose();
      creatures.removeKeepOut(keep);
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
      sign.mesh.removeFromParent();
      sign.dispose();
      bits.removeFromParent();
      bits.dispose();
      bitGeo.dispose();
      bitMat.dispose();
      flock.dispose();
      halo.removeFromParent();
      (halo.material as THREE.SpriteMaterial).dispose();
    },
  };
};
