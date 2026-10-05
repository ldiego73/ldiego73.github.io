import { expect, mock, test } from "bun:test";
import { NEON } from "../core/neon";
import type { GameEvent } from "../core/types";
import { type GameState, spawn, spawnPower } from "./state";

// Test the shell contract without a WebGL/DOM dependency.
let current: GameState;
let frame: (dt: number, t: number) => void;
let target: { kind: "bug" | "power"; id: number } | null = null;
const canvas = new EventTarget();
mock.module("./view", () => ({
  createView: () => ({
    stage: {
      canvas,
      render() {},
      loop(cb: typeof frame) {
        frame = cb;
      },
      pause() {},
      resume() {},
    },
    render(s: GameState) {
      current = s;
    },
    pick: () => target,
    onCatch() {},
    onIncident() {},
    onFlagged() {},
    onRelease() {},
    onGameOver() {},
    onPower() {},
    onArmor() {},
    countdown() {},
    clearFx() {},
    pauseFx() {},
    resumeFx() {},
    dispose() {},
  }),
}));
const { default: game } = await import("./index");
const click = (id: number) => {
  target = { kind: "bug", id };
  canvas.dispatchEvent(new Event("pointerdown", { cancelable: true }));
};
const tick = (seconds: number) => {
  for (let i = 0; i < seconds * 20; i++) frame(0.05, i / 20);
};

test("mount idles; starts/restarts with difficulty; each catch emits one stat; gameover emits once", () => {
  const events: GameEvent[] = [];
  const instance = game.mount({} as HTMLElement, {
    lang: "en",
    reducedMotion: true,
    palette: () => NEON,
    emit: (e) => events.push(e),
  });
  expect(events).toHaveLength(0);
  click(current.bugs[0]!.id);
  expect(events).toHaveLength(0);
  instance.start("hard");
  expect(current.maxIncidents).toBe(2);
  expect(events).toContainEqual({ type: "score", value: 0 });
  expect(events).toContainEqual({ type: "status", text: "Incidents 0/2 · Combo x1" });
  tick(2);
  const flaky = spawn(current, "flaky", 0.5);
  click(flaky.id);
  expect(events.filter((e) => e.type === "stat")).toHaveLength(0);
  click(flaky.id);
  click(flaky.id);
  expect(events.filter((e) => e.type === "stat")).toEqual([{ type: "stat", key: "bugs", inc: 1 }]);
  expect(events).toContainEqual({ type: "score", value: 30 });
  instance.pause();
  click(current.bugs[0]!.id);
  expect(events.filter((e) => e.type === "stat")).toHaveLength(1);
  instance.resume();
  tick(120);
  expect(events.filter((e) => e.type === "gameover")).toEqual([{ type: "gameover", score: 30 }]);
  tick(5);
  instance.pause();
  instance.resume();
  tick(5);
  expect(events.filter((e) => e.type === "gameover")).toHaveLength(1);
  instance.start("easy");
  expect(current.maxIncidents).toBe(5);
  expect(current.score).toBe(0);
  expect(current.caught).toBe(0);
  tick(120);
  expect(events.filter((e) => e.type === "gameover")).toHaveLength(2);
  instance.destroy();
  const count = events.length;
  click(current.bugs[0]?.id ?? -1);
  expect(events).toHaveLength(count);
});

test("Code review emits bugs +1 for each automatic catch and localized combo status", () => {
  const events: GameEvent[] = [];
  const instance = game.mount({} as HTMLElement, {
    lang: "es",
    reducedMotion: true,
    palette: () => NEON,
    emit: (e) => events.push(e),
  });
  instance.start("normal");
  tick(2);
  current.bugs.length = 0;
  const power = spawnPower(current, "review");
  target = { kind: "power", id: power.id };
  canvas.dispatchEvent(new Event("pointerdown", { cancelable: true }));
  for (let i = 0; i < 3; i++) spawn(current, "flaky", 0.99).speed = 1;
  tick(0.05);
  expect(events.filter((e) => e.type === "stat")).toEqual(
    Array.from({ length: 3 }, () => ({ type: "stat", key: "bugs", inc: 1 })),
  );
  expect(events).toContainEqual({ type: "score", value: 120 });
  expect(events).toContainEqual({ type: "status", text: "Incidentes 0/3 · Combo x3" });
  instance.destroy();
});
