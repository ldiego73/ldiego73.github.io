import { type Dir, onDirection } from "../core/input";
import { NEON } from "../core/neon";
import { createStage } from "../core/stage";
import type { Difficulty, GameContext, GameModule } from "../core/types";
import type { Cell, SnakeState, StepEvents } from "./state";
import { autopilot, BONUS_TTL, createState, interval, POWER_TTL, step, tick, turn } from "./state";
import { SnakeView, STONE } from "./view";

const DIE_TIME = 1.1;
const HIT_STOP = 0.08;
const DPAD = 144;
const YAW: Record<Dir, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
const ARROW: Record<Dir, string> = {
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  left: "M15 6l-6 6 6 6",
  right: "M9 6l6 6-6 6",
};

/** Grid size from the free screen area: wide desktop board, squarer or portrait boards on phones. */
function gridFor(w: number, h: number): [number, number] {
  const ar = w / h;
  return ar < 0.8 ? [12, 16] : ar < 1.2 ? [12, 13] : [20, 15];
}

const mod: GameModule = {
  mount(el: HTMLElement, ctx: GameContext) {
    const es = ctx.lang === "es";
    const stage = createStage(el, { camera: "persp", fov: 40, bloom: false });
    const view = new SnakeView(stage, ctx.reducedMotion);
    const rng = Math.random;
    const coarse = matchMedia("(pointer: coarse)").matches;
    let s: SnakeState;
    let phase: "attract" | "count" | "play" | "hitstop" | "dying" | "over" = "attract";
    let acc = 0;
    let timer = 0;
    let count = 0;
    let grid = "";
    let lastStatus = "";
    let bugYaw = 0;

    const pickGrid = () => gridFor(stage.size.w, Math.max(1, stage.size.h - (coarse ? DPAD : 0)));
    const reset = (d: Difficulty) => {
      const g = pickGrid();
      const key = `${g.join("x")}:${d}`;
      if (key !== grid) {
        grid = key;
        view.setBoard(g[0], g[1], d);
      }
      s = createState(g[0], g[1], d, rng);
      acc = 0;
    };

    const status = () => {
      if (phase === "attract") return;
      let text = `${es ? "Paquetes" : "Packets"} ${s.eaten}`;
      if (s.slow > 0) text += ` · CACHE ${Math.ceil(s.slow)}s`;
      if (text !== lastStatus) ctx.emit({ type: "status", text });
      lastStatus = text;
    };

    const onStep = (ev: StepEvents) => {
      const live = phase === "play";
      const pts = s.cfg.mul;
      if (ev.ate && ev.at) {
        if (ev.ate === "packet") {
          view.burst(ev.at, "lime", 16);
          if (live) view.popup(`+${10 * pts}`, ev.at, "lime");
        } else if (ev.ate === "bonus") {
          view.burst(ev.at, "amber", 32, 1.3);
          view.shake(0.12);
          if (live) view.popup(`+${50 * pts}`, ev.at, "amber", true);
        } else if (ev.ate === "bug") {
          view.burst(ev.at, "red", 26, 1.2);
          view.shake(0.1);
          if (live) view.popup(`BUG +${30 * pts}`, ev.at, "red", true);
        } else {
          const cache = ev.ate === "cache";
          view.burst(ev.at, "cyan", 24);
          if (live) view.popup(cache ? "CACHE" : "ZIP -3", ev.at, "cyan", true);
        }
        if (live) ctx.emit({ type: "score", value: s.score });
      }
      for (const c of ev.lost) {
        view.burst(c, ev.bitten ? "red" : "cyan", 5);
      }
      if (ev.bitten) {
        view.shake(0.25);
        view.flash();
        if (live) view.popup(`-${ev.lost.length}`, ev.lost[0] ?? s.body[0], "red", true);
      }
      if (ev.wall) view.burst(ev.wall, "red", 14, 0.8);
      if (ev.milestone30 && live) {
        ctx.emit({ type: "stat", key: "knots30", inc: 1 });
        view.banner("30!", "lime");
      }
    };

    const frame = (raw: number) => {
      const dt = Math.max(0, raw); // first rAF timestamp can precede the stage's resume clock
      if (phase === "attract" || phase === "play") {
        tick(s, dt);
        acc += dt;
        while (acc >= interval(s)) {
          acc -= interval(s);
          if (phase === "attract") turn(s, autopilot(s));
          const ev = step(s, rng);
          if (ev.died) {
            if (phase === "attract") {
              view.shatter(s.body);
              reset("normal");
            } else {
              phase = "hitstop";
              timer = ctx.reducedMotion ? 0 : HIT_STOP;
              acc = 0;
            }
            break;
          }
          onStep(ev);
        }
        status();
      } else if (phase === "count") {
        timer -= dt;
        if (timer <= 0) {
          count--;
          if (count > 0) {
            view.banner(String(count), "cyan");
            timer = 0.5;
          } else {
            view.banner("GO", "lime");
            phase = "play";
            acc = 0;
          }
        }
      } else if (phase === "hitstop") {
        timer -= dt;
        if (timer > 0) return; // freeze frame: skip render updates
        phase = "dying";
        timer = DIE_TIME;
        view.flash();
        view.shake(0.6);
        view.shatter(s.body);
      } else if (phase === "dying") {
        timer -= dt;
        if (timer <= 0) {
          phase = "over";
          timer = 1.5;
          ctx.emit({ type: "gameover", score: s.score });
        }
      } else if (phase === "over") {
        timer -= dt;
        if (timer <= 0) stage.pause();
      }
      render(phase === "play" || phase === "attract" ? Math.min(1, acc / interval(s)) : 1, dt);
    };

    const lerp = (p: Cell, q: Cell, a: number): Cell => {
      // Wrapped moves come in from just outside the opposite edge.
      const fx = Math.abs(q.x - p.x) > 1 ? q.x + Math.sign(q.x - p.x) : p.x;
      const fy = Math.abs(q.y - p.y) > 1 ? q.y + Math.sign(q.y - p.y) : p.y;
      return { x: fx + (q.x - fx) * a, y: fy + (q.y - fy) * a };
    };

    const render = (a: number, dt: number) => {
      const body = s.body.map((c, i) => lerp(s.prev[i] ?? c, c, a));
      let bug = null;
      if (s.bug) {
        const p = lerp(s.bug.from, s.bug, a);
        if (s.bug.from.x !== s.bug.x || s.bug.from.y !== s.bug.y)
          bugYaw = Math.atan2(s.bug.y - s.bug.from.y, s.bug.x - s.bug.from.x);
        bug = { ...p, yaw: bugYaw };
      }
      view.draw(
        {
          body,
          yaw: YAW[s.dir],
          showSnake: phase !== "dying" && phase !== "over",
          food: s.food,
          bonus: s.bonus ? { x: s.bonus.x, y: s.bonus.y, life: s.bonus.ttl / BONUS_TTL } : null,
          power: s.power ? { ...s.power, life: s.power.ttl / POWER_TTL } : null,
          walls: s.walls,
          bug,
          focus: body[0],
          slow: s.slow > 0,
        },
        dt,
      );
    };

    // Touch d-pad (coarse pointers only), drawn inside the screen.
    let dpad: HTMLDivElement | null = null;
    if (coarse) {
      dpad = document.createElement("div");
      dpad.style.cssText = `position:absolute;left:50%;bottom:8px;width:${DPAD - 12}px;height:${DPAD - 12}px;transform:translateX(-50%);display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);gap:4px;pointer-events:auto;touch-action:none`;
      const at: Record<Dir, string> = { up: "1/2", left: "2/1", right: "2/3", down: "3/2" };
      for (const d of Object.keys(at) as Dir[]) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("aria-label", es ? { up: "Arriba", down: "Abajo", left: "Izquierda", right: "Derecha" }[d] : d);
        b.style.cssText = `grid-area:${at[d].split("/")[0]}/${at[d].split("/")[1]};border:3px solid ${STONE};border-radius:0;background:${NEON.cyan};display:grid;place-items:center;padding:0;box-shadow:inset 0 -4px 0 ${STONE}`;
        b.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${STONE}" stroke-width="3" stroke-linecap="square" stroke-linejoin="miter"><path d="${ARROW[d]}"/></svg>`;
        b.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          b.style.background = `${NEON.cyan}bb`;
          if (phase === "play" || phase === "count") turn(s, d);
        });
        const up = () => (b.style.background = NEON.cyan);
        b.addEventListener("pointerup", up);
        b.addEventListener("pointerleave", up);
        dpad.appendChild(b);
      }
      dpad.style.zIndex = "1";
      el.appendChild(dpad);
    }

    stage.onResize(() => {
      view.setReserve(coarse ? DPAD : 0);
      if (phase === "attract") reset("normal");
    });

    const target = (el.closest(".cab-screen") as HTMLElement | null) ?? el;
    const off = onDirection(target, (d) => {
      if (phase === "play" || phase === "count") turn(s, d);
    });

    reset("normal");
    stage.loop(frame);

    return {
      start(d: Difficulty) {
        view.clearHud();
        reset(d);
        phase = "count";
        count = 4;
        timer = 0;
        lastStatus = "";
        ctx.emit({ type: "score", value: 0 });
        status();
        stage.resume();
      },
      pause() {
        stage.pause();
      },
      resume() {
        stage.resume();
      },
      destroy() {
        off();
        dpad?.remove();
        view.dispose();
        stage.dispose();
      },
    };
  },
};

export default mod;
