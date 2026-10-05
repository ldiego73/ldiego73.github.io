import { afterEach, expect, mock, test } from "bun:test";
import { NEON } from "../core/neon";
import type { GameEvent, GameInstance } from "../core/types";
import { type Board, seeded } from "./state";

// Exercise the real input and event wiring without a browser or GPU.
class Element extends EventTarget {
  style = { setProperty() {} };
  children: Element[] = [];
  hidden = false;
  disabled = false;
  textContent = "";
  append(...children: Element[]) {
    this.children.push(...children);
  }
  appendChild(child: Element) {
    this.append(child);
  }
  replaceChildren(...children: Element[]) {
    this.children = children;
  }
  closest(selector: string) {
    return selector === "button" ? null : this;
  }
  focus() {}
  setAttribute() {}
  setPointerCapture() {}
  remove() {}
  animate() {
    return { onfinish: null };
  }
}
let board: Board;
let running = false;
let frame: (dt: number, t: number) => void;
let picked = 0;
let canvas: Element;
mock.module("../core/stage", () => ({
  createStage: () => {
    canvas = new Element();
    return {
      canvas,
      size: { w: 900, h: 600 },
      loop(cb: typeof frame) {
        frame = cb;
        running = true;
      },
      pause() {
        running = false;
      },
      resume() {
        running = true;
      },
      render() {},
      dispose() {
        running = false;
      },
    };
  },
}));
mock.module("./view", () => ({
  ZDS_BLOOM: {},
  createView: () => ({
    build(b: Board) {
      board = b;
    },
    sync() {},
    update() {},
    redrawNumbers() {},
    exploit() {},
    win() {},
    setCursor() {},
    dispose() {},
    pick: () => picked,
    screenOf: () => ({ x: 200, y: 200 }),
  }),
}));
const { default: game } = await import("./index");
const originalDocument = globalThis.document;
const originalRandom = Math.random;
let instance: GameInstance;
afterEach(() => {
  instance?.destroy();
  globalThis.document = originalDocument;
  Math.random = originalRandom;
});
function setup(lang: "es" | "en" = "en") {
  Math.random = seeded(91);
  globalThis.document = { createElement: () => new Element() } as unknown as Document;
  const host = new Element();
  const events: GameEvent[] = [];
  instance = game.mount(host as unknown as HTMLElement, {
    lang,
    reducedMotion: true,
    palette: () => NEON,
    emit: (e) => events.push(e),
  });
  const key = (value: string) => host.dispatchEvent(Object.assign(new Event("keydown"), { key: value }));
  const pointer = (i: number, button = 0) => {
    picked = i;
    const fields = { button, pointerType: "mouse", pointerId: 1, clientX: 0, clientY: 0 };
    canvas.dispatchEvent(Object.assign(new Event("pointerdown"), fields));
    canvas.dispatchEvent(Object.assign(new Event("pointerup"), fields));
  };
  const moveTo = (i: number) => {
    key("ArrowUp");
    for (let k = 0; k < board.rows; k++) key("ArrowUp");
    for (let k = 0; k < board.cols; k++) key("ArrowLeft");
    for (let k = 0; k < Math.floor(i / board.cols); k++) key("ArrowDown");
    for (let k = 0; k < i % board.cols; k++) key("ArrowRight");
  };
  const scanAt = (i: number) => {
    moveTo(i);
    key("Enter");
  };
  const advance = () => {
    for (let k = 0; k < 60; k++) if (running) frame(0.05, k * 0.05);
  };
  const ends = () => events.filter((e) => e.type === "win" || e.type === "gameover");
  return { events, key, pointer, scanAt, advance, ends };
}

test("start gates inputs; pause stops inputs and the terminal timer; loss emits once", () => {
  const s = setup();
  s.key("Enter");
  expect(s.events).toEqual([]);
  instance.start("normal");
  s.key("ArrowRight");
  s.key("Enter");
  expect(board.status).toBe("playing");
  const before = board.scannedSafe;
  instance.pause();
  s.pointer(board.vuln.indexOf(true));
  expect(board.scannedSafe).toBe(before);
  expect(board.status).toBe("playing");
  instance.resume();
  s.pointer(board.vuln.indexOf(true));
  expect(board.status).toBe("lost");
  expect(s.events.some((e) => e.type === "status" && /CVE-2026-.*CVSS.*FICTIONAL/.test(e.text))).toBe(true);
  instance.pause();
  s.advance();
  expect(s.ends()).toHaveLength(0);
  instance.resume();
  s.advance();
  s.key("Enter");
  s.advance();
  expect(s.ends()).toEqual([{ type: "gameover", score: expect.any(Number) }]);
});

test("flagging before generation reports localized status; assist costs once; restart resets", () => {
  const s = setup("es");
  instance.start("hard");
  s.pointer(0, 2);
  expect(s.events.at(-1)).toEqual({ type: "status", text: "Vulns 36 · Marcadas 1" });
  s.pointer(0);
  expect(board.status).toBe("ready");
  s.pointer(80);
  s.key("h");
  s.key("h");
  expect(board.assistUsed).toBe(true);
  expect(board.penalty).toBe(900);
  expect(s.events.filter((e) => e.type === "stat" && e.key === "pentests")).toHaveLength(1);
  instance.start("easy");
  expect(board.cols).toBe(9);
  expect(board.status).toBe("ready");
  expect(board.assistUsed).toBe(false);
  expect(board.flags).toBe(0);
  expect(s.events.at(-1)).toEqual({ type: "status", text: "Vulns 10 · Marcadas 0" });
});

test("scripted safe scans emit exactly one win and reset pending loss on restart", () => {
  const s = setup();
  instance.start("normal");
  s.pointer(60);
  s.pointer(board.vuln.indexOf(true));
  instance.start("easy");
  s.pointer(40);
  for (let i = 0; i < board.vuln.length && board.status === "playing"; i++)
    if (!board.vuln[i] && !board.scanned[i]) s.scanAt(i);
  expect(board.status).toBe("won");
  s.advance();
  s.key("Enter");
  s.key("h");
  s.advance();
  expect(s.ends()).toEqual([{ type: "win", score: expect.any(Number) }]);
});
