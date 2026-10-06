import { getMusic } from "../../audio";
import { ARCADE_TRACKS } from "../../audio/tracks/arcade";
import { ACHIEVEMENTS, GAMES } from "../registry";
import { mountAudioControl } from "./audio-control";
import { createIntensity } from "./intensity";
import { NEON } from "./neon";
import { onThemeChange } from "./palette";
import { activeSkin, evaluate, load, recordEnd, recordStart, recordStat, save } from "./store";
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
  // Reward skin (world passport complete): aguayo-woven trim and a khipu marquee. CSS-only.
  host.dataset.skin = activeSkin(state);
  host.innerHTML = `
    <div class="cab-marquee"><span>${meta.marquee}</span><i class="cab-khipu" aria-hidden="true"></i></div>
    <div class="cab-hud">
      <span class="cab-stat"><span class="cab-k">${c.score}</span> <b data-score>0</b></span>
      <span class="cab-stat"><span class="cab-k">${c.best}</span> <b data-best>${fmt(best0, lang)}</b></span>
      <span class="cab-status" data-status></span>
      <span class="cab-audio" data-audio></span>
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
  mountAudioControl($("[data-audio]"));

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

  // ---- music: tied to the play session (see docs in report). Every audio call is best-effort.
  const music = getMusic();
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch {
      /* audio is never allowed to break a game */
    }
  };
  const meter = createIntensity(difficulty);
  let pushState: "none" | "pending" | "pushed" = "none";
  let destroyed = false;
  let musicTimer = 0;
  let lastTick = 0;
  const startMusic = () => {
    if (pushState !== "none") return;
    const track = ARCADE_TRACKS[meta.slug];
    if (!track) return;
    pushState = "pending";
    // unlock() is called synchronously so it still counts as inside the click/key gesture.
    let unlocked: Promise<void> = Promise.resolve();
    try {
      unlocked = music.unlock();
    } catch {
      /* unavailable */
    }
    unlocked
      .catch(() => {})
      .then(() => {
        if (destroyed) return;
        safe(() => music.push(track, { intensity: meter.value }));
        pushState = "pushed";
      });
  };
  const musicLevel = () => safe(() => music.setIntensity(meter.value));
  const musicTick = () => {
    const now = performance.now();
    if (phase === "playing") {
      meter.tick((now - lastTick) / 1000);
      musicLevel();
    }
    lastTick = now;
  };
  const musicReset = () => {
    meter.reset(difficulty);
    lastTick = performance.now();
    safe(() => music.duck(1, 200));
    musicLevel();
    window.clearInterval(musicTimer);
    musicTimer = window.setInterval(musicTick, 250);
  };

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
    window.clearInterval(musicTimer);
    safe(() => {
      music.stinger(won ? "win" : "gameover");
      music.setIntensity(0.1);
      music.duck(0.4, 400);
    });
    showOverlay(won ? c.win : c.over, msg, c.restart, true);
  };
  const emit = (e: GameEvent) => {
    switch (e.type) {
      case "intensity":
        meter.game(e.value);
        break;
      case "score":
        score = e.value;
        meter.score(e.value);
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
    // The Play button exists before the game module has loaded; keep it inert until its handler is attached.
    action.disabled = true;
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
    startMusic();
    overlay.hidden = true;
    pauseBtn.hidden = false;
    restartBtn.hidden = false;
    statusEl.textContent = "";
    delete host.dataset.end;
    emit({ type: "score", value: 0 });
    recordStart(state, meta.slug);
    commit();
    phase = "playing";
    musicReset();
    game.start(difficulty);
    screen.focus({ preventScroll: true });
  };
  const pause = () => {
    if (phase !== "playing") return;
    phase = "paused";
    safe(() => music.pause());
    game.pause();
    showOverlay(c.paused, `${c.score}: ${fmt(score, lang)}`, c.resume, false);
    overlayRestart.hidden = false;
  };
  const resume = () => {
    overlay.hidden = true;
    pauseBtn.hidden = false;
    restartBtn.hidden = false;
    phase = "playing";
    lastTick = performance.now();
    safe(() => music.resume());
    game.resume();
    screen.focus({ preventScroll: true });
  };
  action.disabled = false;
  action.addEventListener("click", () => (phase === "paused" ? resume() : start()));
  pauseBtn.addEventListener("click", pause);
  // Restart mid-run: the current run counts as abandoned (no loss recorded), then a fresh start.
  const restart = () => {
    if (phase === "paused") {
      safe(() => music.resume());
      game.resume();
    }
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
    destroyed = true;
    window.clearInterval(musicTimer);
    if (pushState === "pushed") {
      // Leave nothing behind: unfreeze, un-duck, then hand the music back to whoever was playing.
      safe(() => {
        music.resume();
        music.duck(1, 0);
        music.pop();
      });
    }
    document.removeEventListener("visibilitychange", onVis);
    window.removeEventListener("blur", pause);
    offTheme();
    game.destroy();
  };
}
