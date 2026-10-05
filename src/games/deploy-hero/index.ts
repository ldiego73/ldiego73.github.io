import { createStage } from "../core/stage";
import type { Difficulty, GameModule } from "../core/types";
import {
  createGame,
  drain,
  type Ev,
  GOAL,
  karpenter,
  MAX_FAILS,
  moveCursor,
  mulberry32,
  place,
  rollback,
  type State,
  seed,
  selectPod,
  step,
} from "./state";
import { createView, type ViewCopy } from "./view";

const ES: ViewCopy & Record<string, unknown> = {
  kind: { od: "on-demand", spot: "spot", gpu: "gpu" },
  fit: {
    ok: "Cabe",
    notready: "NotReady",
    cordoned: "SchedulingDisabled",
    taint: "Taint nvidia.com/gpu",
    affinity: "Affinity: on-demand",
    cpu: "OutOfcpu",
    mem: "OutOfmemory",
    gpu: "CrashLoopBackOff: sin GPU",
    noisy: "Riesgo OOM: vecino ruidoso",
  },
  status: { Ready: "Ready", NotReady: "NotReady", Cordoned: "Cordoned", boot: "Booting", notice: "Spot: aviso" },
  pods: "pods",
  rate: "Costo",
  spend: "Gasto",
  util: "Uso",
  karpenter: "Karpenter",
  drain: "Cordon + drain",
  rollback: "Rollback",
  tags: {
    gpu: "GPU",
    od: "solo on-demand",
    noisy: "vecino ruidoso",
    resched: "reprogramar",
    rollout: "rolling update",
  },
  pending: "Pending",
};
const EN: ViewCopy = {
  ...ES,
  fit: { ...ES.fit, ok: "Fits", gpu: "CrashLoopBackOff: no GPU", noisy: "OOM risk: noisy neighbor" },
  status: { ...ES.status, notice: "Spot notice" },
  rate: "Cost",
  spend: "Spend",
  util: "Util",
  tags: { gpu: "GPU", od: "on-demand only", noisy: "noisy neighbor", resched: "reschedule", rollout: "rolling update" },
};
const MSG = {
  es: {
    status: (d: number, f: number) => `Desplegados ${d}/${GOAL} · Fallos ${f}/${MAX_FAILS}`,
    go: "Release day: ¡a desplegar!",
    pending: (a: string) => `${a}: FailedScheduling (timeout)`,
    crash: (a: string, w: string) => `${a}: ${w}`,
    oom: (a: string) => `${a}: OOMKilled → CrashLoopBackOff`,
    hpa: (a: string) => `HPA: ${a} escala +3 réplicas`,
    rolling: (a: string, v: number) => `Rolling update: ${a} v${v}`,
    down: "Nodo NotReady: reprograma sus pods",
    up: "Nodo Ready otra vez",
    notice: "Aviso de interrupción spot: drena el nodo",
    reclaim: "Nodo spot reclamado",
    karp: "Karpenter: nuevo nodo",
    drain: "Cordon + drain: consolidando",
    rb: (r: boolean) => (r ? "helm rollback: fallo revertido" : "helm rollback: rollout cancelado"),
    win: (b: number) => `Release completo · FinOps +${b}`,
  },
  en: {
    status: (d: number, f: number) => `Deployed ${d}/${GOAL} · Failures ${f}/${MAX_FAILS}`,
    go: "Release day: ship it!",
    pending: (a: string) => `${a}: FailedScheduling (timeout)`,
    crash: (a: string, w: string) => `${a}: ${w}`,
    oom: (a: string) => `${a}: OOMKilled → CrashLoopBackOff`,
    hpa: (a: string) => `HPA: ${a} scales out +3 replicas`,
    rolling: (a: string, v: number) => `Rolling update: ${a} v${v}`,
    down: "Node NotReady: reschedule its pods",
    up: "Node Ready again",
    notice: "Spot interruption notice: drain the node",
    reclaim: "Spot node reclaimed",
    karp: "Karpenter: new node",
    drain: "Cordon + drain: consolidating",
    rb: (r: boolean) => (r ? "helm rollback: failure reverted" : "helm rollback: rollout cancelled"),
    win: (b: number) => `Release complete · FinOps +${b}`,
  },
};

/** Attract frame: a busy cluster mid-release. */
function demo(): State {
  const s = createGame("normal", mulberry32(11));
  seed(s);
  for (let i = 0; i < 40; i++) step(s, 0.1);
  s.nodes[2].noticeIn = 3;
  return s;
}

const mod: GameModule = {
  mount(el, ctx) {
    const m = MSG[ctx.lang];
    const copy = ctx.lang === "es" ? ES : EN;
    const stage = createStage(el, { camera: "persp", fov: 34, bloom: false });
    const view = createView(stage, ctx, el, copy);
    let s = demo();
    let playing = false;
    let endT = 0;
    let hitStop = 0;
    let armDrain = false;
    let lastScore = -1;
    let lastStatus = "";
    view.sync(s, 0, 0, []);
    stage.render();

    const emitHud = () => {
      if (s.score !== lastScore) {
        lastScore = s.score;
        ctx.emit({ type: "score", value: lastScore });
      }
      const st = m.status(s.deployed, s.failures);
      if (st !== lastStatus) {
        lastStatus = st;
        ctx.emit({ type: "status", text: lastStatus });
      }
    };

    const handle = (evs: Ev[]) => {
      for (const e of evs) {
        if (e.t === "place") {
          if (!e.pod.resched) ctx.emit({ type: "stat", key: "deploys", inc: 1 });
        } else if (e.t === "crash") {
          view.say(m.crash(e.pod.app, copy.fit[e.why]), "red");
          hitStop = 0.07;
        } else if (e.t === "pending") {
          view.say(m.pending(e.pod.app), "red");
          hitStop = 0.07;
        } else if (e.t === "oom") {
          view.say(m.oom(e.pod.app), "magenta");
          hitStop = 0.07;
        } else if (e.t === "hpa") view.say(m.hpa(e.app), "cyan");
        else if (e.t === "rolling") view.say(m.rolling(e.app, e.ver), "cyan");
        else if (e.t === "nodeDown") view.say(m.down, "red");
        else if (e.t === "nodeUp") view.say(m.up, "lime", 1.4);
        else if (e.t === "notice") view.say(m.notice, "amber", 3);
        else if (e.t === "reclaim") view.say(m.reclaim, "amber");
        else if (e.t === "karpenter") view.say(m.karp, "lime");
        else if (e.t === "drain") view.say(m.drain, "amber");
        else if (e.t === "rollback") view.say(m.rb(e.restored), "magenta");
        else if (e.t === "win") view.say(m.win(e.bonus), "lime", 5);
      }
    };
    const act = (evs: Ev[]) => {
      if (!playing) return;
      handle(evs);
      pending.push(...evs);
    };
    let pending: Ev[] = [];

    const doNode = (i: number) => {
      if (!playing) return;
      if (armDrain) {
        armDrain = false;
        view.buttons.c.setAttribute("aria-pressed", "false");
        act(drain(s, i));
      } else act(place(s, i));
    };
    view.onNode(doNode);
    view.buttons.k.addEventListener("click", () => playing && act(karpenter(s)));
    view.buttons.r.addEventListener("click", () => playing && act(rollback(s)));
    view.buttons.c.addEventListener("click", () => {
      if (!playing) return;
      armDrain = !armDrain;
      view.buttons.c.setAttribute("aria-pressed", String(armDrain));
    });

    const keyEl = (el.closest(".cab-screen") as HTMLElement | null) ?? el;
    const onKey = (e: KeyboardEvent) => {
      if (!playing || e.altKey || e.ctrlKey || e.metaKey) return;
      const k = e.key.toLowerCase();
      let used = true;
      if (k >= "1" && k <= "6") act(place(s, Number(k) - 1));
      else if (k === "arrowleft" || k === "a") moveCursor(s, -1);
      else if (k === "arrowright" || k === "d") moveCursor(s, 1);
      else if (k === "arrowup" || k === "w") selectPod(s, s.sel - 1);
      else if (k === "arrowdown" || k === "s") selectPod(s, s.sel + 1);
      else if (k === "enter" || k === " ") act(place(s, s.cursor));
      else if (k === "k") act(karpenter(s));
      else if (k === "c") act(drain(s, s.cursor));
      else if (k === "r") act(rollback(s));
      else used = false;
      if (used) e.preventDefault();
    };
    keyEl.addEventListener("keydown", onKey);

    let px = 0;
    let py = 0;
    const pdown = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
    };
    const pup = (e: PointerEvent) => {
      if (!playing || Math.hypot(e.clientX - px, e.clientY - py) > 14) return;
      const h = view.pick(s, e.clientX, e.clientY);
      if (h.pod >= 0) selectPod(s, h.pod);
      else if (h.node >= 0) doNode(h.node);
    };
    stage.canvas.addEventListener("pointerdown", pdown);
    stage.canvas.addEventListener("pointerup", pup);

    stage.loop((dt, t) => {
      let evs: Ev[] = pending;
      pending = [];
      if (playing) {
        if (hitStop > 0) hitStop -= dt;
        else {
          const se = step(s, dt);
          handle(se);
          evs = evs.concat(se);
        }
        emitHud();
        if (s.over) {
          playing = false;
          endT = 1.4;
          ctx.emit(s.over === "win" ? { type: "win", score: s.score } : { type: "gameover", score: s.score });
        }
      }
      view.sync(s, dt, t, evs);
      if (endT > 0) {
        endT -= dt;
        if (endT <= 0) stage.pause();
      }
    });
    stage.pause();

    return {
      start(difficulty: Difficulty) {
        view.reset();
        s = createGame(difficulty, mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0));
        seed(s);
        playing = true;
        endT = hitStop = 0;
        armDrain = false;
        pending = [];
        lastScore = -1;
        lastStatus = "";
        view.buttons.c.setAttribute("aria-pressed", "false");
        emitHud();
        view.say(m.go, "cyan", 2);
        stage.resume();
      },
      pause() {
        stage.pause();
      },
      resume() {
        if (playing) stage.resume();
      },
      destroy() {
        keyEl.removeEventListener("keydown", onKey);
        stage.canvas.removeEventListener("pointerdown", pdown);
        stage.canvas.removeEventListener("pointerup", pup);
        view.dispose();
        stage.dispose();
      },
    };
  },
};

export default mod;
