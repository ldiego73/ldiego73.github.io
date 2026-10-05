import { heldKeys } from "../core/input";
import { ARCADE_FONT, HUD_FONT } from "../core/neon";
import { createStage } from "../core/stage";
import type { Difficulty, GameModule } from "../core/types";
import { BOSS_LEVEL, createState, type PowerKind, STEP, type State, step } from "./state";
import { createView, POWER_COLOR } from "./view";

const COPY = {
  es: {
    levels: [
      "Monolito en capas",
      "Pirámide del destino",
      "Fortaleza legacy",
      "Torres fragmentadas",
      "Núcleo espagueti",
      "Big Ball of Mud",
    ],
    level: "Nivel",
    lives: "Vidas",
    core: "Core",
    go: "¡Deploy!",
    hint: "Arrastra para mover · toca para lanzar",
    clear: "Monolito roto",
    power: {
      wide: ["Autoscale", "Gateway más ancho"],
      multi: ["Retry", "Más pelotas"],
      slow: ["Circuit breaker", "Pelota más lenta"],
      pierce: ["Strangler Fig", "La pelota atraviesa bloques"],
      debt: ["Tech debt", "Gateway reducido"],
    },
  },
  en: {
    levels: [
      "Layered monolith",
      "Pyramid of doom",
      "Legacy fortress",
      "Sharded towers",
      "Spaghetti core",
      "Big Ball of Mud",
    ],
    level: "Level",
    lives: "Lives",
    core: "Core",
    go: "Deploy!",
    hint: "Drag to move · tap to launch",
    clear: "Monolith broken",
    power: {
      wide: ["Autoscale", "Wider gateway"],
      multi: ["Retry", "Extra balls"],
      slow: ["Circuit breaker", "Slower ball"],
      pierce: ["Strangler Fig", "Ball pierces blocks"],
      debt: ["Tech debt", "Gateway shrinks"],
    },
  },
} as const;

const css = (el: HTMLElement, s: string) => {
  el.style.cssText = s;
  return el;
};
const div = (parent: HTMLElement, s: string) => parent.appendChild(css(document.createElement("div"), s));

const mod: GameModule = {
  mount(el, ctx) {
    const c = COPY[ctx.lang];
    const rm = ctx.reducedMotion;
    const NEON = ctx.palette();
    const stage = createStage(el, { camera: "persp", fov: 38, bloom: false });
    const view = createView(stage, rm, NEON);
    const screen = (el.closest(".cab-screen") as HTMLElement | null) ?? el;
    const keys = heldKeys(screen);
    if (getComputedStyle(el).position === "static") el.style.position = "relative";

    // DOM layer over the canvas: banner (countdown, level cards, power names), score pops, touch hint.
    const layer = div(el, "position:absolute;inset:0;pointer-events:none;overflow:hidden");
    const banner = div(
      layer,
      `position:absolute;left:0;right:0;top:34%;text-align:center;font-family:${ARCADE_FONT};opacity:0;transition:opacity .2s ease-out`,
    );
    const big = div(banner, "font-weight:800;font-size:clamp(1.6rem,6vw,3.4rem);letter-spacing:.06em;line-height:1");
    const small = div(
      banner,
      `margin-top:.4em;font-family:${HUD_FONT};font-size:clamp(.7rem,2.2vw,.95rem);color:${NEON.ink}`,
    );
    const coarse = matchMedia("(pointer: coarse)").matches;
    const hint = div(
      layer,
      `position:absolute;left:6%;right:6%;bottom:3%;padding:.55em;border:2px solid ${NEON.grid};border-radius:0;text-align:center;font:600 .72rem ${HUD_FONT};color:${NEON.cyan};background:${NEON.void};display:${coarse ? "block" : "none"};transition:opacity .4s`,
    );
    hint.textContent = c.hint;

    let bannerT = 0;
    const show = (text: string, sub: string, color: string, t = 1.4) => {
      big.textContent = text;
      big.style.color = color;
      small.textContent = sub;
      banner.style.opacity = "1";
      bannerT = t;
    };
    const pops: { el: HTMLElement; age: number }[] = [];
    const pop = (x: number, y: number, text: string, color: string = NEON.lime) => {
      if (pops.length > 14) pops.shift()?.el.remove();
      const p = view.project(x, y);
      const d = div(
        layer,
        `position:absolute;left:${p.x}px;top:${p.y}px;transform:translate(-50%,-50%);font:800 clamp(.8rem,2.4vw,1.1rem) ${ARCADE_FONT};color:${color}`,
      );
      d.textContent = text;
      pops.push({ el: d, age: 0 });
    };

    let s: State = createState("normal");
    view.reset(s);
    view.frame(s, 1);
    stage.render();

    let started = false;
    let launch = false;
    let target: number | null = null;
    let acc = 0;
    let count = 0; // start countdown seconds left
    let stop = 0; // hit-stop seconds left
    let endT = -1;
    let ended = false;
    let lastScore = -1;
    let lastStatus = "";

    const status = () => {
      const fx = [s.wideT > 0 && "▲", s.slowT > 0 && "⏱", s.pierceT > 0 && "⟫", s.debtT > 0 && "▼"]
        .filter(Boolean)
        .join(" ");
      const core = s.boss ? ` · ${c.core} ${Math.max(0, s.boss.hp)}/${s.boss.maxHp}` : "";
      const t = `${c.lives} ${s.lives} · ${c.level} ${s.level + 1}${core}${fx ? ` · ${fx}` : ""}`;
      if (t !== lastStatus) {
        lastStatus = t;
        ctx.emit({ type: "status", text: t });
      }
    };
    const levelCard = () =>
      show(
        s.level === BOSS_LEVEL ? c.levels[s.level].toUpperCase() : `${c.level} ${s.level + 1}`,
        s.level === BOSS_LEVEL ? `${c.core} ×${s.boss?.maxHp}` : c.levels[s.level],
        s.level === BOSS_LEVEL ? NEON.red : NEON.ink,
        1.8,
      );

    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter" || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        if (e.key === " ") e.preventDefault();
        launch = true;
      }
    };
    const track = (e: PointerEvent) => {
      if (!started || (e.pointerType !== "mouse" && e.buttons === 0)) return;
      target = view.pointerX(e.clientX, e.clientY);
    };
    const down = (e: PointerEvent) => {
      if (!started) return;
      target = view.pointerX(e.clientX, e.clientY);
      launch = true;
      hint.style.opacity = "0";
    };
    screen.addEventListener("keydown", onKey);
    stage.canvas.addEventListener("pointermove", track);
    stage.canvas.addEventListener("pointerdown", down);

    const handle = (s: State) => {
      for (const ev of s.events) {
        switch (ev.t) {
          case "break": {
            const b = ev.brick;
            view.onBreak(b);
            pop(b.x, b.y, `+${10 * b.maxHp + (b.label ? 15 : 0)}`, b.label ? NEON.ink : NEON.lime);
            if (b.maxHp > 1 && !rm) stop = 0.05;
            break;
          }
          case "hit":
            view.onHit(ev.brick);
            break;
          case "shed":
            view.onShed(ev.brick, s);
            break;
          case "boss":
            view.onBoss(s);
            pop(s.boss!.x, s.boss!.y, "+50", NEON.lime);
            if (!rm) stop = ev.hp <= 0 ? 0.12 : 0.07;
            break;
          case "paddle":
            view.onPaddle();
            break;
          case "power": {
            const [name, sub] = c.power[ev.kind as PowerKind];
            view.onPower(ev.kind, s.paddleX);
            show(name, sub, POWER_COLOR[ev.kind], 1.2);
            break;
          }
          case "life":
            view.onLife();
            break;
          case "level":
            view.onLevel();
            ctx.emit({ type: "stat", key: "levels", inc: 1 });
            if (s.phase === "play") levelCard();
            break;
          case "over":
          case "win":
            ended = true;
            if (ev.t === "win") show(c.clear, "", NEON.lime, 3);
            break;
        }
      }
      s.events.length = 0;
    };

    const tick = (dt: number) => {
      if (count > 0) {
        const prev = Math.ceil(count / 0.55);
        count -= dt;
        const n = Math.ceil(count / 0.55);
        if (count <= 0) show(c.go, c.levels[0], NEON.cyan, 0.7);
        else if (n !== prev) show(String(n), "", NEON.lime, 0.6);
      } else if (stop > 0) stop -= dt;
      else if (s.phase === "play") {
        acc = Math.min(acc + dt, 0.25);
        while (acc >= STEP && s.phase === "play") {
          acc -= STEP;
          const move =
            (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
          if (move !== 0) target = null;
          const prevLevel = s.level;
          step(s, { move, target, launch });
          launch = false;
          if (s.level !== prevLevel) view.setLevel(s);
          handle(s);
          if (stop > 0) break;
        }
        if (s.score !== lastScore) {
          lastScore = s.score;
          ctx.emit({ type: "score", value: s.score });
        }
        status();
      }
      view.frame(s, dt);
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i];
        p.age += dt;
        p.el.style.opacity = String(Math.max(0, 1 - p.age / 0.85));
        if (!rm) p.el.style.transform = `translate(-50%,-${50 + p.age * 130}%)`;
        if (p.age >= 0.85) {
          p.el.remove();
          pops.splice(i, 1);
        }
      }
      if (bannerT > 0) {
        bannerT -= dt;
        if (bannerT <= 0) banner.style.opacity = "0";
      }
      // Ending beat: let the last burst land, then hand the result to the shell and idle the GPU.
      if (ended) {
        endT += dt;
        if (endT > 0.9 && endT - dt <= 0.9) {
          if (s.phase === "win") ctx.emit({ type: "win", score: s.score });
          else ctx.emit({ type: "gameover", score: s.score });
        }
        if (endT > 2.4) stage.pause();
      }
    };

    return {
      start(difficulty: Difficulty) {
        s = createState(difficulty);
        view.reset(s);
        started = true;
        ended = false;
        acc = 0;
        stop = 0;
        endT = 0;
        count = rm ? 0.01 : 1.65;
        for (const p of pops) p.el.remove();
        pops.length = 0;
        lastScore = 0;
        ctx.emit({ type: "score", value: 0 });
        lastStatus = "";
        target = null;
        launch = false;
        if (rm) show(c.go, c.levels[0], NEON.cyan, 1);
        else show("3", "", NEON.lime, 0.6);
        hint.style.opacity = "1";
        status();
        stage.loop(tick);
      },
      pause() {
        stage.pause();
      },
      resume() {
        if (started && !(ended && endT > 2.4)) stage.resume();
      },
      destroy() {
        stage.pause();
        keys.dispose();
        screen.removeEventListener("keydown", onKey);
        stage.canvas.removeEventListener("pointermove", track);
        stage.canvas.removeEventListener("pointerdown", down);
        view.dispose();
        stage.dispose();
        layer.remove();
      },
    };
  },
};

export default mod;
