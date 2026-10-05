import { ARCADE_FONT, NEON } from "../core/neon";
import { createStage } from "../core/stage";
import type { Difficulty, GameModule } from "../core/types";
import {
  type Board,
  boardFor,
  correctFlags,
  cveFor,
  finalScore,
  liveScore,
  neighbors,
  pentest,
  scan,
  seeded,
  toggleFlag,
} from "./state";
import { createView } from "./view";

const LONG_PRESS = 450;
const COUNT_STEP = 0.42;

const COPY = {
  es: {
    status: (v: number, f: number) => `Vulns ${v} · Marcadas ${f}`,
    exploit: "EXPLOIT",
    pentest: "Pentest",
    pentestAria: (c: number) => `Pentest: revela una casilla segura, cuesta ${c} puntos (tecla H)`,
    go: "SCAN",
  },
  en: {
    status: (v: number, f: number) => `Vulns ${v} · Flagged ${f}`,
    exploit: "EXPLOIT",
    pentest: "Pentest",
    pentestAria: (c: number) => `Pentest: reveals one safe tile, costs ${c} points (H key)`,
    go: "SCAN",
  },
} as const;

const css = (el: HTMLElement, s: Partial<CSSStyleDeclaration>) => Object.assign(el.style, s);

const mod: GameModule = {
  mount(el, ctx) {
    const T = COPY[ctx.lang];
    const motion = !ctx.reducedMotion;
    const stage = createStage(el, { camera: "persp", fov: 32, bloom: false });
    const view = createView(stage, ctx);
    const canvas = stage.canvas;
    canvas.style.cursor = "pointer";
    canvas.style.userSelect = "none";
    canvas.style.setProperty("-webkit-touch-callout", "none");
    const keyTarget = (el.closest(".cab-screen") as HTMLElement | null) ?? el;

    // DOM layer over the canvas: score pops, countdown, CVE callout, Pentest button.
    const fx = document.createElement("div");
    css(fx, { position: "absolute", inset: "0", pointerEvents: "none", overflow: "hidden", fontFamily: ARCADE_FONT });
    const countEl = document.createElement("div");
    css(countEl, {
      position: "absolute",
      left: "50%",
      top: "46%",
      transform: "translate(-50%,-50%)",
      font: `800 clamp(3rem, 12vw, 6rem)/1 ${ARCADE_FONT}`,
      color: NEON.cyan,
      textShadow: `3px 3px 0 ${NEON.void}`,
      display: "none",
    });
    const cveEl = document.createElement("div");
    css(cveEl, {
      position: "absolute",
      transform: "translate(-50%, calc(-100% - 10px))",
      padding: "6px 10px",
      border: `1px solid ${NEON.red}`,
      background: NEON.floor,
      color: NEON.red,
      textAlign: "center",
      whiteSpace: "nowrap",
      font: `700 clamp(11px, 2.4vw, 15px)/1.25 ${ARCADE_FONT}`,
      letterSpacing: "0.04em",
      textShadow: `2px 2px 0 ${NEON.void}`,
      display: "none",
    });
    const btn = document.createElement("button");
    btn.type = "button";
    btn.hidden = true;
    css(btn, {
      position: "absolute",
      left: "50%",
      bottom: "12px",
      transform: "translateX(-50%)",
      pointerEvents: "auto",
      padding: "8px 16px",
      minHeight: "40px",
      border: `2px solid ${NEON.grid}`,
      borderRadius: "0",
      background: NEON.floor,
      color: NEON.ink,
      font: `700 13px/1 ${ARCADE_FONT}`,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      boxShadow: `0 4px 0 ${NEON.void}`,
      cursor: "pointer",
      touchAction: "manipulation",
    });
    fx.append(countEl, cveEl);
    el.append(fx, btn);

    let board: Board = boardFor("normal", false);
    let started = false;
    let paused = false;
    let destroyed = false;
    let seconds = 0;
    let endIn = -1;
    let ending: (() => void) | null = null;
    let cursor = -1;
    let pointerFlagged = false;
    let countIn = 0;

    const portrait = () => stage.size.h > stage.size.w;
    const playable = () =>
      started &&
      !paused &&
      !destroyed &&
      countIn <= 0 &&
      endIn < 0 &&
      (board.status === "ready" || board.status === "playing");
    const status = () => ctx.emit({ type: "status", text: T.status(board.vulns, board.flags) });

    const syncButton = () => {
      const show = started && endIn < 0 && (board.status === "ready" || board.status === "playing");
      btn.hidden = !show;
      const usable = show && board.status === "playing" && !board.assistUsed && countIn <= 0;
      btn.disabled = !usable;
      btn.style.opacity = usable ? "1" : "0.38";
      btn.style.cursor = usable ? "pointer" : "default";
      btn.textContent = `${T.pentest} −${board.assistCost}`;
      btn.setAttribute("aria-label", T.pentestAria(board.assistCost));
      btn.title = T.pentestAria(board.assistCost);
    };

    const pop = (i: number, text: string, color: string) => {
      if (i < 0) return;
      const p = view.screenOf(i);
      const d = document.createElement("div");
      d.textContent = text;
      css(d, {
        position: "absolute",
        left: `${p.x}px`,
        top: `${p.y}px`,
        transform: "translate(-50%,-50%)",
        color,
        font: `800 clamp(13px, 2.6vw, 20px)/1 ${ARCADE_FONT}`,
        textShadow: `2px 2px 0 ${NEON.void}`,
        whiteSpace: "nowrap",
      });
      fx.appendChild(d);
      const kf = motion
        ? [
            { transform: "translate(-50%,-50%) scale(0.6)", opacity: 0 },
            { transform: "translate(-50%,-120%) scale(1.1)", opacity: 1, offset: 0.25 },
            { transform: "translate(-50%,-260%) scale(1)", opacity: 0 },
          ]
        : [{ opacity: 1 }, { opacity: 0 }];
      d.animate(kf, { duration: motion ? 850 : 600, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => d.remove();
    };

    // Idle first frame: a partially scanned demo cluster with a few red banners.
    const demo = () => {
      board = boardFor("normal", portrait());
      view.build(board);
      const mid = Math.floor(board.rows / 2) * board.cols + Math.floor(board.cols / 2);
      scan(board, mid, seeded(42));
      let placed = 0;
      for (let i = 0; i < board.vuln.length && placed < 3; i++)
        if (board.vuln[i] && neighbors(board, i).some((j) => board.scanned[j])) placed += +toggleFlag(board, i);
      view.sync(board, [], true);
      view.update(0, 0);
      stage.render();
    };
    demo();
    document.fonts?.ready.then(() => {
      if (destroyed) return;
      view.redrawNumbers();
      stage.render();
    });

    const setCursor = (i: number) => {
      cursor = i;
      view.setCursor(i);
    };

    const finish = (delay: number, fn: () => void) => {
      endIn = delay;
      ending = fn;
      syncButton();
    };

    const endStats = () => {
      const c = correctFlags(board);
      if (c) ctx.emit({ type: "stat", key: "cves", inc: c });
    };

    /** Shared aftermath of a scan or a Pentest reveal. */
    const after = (out: number[], at: number, before: number) => {
      if (board.status === "lost") {
        const cve = cveFor(Math.random);
        ctx.emit({
          type: "status",
          text: `${T.exploit} ${cve.id} · CVSS ${cve.cvss} · ${ctx.lang === "es" ? "FICTICIO" : "FICTIONAL"}`,
        });
        view.exploit(board);
        const p = view.screenOf(board.exploit);
        cveEl.replaceChildren();
        const k = document.createElement("div");
        k.textContent = `⚠ ${T.exploit}`;
        k.style.fontSize = "0.8em";
        const v = document.createElement("div");
        v.textContent = `${cve.id} · CVSS ${cve.cvss}`;
        cveEl.append(k, v);
        css(cveEl, {
          left: `${Math.min(Math.max(p.x, 110), stage.size.w - 110)}px`,
          top: `${Math.max(p.y, 70)}px`,
          display: "block",
        });
        if (motion)
          cveEl.animate(
            [
              { opacity: 0, transform: "translate(-48%, calc(-100% - 4px))" },
              { opacity: 1, transform: "translate(-52%, calc(-100% - 12px))", offset: 0.3 },
              { opacity: 0.6, transform: "translate(-50%, calc(-100% - 10px))", offset: 0.4 },
              { opacity: 1, transform: "translate(-50%, calc(-100% - 10px))" },
            ],
            { duration: 420, delay: 160, fill: "backwards" },
          );
        const final = liveScore(board);
        endStats();
        finish(motion ? 1.5 : 0.6, () => ctx.emit({ type: "gameover", score: final }));
        return;
      }
      const now = liveScore(board);
      const gain = Math.round(out.length * 10 * board.mult);
      if (gain) pop(at, `+${gain}`, NEON.lime);
      if (now !== before) ctx.emit({ type: "score", value: now });
      if (board.status === "won") {
        const final = finalScore(board, seconds);
        view.win(board);
        ctx.emit({ type: "score", value: final });
        endStats();
        finish(motion ? 1.3 : 0.6, () => ctx.emit({ type: "win", score: final }));
      }
      syncButton();
    };

    const doScan = (i: number) => {
      if (!playable() || i < 0) return;
      const before = liveScore(board);
      const out = scan(board, i, Math.random);
      if (!out.length) return;
      view.sync(board, out);
      after(out, i, before);
    };

    const doAssist = () => {
      if (!playable() || board.status !== "playing" || board.assistUsed) return;
      const before = liveScore(board);
      const out = pentest(board, Math.random);
      if (!out.length) return;
      view.sync(board, out, false, true);
      ctx.emit({ type: "stat", key: "pentests", inc: 1 });
      pop(out[0], `−${board.assistCost}`, NEON.amber);
      if (cursor >= 0) setCursor(out[0]);
      after(out, -1, before); // the cost pop already marks the tile
    };

    const doFlag = (i: number) => {
      if (!playable() || i < 0) return;
      if (!toggleFlag(board, i)) return;
      view.sync(board);
      status();
    };

    btn.addEventListener("click", () => {
      doAssist();
      keyTarget.focus({ preventScroll: true });
    });

    // Pointer: click = scan, right click = flag, long press on touch = flag.
    let down: { i: number; x: number; y: number; timer: number } | null = null;
    const cancelPress = () => {
      if (down) clearTimeout(down.timer);
      down = null;
    };
    const onDown = (e: PointerEvent) => {
      if (!playable()) return;
      keyTarget.focus({ preventScroll: true });
      const i = view.pick(e.clientX, e.clientY);
      setCursor(i);
      if (e.button === 2) {
        doFlag(i);
        return;
      }
      if (e.button !== 0) return;
      cancelPress();
      pointerFlagged = false;
      const timer =
        e.pointerType === "mouse"
          ? 0
          : window.setTimeout(() => {
              pointerFlagged = true;
              doFlag(i);
              navigator.vibrate?.(15);
            }, LONG_PRESS);
      canvas.setPointerCapture(e.pointerId);
      down = { i, x: e.clientX, y: e.clientY, timer };
    };
    const onMove = (e: PointerEvent) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) cancelPress();
      if (e.pointerType === "mouse" && playable()) setCursor(view.pick(e.clientX, e.clientY));
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const i = down.i;
      cancelPress();
      if (!pointerFlagged && e.button === 0) doScan(i);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") setCursor(-1);
    };
    const onContext = (e: Event) => e.preventDefault();
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", cancelPress);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("contextmenu", onContext);

    // Keyboard: arrows/WASD move the cursor tile, Space/Enter scan, F flag, H pentest.
    const MOVES: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      w: [0, -1],
      s: [0, 1],
      a: [-1, 0],
      d: [1, 0],
    };
    const center = () => Math.floor(board.rows / 2) * board.cols + Math.floor(board.cols / 2);
    const onKey = (e: KeyboardEvent) => {
      if (!playable() || (e.target as HTMLElement).closest?.("button")) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const mv = MOVES[key];
      const n = board.cols * board.rows;
      if (mv) {
        e.preventDefault();
        if (cursor < 0) return setCursor(center());
        const c = Math.min(board.cols - 1, Math.max(0, (cursor % board.cols) + mv[0]));
        const r = Math.min(board.rows - 1, Math.max(0, Math.floor(cursor / board.cols) + mv[1]));
        setCursor(r * board.cols + c);
      } else if (key === " " || key === "Enter") {
        e.preventDefault();
        if (cursor >= 0 && cursor < n) doScan(cursor);
        else setCursor(center());
      } else if (key === "f") {
        e.preventDefault();
        if (cursor >= 0 && cursor < n) doFlag(cursor);
      } else if (key === "h") {
        e.preventDefault();
        doAssist();
      }
    };
    keyTarget.addEventListener("keydown", onKey);

    const frame = (dt: number, t: number) => {
      if (countIn > 0) {
        countIn -= dt;
        const step = Math.ceil(countIn / COUNT_STEP);
        if (countIn <= 0) {
          countEl.style.display = "none";
          syncButton();
        } else {
          countEl.style.display = "block";
          countEl.textContent = step > 1 ? String(step - 1) : T.go;
          const u = 1 - (countIn % COUNT_STEP) / COUNT_STEP;
          countEl.style.transform = `translate(-50%,-50%) scale(${1.35 - u * 0.35})`;
          countEl.style.opacity = String(1 - u * 0.7);
        }
      }
      if (started && board.status === "playing" && endIn < 0) seconds += dt;
      if (endIn >= 0) {
        endIn -= dt;
        if (endIn < 0 && ending) {
          const fn = ending;
          ending = null;
          setCursor(-1);
          fn();
        }
      }
      view.update(dt, t);
    };
    // Keep the demo responsive behind the cabinet overlay.
    if (motion) stage.loop(frame);

    return {
      start(difficulty: Difficulty) {
        cancelPress();
        board = boardFor(difficulty, portrait());
        view.build(board);
        setCursor(-1);
        seconds = 0;
        endIn = -1;
        ending = null;
        started = true;
        paused = false;
        countIn = motion ? COUNT_STEP * 4 : 0;
        cveEl.style.display = "none";
        for (const p of [...fx.children]) if (p !== countEl && p !== cveEl) p.remove();
        ctx.emit({ type: "score", value: 0 });
        status();
        syncButton();
        stage.loop(frame);
      },
      pause() {
        paused = true;
        cancelPress();
        stage.pause();
      },
      resume() {
        paused = false;
        if (started || motion) stage.resume();
      },
      destroy() {
        destroyed = true;
        cancelPress();
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", cancelPress);
        canvas.removeEventListener("pointerleave", onLeave);
        canvas.removeEventListener("contextmenu", onContext);
        keyTarget.removeEventListener("keydown", onKey);
        fx.remove();
        btn.remove();
        view.dispose();
        stage.dispose();
      },
    };
  },
};

export default mod;
