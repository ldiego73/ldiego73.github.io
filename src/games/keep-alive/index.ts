import { ARCADE_FONT, NEON } from "../core/neon";
import { createStage } from "../core/stage";
import type { Difficulty, GameModule, Lang } from "../core/types";
import {
  ACTIONS,
  type Action,
  act,
  COOLDOWN,
  type Comp,
  clockOf,
  computeFlow,
  createState,
  type Fault,
  finalScore,
  fmtUptime,
  GLOBAL,
  get,
  postmortem,
  REGIONS,
  remedy,
  SCALE_COST,
  type State,
  step,
  uptime,
} from "./state";
import { createView, POS } from "./view";

const ORDER = Object.keys(POS);
const COUNT = 1.35;

const COPY = {
  en: {
    actions: {
      scale: "Scale out",
      restart: "Restart",
      failover: "Failover",
      breaker: "Breaker",
      renew: "Renew cert",
      rollback: "Rollback",
    },
    names: {
      edge: "Clients",
      lb: "LB",
      api0: "API 1",
      api1: "API 2",
      api2: "API 3",
      cache: "Cache",
      queue: "Queue",
      primary: "DB primary",
      replica: "Replica",
    },
    tags: {
      crash: "crashed",
      leak: "memory leak",
      spike: "traffic spike",
      dbfail: "disk failing",
      noisy: "noisy neighbor",
      region: "region failing",
      cert: "cert expires",
      deploy: "bad deploy",
      retry: "retry storm",
    },
    inc: {
      crash: "Pod crash",
      leak: "Memory leak",
      spike: "Traffic spike",
      dbfail: "DB disk failure",
      noisy: "Noisy neighbor",
      region: "Region outage",
      cert: "Cert expiry",
      deploy: "Bad deploy",
      retry: "Retry storm",
    },
    expired: "cert expired",
    down: "down",
    restarting: "restarting",
    breaker: "breaker open",
    healthy: "healthy",
    degraded: "degraded",
    res: {
      ok: "Applied",
      noop: "Little effect",
      cooldown: "Cooling down",
      budget: "Not enough budget",
      maxed: "Already at max scale",
    },
    left: "left",
    budget: "Budget",
    target: "target",
    region: "Region",
    pm: "Postmortem",
    clean: "No customer impact. Clean day.",
    req: "req",
    top: "Top",
    fixed: "FIXED",
    lost: "DOWN",
  },
  es: {
    actions: {
      scale: "Escalar",
      restart: "Reiniciar",
      failover: "Failover",
      breaker: "Breaker",
      renew: "Renovar cert",
      rollback: "Rollback",
    },
    names: {
      edge: "Clientes",
      lb: "LB",
      api0: "API 1",
      api1: "API 2",
      api2: "API 3",
      cache: "Caché",
      queue: "Cola",
      primary: "BD primaria",
      replica: "Réplica",
    },
    tags: {
      crash: "caída",
      leak: "fuga de memoria",
      spike: "pico de tráfico",
      dbfail: "disco fallando",
      noisy: "vecino ruidoso",
      region: "región cayendo",
      cert: "cert vence",
      deploy: "deploy malo",
      retry: "tormenta de reintentos",
    },
    inc: {
      crash: "Pod caído",
      leak: "Fuga de memoria",
      spike: "Pico de tráfico",
      dbfail: "Falla de disco BD",
      noisy: "Vecino ruidoso",
      region: "Caída de región",
      cert: "Cert vencido",
      deploy: "Deploy malo",
      retry: "Tormenta de reintentos",
    },
    expired: "cert vencido",
    down: "caído",
    restarting: "reiniciando",
    breaker: "breaker abierto",
    healthy: "sano",
    degraded: "degradado",
    res: {
      ok: "Aplicado",
      noop: "Poco efecto",
      cooldown: "En enfriamiento",
      budget: "Presupuesto insuficiente",
      maxed: "Escala máxima",
    },
    left: "restantes",
    budget: "Presupuesto",
    target: "meta",
    region: "Región",
    pm: "Postmortem",
    clean: "Sin impacto en clientes. Día limpio.",
    req: "req",
    top: "Top",
    fixed: "RESUELTO",
    lost: "CAÍDO",
  },
} as const;

const N = NEON;
const CSS = `
.ka{position:absolute;inset:0;display:flex;flex-direction:column;font-family:${ARCADE_FONT};color:${N.ink};background:${N.void}}
.ka [hidden]{display:none!important}
.ka-scene{position:relative;flex:1;min-height:0;overflow:hidden}
.ka-scene canvas{position:absolute;inset:0}
.ka-hud{position:absolute;inset:10px 14px auto;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;pointer-events:none}
.ka-panel,.ka-right{padding:7px 9px;background:${N.floor};border:2px solid ${N.grid}}
.ka-k{font:.7rem/1 ${ARCADE_FONT};letter-spacing:.06em;text-transform:uppercase;color:${N.dim}}
.ka-up{font:800 clamp(1.5rem,5vw,2.8rem)/1 ${ARCADE_FONT};font-variant-numeric:tabular-nums;color:${N.lime};margin:3px 0}
.ka-up[data-bad]{color:${N.amber}}.ka-up[data-dead]{color:${N.red}}
.ka-right{display:flex;gap:10px;align-items:center;text-align:right;font:.82rem/1.3 ${ARCADE_FONT};font-variant-numeric:tabular-nums}
.ka-clock{width:78px;flex:none;padding-left:8px;border-left:2px solid ${N.grid};text-align:center}
.ka-clock b{display:block;font:700 1rem/1.2 ${ARCADE_FONT};color:${N.ink};margin:4px 0}
.ka-day{display:grid;grid-template-columns:repeat(12,1fr);gap:2px}
.ka-day i{height:4px;background:${N.grid}}.ka-day i[data-lit]{background:${N.amber}}
.ka-meter{width:84px;display:flex;gap:2px;margin:4px 0 0 auto}
.ka-meter i{flex:1;height:5px;background:${N.grid}}.ka-meter i[data-lit]{background:${N.lime}}
.ka-lbl,.ka-reg{position:absolute;pointer-events:none;white-space:nowrap;font:.72rem/1.15 ${ARCADE_FONT};color:${N.dim};text-align:center;transform:translate(-50%,0)}
.ka-lbl.side{transform:translate(0,-50%);text-align:left}.ka-lbl b{display:block;color:${N.ink};font-weight:600;letter-spacing:.03em}
.ka-lbl em{display:inline-block;font-style:normal;text-transform:uppercase;font-size:.62rem;padding:2px 4px;margin-top:3px;background:${N.void};border:1px solid}
.ka-lbl em.r{color:${N.red}}.ka-lbl em.o{color:${N.amber}}.ka-lbl em.m{color:${N.dim}}
.ka-reg{transform:none;color:${N.dim};letter-spacing:.06em;text-transform:uppercase;background:${N.void};padding:2px 4px}.ka-reg[data-bad]{color:${N.red}}
.ka-pop{position:absolute;pointer-events:none;transform:translate(-50%,-50%);font:800 1rem/1 ${ARCADE_FONT};letter-spacing:.08em;color:${N.lime};background:${N.void};padding:4px;animation:ka-up .9s steps(4,end) forwards}
.ka-pop.d{color:${N.red}}
@keyframes ka-up{from{opacity:1;translate:0 6px}to{opacity:0;translate:0 -34px}}
.ka-count{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font:800 clamp(4rem,16vw,8rem)/1 ${ARCADE_FONT};color:${N.ink}}
.ka-bar{border-top:3px solid ${N.grid};background:${N.floor};padding:7px 10px 10px;display:grid;gap:7px}
.ka-info{display:flex;justify-content:space-between;gap:8px;font:.78rem/1.2 ${ARCADE_FONT};color:${N.dim};min-height:1.2em;white-space:nowrap;overflow:hidden}
.ka-info b{color:${N.ink};font-weight:600}.ka-info [data-msg]{color:${N.amber}}
.ka-keys{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
.ka-key{position:relative;display:flex;gap:6px;align-items:center;justify-content:flex-start;padding:7px 6px 15px;min-height:46px;border-radius:0;border:2px solid ${N.grid};border-bottom:5px solid ${N.void};background:${N.floor};color:${N.ink};font:.8rem/1.1 ${ARCADE_FONT};text-align:left;cursor:pointer;touch-action:manipulation}
.ka-key:active{transform:translateY(2px)}
.ka-key:focus-visible{outline:2px solid ${N.ink};outline-offset:2px}
.ka-cd{position:absolute;bottom:4px;left:6px;right:6px;display:flex;gap:3px}
.ka-cd i{flex:1;height:4px;background:${N.grid}}.ka-cd i[data-lit]{background:${N.cyan}}
.ka-number{flex:none;padding:3px 5px;border:1px solid ${N.grid};background:${N.void};color:${N.cyan};font:700 .78rem/1 ${ARCADE_FONT}}
.ka-key small{margin-left:auto;font:.68rem/1 ${ARCADE_FONT};color:${N.dim}}
.ka-key[data-hint]{border-color:${N.cyan};background:${N.grid}}
.ka-key:disabled{opacity:.45;cursor:default}
.ka-pm{position:absolute;z-index:3;top:10px;left:50%;translate:-50% 0;width:min(440px,calc(100% - 20px));box-sizing:border-box;pointer-events:none;padding:9px 12px;border:3px solid ${N.grid};border-radius:0;background:${N.void};font:.78rem/1.35 ${ARCADE_FONT};color:${N.dim}}
.ka-pm b{display:block;font:800 1rem/1 ${ARCADE_FONT};letter-spacing:.08em;text-transform:uppercase;color:${N.ink};margin-bottom:5px}
.ka-pm ol{margin:0;padding:0;list-style:none;display:grid;gap:2px}
.ka-pm li{display:grid;grid-template-columns:1fr auto auto;gap:10px}.ka-pm li span:first-child{color:${N.ink}}.ka-pm li span:last-child{color:${N.red};min-width:6ch;text-align:right}
@media (max-width:640px){.ka-keys{grid-template-columns:repeat(3,1fr)}.ka-key{min-height:42px;padding:6px 6px 14px;font-size:.75rem}.ka-panel,.ka-right{padding:5px}.ka-clock{width:62px;padding-left:5px}.ka-right{gap:5px;font-size:.72rem}.ka-lbl em{font-size:.58rem}.ka-hud{inset:8px 10px auto}.ka-k{font-size:.6rem}}
@media (prefers-reduced-motion:reduce){.ka-pop{animation:none;opacity:0}}
`;

const fmtLost = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n)));

const mod: GameModule = {
  mount(el, ctx) {
    const lang: Lang = ctx.lang;
    const T = COPY[lang];
    const root = document.createElement("div");
    root.className = "ka";
    const blocks = (n: number) => "<i></i>".repeat(n);
    root.innerHTML = `<style>${CSS}</style>
      <div class="ka-scene">
        <div class="ka-hud">
          <div class="ka-panel"><div class="ka-k">Uptime</div><div class="ka-up" data-up>100.000%</div><div class="ka-k" data-target></div></div>
          <div class="ka-right"><div><span data-time></span> <span class="ka-k">${T.left}</span>
            <div class="ka-k" style="margin-top:6px">${T.budget} <span data-budget></span></div><div class="ka-meter" data-meter>${blocks(10)}</div></div>
            <div class="ka-clock"><span class="ka-k">24h</span><b data-clock>00:00</b><div class="ka-day" data-day>${blocks(24)}</div></div>
          </div>
        </div>
        <div class="ka-reg" data-reg></div>
        <div class="ka-count" data-count hidden></div>
      </div>
      <div class="ka-bar">
        <div class="ka-info"><span data-sel></span><span data-msg aria-live="polite"></span></div>
        <div class="ka-keys">${ACTIONS.map(
          (a, i) =>
            `<button type="button" class="ka-key" data-a="${a}"><span class="ka-number">${i + 1}</span><span class="ka-cd" aria-hidden="true">${blocks(8)}</span>${T.actions[a]}${a === "scale" ? `<small>-${SCALE_COST}</small>` : ""}</button>`,
        ).join("")}</div>
      </div>
      <div class="ka-pm" data-pm hidden></div>`;
    el.appendChild(root);
    const $ = (q: string) => root.querySelector(q) as HTMLElement;
    const sceneEl = $(".ka-scene");
    const stage = createStage(sceneEl, { camera: "persp", fov: 36, bloom: false });
    $(".ka-hud").before(stage.canvas);

    let s: State = createState();
    s.flow = computeFlow(s);
    let sel = "api1";
    let phase: "idle" | "count" | "play" | "end" = "idle";
    let count = 0;
    let endT = 0;
    let emitT = 0;
    let lastScore = -1;
    let resolved = 0;
    let msgT = 0;
    const popTimers = new Set<ReturnType<typeof setTimeout>>();
    const clearPops = () => {
      for (const timer of popTimers) clearTimeout(timer);
      popTimers.clear();
      root.querySelectorAll(".ka-pop").forEach((p) => {
        p.remove();
      });
    };
    const view = createView(stage, s, ctx.reducedMotion);

    const labels = new Map<string, HTMLElement>();
    for (const id of ORDER) {
      const l = document.createElement("div");
      l.className = id === "lb" || id === "edge" ? "ka-lbl side" : "ka-lbl";
      sceneEl.appendChild(l);
      labels.set(id, l);
    }
    const regEl = $("[data-reg]");
    const place = () => {
      for (const [id, l] of labels) {
        const p = view.screen(id);
        l.style.left = `${p.x}px`;
        l.style.top = `${p.y}px`;
      }
      const p = view.plate();
      regEl.style.left = `${p.x}px`;
      regEl.style.top = `${p.y - 16}px`;
    };
    stage.onResize(place);

    const nameOf = (c: Comp) =>
      c.kind === "db" ? (c.primary ? T.names.primary : T.names.replica) : T.names[c.id as keyof typeof T.names];
    const tagOf = (c: Comp): [string, string] | null => {
      if (c.restarting > 0) return [T.restarting, "m"];
      if (c.fault === "cert")
        return c.down ? [T.expired, "r"] : [`${T.tags.cert} ${Math.ceil(c.health / (10 * s.d.decay))}s`, "o"];
      if (c.down) return [c.fault === "crash" || !c.fault ? T.down : T.tags[c.fault], "r"];
      if (c.fault === "spike" && s.spike && s.spike.start > s.t)
        return [`${T.tags.spike} ${Math.ceil(s.spike.start - s.t)}s`, "o"];
      if (c.fault) return [T.tags[c.fault], c.fault === "dbfail" || c.fault === "region" || c.health < 35 ? "r" : "o"];
      if (c.breaker) return [T.breaker, "m"];
      return null;
    };

    const keys = [...root.querySelectorAll<HTMLButtonElement>(".ka-key")];
    const upEl = $("[data-up]");
    const targetEl = $("[data-target]");
    const timeEl = $("[data-time]");
    const budgetEl = $("[data-budget]");
    const meter = $("[data-meter]");
    const day = $("[data-day]");
    const clockEl = $("[data-clock]");
    const selEl = $("[data-sel]");
    const msgEl = $("[data-msg]");
    const countEl = $("[data-count]");
    const pmEl = $("[data-pm]");

    const hud = () => {
      const u = uptime(s);
      upEl.textContent = `${fmtUptime(u, 3)}%`;
      upEl.toggleAttribute("data-bad", u < s.d.target);
      upEl.toggleAttribute("data-dead", u < 0.99);
      targetEl.textContent = `${T.target} ${fmtUptime(s.d.target, 2)}%`;
      timeEl.textContent = `${Math.ceil(s.d.duration - s.t)}s`;
      budgetEl.textContent = String(Math.floor(s.budget));
      [...meter.children].forEach((b, i) => {
        b.toggleAttribute("data-lit", i < Math.ceil((s.budget / s.d.budget) * 10));
      });
      [...day.children].forEach((b, i) => {
        b.toggleAttribute("data-lit", i < Math.floor((s.t / s.d.duration) * 24));
      });
      clockEl.textContent = clockOf(s);
      const c = get(s, sel);
      const tag = tagOf(c);
      const selHtml = `<b>${nameOf(c)}</b> · ${tag ? tag[0] : c.health < 70 ? T.degraded : T.healthy} · ${Math.max(0, Math.round(c.health))}%`;
      if (selEl.dataset.h !== selHtml) selEl.innerHTML = selEl.dataset.h = selHtml;
      const fix = remedy(c);
      const fleet = { renew: get(s, "edge").fault === "cert", rollback: s.comps.some((x) => x.fault === "deploy") };
      const live = phase === "play";
      keys.forEach((b, i) => {
        const a = ACTIONS[i];
        const ready = 1 - Math.min(1, s.cd[a] / COOLDOWN[a]);
        b.querySelectorAll(".ka-cd i").forEach((block, k) => {
          block.toggleAttribute("data-lit", k < Math.floor(ready * 8));
        });
        const hint = GLOBAL.includes(a) ? fleet[a as "renew" | "rollback"] : fix === a;
        b.toggleAttribute("data-hint", live && hint);
        b.disabled = !live;
      });
      for (const c2 of s.comps) {
        const l = labels.get(c2.id) as HTMLElement;
        const t = tagOf(c2);
        const html = `<b>${nameOf(c2)}</b>${t ? `<em class="${t[1]}">${t[0]}</em>` : ""}`;
        if (l.dataset.h !== html) l.innerHTML = l.dataset.h = html;
      }
      const lb = get(s, "lb");
      const reg = `${T.region} ${REGIONS[s.region]}${lb.fault === "region" ? ` · ${T.tags.region}` : ""}`;
      if (regEl.textContent !== reg) regEl.textContent = reg;
      regEl.toggleAttribute("data-bad", lb.fault === "region");
    };

    const emitScore = () => {
      const score = Math.floor(s.served);
      if (score !== lastScore) {
        lastScore = score;
        ctx.emit({ type: "score", value: score });
      }
    };
    const tension = () => {
      const faults = s.comps.filter((c2) => c2.fault).length;
      const margin = uptime(s) - s.d.target;
      const v = Math.round(Math.min(1, 0.2 + 0.18 * faults + (margin < 0.02 ? 0.25 : 0)) * 20) / 20;
      ctx.emit({ type: "intensity", value: v });
    };
    const status = () => {
      emitScore();
      tension();
      ctx.emit({ type: "status", text: `Uptime ${fmtUptime(uptime(s), 2)}% · ${Math.ceil(s.d.duration - s.t)}s` });
    };

    const popText = (id: string, text: string, down: boolean) => {
      if (ctx.reducedMotion) return;
      const p = view.above(id);
      const d = document.createElement("div");
      d.className = down ? "ka-pop d" : "ka-pop";
      d.textContent = text;
      d.style.left = `${p.x}px`;
      d.style.top = `${p.y}px`;
      sceneEl.appendChild(d);
      const timer = setTimeout(() => {
        d.remove();
        popTimers.delete(timer);
      }, 950);
      popTimers.add(timer);
    };

    const incName = (f: Fault, id: string) =>
      `${T.inc[f]}${id === "api" || f === "region" || f === "cert" || f === "retry" ? "" : ` · ${nameOf(get(s, id))}`}`;
    const showPostmortem = () => {
      const top = postmortem(s);
      const rows = top
        .map(
          (i) =>
            `<li><span>${incName(i.fault, i.id)}</span><span>${clockOf(s, i.start)}</span><span>−${fmtLost(i.lost)} ${T.req}</span></li>`,
        )
        .join("");
      pmEl.innerHTML = `<b>${T.pm}</b>${rows ? `<ol>${rows}</ol>` : T.clean}`;
      pmEl.hidden = false;
      $(".ka-hud").hidden = true;
    };

    const doAct = (a: Action) => {
      if (phase !== "play") return;
      const r = act(s, sel, a);
      msgEl.textContent = T.res[r];
      msgT = 1.6;
      if (r === "ok" && a === "failover" && sel === "lb") view.pop("lb", "region");
    };
    const cycle = (d: number) => {
      sel = ORDER[(ORDER.indexOf(sel) + d + ORDER.length) % ORDER.length];
    };

    const frame = (dt: number) => {
      if (phase === "count") {
        count -= dt;
        const n = Math.ceil(count / (COUNT / 3));
        countEl.textContent = n > 0 ? String(n) : "GO";
        if (count <= 0) {
          phase = "play";
          countEl.style.opacity = "0.4";
          countEl.textContent = "GO";
        }
      } else if (phase === "play") {
        if (count > -0.45) count -= dt;
        else countEl.hidden = true;
        step(s, dt);
        emitScore();
        for (const e of s.log) {
          if (e.kind === "fix") {
            view.pop(e.id, "fix");
            popText(e.id, T.fixed, false);
          } else if (e.kind === "down") {
            view.pop(e.id, "down");
            popText(e.id, T.lost, true);
          }
        }
        s.log.length = 0;
        if (s.resolved > resolved) {
          ctx.emit({ type: "stat", key: "resolved", inc: s.resolved - resolved });
          resolved = s.resolved;
        }
        emitT -= dt;
        if (emitT <= 0) {
          emitT = 0.25;
          status();
        }
        if (s.over) {
          phase = "end";
          endT = 2.5;
          countEl.hidden = true;
          status();
          const score = finalScore(s);
          ctx.emit({ type: "score", value: score });
          for (const id of ORDER) if (s.won) view.pop(id, "fix");
          if (!s.won) view.pop("lb", "down");
          ctx.emit(s.won ? { type: "win", score } : { type: "gameover", score });
          showPostmortem();
        }
      } else if (phase === "end") {
        endT -= dt;
        if (endT <= 0) stage.pause();
      }
      msgT -= dt;
      if (msgT <= 0) msgEl.textContent = "";
      view.update(s, sel, dt);
      hud();
      place();
    };
    stage.loop(frame);

    const screen = (el.closest(".cab-screen") as HTMLElement) ?? el;
    const onKey = (e: KeyboardEvent) => {
      if (phase !== "play" && phase !== "count") return;
      const n = Number(e.key);
      if (n >= 1 && n <= ACTIONS.length) {
        e.preventDefault();
        doAct(ACTIONS[n - 1]);
      } else if (e.key === "Tab" || e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        cycle(e.key === "Tab" && e.shiftKey ? -1 : 1);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        cycle(-1);
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (phase !== "play" && phase !== "count") return;
      const r = stage.canvas.getBoundingClientRect();
      const id = view.pick(e.clientX - r.left, e.clientY - r.top);
      if (id) sel = id;
    };
    const onBtn = (e: MouseEvent) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>(".ka-key");
      if (!b) return;
      doAct(b.dataset.a as Action);
      screen.focus({ preventScroll: true });
    };
    screen.addEventListener("keydown", onKey);
    stage.canvas.addEventListener("pointerdown", onPointer);
    root.addEventListener("click", onBtn);

    return {
      start(difficulty: Difficulty) {
        s = createState(Math.random, difficulty);
        s.flow = computeFlow(s);
        clearPops();
        sel = "api1";
        phase = "count";
        count = COUNT;
        resolved = 0;
        lastScore = -1;
        emitT = 0;
        msgT = 0;
        msgEl.textContent = "";
        countEl.textContent = "3";
        countEl.style.opacity = "1";
        countEl.hidden = false;
        pmEl.hidden = true;
        $(".ka-hud").hidden = false;
        hud();
        status();
        stage.resume();
      },
      pause() {
        stage.pause();
      },
      resume() {
        if (phase === "play" || phase === "count") stage.resume();
      },
      destroy() {
        clearPops();
        screen.removeEventListener("keydown", onKey);
        stage.canvas.removeEventListener("pointerdown", onPointer);
        root.removeEventListener("click", onBtn);
        view.dispose();
        stage.dispose();
        root.remove();
      },
    };
  },
};

export default mod;
