import { describe, expect, test } from "bun:test";
import { festivalOf } from "../../calendar";
import { dateWatch } from "./datewatch";

describe("dateWatch", () => {
  test("reads the state at once and only re-checks after the period", () => {
    let d = new Date("2026-06-19T23:59:50");
    const w = dateWatch(() => festivalOf(d) === "inti-raymi", 60);
    expect(w.on).toBe(false);
    d = new Date("2026-06-20T00:00:05");
    expect(w.step(30)).toBe(false);
    expect(w.on).toBe(false);
    expect(w.step(31)).toBe(true);
    expect(w.on).toBe(true);
    expect(w.step(61)).toBe(false);
  });

  test("turns off when the festival ends and check() flips immediately", () => {
    let d = new Date("2026-06-24T12:00:00");
    const w = dateWatch(() => festivalOf(d) === "inti-raymi", 60);
    expect(w.on).toBe(true);
    d = new Date("2026-06-25T00:00:01");
    expect(w.check()).toBe(true);
    expect(w.on).toBe(false);
    expect(w.check()).toBe(false);
  });
});
