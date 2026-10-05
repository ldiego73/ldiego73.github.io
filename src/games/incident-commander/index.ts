import { ARCADE_FONT, HUD_FONT, NEON } from "../core/neon";
import type { Difficulty, GameContext, GameModule } from "../core/types";
import { SCENARIOS } from "./scenarios";
import { answer, createRun, type RunState, skipReveal, slotOf, statusText, tick } from "./state";
import { createView } from "./view";

const COPY = {
  es: {
    incident: "Incidente",
    step: "Parte 2/2",
    time: "Tiempo",
    correct: "Resuelto",
    partial: "Parcial",
    wrong: "Empeoró",
    timeout: "Sin respuesta",
    choose: "Acciones",
    next: "Enter ▸ siguiente",
    go: "ON CALL",
  },
  en: {
    incident: "Incident",
    step: "Part 2/2",
    time: "Time",
    correct: "Resolved",
    partial: "Partial",
    wrong: "Made it worse",
    timeout: "No call made",
    choose: "Actions",
    next: "Enter ▸ next",
    go: "ON CALL",
  },
} as const;

const N = NEON;
const CSS = `
.ic-ui{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;gap:8px;padding:12px;pointer-events:none;color:${N.ink};font-family:${HUD_FONT}}
.ic-ui>*{pointer-events:auto}
.ic-card{position:relative;width:100%;max-width:760px;margin:0 auto;box-sizing:border-box;padding:10px 14px 14px;border:3px solid ${N.void};background:${N.floor};box-shadow:inset 0 -5px ${N.grid};display:grid;gap:7px}
.ic-card[data-fx=good]{border-color:${N.lime}}
.ic-card[data-fx=bad]{border-color:${N.red};animation:ic-shake .24s steps(1,end) 1}
.ic-head{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;font:600 .68rem/1 ${HUD_FONT};letter-spacing:.06em;text-transform:uppercase;color:${N.dim}}
.ic-head .ic-r{margin-left:auto;font-variant-numeric:tabular-nums}
.ic-sev{padding:3px 6px;border:2px solid ${N.void};font-weight:700;letter-spacing:.08em}
.ic-sev[data-s="1"]{color:${N.ink};background:${N.red}}
.ic-sev[data-s="2"]{color:${N.red};background:${N.floor}}
.ic-sev[data-s="3"]{color:${N.ink};background:${N.grid}}
.ic-comp{color:${N.ink}}
.ic-chain{color:${N.cyan};border:2px solid ${N.grid};padding:2px 5px}
.ic-title{margin:0;font:700 clamp(1.02rem,2.7vw,1.45rem)/1.12 ${ARCADE_FONT};letter-spacing:.01em;color:${N.ink};text-wrap:balance}
.ic-bars{display:grid;grid-template-columns:auto 1fr auto;gap:5px 8px;align-items:center;font:500 .64rem/1 ${HUD_FONT};letter-spacing:.08em;text-transform:uppercase;color:${N.dim};font-variant-numeric:tabular-nums}
.ic-bar{height:6px;border:2px solid ${N.void};background:${N.grid};overflow:hidden}
.ic-bar i{display:block;height:100%;width:100%;background:${N.cyan};transform-origin:left}
.ic-bar[data-low] i{background:${N.red}}
.ic-explain{margin:0;font:400 .84rem/1.35 ${HUD_FONT};color:${N.ink};cursor:pointer}
.ic-explain b{font:700 .9rem/1 ${ARCADE_FONT};letter-spacing:.04em;text-transform:uppercase;margin-right:8px}
.ic-explain small{display:block;margin-top:4px;color:${N.dim};font-size:.66rem;letter-spacing:.08em;text-transform:uppercase}
.ic-explain[data-o=correct] b{color:${N.lime}}
.ic-explain[data-o=partial] b{color:${N.cyan}}
.ic-explain[data-o=wrong] b,.ic-explain[data-o=timeout] b{color:${N.red}}
.ic-opts{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%;max-width:760px;margin:0 auto}
.ic-opt{display:flex;align-items:center;gap:9px;min-height:50px;padding:8px 11px 12px;text-align:left;font:500 .86rem/1.2 ${HUD_FONT};color:${N.ink};background:${N.floor};border:3px solid ${N.void};cursor:pointer;box-shadow:inset 0 -4px ${N.grid}}
.ic-opt:hover{border-color:${N.cyan}}
.ic-opt:active{box-shadow:inset 0 3px ${N.void}}
.ic-opt:focus-visible{outline:3px solid ${N.cyan};outline-offset:2px}
.ic-opt kbd{flex:none;display:grid;place-items:center;width:24px;height:24px;border:2px solid ${N.void};background:${N.grid};font:700 1rem/1 ${ARCADE_FONT};color:${N.cyan}}
.ic-opt[aria-disabled=true]{cursor:default;color:${N.dim}}
.ic-opt[aria-disabled=true]:hover{border-color:${N.void}}
.ic-opt[data-r]{color:${N.ink}}
.ic-opt[data-r=correct],.ic-opt[data-r=correct]:hover{border-color:${N.lime}}
.ic-opt[data-r=correct] kbd{background:${N.lime};color:${N.void}}
.ic-opt[data-r=partial],.ic-opt[data-r=partial]:hover{border-color:${N.cyan}}
.ic-opt[data-r=wrong],.ic-opt[data-r=wrong]:hover{border-color:${N.red}}
.ic-opt[data-r=wrong] kbd{background:${N.red};color:${N.ink}}
.ic-name{position:absolute;transform:translate(-50%,0);pointer-events:none;font:700 clamp(.45rem,1.5vw,.7rem)/1 ${ARCADE_FONT};color:${N.ink};white-space:nowrap}
.ic-metric{position:absolute;z-index:0;transform:translate(-50%,-100%);pointer-events:none;font:700 .8rem/1 ${HUD_FONT};font-variant-numeric:tabular-nums;padding:6px 9px 9px;white-space:nowrap;color:${N.ink};border:3px solid ${N.void};background:${N.red};box-shadow:inset 0 -3px ${N.floor}}
.ic-metric[data-tone=lime]{background:${N.lime};color:${N.void}}
.ic-pop{position:absolute;z-index:0;pointer-events:none;font:800 1.5rem/1 ${ARCADE_FONT};color:${N.lime};background:${N.void};padding:2px 4px;margin-top:-38px}
.ic-count{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;font:800 clamp(3rem,14vw,7rem)/1 ${ARCADE_FONT};color:${N.ink}}
.ic-count[data-go]{font-size:clamp(2rem,9vw,4.4rem);letter-spacing:.08em;color:${N.cyan}}
@keyframes ic-shake{0%{transform:translateX(-3px)}50%{transform:translateX(3px)}100%{transform:translateX(0)}}
@media (max-width:640px){.ic-ui{padding:8px;gap:6px}.ic-card{padding:8px 10px 12px;gap:5px}.ic-opt{font-size:.76rem;min-height:46px;padding:6px 8px 10px;gap:6px}.ic-opt kbd{width:20px;height:20px}.ic-explain{font-size:.76rem}.ic-opts{gap:6px}.ic-metric{font-size:.7rem;padding:4px 6px 7px}}
@media (prefers-reduced-motion:reduce){.ic-card{animation:none!important}}
`;

const mod: GameModule = {
  mount(el: HTMLElement, ctx: GameContext) {
    const t = COPY[ctx.lang];
    const rm = ctx.reducedMotion;
    const view = createView(el, rm);
    const style = document.createElement("style");
    style.textContent = CSS;
    const ui = document.createElement("div");
    ui.className = "ic-ui";
    ui.inert = true;
    ui.hidden = true;
    ui.innerHTML = `
      <section class="ic-card" aria-live="polite">
        <div class="ic-head"><span class="ic-sev" data-k="sev"></span><span class="ic-comp" data-k="comp"></span><span class="ic-chain" data-k="chain" hidden>${t.step}</span><span class="ic-r" data-k="count"></span></div>
        <p class="ic-title" data-k="title"></p>
        <div class="ic-bars">
          <span>Budget</span><span class="ic-bar ic-budget" data-k="bbar"><i data-k="budget"></i></span><span data-k="bnum"></span>
          <span>${t.time}</span><span class="ic-bar" data-k="tbar"><i data-k="time"></i></span><span data-k="tnum"></span>
        </div>
        <p class="ic-explain" data-k="explain" hidden></p>
      </section>
      <div class="ic-opts" role="group" aria-label="${t.choose}"></div>`;
    const count = document.createElement("div");
    count.className = "ic-count";
    count.hidden = true;
    count.setAttribute("aria-hidden", "true");
    el.append(style, ui, count);
    const $ = (k: string) => ui.querySelector(`[data-k=${k}]`) as HTMLElement;
    const card = ui.querySelector(".ic-card") as HTMLElement;
    const opts = ui.querySelector(".ic-opts") as HTMLElement;
    const btns = [0, 1, 2, 3].map((i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ic-opt";
      b.innerHTML = `<kbd>${i + 1}</kbd><span></span>`;
      b.setAttribute("aria-keyshortcuts", String(i + 1));
      b.addEventListener("click", () => choose(i));
      opts.appendChild(b);
      return b;
    });

    let run: RunState | null = null;
    let playing = false;
    let countdown = 0;
    const rng = Math.random;

    const relayout = () => {
      if (ui.hidden) return view.setInsets(0, 0);
      const r = el.getBoundingClientRect();
      view.setInsets(card.getBoundingClientRect().bottom - r.top, r.bottom - opts.getBoundingClientRect().top);
    };

    const status = () => ctx.emit({ type: "status", text: statusText(run!, ctx.lang) });
    const bars = () => {
      const s = run!;
      $("budget").style.transform = `scaleX(${s.budget / 100})`;
      $("bbar").toggleAttribute("data-low", s.budget <= 30);
      $("bnum").textContent = `${s.budget}%`;
      const left = s.phase === "ask" ? s.timeLeft : 0;
      const frac = left / s.limit;
      $("time").style.transform = `scaleX(${frac})`;
      $("tbar").toggleAttribute("data-low", frac < 0.3);
      $("tnum").textContent = `${left.toFixed(1)}s`;
    };
    const fx = (k: string | null) => {
      delete card.dataset.fx;
      delete card.dataset.page;
      if (!k) return;
      void card.offsetWidth; // restart CSS animation
      if (k === "page") card.dataset.page = "";
      else card.dataset.fx = k;
    };

    const showQuestion = () => {
      const s = run!;
      const sc = SCENARIOS[s.cur];
      $("sev").textContent = `SEV${sc.sev}`;
      $("sev").dataset.s = String(sc.sev);
      $("comp").textContent = sc.comp.toUpperCase();
      $("chain").hidden = s.step !== 2;
      $("count").textContent = `${t.incident} ${s.answered + 1}/${s.cfg.winAt}`;
      $("title").textContent = sc.alert[ctx.lang];
      $("explain").hidden = true;
      btns.forEach((b, i) => {
        (b.lastElementChild as HTMLElement).textContent = sc.options[s.order[i]][ctx.lang];
        b.setAttribute("aria-disabled", "false");
        delete b.dataset.r;
      });
      fx(rm ? null : "page");
      view.alert(sc.comp, sc.metric);
      bars();
      relayout();
    };

    const reveal = () => {
      const s = run!;
      const sc = SCENARIOS[s.cur];
      const last = s.last!;
      for (const b of btns) b.setAttribute("aria-disabled", "true");
      btns[slotOf(s, sc.correct)].dataset.r = "correct";
      if (last.outcome === "partial") btns[last.slot].dataset.r = "partial";
      if (last.outcome === "wrong") btns[last.slot].dataset.r = "wrong";
      const ex = $("explain");
      ex.dataset.o = last.outcome;
      ex.innerHTML = `<b></b><span></span><small>${t.next}</small>`;
      const pts = last.points ? ` +${last.points}` : last.burn ? ` −${last.burn}%` : "";
      (ex.firstChild as HTMLElement).textContent = `${t[last.outcome]}${pts}`;
      (ex.children[1] as HTMLElement).textContent = sc.explain[ctx.lang];
      ex.hidden = false;
      const good = last.outcome === "correct";
      fx(rm ? null : good ? "good" : last.outcome === "partial" ? null : "bad");
      view.resolve(good, last.points);
      if (last.points) ctx.emit({ type: "score", value: s.score });
      if (good) ctx.emit({ type: "stat", key: "resolved", inc: 1 });
      status();
      bars();
      relayout();
    };

    const end = (won: boolean) => {
      playing = false;
      ui.inert = true;
      view.idle();
      ctx.emit({ type: won ? "win" : "gameover", score: run!.score });
    };

    function choose(slot: number) {
      if (!playing || !run || countdown > 0) return;
      if (run.phase === "reveal") {
        skipReveal(run);
        return;
      }
      if (run.phase === "ask" && answer(run, slot)) reveal();
    }

    const screen = (el.closest(".cab-screen") as HTMLElement | null) ?? el;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || !playing || !run) return;
      const n = "1234".indexOf(e.key);
      if (n >= 0) {
        e.preventDefault();
        choose(n);
      } else if ((e.key === "Enter" || e.key === " ") && run.phase === "reveal" && e.target === screen) {
        e.preventDefault();
        skipReveal(run);
      }
    };
    screen.addEventListener("keydown", onKey);
    $("explain").addEventListener("click", () => run && skipReveal(run));

    const setCount = (n: number) => {
      const txt = n > 0 ? String(n) : t.go;
      if (count.textContent !== txt) count.textContent = txt;
      count.toggleAttribute("data-go", n <= 0);
    };

    view.stage.loop((dt, time) => {
      if (playing && run) {
        if (countdown > 0) {
          countdown -= dt;
          setCount(Math.ceil(countdown / 0.45) - 1);
          if (countdown <= 0) {
            count.hidden = true;
            ui.hidden = false;
            ui.inert = false;
            showQuestion();
          }
        } else {
          const ev = tick(run, dt, rng);
          if (ev === "timeout") reveal();
          else if (ev === "next") showQuestion();
          else if (ev === "gameover" || ev === "win") end(ev === "win");
          if (run.phase === "ask") bars();
        }
      }
      view.update(dt, time);
    });
    view.stage.pause();
    view.stage.render();

    return {
      start(difficulty: Difficulty) {
        run = createRun(SCENARIOS, difficulty, rng);
        playing = true;
        ui.hidden = true;
        ui.inert = true;
        view.idle();
        countdown = 1.8; // 3, 2, 1, ON CALL
        count.hidden = false;
        setCount(3);
        relayout();
        ctx.emit({ type: "score", value: 0 });
        status();
        view.setRunning(true);
        view.stage.resume();
      },
      pause() {
        ui.inert = true;
        view.setRunning(false);
        view.stage.pause();
      },
      resume() {
        ui.inert = !playing || countdown > 0;
        view.setRunning(true);
        view.stage.resume();
      },
      destroy() {
        playing = false;
        screen.removeEventListener("keydown", onKey);
        ui.remove();
        count.remove();
        style.remove();
        view.dispose();
      },
    };
  },
};

export default mod;
