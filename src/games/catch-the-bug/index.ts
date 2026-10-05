import type { Difficulty, GameModule } from "../core/types";
import {
  type CatchEvent,
  collect,
  createState,
  type StepEvent,
  seeded,
  spawn,
  spawnPower,
  statusText,
  step,
  tap,
} from "./state";
import { createView } from "./view";

const BEAT = 0.5; // countdown seconds per number
const HIT_STOP = 0.05;
const GAMEOVER_BEAT = 1.1;

const mod: GameModule = {
  mount(el, ctx) {
    const view = createView(el, ctx);
    const { stage } = view;
    const rm = ctx.reducedMotion;

    // Idle attract frame: one of each bug kind mid-pipeline plus a power-up, frozen under the shell overlay.
    let s = createState(seeded(42));
    for (const [kind, p] of [
      ["normal", 0.3],
      ["zigzag", 0.75],
      ["fast", 1.25],
      ["flaky", 1.6],
      ["regression", 2.15],
      ["heisen", 2.6],
    ] as const)
      spawn(s, kind, p).age = 0.3;
    Object.assign(spawnPower(s, "review"), { p: 1.15, lat: 0.6 });
    view.render(s, 0, 0.3);
    stage.render();

    let started = false;
    let running = false;
    let ended = false;
    let count = 0;
    let hit = 0;
    let overIn = 0;
    let finalScore = 0;
    let lastBeat = "";
    let lastStatus = "";
    const status = () => {
      const text = statusText(s, ctx.lang);
      if (text !== lastStatus) ctx.emit({ type: "status", text });
      lastStatus = text;
    };

    const caught = (e: CatchEvent) => {
      view.onCatch(e);
      ctx.emit({ type: "score", value: s.score });
      ctx.emit({ type: "stat", key: "bugs", inc: 1 });
      if (!rm) hit = HIT_STOP;
    };
    const handle = (events: StepEvent[]) => {
      for (const e of events) {
        if (e.type === "catch") caught(e);
        else if (e.type === "incident") view.onIncident();
        else if (e.type === "flagged") view.onFlagged(e.bug);
        else if (e.type === "release") view.onRelease(e.name);
        else if (e.type === "gameover") {
          ended = true;
          finalScore = e.score;
          overIn = GAMEOVER_BEAT;
          view.onGameOver();
        }
      }
    };

    const frame = (dt: number, t: number) => {
      if (!ended) {
        if (count > 0) {
          count -= dt;
          const beat = count > 0 ? String(Math.ceil(count / BEAT)) : ctx.lang === "es" ? "¡YA!" : "GO!";
          if (beat !== lastBeat) view.countdown(beat);
          lastBeat = beat;
        } else if (hit > 0) hit -= dt;
        else handle(step(s, dt));
        status();
      } else if (overIn > 0) {
        overIn -= dt;
        // A short beat of alarms before the shell's game-over card; emitted exactly once.
        if (overIn <= 0) ctx.emit({ type: "gameover", score: finalScore });
      }
      view.render(s, dt, t);
    };

    const onDown = (e: PointerEvent) => {
      if (!running || ended || count > 0) return;
      e.preventDefault();
      const hitTarget = view.pick(e.clientX, e.clientY, e.pointerType !== "mouse");
      if (!hitTarget) return;
      if (hitTarget.kind === "power") {
        const p = collect(s, hitTarget.id);
        if (p) view.onPower(p);
        return;
      }
      const r = tap(s, hitTarget.id);
      if (!r) return;
      if (r.type === "armor") view.onArmor(r.bug);
      else {
        caught(r);
        status();
      }
    };
    stage.canvas.addEventListener("pointerdown", onDown);

    return {
      start(difficulty: Difficulty) {
        s = createState(Math.random, difficulty);
        // The first build lines up at the DEV gate during the countdown.
        for (const p of [0.16, 0.08, 0.02]) spawn(s, "normal", p);
        ended = false;
        running = true;
        count = 3 * BEAT;
        hit = 0;
        overIn = 0;
        lastBeat = "";
        lastStatus = "";
        view.clearFx();
        view.resumeFx();
        ctx.emit({ type: "score", value: 0 });
        status();
        view.render(s, 0, 0);
        stage.render();
        if (!started) {
          started = true;
          stage.loop(frame);
        } else stage.resume();
      },
      pause() {
        running = false;
        view.pauseFx();
        stage.pause();
      },
      resume() {
        if (!started) return;
        running = true;
        view.resumeFx();
        stage.resume();
      },
      destroy() {
        stage.canvas.removeEventListener("pointerdown", onDown);
        view.dispose();
      },
    };
  },
};

export default mod;
