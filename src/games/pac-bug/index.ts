import { type Dir, onDirection } from "../core/input";
import { NEON } from "../core/neon";
import { createStage } from "../core/stage";
import type { GameModule } from "../core/types";
import { BONUS, newGame, posOf, setWant, step } from "./state";
import { BUG_HUES, createView, type ViewCopy } from "./view";

const COPY: Record<"es" | "en", ViewCopy & { lives: string; dpad: Record<Dir, string> }> = {
  es: {
    lives: "Vidas",
    level: "Nivel",
    ready: "LISTO",
    go: "¡YA!",
    clear: "LIMPIO",
    hotfix: "HOTFIX!",
    lock: "DEADLOCK!",
    bonus: { coffee: "CAFÉ", lgtm: "LGTM" },
    dpad: { up: "Arriba", down: "Abajo", left: "Izquierda", right: "Derecha" },
  },
  en: {
    lives: "Lives",
    level: "Level",
    ready: "READY",
    go: "GO!",
    clear: "CLEAR",
    hotfix: "HOTFIX!",
    lock: "DEADLOCK!",
    bonus: { coffee: "COFFEE", lgtm: "LGTM" },
    dpad: { up: "Up", down: "Down", left: "Left", right: "Right" },
  },
};
const ARROW: Record<Dir, string> = { up: "▲", down: "▼", left: "◀", right: "▶" };

const mod: GameModule = {
  mount(el, ctx) {
    const c = COPY[ctx.lang];
    const coarse = matchMedia("(pointer: coarse)").matches;
    const stage = createStage(el, { camera: "persp", bloom: false });
    const view = createView(stage, el, { reduced: ctx.reducedMotion, coarse, copy: c });
    let g = newGame();
    let live = false;
    let pending = 0;
    let flushT = 0;
    let time = 0;
    let hitstop = 0;

    view.sync(g, 0, 0, false);
    stage.render();

    const want = (d: Dir) => {
      if (live && (g.phase === "play" || g.phase === "ready")) setWant(g, d);
    };
    const screen = (el.closest(".cab-screen") as HTMLElement | null) ?? el;
    const offInput = onDirection(screen, want);

    // On-screen d-pad for touch screens.
    let pad: HTMLElement | null = null;
    if (coarse) {
      pad = document.createElement("div");
      pad.style.cssText =
        "position:absolute;z-index:1;right:16px;bottom:16px;width:152px;height:152px;display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:4px;touch-action:none";
      const area: Record<Dir, string> = { up: "1/2", left: "2/1", right: "2/3", down: "3/2" };
      for (const d of ["up", "left", "right", "down"] as Dir[]) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = ARROW[d];
        b.setAttribute("aria-label", c.dpad[d]);
        b.style.cssText = `grid-area:${area[d]};border-radius:0;border:3px solid ${NEON.void};background:${NEON.floor};color:${NEON.cyan};font-size:20px;box-shadow:inset 0 -4px 0 ${NEON.grid};touch-action:none;padding:0`;
        b.addEventListener("pointerdown", (e) => {
          e.stopPropagation();
          e.preventDefault();
          want(d);
        });
        pad.appendChild(b);
      }
      el.appendChild(pad);
      stage.onResize((w, h) => {
        if (!pad) return;
        const portrait = w / h < 1;
        pad.style.left = portrait ? "50%" : "auto";
        pad.style.right = portrait ? "auto" : "16px";
        pad.style.transform = portrait ? "translateX(-50%)" : "none";
        const s = Math.round(Math.min(160, portrait ? h * 0.24 : h * 0.3));
        pad.style.width = pad.style.height = `${s}px`;
        pad.style.bottom = portrait ? `${Math.max(8, h * 0.02)}px` : "16px";
      });
    }

    const status = () => ctx.emit({ type: "status", text: `${c.lives} ${g.lives} · ${c.level} ${g.level}` });
    const flush = () => {
      if (pending) ctx.emit({ type: "stat", key: "packets", inc: pending });
      pending = 0;
      flushT = 0;
    };

    const frame = (dt: number) => {
      time += dt;
      if (live) {
        if (hitstop > 0) hitstop -= dt;
        else step(g, dt);
        for (const e of g.events.splice(0)) {
          switch (e.type) {
            case "score":
              ctx.emit({ type: "score", value: e.value });
              break;
            case "packet":
              pending++;
              view.burst(e.x, e.y, "lime", 4, 1.6);
              break;
            case "hotfix":
              pending++;
              view.burst(e.x, e.y, "amber", 22, 3.5);
              view.popup(c.hotfix, e.x, e.y, "amber", true);
              view.pulse(0.8);
              break;
            case "eat":
              view.burst(e.x, e.y, BUG_HUES[e.id], 26, 4);
              view.popup(`+${e.points}`, e.x, e.y, "lime", true);
              view.pulse(0.7);
              if (!ctx.reducedMotion) hitstop = 0.07;
              break;
            case "bonus":
              view.popup(c.bonus[e.kind], BONUS.tile.x, BONUS.tile.y, "amber");
              break;
            case "bonusEat":
              view.burst(BONUS.tile.x, BONUS.tile.y, "amber", 20, 3);
              view.popup(`+${e.points}`, BONUS.tile.x, BONUS.tile.y, "amber", true);
              break;
            case "warp":
              view.burst(e.from, e.y, "cyan", 12, 2.5);
              view.burst(e.to, e.y, "lime", 12, 2.5);
              break;
            case "lock": {
              const p = posOf(g.player);
              view.popup(c.lock, p.x, p.y, "violet");
              view.shake(0.15);
              break;
            }
            case "die":
              view.shake(0.6);
              view.pulse(0.6);
              break;
            case "clear":
              view.pulse(1.2);
              break;
            case "lives":
              status();
              break;
            case "level":
              status();
              break;
            case "gameover":
            case "win":
              live = false;
              flush();
              ctx.emit(e);
              break;
          }
        }
        flushT += dt;
        if (flushT >= 1) flush();
      }
      view.sync(g, time, dt, live);
    };

    return {
      start(difficulty) {
        g = newGame(Math.random, { difficulty });
        live = true;
        pending = 0;
        flushT = 0;
        hitstop = 0;
        ctx.emit({ type: "score", value: 0 });
        status();
        stage.loop(frame);
      },
      pause() {
        flush();
        stage.pause();
      },
      resume() {
        stage.resume();
      },
      destroy() {
        flush();
        offInput();
        pad?.remove();
        view.dispose();
        stage.dispose();
      },
    };
  },
};

export default mod;
