/**
 * Easter eggs along the Qhapaq Ñan.
 *  - Five vizcachas sit in nooks just off the stone path (rocks by the lower trail, an andén wall, the
 *    waterfall stream, the cliff past the rope bridge, near the summit). Placed deterministically
 *    (seeded) by ./eggs/placement.ts. They duck into their burrow when you come close, peek out when you
 *    are within greeting range ("E · Saludar"), and on greeting they pop up and squeak: `egg:vizcacha-N`.
 *  - The golden khipu hangs in a stone niche beside the summit path. It only shimmers (and only answers
 *    "E · Leer") at night or once the passport is complete (`world:passport-complete`, remembered
 *    locally); it opens a small panel with a note about the road and emits `egg:golden-khipu`.
 */
import "./eggs/eggs.css";
import * as THREE from "three";
import type { Ambient, CreateAmbient, L } from "../contract";
import type { WorldEnvExtra } from "../env";
import { emit, on } from "../events";
import { createEggKit, type Vizcacha } from "./eggs/models";
import { khipuNiche, type Nook, type PlaceEnv, vizcachaNooks } from "./eggs/placement";

const GREET = 2.5;
const SHY = 6;
const KHIPU_RANGE = 2.6;
const AWAKE_KEY = "ldiego73-world-golden-khipu";

const T_GREET: L = { es: "E · Saludar", en: "E · Say hi" };
const T_READ: L = { es: "E · Leer el khipu", en: "E · Read the khipu" };
const SQUEAK: L = { es: "¡Fiii! ¡Hola!", en: "Squeak! Hi!" };
const VIZ_LABEL = (n: number): L => ({ es: `Vizcacha escondida ${n}/5`, en: `Hidden vizcacha ${n}/5` });
const KHIPU_LABEL: L = { es: "Khipu dorado", en: "Golden khipu" };

const PANEL = {
  kicker: { es: "Khipu dorado", en: "Golden khipu" },
  title: { es: "Lo que cuentan los nudos", en: "What the knots count" },
  body: [
    {
      es: "El Qhapaq Ñan unió más de treinta mil kilómetros de montaña, valle y desierto. Nadie lo caminó entero: cada tramo lo sostuvieron manos que nunca vieron el final, y aun así lo dejaron listo para quien viniera después.",
      en: "The Qhapaq Ñan joined more than thirty thousand kilometres of mountain, valley and desert. No one walked all of it: every stretch was held up by hands that never saw its end, and still they left it ready for whoever came next.",
    },
    {
      es: "Los chasquis corrían de tambo en tambo y entregaban el mensaje sin detenerse. Los khipus guardaban la memoria en nudos: no en palabras, sino en cuerdas que alguien, más adelante, sabría leer.",
      en: "Chasquis ran from tambo to tambo and handed the message on without stopping. Khipus kept memory in knots: not in words, but in cords that someone further along would know how to read.",
    },
    {
      es: "Este khipu no cuenta cosechas ni tributos. Cuenta tus pasos: desde la puerta del valle hasta aquí arriba, donde el aire es delgado y las estrellas quedan cerca.",
      en: "This khipu counts no harvests and no tribute. It counts your steps: from the valley gate up to here, where the air is thin and the stars are close.",
    },
  ] as L[],
  thanks: {
    es: "Gracias por recorrer este camino, por detenerte en cada tambo y por encontrar lo que estaba escondido. Que tu propio camino tenga buenos puentes.",
    en: "Thank you for walking this road, for stopping at every tambo and for finding what was hidden. May your own road have good bridges.",
  },
  close: { es: "Cerrar", en: "Close" },
};

interface Egg {
  v: Vizcacha;
  nook: Nook;
  hide: number;
  greeted: boolean;
  hop: number;
  look: number;
  dist: number;
}

const readAwake = () => {
  try {
    return localStorage.getItem(AWAKE_KEY) === "1";
  } catch {
    return false;
  }
};

export const create: CreateAmbient = (env, hudRoot) => {
  const extra = (env as Partial<WorldEnvExtra>).extra;
  if (!extra) throw new Error("eggs need env.extra");
  const placeEnv: PlaceEnv = env as WorldEnvExtra;
  const lang = env.lang;
  const rm = env.reducedMotion;
  const kit = createEggKit(env);
  const root = new THREE.Group();
  root.name = "easter-eggs";
  env.scene.add(root);

  // ---------------------------------------------------------------- vizcachas
  const nooks = vizcachaNooks(placeEnv);
  const eggs: Egg[] = nooks.map((nook, i) => {
    const v = kit.vizcacha(i);
    v.group.position.set(nook.x, nook.y, nook.z);
    // Mostly facing the path, a little askew so they read as animals, not props.
    v.group.rotation.y = nook.yaw + (i % 2 ? 0.5 : -0.4);
    root.add(v.group);
    if (i === 0) {
      // The first one hides behind a few boulders (between it and the trail).
      const r = kit.rocks(97);
      r.position.copy(v.group.position);
      r.position.y -= 0.1;
      r.rotation.y = nook.yaw;
      root.add(r);
    }
    return { v, nook, hide: 0, greeted: false, hop: 0, look: 0, dist: Infinity };
  });

  // Squeak bubble (one shared sprite).
  const bubble = kit.bubble(SQUEAK, lang);
  root.add(bubble);
  let bubbleT = 0;
  const bubbleAt = new THREE.Vector3();

  // ---------------------------------------------------------------- golden khipu
  const niche = khipuNiche(placeEnv, nooks);
  const kh = kit.khipu(env.quality === "low");
  kh.group.position.set(niche.x, niche.y - 0.05, niche.z);
  kh.group.rotation.y = niche.yaw;
  root.add(kh.group);
  let complete = readAwake();
  let khipuDist = Infinity;
  let awake = false;
  const onComplete = () => {
    complete = true;
    try {
      localStorage.setItem(AWAKE_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  };
  window.addEventListener("world:passport-complete", onComplete);

  // ---------------------------------------------------------------- panel
  const layer = document.createElement("div");
  layer.className = "qn-hud kx-eggs-layer";
  const panel = document.createElement("section");
  panel.className = "kx-khipu";
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "kx-khipu-title");
  const close = document.createElement("button");
  close.type = "button";
  close.className = "kx-khipu-close";
  close.setAttribute("aria-label", PANEL.close[lang]);
  close.textContent = "×";
  const body = document.createElement("div");
  body.className = "kx-khipu-body";
  const kicker = document.createElement("p");
  kicker.className = "kx-khipu-kicker";
  kicker.textContent = PANEL.kicker[lang];
  const h = document.createElement("h2");
  h.className = "kx-khipu-title";
  h.id = "kx-khipu-title";
  h.textContent = PANEL.title[lang];
  body.append(kicker, h);
  for (const p of PANEL.body) {
    const el = document.createElement("p");
    el.textContent = p[lang];
    body.append(el);
  }
  const thanks = document.createElement("p");
  thanks.className = "kx-khipu-thanks";
  thanks.textContent = PANEL.thanks[lang];
  body.append(thanks);
  panel.append(close, body);
  layer.append(panel);
  hudRoot.append(layer);
  const syncNight = () => layer.classList.toggle("is-night", env.sky.isNight());
  syncNight();
  const offSky = env.sky.onChange(syncNight);

  let open = false;
  let returnFocus: HTMLElement | null = null;
  const openPanel = () => {
    if (open) return;
    open = true;
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.hidden = false;
    panel.classList.remove("is-open");
    void panel.offsetWidth;
    panel.classList.add("is-open");
    panel.focus({ preventScroll: true });
    emit("world:modal", { open: true });
  };
  const closePanel = () => {
    if (!open) return;
    open = false;
    panel.hidden = true;
    panel.classList.remove("is-open");
    emit("world:modal", { open: false });
    returnFocus?.focus?.({ preventScroll: true });
    returnFocus = null;
  };
  close.addEventListener("click", closePanel);
  // Keep Tab inside the dialog (only one control), Esc also works with focus inside the panel.
  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      e.preventDefault();
      close.focus();
    }
  };
  panel.addEventListener("keydown", onPanelKey);

  // Other modals (passport, content panels) freeze greeting prompts.
  let otherModal = false;
  const offModal = on("world:modal", (d) => {
    if (!open) otherModal = !!d?.open;
  });

  // ---------------------------------------------------------------- frame
  let target: Egg | null = null;
  const sparklePos = kh.sparkles?.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;

  const ambient: Ambient = {
    update(dt, avatar, t) {
      dt = Math.min(dt, 0.05);
      target = null;
      let best = GREET;
      for (const e of eggs) {
        const g = e.v.group.position;
        const dx = avatar.x - g.x;
        const dz = avatar.z - g.z;
        e.dist = Math.hypot(dx, dz);
        if (e.dist < best) {
          best = e.dist;
          target = e;
        }
        // Shy: duck down when the traveler approaches, peek out when they stand still nearby.
        let want = 0;
        if (!e.greeted) want = e.dist < GREET ? 0.45 : e.dist < SHY ? 1 : 0;
        const rate = want > e.hide ? 16 : 2.5;
        e.hide = rm ? want : e.hide + (want - e.hide) * (1 - Math.exp(-dt * rate));
        e.hop = Math.max(0, e.hop - dt * 1.8);
        const hopY = rm ? 0 : Math.sin(e.hop * Math.PI * 2) * 0.12 * e.hop;
        e.v.body.position.y = -0.46 * e.hide + Math.max(0, hopY);
        // Head follows the traveler when close; otherwise a slow idle glance.
        let lookT = Math.sin(t * 0.6 + e.nook.x) * 0.4;
        if (e.dist < 9) {
          let rel = Math.atan2(dx, dz) - e.v.group.rotation.y;
          while (rel > Math.PI) rel -= Math.PI * 2;
          while (rel < -Math.PI) rel += Math.PI * 2;
          lookT = THREE.MathUtils.clamp(rel, -1, 1);
        }
        e.look += (lookT - e.look) * (1 - Math.exp(-dt * 4));
        e.v.head.rotation.y = e.look;
        e.v.head.rotation.x = rm ? 0 : Math.sin(t * 3 + e.nook.z) * 0.04;
        e.v.tail.rotation.x = rm ? 0 : Math.sin(t * 1.4 + e.nook.x) * 0.12 + e.hop * 0.4;
      }

      // Squeak bubble: rises and fades above the greeted vizcacha.
      if (bubbleT > 0) {
        bubbleT = Math.max(0, bubbleT - dt);
        const k = bubbleT / 1.8;
        bubble.position.set(bubbleAt.x, bubbleAt.y + 1.0 + (rm ? 0 : (1 - k) * 0.35), bubbleAt.z);
        bubble.material.opacity = Math.min(1, k * 4);
        bubble.visible = bubbleT > 0;
      }

      // Golden khipu: shimmers at night or once the passport is complete.
      awake = complete || env.sky.isNight();
      const kp = kh.group.position;
      khipuDist = Math.hypot(avatar.x - kp.x, avatar.z - kp.z);
      const pulse = rm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.2);
      kh.glow.material.opacity = awake ? 0.3 + 0.3 * pulse : 0;
      kh.glow.visible = awake;
      if (kh.sparkles && kh.sparkleBase && sparklePos) {
        kh.sparkles.visible = awake;
        if (awake) {
          const mat = kh.sparkles.material as THREE.PointsMaterial;
          mat.opacity = 0.55 + 0.4 * pulse;
          if (!rm) {
            const a = sparklePos.array as Float32Array;
            const b = kh.sparkleBase;
            for (let i = 0; i < a.length; i += 3) {
              const ph = (t * 0.22 + i * 0.047) % 1;
              a[i] = (b[i] as number) + Math.sin(t * 1.3 + i) * 0.04;
              a[i + 1] = (b[i + 1] as number) - 0.2 + ph * 0.6;
              a[i + 2] = b[i + 2] as number;
            }
            sparklePos.needsUpdate = true;
          }
        }
      }
    },
    prompt() {
      if (open || otherModal) return null;
      if (target) return T_GREET[lang];
      if (awake && khipuDist < KHIPU_RANGE) return T_READ[lang];
      return null;
    },
    interact() {
      if (open || otherModal) return false;
      const e = target;
      if (e) {
        const n = eggs.indexOf(e) + 1;
        e.greeted = true;
        e.hop = 1;
        bubbleAt.copy(e.v.group.position);
        bubbleT = 1.8;
        bubble.visible = true;
        emit("world:stamp", { id: `egg:vizcacha-${n}`, kind: "egg", label: VIZ_LABEL(n) });
        return true;
      }
      if (awake && khipuDist < KHIPU_RANGE) {
        openPanel();
        emit("world:stamp", { id: "egg:golden-khipu", kind: "egg", label: KHIPU_LABEL });
        return true;
      }
      return false;
    },
    escape() {
      if (!open) return false;
      closePanel();
      return true;
    },
    dispose() {
      if (open) closePanel();
      window.removeEventListener("world:passport-complete", onComplete);
      offModal();
      offSky();
      close.removeEventListener("click", closePanel);
      panel.removeEventListener("keydown", onPanelKey);
      layer.remove();
      root.removeFromParent();
      kit.dispose();
    },
  };
  return ambient;
};
