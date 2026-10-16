import { describe, expect, test } from "bun:test";
import { buildColcaLayout } from "../../layout";
import { CANYON, rimZ } from "../../plan";
import { cruzThermal } from "../condores/logic";
import {
  type Anchor,
  circleFor,
  farthestPhase,
  inWindow,
  LOOK,
  lookStep,
  onCircle,
  PASS,
  passAt,
  passOver,
  schedule,
} from "./logic";

const layout = buildColcaLayout({ cells: 60 });
const C = layout.cruz;
const anchor: Anchor = { x: C.x, s: C.z - rimZ(C.x), y: C.y - CANYON.rimY };
const dist = (p: { x: number; s: number; y: number }, q: { x: number; s: number; y: number }) =>
  Math.hypot(p.x - q.x, p.s - q.s, p.y - q.y);

describe("white condor", () => {
  test("flies in the morning, including where the T key lands (0.40), not at night", () => {
    for (const t of [0.3, 0.4, 0.45, 0.5]) expect(inWindow(t)).toBe(true);
    for (const t of [0.0, 0.2, 0.6, 0.93]) expect(inWindow(t)).toBe(false);
  });

  test("its circle passes within a good look of the lookout for a good part of every loop", () => {
    const c = circleFor(anchor);
    let near = 0;
    const N = 200;
    let min = Infinity;
    for (let i = 0; i < N; i++) {
      const p = onCircle(c, (i / N) * Math.PI * 2, 0);
      const d = dist(p, anchor);
      min = Math.min(min, d);
      if (d < LOOK.r) near++;
    }
    expect(near / N).toBeGreaterThan(0.3);
    // Not into the platform: the circle stays out over the canyon.
    expect(min).toBeGreaterThan(8);
    expect(c.s - c.r).toBeGreaterThan(0); // s > 0: past the rim's lip
    // A loop within ~30 s.
    expect((Math.PI * 2) / Math.abs(c.w)).toBeLessThan(31);
  });

  test("its circle keeps clear of the black condors' morning thermal at the Cruz", () => {
    const c = circleFor(anchor);
    const b = cruzThermal(C.x);
    // Horizontal overlap is small and the white one turns the other way.
    expect(Math.hypot(c.x - b.x, c.s - b.s)).toBeGreaterThan(c.r + b.r - 12);
    expect(Math.sign(c.w)).not.toBe(Math.sign(b.w));
  });

  test("reduced motion: a slower glide and still wings", () => {
    const c = circleFor(anchor, true);
    expect(Math.abs(c.w)).toBeLessThan(Math.abs(circleFor(anchor).w));
    for (let t = 0; t < 60; t += 0.3) expect(onCircle(c, 1, t, true).wing).toBe(0.08);
  });

  test("wings stay nearly flat except a rare stroke", () => {
    const c = circleFor(anchor);
    let flapping = 0;
    for (let t = 0; t < 370; t += 0.1) if (Math.abs(onCircle(c, 0, t).wing - 0.08) > 0.03) flapping++;
    expect(flapping / 3700).toBeLessThan(0.06);
    expect(flapping).toBeGreaterThan(0);
  });

  test("appears at the far side of its circle", () => {
    const c = circleFor(anchor);
    const ph = farthestPhase(c, anchor.x, anchor.s);
    const far = onCircle(c, ph, 0);
    for (let i = 0; i < 16; i++)
      expect(Math.hypot(far.x - anchor.x, far.s - anchor.s)).toBeGreaterThanOrEqual(
        Math.hypot(onCircle(c, i, 0).x - anchor.x, onCircle(c, i, 0).s - anchor.s) - 1e-6,
      );
  });

  test("the first low pass comes soon after arriving at the Cruz, then every so often", () => {
    let next: number | null = null;
    let first = -1;
    const starts: number[] = [];
    for (let clock = 0; clock < 200; clock += 0.1) {
      const r = schedule(next, clock, 10, false);
      next = r.next;
      if (r.start) {
        starts.push(clock);
        if (first < 0) first = clock;
      }
    }
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(15);
    expect(starts.length).toBeGreaterThanOrEqual(3);
    // Leaving the Cruz resets it.
    expect(schedule(5, 10, PASS.near + 1, false)).toEqual({ next: null, start: false });
  });

  test("no low pass with reduced motion", () => {
    let next: number | null = null;
    for (let clock = 0; clock < 200; clock += 0.5) {
      const r = schedule(next, clock, 5, true);
      next = r.next;
      expect(r.start).toBe(false);
    }
  });

  test("the low pass sweeps close past the lookout, above the cross, and joins the circle smoothly", () => {
    const c = circleFor(anchor);
    const a = onCircle(c, 0.3, 0);
    const b = onCircle(c, 2.1, 0);
    const over = passOver(anchor);
    expect(dist(passAt(a, over, b, 0), a)).toBeLessThan(1e-6);
    expect(dist(passAt(a, over, b, 1), b)).toBeLessThan(1e-6);
    expect(dist(passAt(a, over, b, 0.5), over)).toBeLessThan(1e-6);
    expect(dist(over, anchor)).toBeLessThan(15);
    // Out past the parapet and above the cross's top (~4.7 u over the floor).
    expect(over.s - anchor.s).toBeGreaterThan(9);
    expect(over.y - anchor.y).toBeGreaterThanOrEqual(5);
  });

  test("a good look needs the bird close and on screen for a moment", () => {
    let seen = 0;
    for (let i = 0; i < 10; i++) seen = lookStep(seen, 0.05, 20, true);
    expect(seen).toBeCloseTo(0.5);
    expect(lookStep(seen, 0.05, 20, false)).toBe(0);
    expect(lookStep(seen, 0.05, LOOK.r + 1, true)).toBe(0);
  });
});
