import { describe, expect, test } from "bun:test";
import { moonOf } from "../../calendar";
import { arcDir, moonlight, phaseLight } from "./moon";

const v = () => ({ x: 0, y: 0, z: 0 });
const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  a.x * b.x + a.y * b.y + a.z * b.z;

describe("moon", () => {
  test("sun arc: rises at 0.25, noon high, sets at 0.75, leaning north", () => {
    expect(arcDir(0.25, 0, v()).y).toBeCloseTo(0, 6);
    expect(arcDir(0.5, 0, v()).y).toBeGreaterThan(0.9);
    expect(arcDir(0.75, 0, v()).y).toBeCloseTo(0, 6);
    expect(arcDir(0.5, 0, v()).z).toBeLessThan(0);
  });

  test("phase light: lit fraction is the calendar illumination, bright limb toward the sun", () => {
    for (const phase of [0.05, 0.25, 0.5, 0.7, 0.9]) {
      const L = phaseLight({ x: -0.6, y: -0.8 }, phase, v());
      // Lit fraction of a sphere seen along +z with light L: (1 + L·view) / 2.
      const lit = (1 + dot(L, { x: 0, y: 0, z: 1 })) / 2;
      const illum = (1 - Math.cos(phase * 2 * Math.PI)) / 2;
      expect(lit).toBeCloseTo(illum, 6);
      if (phase !== 0.5) {
        expect(L.x).toBeLessThan(0);
        expect(L.y).toBeLessThan(0);
      }
    }
  });

  test("moon lags the sun by its phase along the arc", () => {
    // The moon rises later each night: same time, larger phase → lower in the east.
    expect(arcDir(0.3, 0.1, v()).y).toBeLessThan(arcDir(0.3, 0, v()).y);
  });

  test("full moon rises at sunset; new moon is down at midnight", () => {
    expect(arcDir(0.75, 0.5, v()).y).toBeCloseTo(0, 6);
    expect(arcDir(0.0, 0.5, v()).y).toBeGreaterThan(0.9);
    expect(arcDir(0.0, 0.0, v()).y).toBeLessThan(-0.9);
  });

  test("moonlight scales with illumination and altitude", () => {
    expect(moonlight(1, 0.8)).toBeCloseTo(1, 6);
    expect(moonlight(0, 0.8)).toBe(0);
    expect(moonlight(1, -0.1)).toBe(0);
    expect(moonlight(0.5, 0.8)).toBeCloseTo(0.5, 6);
    expect(moonlight(1, 0.1)).toBeGreaterThan(0);
    expect(moonlight(1, 0.1)).toBeLessThan(1);
  });

  test("calendar sanity: a known full moon and new moon in 2026", () => {
    expect(moonOf(new Date("2026-09-26T12:00:00")).illumination).toBeGreaterThan(0.98);
    expect(moonOf(new Date("2026-09-11T12:00:00")).illumination).toBeLessThan(0.02);
  });
});
