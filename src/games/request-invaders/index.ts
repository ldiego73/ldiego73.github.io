import { heldKeys } from "../core/input";
import { ARCADE_FONT, HUD_FONT, NEON, type NeonRole } from "../core/neon";
import type { Difficulty, GameModule } from "../core/types";
import { createState, ENTER_T, type FormationName, type Input, type PowerKind, type State, step } from "./state";
import { View } from "./view";

const COPY = {
  es: {
    wave: "Oleada",
    lives: "Vidas",
    left: "Mover a la izquierda",
    right: "Mover a la derecha",
    fire: "Disparar",
    go: "¡YA!",
    boss: "DDoS Mothership",
    bossSub: "Ataque distribuido entrante",
    phase: "Fase",
    down: "API caída",
    cleared: "Mitigado",
    form: { grid: "Formación: grid", v: "Formación: V", ring: "Entrada en espiral" } as Record<FormationName, string>,
    power: { spread: "Regla mejorada", cache: "Caché CDN", slow: "Rate limit" } as Record<PowerKind, string>,
    blocked: "Bloqueado por CDN",
    legend: ["GET /wp-admin", "POST ' OR 1=1", "XSS <script>", "Botnet"],
  },
  en: {
    wave: "Wave",
    lives: "Lives",
    left: "Move left",
    right: "Move right",
    fire: "Fire",
    go: "GO!",
    boss: "DDoS Mothership",
    bossSub: "Distributed attack incoming",
    phase: "Phase",
    down: "API down",
    cleared: "Mitigated",
    form: { grid: "Formation: grid", v: "Formation: V", ring: "Spiral entry" } as Record<FormationName, string>,
    power: { spread: "Rule upgrade", cache: "CDN cache", slow: "Rate limit" } as Record<PowerKind, string>,
    blocked: "Blocked by CDN",
    legend: ["GET /wp-admin", "POST ' OR 1=1", "XSS <script>", "Botnet"],
  },
};
const KIND_ROLE: NeonRole[] = ["red", "magenta", "amber", "violet"];
const POINTS = [20, 40, 30, 10];
const GUTTER = 64;
const div = (css: string, parent: HTMLElement) => {
  const d = document.createElement("div");
  d.setAttribute("aria-hidden", "true");
  d.style.cssText = `position:absolute;pointer-events:none;z-index:1;${css}`;
  parent.appendChild(d);
  return d;
};

const mod: GameModule = {
  mount(el, ctx) {
    const t = COPY[ctx.lang];
    const coarse = matchMedia("(pointer: coarse)").matches;
    if (getComputedStyle(el).position === "static") el.style.position = "relative";
    const view = new View(el, ctx.reducedMotion, coarse ? GUTTER : 0);

    // Legend (wide screens only): method chips with points.
    const legend = div(
      `left:10px;top:10px;display:flex;flex-wrap:wrap;gap:6px;max-width:60%;font:600 10px/1 ${HUD_FONT};color:${NEON.dim}`,
      el,
    );
    t.legend.forEach((label, k) => {
      const s = document.createElement("span");
      s.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:4px 7px;border:1px solid ${NEON.grid};border-radius:0;background:${NEON.void}cc`;
      s.innerHTML = `<i style="width:7px;height:7px;background:${NEON[KIND_ROLE[k]]}"></i>`;
      s.append(`${label} · ${POINTS[k]}`);
      legend.appendChild(s);
    });

    const banner = div(`left:0;right:0;top:34%;text-align:center;opacity:0;transition:opacity .2s`, el);
    const bTitle = document.createElement("div");
    bTitle.style.cssText = `font:800 clamp(1.8rem,7vw,3.6rem)/1 ${ARCADE_FONT};font-stretch:80%;letter-spacing:.06em;text-transform:uppercase;color:${NEON.ink}`;
    const bSub = document.createElement("div");
    bSub.style.cssText = `margin-top:8px;font:600 clamp(.7rem,2.2vw,.9rem)/1.2 ${HUD_FONT};letter-spacing:.12em;text-transform:uppercase`;
    banner.append(bTitle, bSub);

    const bossBar = div(
      `left:50%;top:10px;width:min(46%,340px);transform:translateX(-50%);display:none;font:700 10px/1 ${HUD_FONT};letter-spacing:.14em;text-transform:uppercase;color:${NEON.magenta};text-align:center`,
      el,
    );
    const bossName = document.createElement("div");
    const track = document.createElement("div");
    track.style.cssText = `margin-top:5px;height:10px;display:grid;grid-template-columns:repeat(20,1fr);gap:2px;padding:2px;border:2px solid ${NEON.grid};background:${NEON.void}`;
    const hpBlocks = Array.from({ length: 20 }, () => {
      const block = document.createElement("span");
      block.style.background = NEON.magenta;
      track.appendChild(block);
      return block;
    });
    bossBar.append(bossName, track);

    const powerHud = div(
      `right:10px;top:10px;display:flex;flex-direction:column;align-items:flex-end;gap:5px;font:700 10px/1 ${HUD_FONT};letter-spacing:.1em;text-transform:uppercase`,
      el,
    );

    const pops = Array.from({ length: 10 }, () => {
      const p = div(
        `left:0;top:0;font:800 15px/1 ${ARCADE_FONT};white-space:nowrap;opacity:0;will-change:transform`,
        el,
      );
      return { el: p, life: 0, x: 0, y: 0 };
    });
    let popI = 0;
    const pop = (x: number, y: number, text: string, role: NeonRole) => {
      const p = pops[popI++ % pops.length];
      const s = view.project(x, y);
      p.el.textContent = text;
      p.el.style.color = NEON[role];
      p.el.style.textShadow = "none";
      p.life = 0.9;
      p.x = s.x;
      p.y = s.y;
    };

    // Touch controls inside the screen: ◀ ▶ bottom-left, fire bottom-right.
    const touch = { left: false, right: false, fire: false };
    const cleanups: Array<() => void> = [];
    if (coarse) {
      const mk = (key: keyof typeof touch, label: string, glyph: string, pos: string, wide = false) => {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", label);
        b.textContent = glyph;
        const role: NeonRole = "cyan";
        b.style.cssText = `position:absolute;bottom:8px;${pos};z-index:1;width:${wide ? 82 : 54}px;height:50px;border-radius:0;border:3px solid ${NEON.grid};background:${NEON.floor};color:${NEON[role]};font:800 ${wide ? 14 : 20}px/1 ${ARCADE_FONT};letter-spacing:.08em;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent`;
        const on = (e: PointerEvent) => {
          e.preventDefault();
          b.setPointerCapture?.(e.pointerId);
          touch[key] = true;
          b.style.background = NEON.grid;
        };
        const off = () => {
          touch[key] = false;
          b.style.background = NEON.floor;
        };
        b.addEventListener("pointerdown", on);
        b.addEventListener("pointerup", off);
        b.addEventListener("pointercancel", off);
        b.addEventListener("lostpointercapture", off);
        b.addEventListener("contextmenu", (e) => e.preventDefault());
        el.appendChild(b);
        cleanups.push(() => b.remove());
      };
      mk("left", t.left, "◀", "left:8px");
      mk("right", t.right, "▶", "left:70px");
      mk("fire", t.fire, ctx.lang === "es" ? "FUEGO" : "FIRE", "right:8px", true);
    }

    const keyTarget = (el.closest(".cab-screen") as HTMLElement | null) ?? el;
    const keys = heldKeys(keyTarget);

    const idle: Input = { left: false, right: false, fire: false };
    const attract = (): State => {
      const s = createState("normal");
      for (const e of s.enemies) e.t = ENTER_T;
      step(s, 0, idle);
      s.events.length = 0;
      return s;
    };
    let s = attract();
    let running = false;
    let beat = -1; // game-over beat countdown (s), -1 when inactive
    let stop = 0; // hit-stop
    let msg = { title: "", sub: "", role: "cyan" as NeonRole, life: 0 };
    let lastStatus = "";
    let lastBanner = "";
    let lastPower = "";

    const status = () => {
      const tension = Math.min(1, 0.2 + 0.08 * (s.wave - 1) + (s.boss ? 0.25 : 0));
      ctx.emit({ type: "intensity", value: tension });
      const text = `${t.wave} ${s.wave} · ${t.lives} ${s.lives}`;
      if (text !== lastStatus) ctx.emit({ type: "status", text });
      lastStatus = text;
    };
    const flash = (title: string, sub: string, role: NeonRole, life = 1.1) => {
      msg = { title, sub, role, life };
    };
    const hitStop = (d: number) => {
      if (!ctx.reducedMotion) stop = Math.max(stop, d);
    };

    const handle = () => {
      for (const e of s.events) {
        switch (e.t) {
          case "kill":
            view.burst(e.x, e.y, KIND_ROLE[e.kind], e.points ? 18 : 10);
            if (e.points) {
              pop(e.x, e.y, `+${e.points}`, "lime");
              view.pulse(0.15);
              hitStop(0.04);
            }
            break;
          case "saucer":
            view.burst(e.x, e.y, "amber", 36, 13);
            view.shockwave(e.x, e.y);
            view.pulse(0.6);
            pop(e.x, e.y, `0-DAY +${e.bonus}`, "amber");
            hitStop(0.07);
            break;
          case "shield":
            view.burst(e.x, e.y, "grid", e.dead ? 6 : 3, 5);
            break;
          case "playerHit":
            view.burst(s.px, -12.4, "cyan", 40, 14);
            view.shockwave(s.px, -12.4);
            view.coreHit();
            view.pulse(0.7, 1.1);
            hitStop(0.08);
            break;
          case "cacheBlock":
            view.burst(s.px, -12, "cyan", 24, 10);
            view.shockwave(s.px, -12.4);
            pop(s.px, -10.5, t.blocked, "cyan");
            break;
          case "leak":
            view.burst(e.x, -14.5, "red", 24, 10);
            view.coreHit();
            view.pulse(0.4, 0.7);
            break;
          case "power":
            view.burst(e.x, e.y, "lime", 22, 9);
            view.pulse(0.3);
            pop(e.x, e.y + 1, t.power[e.kind], "lime");
            break;
          case "bossHit":
            view.bossHit();
            view.burst(e.x + (Math.random() - 0.5) * 6, e.y - 1, "magenta", 6, 7);
            break;
          case "bossPhase":
            view.pulse(0.9, 0.6);
            view.shockwave(s.boss?.x ?? 0, s.boss?.y ?? 9);
            flash(`${t.phase} ${e.phase}`, t.boss, e.phase === 3 ? "red" : "amber");
            hitStop(0.08);
            break;
          case "bossDown":
            view.burst(e.x, e.y, "magenta", 90, 18);
            view.burst(e.x, e.y, "amber", 40, 12);
            view.shockwave(e.x, e.y);
            view.pulse(1.6, 1.2);
            pop(e.x, e.y, `+${e.points}`, "lime");
            hitStop(0.14);
            break;
          case "waveClear":
            ctx.emit({ type: "stat", key: "waves", inc: 1 });
            view.pulse(0.4);
            break;
          case "gameover":
            beat = 1.4;
            view.burst(s.px, -13, "red", 70, 16);
            view.burst(0, -15, "cyan", 40, 12);
            view.shockwave(s.px, -13);
            view.coreHit();
            view.pulse(1.4, 1.4);
            break;
        }
      }
      s.events.length = 0;
    };

    const setBanner = (title: string, sub: string, role: NeonRole) => {
      const key = `${title}|${sub}|${role}`;
      if (key === lastBanner) return;
      lastBanner = key;
      banner.style.opacity = title ? "1" : "0";
      if (!title) return;
      bTitle.textContent = title;
      bTitle.style.color = NEON[role];
      bSub.textContent = sub;
      bSub.style.color = NEON[role];
    };

    const hud = (dt: number) => {
      // Banner: countdown, wave intro, transient flash, game over.
      msg.life -= dt;
      if (beat >= 0 || (s.over && running)) setBanner(t.down, "", "red");
      else if (!running) setBanner("", "", "cyan");
      else if (s.hold > 0 && s.wave === 1 && s.time < 3) {
        const n = Math.ceil((s.hold - 0.6) / 0.6);
        setBanner(n > 0 ? String(n) : t.go, `${t.wave} 1 · ${t.form.grid}`, n > 0 ? "cyan" : "lime");
      } else if (s.hold > 0) {
        if (s.boss) setBanner(t.boss, `⚠ ${t.bossSub}`, "magenta");
        else setBanner(`${t.wave} ${s.wave}`, `${t.cleared} · ${s.formation ? t.form[s.formation] : ""}`, "cyan");
      } else if (msg.life > 0) setBanner(msg.title, msg.sub, msg.role);
      else setBanner("", "", "cyan");

      const b = s.boss;
      bossBar.style.display = b && running ? "block" : "none";
      legend.style.display = el.clientWidth >= 620 && !b ? "flex" : "none";
      if (b) {
        bossName.textContent = `${t.boss} · ${t.phase} ${b.phase}`;
        hpBlocks.forEach((block, i) => {
          block.style.background = i < Math.ceil((20 * b.hp) / b.max) ? NEON.magenta : NEON.floor;
        });
      }
      const chips: string[] = [];
      if (running) {
        if (s.spread > 0) chips.push(`${t.power.spread} ${Math.ceil(s.spread)}s`);
        if (s.slow > 0) chips.push(`${t.power.slow} ${Math.ceil(s.slow)}s`);
        if (s.cache) chips.push(t.power.cache);
      }
      const key = chips.join("|");
      if (key !== lastPower) {
        lastPower = key;
        powerHud.replaceChildren(
          ...chips.map((c) => {
            const d = document.createElement("span");
            d.style.cssText = `padding:4px 7px;border:1px solid ${NEON.lime};border-radius:0;color:${NEON.lime};background:${NEON.void}cc`;
            d.textContent = c;
            return d;
          }),
        );
      }
      for (const p of pops) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const k = Math.max(0, p.life / 0.9);
        p.el.style.opacity = String(Math.min(1, k * 2));
        p.el.style.transform = `translate(calc(${p.x}px - 50%), ${p.y - 18 - (ctx.reducedMotion ? 0 : (1 - k) * 20)}px)`;
      }
    };

    view.draw(s, 0, 0.8);
    view.stage.render();

    const frame = (dt: number, time: number) => {
      if (beat >= 0) {
        beat -= dt;
        if (beat < 0) {
          beat = -1;
          running = false;
          ctx.emit({ type: "gameover", score: s.score });
        }
      } else if (running && !s.over) {
        if (stop > 0) stop -= dt;
        else {
          const input: Input = {
            left: touch.left || keys.has("ArrowLeft") || keys.has("a"),
            right: touch.right || keys.has("ArrowRight") || keys.has("d"),
            fire: touch.fire || keys.has(" ") || keys.has("ArrowUp") || keys.has("w"),
          };
          const before = s.score;
          step(s, dt, input);
          handle();
          if (s.score !== before) ctx.emit({ type: "score", value: s.score });
          status();
        }
      }
      hud(dt);
      view.draw(s, dt, time);
    };

    return {
      start(difficulty: Difficulty) {
        s = createState(difficulty);
        s.events.length = 0;
        lastStatus = "";
        beat = -1;
        stop = 0;
        msg.life = 0;
        running = true;
        ctx.emit({ type: "score", value: 0 });
        status();
        view.stage.loop(frame);
      },
      pause() {
        view.stage.pause();
      },
      resume() {
        view.stage.resume();
      },
      destroy() {
        running = false;
        keys.dispose();
        for (const c of cleanups) c();
        view.dispose();
        el.replaceChildren();
      },
    };
  },
};

export default mod;
