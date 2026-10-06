/**
 * Cross rewards between the Andean world and the arcade (both stored in the arcade store, backward compatible):
 *  - World → arcade: a complete passport (`world:passport-complete`, or already complete on load) unlocks
 *    the arcade achievement "Caminante del Qhapaq Ñan", which unlocks the aguayo cabinet skin in the arcade.
 *  - Arcade → world: CHULLO_AT (6) arcade achievements (the walker itself doesn't count) re-weave the
 *    traveler's chullo with golden thread (./rewards/chullo.ts) and show a toast the first time.
 */
import "./rewards/rewards.css";
import { CHULLO_AT, chulloUnlocked, evaluate, grantWorldPassport, load, save } from "../../games/core/store";
import { ACHIEVEMENTS, GAMES } from "../../games/registry";
import { loadPassport, passportComplete } from "../../lib/passport";
import type { Ambient, CreateAmbient, L } from "../contract";
import { createGoldenChullo } from "./rewards/chullo";

const SEEN_KEY = "ldiego73-world-chullo-seen";
const IDS = ACHIEVEMENTS.map((a) => a.id);
const SLUGS = GAMES.map((g) => g.slug);

const COPY = {
  arcadeKicker: { es: "Recompensa en el arcade", en: "Arcade reward" },
  arcadeTitle: { es: "Caminante del Qhapaq Ñan", en: "Qhapaq Ñan Walker" },
  arcadeBody: {
    es: "Completaste el pasaporte: las cabinas del arcade ya pueden vestir aguayo.",
    en: "Passport complete: the arcade cabinets can now wear aguayo.",
  },
  chulloKicker: { es: "Recompensa del arcade", en: "Arcade reward" },
  chulloTitle: { es: "Chullo de hilo dorado", en: "Golden-thread chullo" },
  chulloBody: {
    es: `Tus ${CHULLO_AT} logros del arcade quedaron tejidos en tu chullo.`,
    en: `Your ${CHULLO_AT} arcade achievements are now woven into your chullo.`,
  },
} satisfies Record<string, L>;

const seen = () => {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
};
const markSeen = () => {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage unavailable */
  }
};

/** Grants the walker achievement in the arcade store; true when it was newly unlocked. */
function grantWalker(): boolean {
  const s = load();
  if (!grantWorldPassport(s)) return false;
  const fresh = evaluate(s, ACHIEVEMENTS, SLUGS);
  save(s);
  return fresh.length > 0;
}

export const create: CreateAmbient = (env, hudRoot) => {
  const lang = env.lang;
  const chullo = createGoldenChullo(env);

  // ---------------------------------------------------------------- toast
  const layer = document.createElement("div");
  layer.className = "qn-hud kx-rewards-layer";
  const toast = document.createElement("div");
  toast.className = "kx-reward-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.setAttribute("aria-atomic", "true");
  const kicker = document.createElement("span");
  kicker.className = "kx-reward-kicker";
  const title = document.createElement("b");
  const body = document.createElement("span");
  toast.append(kicker, title, body);
  layer.append(toast);
  hudRoot.append(layer);
  if (env.reducedMotion) layer.classList.add("is-reduced");
  const queue: Array<{ kicker: L; title: L; body: L }> = [];
  let toastT = 0;
  const show = (m: { kicker: L; title: L; body: L }) => {
    kicker.textContent = m.kicker[lang];
    title.textContent = m.title[lang];
    body.textContent = m.body[lang];
    toast.classList.remove("is-on");
    void toast.offsetWidth;
    toast.classList.add("is-on");
    toastT = 6.5;
  };
  const enqueue = (m: { kicker: L; title: L; body: L }) => {
    if (toastT > 0) queue.push(m);
    else show(m);
  };

  // ---------------------------------------------------------------- world → arcade
  // Catch up silently on load (the passport may have been completed in an earlier visit).
  if (passportComplete(loadPassport())) grantWalker();
  const onComplete = () => {
    if (grantWalker()) enqueue({ kicker: COPY.arcadeKicker, title: COPY.arcadeTitle, body: COPY.arcadeBody });
  };
  window.addEventListener("world:passport-complete", onComplete);

  // ---------------------------------------------------------------- arcade → world
  let wantChullo = false;
  const check = () => {
    wantChullo = chulloUnlocked(load(), IDS);
    if (!wantChullo && chullo.applied) chullo.restore();
  };
  check();
  // The arcade may be played in another tab: re-check when its store changes.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === "ldiego73-arcade-v1") check();
  };
  window.addEventListener("storage", onStorage);
  let findClock = 0;

  const ambient: Ambient = {
    update(dt) {
      if (toastT > 0) {
        toastT -= dt;
        if (toastT <= 0) {
          toast.classList.remove("is-on");
          const next = queue.shift();
          if (next) show(next);
        }
      }
      if (!wantChullo || chullo.applied) return;
      // The traveler is built by content; look it up about once a second until it exists.
      findClock -= dt;
      if (findClock > 0) return;
      findClock = 1;
      const traveler = env.scene.getObjectByName("traveler");
      if (traveler && chullo.apply(traveler) && !seen()) {
        markSeen();
        enqueue({ kicker: COPY.chulloKicker, title: COPY.chulloTitle, body: COPY.chulloBody });
      }
    },
    dispose() {
      window.removeEventListener("world:passport-complete", onComplete);
      window.removeEventListener("storage", onStorage);
      chullo.dispose();
      layer.remove();
    },
  };
  return ambient;
};
