import { describe, expect, test } from "bun:test";
import type { SnakeState } from "./state";
import {
  autopilot,
  BONUS_POINTS,
  CACHE_FACTOR,
  CACHE_TIME,
  createState,
  DIFFICULTY,
  interval,
  PACKET_POINTS,
  START_LEN,
  seeded,
  step,
  tick,
  turn,
} from "./state";

const fixed = (v: number) => () => v;

function feedAhead(s: SnakeState) {
  const h = s.body[0];
  const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[s.dir];
  s.food = { x: h.x + d[0], y: h.y + d[1] };
}

describe("neon snake rules", () => {
  test("starts moving right with a packet off the stream", () => {
    const s = createState(20, 15, "normal", seeded(1));
    expect(s.body.length).toBe(START_LEN);
    expect(s.dir).toBe("right");
    expect(s.food).not.toBeNull();
    expect(s.body.some((c) => c.x === s.food?.x && c.y === s.food?.y)).toBe(false);
  });

  test("difficulty table: hard is faster than normal, normal faster than easy", () => {
    const e = createState(20, 15, "easy", seeded(1));
    const n = createState(20, 15, "normal", seeded(1));
    const h = createState(20, 15, "hard", seeded(1));
    expect(interval(e)).toBeGreaterThan(interval(n));
    expect(interval(n)).toBeGreaterThan(interval(h));
    expect(DIFFICULTY.easy.wrap).toBe(true);
    expect(DIFFICULTY.normal.wrap).toBe(false);
    expect(DIFFICULTY.hard.firewalls && DIFFICULTY.hard.bug).toBe(true);
    expect(DIFFICULTY.normal.firewalls || DIFFICULTY.normal.bug).toBe(false);
  });

  test("normal: walls kill", () => {
    const s = createState(10, 8, "normal", fixed(0));
    s.food = null;
    let steps = 0;
    while (s.alive && steps < 50) {
      step(s, fixed(0));
      steps++;
    }
    expect(s.alive).toBe(false);
    expect(s.body[0].x).toBe(9);
  });

  test("easy: walls wrap around", () => {
    const s = createState(10, 8, "easy", fixed(0));
    s.food = null;
    for (let i = 0; i < 12; i++) step(s, fixed(0));
    expect(s.alive).toBe(true);
    expect(s.body[0].x).toBe((4 + 12) % 10);
  });

  test("reversal is ignored and one turn is buffered ahead", () => {
    const s = createState(20, 15, "normal", fixed(0.99));
    turn(s, "left");
    expect(s.queue).toEqual([]);
    turn(s, "up");
    turn(s, "left");
    turn(s, "down");
    expect(s.queue).toEqual(["up", "left"]);
    step(s, fixed(0.99));
    expect(s.dir).toBe("up");
    step(s, fixed(0.99));
    expect(s.dir).toBe("left");
  });

  test("eating a packet scores, grows by one and counts", () => {
    const s = createState(20, 15, "normal", fixed(0.99));
    feedAhead(s);
    const ev = step(s, fixed(0.99));
    expect(ev.ate).toBe("packet");
    expect(s.score).toBe(PACKET_POINTS);
    expect(s.eaten).toBe(1);
    step(s, fixed(0.99));
    expect(s.body.length).toBe(START_LEN + 1);
  });

  test("hard doubles points", () => {
    const s = createState(20, 15, "hard", fixed(0.99));
    feedAhead(s);
    step(s, fixed(0.99));
    expect(s.score).toBe(PACKET_POINTS * 2);
  });

  test("bonus packet pays more and expires", () => {
    const s = createState(20, 15, "normal", fixed(0.99));
    const h = s.body[0];
    s.bonus = { x: h.x + 1, y: h.y, ttl: 5 };
    expect(step(s, fixed(0.99)).ate).toBe("bonus");
    expect(s.score).toBe(BONUS_POINTS);
    s.bonus = { x: 0, y: 0, ttl: 2 };
    step(s, fixed(0.99));
    step(s, fixed(0.99));
    expect(s.bonus).toBeNull();
  });

  test("cache slows the stream for 4 seconds", () => {
    const s = createState(20, 15, "normal", fixed(0.99));
    const base = interval(s);
    const h = s.body[0];
    s.power = { x: h.x + 1, y: h.y, kind: "cache", ttl: 10 };
    expect(step(s, fixed(0.99)).ate).toBe("cache");
    expect(interval(s)).toBeCloseTo(base * CACHE_FACTOR);
    tick(s, CACHE_TIME + 0.1);
    expect(interval(s)).toBeCloseTo(base);
  });

  test("compress sheds 3 segments", () => {
    const s = createState(20, 15, "normal", fixed(0.99));
    s.grow = 4;
    for (let i = 0; i < 4; i++) step(s, fixed(0.99));
    expect(s.body.length).toBe(START_LEN + 4);
    const h = s.body[0];
    s.power = { x: h.x + 1, y: h.y, kind: "compress", ttl: 10 };
    const ev = step(s, fixed(0.99));
    expect(ev.ate).toBe("compress");
    expect(ev.lost.length).toBe(3);
    expect(s.body.length).toBe(START_LEN + 1);
  });

  test("hard: firewalls appear as you grow and kill on contact", () => {
    const s = createState(20, 15, "hard", seeded(3));
    let walls = 0;
    for (let i = 0; i < 10; i++) {
      s.body = [
        { x: 10, y: 7 },
        { x: 9, y: 7 },
        { x: 8, y: 7 },
      ];
      s.dir = "right";
      s.walls = s.walls.filter((w) => !(w.y === 7 && w.x >= 11 && w.x <= 12));
      s.food = { x: 11, y: 7 };
      if (step(s, seeded(10 + i)).wall) walls++;
    }
    expect(walls).toBeGreaterThan(0);
    expect(s.walls.length).toBe(walls);
    const h = s.body[0];
    s.walls.push({ x: h.x + 1, y: h.y });
    s.dir = "right";
    s.queue = [];
    expect(step(s, fixed(0.5)).died).toBe(true);
  });

  test("normal: no firewalls or bugs ever", () => {
    const s = createState(20, 15, "normal", seeded(5));
    for (let i = 0; i < 20; i++) {
      feedAhead(s);
      if (s.body[0].x >= 18) s.body = s.body.map((c) => ({ x: c.x - 10, y: c.y }));
      step(s, seeded(i));
    }
    expect(s.walls.length).toBe(0);
    expect(s.bug).toBeNull();
  });

  test("hard: the bug bites segments off the stream", () => {
    const s = createState(20, 15, "hard", fixed(0.99));
    s.body = [];
    for (let i = 0; i < 10; i++) s.body.push({ x: 15 - i, y: 7 });
    s.food = { x: 0, y: 0 };
    s.steps = 1; // next step is even: the bug moves
    s.bug = { x: 11, y: 8, ttl: 20, from: { x: 11, y: 8 } };
    const ev = step(s, fixed(0));
    expect(ev.bitten).toBe(true);
    expect(ev.lost.length).toBeGreaterThan(0);
    expect(s.body.length).toBeLessThan(10);
    expect(s.bug).toBeNull();
  });

  test("hard: eating the bug scores", () => {
    const s = createState(20, 15, "hard", fixed(0.99));
    const h = s.body[0];
    s.bug = { x: h.x + 1, y: h.y, ttl: 20, from: { x: h.x + 1, y: h.y } };
    expect(step(s, fixed(0.99)).ate).toBe("bug");
    expect(s.score).toBeGreaterThan(0);
  });

  test("self collision kills (moving into the vacating tail is allowed)", () => {
    const s = createState(20, 15, "easy", fixed(0.99));
    s.body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
    ];
    s.dir = "right";
    turn(s, "down");
    expect(step(s, fixed(0.99)).died).toBe(false);
    const t = createState(20, 15, "easy", fixed(0.99));
    t.body = [
      { x: 5, y: 5 },
      { x: 4, y: 5 },
      { x: 4, y: 6 },
      { x: 5, y: 6 },
      { x: 6, y: 6 },
    ];
    t.dir = "right";
    turn(t, "down");
    expect(step(t, fixed(0.99)).died).toBe(true);
  });

  for (const diff of ["easy", "normal", "hard"] as const) {
    test(`${diff}: scripted run reaches 30 packets once, then dies`, () => {
      const s = createState(20, 15, diff, seeded(7));
      let milestones = 0;
      let died = false;
      for (let i = 0; i < 4000 && !died; i++) {
        if (s.eaten < 31) {
          // keep it simple: drop the next packet straight ahead, bounce around the middle rows
          const h = s.body[0];
          if (h.x >= 17 && s.dir === "right") turn(s, h.y > 7 ? "up" : "down");
          if (h.x <= 2 && s.dir === "left") turn(s, h.y > 7 ? "up" : "down");
          if (s.dir === "up" || s.dir === "down") turn(s, h.x > 9 ? "left" : "right");
          s.walls = [];
          s.bug = null;
          s.body = s.body.slice(0, 6);
          feedAhead(s);
        } else turn(s, s.dir === "up" ? "left" : "up");
        const ev = step(s, seeded(i));
        if (ev.milestone30) milestones++;
        died = ev.died;
        if (diff === "easy" && s.eaten > 30 && s.steps > 200) {
          // wrap mode: die by coiling into ourselves
          s.body = [
            { x: 5, y: 5 },
            { x: 4, y: 5 },
            { x: 4, y: 6 },
            { x: 5, y: 6 },
            { x: 6, y: 6 },
          ];
          s.dir = "right";
          s.queue = ["down"];
          died = step(s, fixed(0.5)).died;
        }
      }
      expect(milestones).toBe(1);
      expect(s.eaten).toBeGreaterThanOrEqual(30);
      expect(died).toBe(true);
    });
  }

  test("autopilot never steers into an immediate wall", () => {
    const s = createState(20, 15, "normal", seeded(2));
    for (let i = 0; i < 300 && s.alive; i++) {
      turn(s, autopilot(s));
      step(s, seeded(i));
    }
    expect(s.steps).toBeGreaterThan(30);
  });
});
