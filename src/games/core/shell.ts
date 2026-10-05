import { ACHIEVEMENTS, GAMES } from "../registry";
import { NEON } from "./neon";
import { onThemeChange } from "./palette";
import { evaluate, load, recordEnd, recordStart, recordStat, save } from "./store";
import type { Achievement, Difficulty, GameEvent, GameInstance, GameMeta, Lang } from "./types";

const COPY = {
  es: {
    insert: "Elige dificultad",
    easy: "Fácil",
    normal: "Normal",
    hard: "Difícil",
    start: "Jugar",
    restart: "Otra vez",
    resume: "Continuar",
    paused: "Pausa",
    over: "Game over",
    win: "¡Ganaste!",
    score: "Score",
    best: "Récord",
    newBest: "Nuevo récord",
    unlocked: "Logro desbloqueado",
    pause: "Pausa",
    restartNow: "Reiniciar",
    noWebgl: "Este juego necesita WebGL y tu navegador no lo tiene activo.",
    loadError: "No se pudo cargar el juego. Recarga la página para intentarlo de nuevo.",
  },
  en: {
    insert: "Choose difficulty",
    easy: "Easy",
    normal: "Normal",
    hard: "Hard",
    start: "Play",
    restart: "Again",
    resume: "Resume",
    paused: "Paused",
    over: "Game over",
    win: "You win!",
    score: "Score",
    best: "Best",
    newBest: "New best",
    unlocked: "Achievement unlocked",
    pause: "Pause",
    restartNow: "Restart",
    noWebgl: "This game needs WebGL and your browser doesn't have it enabled.",
    loadError: "The game failed to load. Reload the page to try again.",
  },
} as const;

const fmt = (n: number, lang: Lang) => n.toLocaleString(lang === "es" ? "es-PE" : "en-US");
const DIFF_KEY = "ldiego73-arcade-difficulty";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

const readDifficulty = (): Difficulty => {
  try {
    const d = localStorage.getItem(DIFF_KEY);
    return d === "easy" || d === "hard" ? d : "normal";
  } catch {
    return "normal";
  }
};

/**
 * Builds the neon cabinet (marquee, HUD, CRT screen, overlays) inside host and runs one game.
 * Used by the Astro arcade page and by the dev harness.
 */
export async function mountCabinet(host: HTMLElement, meta: GameMeta, lang: Lang): Promise<() => void> {
  const c = COPY[lang];
  const state = load();
  const best0 = state.games[meta.slug]?.best ?? 0;
  let difficulty = readDifficulty();
  host.classList.add("cabinet");
  host.style.setProperty("--neon", NEON[meta.neon]);
  host.innerHTML = `
    <div class="cab-marquee"><span>${meta.marquee}</span></div>
    <div class="cab-hud">
      <span class="cab-stat"><span class="cab-k">${c.score}</span> <b data-score>0</b></span>
      <span class="cab-stat"><span class="cab-k">${c.best}</span> <b data-best>${fmt(best0, lang)}</b></span>
      <span class="cab-status" data-status></span>
      <button class="cab-btn cab-pause" type="button" data-restart hidden>${c.restartNow}</button>
      <button class="cab-btn cab-pause" type="button" data-pause hidden>${c.pause}</button>
    </div>
    <div class="cab-screen" tabindex="0" aria-label="${meta.title[lang]}">
      <div class="cab-root" data-root></div>
      <div class="cab-crt" aria-hidden="true"></div>
      <div class="cab-overlay" data-overlay>
        <p class="cab-title" data-otitle>${meta.title[lang]}</p>
        <p class="cab-msg" data-omsg>${meta.tagline[lang]}</p>
        <div class="cab-diff" role="radiogroup" aria-label="${c.insert}" data-diff>
          ${(["easy", "normal", "hard"] as const)
            .map(
              (d) =>
                `<button type="button" role="radio" data-d="${d}" aria-checked="${d === difficulty}">${c[d]}</button>`,
            )
            .join("")}
        </div>
        <button class="cab-btn cab-primary" type="button" data-action>${c.start}</button>
        <button class="cab-btn" type="button" data-orestart hidden>${c.restartNow}</button>
      </div>
    </div>
    <p class="sr-only" aria-live="polite" data-live></p>
    <div class="cab-toasts" aria-live="polite" data-toasts></div>`;

  const $ = <T extends HTMLElement>(sel: string) => host.querySelector(sel) as T;
  const screen = $(".cab-screen");
  const root = $("[data-root]");
  const overlay = $("[data-overlay]");
  const diffBox = $("[data-diff]");
  const action = $<HTMLButtonElement>("[data-action]");
  const pauseBtn = $<HTMLButtonElement>("[data-pause]");
  const restartBtn = $<HTMLButtonElement>("[data-restart]");
  const overlayRestart = $<HTMLButtonElement>("[data-orestart]");
  const scoreEl = $("[data-score]");
  const bestEl = $("[data-best]");
  const statusEl = $("[data-status]");
  const live = $("[data-live]");
  const toasts = $("[data-toasts]");

  for (const b of diffBox.querySelectorAll<HTMLButtonElement>("[data-d]")) {
    b.addEventListener("click", () => {
      difficulty = b.dataset.d as Difficulty;
      for (const x of diffBox.querySelectorAll("[data-d]")) x.setAttribute("aria-checked", String(x === b));
      try {
        localStorage.setItem(DIFF_KEY, difficulty);
      } catch {
        /* storage unavailable */
      }
    });
  }

  const showOverlay = (title: string, msg: string, label: string, withDifficulty: boolean) => {
    $("[data-otitle]").textContent = title;
    $("[data-omsg]").textContent = msg;
    action.textContent = label;
    diffBox.hidden = !withDifficulty;
    overlay.hidden = false;
    pauseBtn.hidden = true;
    restartBtn.hidden = true;
    overlayRestart.hidden = true;
    action.focus({ preventScroll: true });
  };

  if (!webglAvailable()) {
    showOverlay(meta.title[lang], c.noWebgl, c.start, false);
    action.hidden = true;
    return () => {};
  }

  let game: GameInstance;
  let phase: "idle" | "playing" | "paused" | "ended" = "idle";
  let score = 0;
  const toast = (a: Achievement) => {
    const el = document.createElement("div");
    el.className = "cab-toast";
    const k = document.createElement("span");
    k.className = "cab-k";
    k.textContent = c.unlocked;
    const b = document.createElement("b");
    b.textContent = a.title[lang];
    const d = document.createElement("span");
    d.textContent = a.description[lang];
    el.append(k, b, d);
    toasts.appendChild(el);
    setTimeout(() => el.remove(), 5200);
  };
  const commit = () => {
    for (const a of evaluate(
      state,
      ACHIEVEMENTS,
      GAMES.map((g) => g.slug),
    ))
      toast(a);
    save(state);
  };
  const end = (won: boolean, final: number) => {
    if (phase === "ended") return;
    phase = "ended";
    const { newBest } = recordEnd(state, meta.slug, final, won);
    commit();
    if (newBest) bestEl.textContent = fmt(final, lang);
    const msg = `${c.score}: ${fmt(final, lang)}${newBest ? ` · ${c.newBest}` : ""}`;
    live.textContent = `${won ? c.win : c.over}. ${msg}`;
    host.dataset.end = won ? "win" : "over";
    showOverlay(won ? c.win : c.over, msg, c.restart, true);
  };
  const emit = (e: GameEvent) => {
    switch (e.type) {
      case "score":
        score = e.value;
        scoreEl.textContent = fmt(score, lang);
        break;
      case "status":
        statusEl.textContent = e.text;
        break;
      case "stat":
        recordStat(state, meta.slug, e.key, e.inc);
        commit();
        break;
      case "gameover":
        end(false, e.score);
        break;
      case "win":
        end(true, e.score);
        break;
    }
  };

  try {
    const mod = await meta.load();
    game = mod.default.mount(root, {
      lang,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      palette: () => NEON,
      emit,
    });
  } catch (err) {
    console.error(err);
    showOverlay(meta.title[lang], c.loadError, c.start, false);
    action.hidden = true;
    return () => {};
  }

  const start = () => {
    overlay.hidden = true;
    pauseBtn.hidden = false;
    restartBtn.hidden = false;
    statusEl.textContent = "";
    delete host.dataset.end;
    emit({ type: "score", value: 0 });
    recordStart(state, meta.slug);
    commit();
    phase = "playing";
    game.start(difficulty);
    screen.focus({ preventScroll: true });
  };
  const pause = () => {
    if (phase !== "playing") return;
    phase = "paused";
    game.pause();
    showOverlay(c.paused, `${c.score}: ${fmt(score, lang)}`, c.resume, false);
    overlayRestart.hidden = false;
  };
  const resume = () => {
    overlay.hidden = true;
    pauseBtn.hidden = false;
    restartBtn.hidden = false;
    phase = "playing";
    game.resume();
    screen.focus({ preventScroll: true });
  };
  action.addEventListener("click", () => (phase === "paused" ? resume() : start()));
  pauseBtn.addEventListener("click", pause);
  // Restart mid-run: the current run counts as abandoned (no loss recorded), then a fresh start.
  const restart = () => {
    if (phase === "paused") game.resume();
    start();
  };
  restartBtn.addEventListener("click", restart);
  overlayRestart.addEventListener("click", restart);
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === "r" || e.key === "R") && e.shiftKey && (phase === "playing" || phase === "paused")) {
      e.preventDefault();
      restart();
      return;
    }
    if (e.key === "Escape" || e.key === "p" || e.key === "P") {
      if (phase === "playing") pause();
      else if (phase === "paused") resume();
    }
  };
  screen.addEventListener("keydown", onKey);
  const onVis = () => {
    if (document.hidden) pause();
  };
  document.addEventListener("visibilitychange", onVis);
  window.addEventListener("blur", pause);
  const offTheme = onThemeChange(() => game.onThemeChange?.());

  return () => {
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("blur", pause);
    offTheme();
    game.destroy();
  };
}
