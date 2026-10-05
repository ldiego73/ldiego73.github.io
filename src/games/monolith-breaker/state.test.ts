import { describe, expect, test } from "bun:test";
import {
  BALL_R,
  BOSS_LEVEL,
  BRICK_H,
  buildLevel,
  collideBox,
  createState,
  DEBT_K,
  DIFFICULTY,
  EFFECT_TIME,
  type Ev,
  type Input,
  LEVELS,
  MAX_BALLS,
  PADDLE_H,
  PADDLE_Y,
  PIERCE_TIME,
  type PowerKind,
  paddleBounce,
  paddleHalf,
  STEP,
  type State,
  seeded,
  step,
  WIDE_K,
} from "./state";

const idle: Input = { move: 0, target: null, launch: false };
const DIFFS = ["easy", "normal", "hard"] as const;

function run(s: State, seconds: number, input: (s: State) => Input = () => idle): Ev[] {
  const evs: Ev[] = [];
  for (let i = 0; i < seconds / STEP && s.phase === "play"; i++) {
    step(s, input(s));
    evs.push(...s.events);
    s.events.length = 0;
  }
  return evs;
}

const legacy = (d: (typeof DIFFS)[number]) =>
  LEVELS.reduce((n, _, i) => n + buildLevel(i, d).filter((b) => b.maxHp > 1).length, 0);

describe("collision", () => {
  test("ball hitting a box from below bounces down", () => {
    const b = { x: 0, y: -0.3 - BALL_R + 0.05, vx: 0, vy: 5, stuck: false };
    expect(collideBox(b, 0, 0, 0.75, 0.3)).toBe(true);
    expect(b.vy).toBeLessThan(0);
    expect(b.vx).toBeCloseTo(0);
  });
  test("side hit flips vx only", () => {
    const b = { x: -0.75 - BALL_R + 0.05, y: 0, vx: 5, vy: 0, stuck: false };
    collideBox(b, 0, 0, 0.75, 0.3);
    expect(b.vx).toBeLessThan(0);
    expect(b.vy).toBeCloseTo(0);
  });
  test("no contact when apart", () => {
    const b = { x: 3, y: 3, vx: 1, vy: 1, stuck: false };
    expect(collideBox(b, 0, 0, 0.75, 0.3)).toBe(false);
  });
  test("paddle offset sets angle", () => {
    const b = { x: 0, y: 0, vx: 0, vy: 0, stuck: false };
    paddleBounce(b, 0, 10);
    expect(b.vx).toBeCloseTo(0);
    expect(b.vy).toBeCloseTo(10);
    paddleBounce(b, 1, 10);
    expect(b.vx).toBeGreaterThan(8);
    paddleBounce(b, -0.5, 10);
    expect(b.vx).toBeLessThan(0);
  });
  test("ball does not tunnel through a brick even with a large dt", () => {
    const s = createState("normal", seeded(1));
    const br = s.bricks[s.bricks.length - 1];
    s.bricks = [br, s.bricks[0]];
    s.balls = [{ x: br.x, y: br.y - 3, vx: 0, vy: 14, stuck: false }];
    step(s, idle, 0.4);
    expect(br.alive).toBe(false);
    expect(s.balls[0].vy).toBeLessThan(0);
    expect(s.balls[0].y).toBeLessThan(br.y - BRICK_H / 2);
  });
  test("ball bounces off the paddle by hit position", () => {
    const s = createState("normal", seeded(2));
    s.balls = [{ x: s.paddleX + 1, y: PADDLE_Y + PADDLE_H / 2 + BALL_R + 0.3, vx: 0, vy: -10, stuck: false }];
    const evs = run(s, 0.1);
    expect(evs.some((e) => e.t === "paddle")).toBe(true);
    expect(s.balls[0].vy).toBeGreaterThan(0);
    expect(s.balls[0].vx).toBeGreaterThan(0);
  });
  test("legacy blocks need several hits", () => {
    const s = createState("normal", seeded(3));
    const br = s.bricks.find((b) => b.maxHp === 2)!;
    s.bricks = [br, s.bricks[0]];
    s.balls = [{ x: br.x, y: br.y - 1.5, vx: 0, vy: 10, stuck: false }];
    const evs = run(s, 0.3);
    expect(evs.some((e) => e.t === "hit")).toBe(true);
    expect(br.alive).toBe(true);
    expect(br.hp).toBe(1);
  });
});

describe("difficulty", () => {
  test("lives: easy 5, normal 3, hard 2, each ends in exactly one gameover", () => {
    for (const d of DIFFS) {
      const s = createState(d, seeded(5));
      const evs = run(s, 200, (st) => ({ move: 0, target: st.balls[0]?.stuck ? null : 7, launch: true }));
      expect(evs.filter((e) => e.t === "life").length).toBe(DIFFICULTY[d].lives);
      expect(evs.filter((e) => e.t === "over").length).toBe(1);
      expect(s.phase).toBe("over");
    }
    expect([DIFFICULTY.easy.lives, DIFFICULTY.normal.lives, DIFFICULTY.hard.lives]).toEqual([5, 3, 2]);
  });
  test("easy is slower with a wider paddle, hard is faster with a narrower one", () => {
    const [e, n, h] = DIFFS.map((d) => createState(d, seeded(1)));
    for (const s of [e, n, h]) step(s, { ...idle, launch: true });
    const sp = (s: State) => Math.hypot(s.balls[0].vx, s.balls[0].vy);
    expect(sp(e)).toBeLessThan(sp(n));
    expect(sp(n)).toBeLessThan(sp(h));
    expect(paddleHalf(e)).toBeGreaterThan(paddleHalf(n));
    expect(paddleHalf(n)).toBeGreaterThan(paddleHalf(h));
  });
  test("hard adds legacy blocks, easy caps legacy at two hits", () => {
    expect(legacy("hard")).toBeGreaterThan(legacy("normal"));
    expect(Math.max(...LEVELS.flatMap((_, i) => buildLevel(i, "easy").map((b) => b.maxHp)))).toBe(2);
    expect(DIFFICULTY.hard.bossHp).toBeGreaterThan(DIFFICULTY.easy.bossHp);
  });
});

describe("progression", () => {
  test("stuck ball follows paddle and launches", () => {
    const s = createState("normal", seeded(4));
    run(s, 0.3, () => ({ move: 1, target: null, launch: false }));
    expect(s.balls[0].stuck).toBe(true);
    expect(s.balls[0].x).toBeCloseTo(s.paddleX);
    step(s, { move: 0, target: null, launch: true });
    expect(s.balls[0].stuck).toBe(false);
    expect(s.balls[0].vy).toBeGreaterThan(0);
  });
  test("six stages: five monoliths with distinct shapes and the boss", () => {
    expect(LEVELS.length).toBe(6);
    expect(new Set(LEVELS.map((l) => l.join("/"))).size).toBe(6);
    const s = createState("normal", seeded(6), BOSS_LEVEL);
    expect(s.boss).not.toBeNull();
    expect(createState("normal", seeded(6)).boss).toBeNull();
  });
  test("clearing every stage emits level 1..6 then one win", () => {
    const s = createState("normal", seeded(6));
    const all: Ev[] = [];
    for (let l = 0; l < BOSS_LEVEL; l++) {
      expect(s.level).toBe(l);
      for (const b of s.bricks.slice(1)) b.alive = false;
      const last = s.bricks[0];
      last.hp = 1;
      s.balls = [{ x: last.x, y: last.y - 1, vx: 0, vy: 10, stuck: false }];
      all.push(...run(s, 0.3));
    }
    expect(s.level).toBe(BOSS_LEVEL);
    s.boss!.hp = 1;
    s.boss!.vx = 0;
    s.bricks = [];
    s.balls = [{ x: s.boss!.x, y: s.boss!.y - 2, vx: 0, vy: 10, stuck: false }];
    all.push(...run(s, 0.5));
    expect(all.filter((e) => e.t === "level").map((e) => (e as { level: number }).level)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all.filter((e) => e.t === "win").length).toBe(1);
    expect(s.phase).toBe("win");
  });
  test("boss: needs N core hits, sheds blocks, not won while the core lives", () => {
    const s = createState("normal", seeded(9), BOSS_LEVEL);
    const boss = s.boss!;
    s.bricks = [];
    let hits = 0;
    let shed = 0;
    for (let i = 0; i < boss.maxHp - 1; i++) {
      boss.cd = 0;
      boss.vx = 0;
      s.balls = [{ x: boss.x, y: boss.y - 1.3, vx: 0, vy: 10, stuck: false }];
      const evs = run(s, 0.1);
      hits += evs.filter((e) => e.t === "boss").length;
      shed += evs.filter((e) => e.t === "shed").length;
      for (const b of s.bricks) b.alive = false; // keep the lane clear
    }
    expect(hits).toBe(boss.maxHp - 1);
    expect(shed).toBeGreaterThan(0);
    expect(s.phase).toBe("play");
    expect(boss.hp).toBe(1);
  });
  test("boss core moves and stays inside the walls", () => {
    const s = createState("hard", seeded(10), BOSS_LEVEL);
    const xs: number[] = [];
    run(s, 10, () => {
      xs.push(s.boss!.x);
      return idle;
    });
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(5);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(8);
  });
  for (const difficulty of DIFFS) {
    test(`autopilot clears every stage on ${difficulty}, with exactly one win`, () => {
      const rng = seeded(7);
      const s = createState(difficulty, rng);
      let off = 0.3;
      const evs = run(s, 3600, (st) => {
        const b = st.balls.filter((x) => !x.stuck).sort((a, c) => a.y - c.y)[0];
        if (rng() < 0.01) off = (rng() - 0.5) * 1.6;
        return { move: 0, target: b ? b.x - off : st.paddleX, launch: true };
      });
      expect(evs.filter((e) => e.t === "level").map((e) => (e as { level: number }).level)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(evs.filter((e) => e.t === "win").length).toBe(1);
      expect(evs.filter((e) => e.t === "over").length).toBe(0);
      expect(s.phase).toBe("win");
      expect(s.score).toBeGreaterThan(0);
      for (let i = 0; i < 100; i++) step(s, { ...idle, launch: true });
      expect(s.events).toEqual([]);
    });
  }
  test("boss recycles destroyed shields during long fights", () => {
    const s = createState("hard", seeded(31), BOSS_LEVEL);
    const initialId = s.nextId;
    for (let i = 0; i < 200; i++) {
      for (const brick of s.bricks) brick.alive = false;
      s.boss!.shedT = 0;
      step(s, idle);
      expect(s.bricks.length).toBeLessThanOrEqual(44);
      s.events.length = 0;
    }
    expect(s.nextId).toBe(initialId + 200);
    expect(s.phase).toBe("play");
  });
});

describe("power-ups and hazards", () => {
  const catchIt = (s: State, kind: PowerKind) => {
    s.powers.push({ kind, x: s.paddleX, y: PADDLE_Y + 0.1 });
    return run(s, 0.05);
  };
  test("autoscale, circuit breaker and retry", () => {
    const s = createState("normal", seeded(8));
    s.balls = [{ x: 0, y: 8, vx: 0, vy: 10, stuck: false }];
    const evs = catchIt(s, "wide");
    expect(evs.some((e) => e.t === "power" && e.kind === "wide")).toBe(true);
    expect(paddleHalf(s)).toBeCloseTo(DIFFICULTY.normal.half * WIDE_K);
    s.wideT = 0.01;
    run(s, 0.05);
    expect(paddleHalf(s)).toBe(DIFFICULTY.normal.half);
    catchIt(s, "slow");
    expect(Math.hypot(s.balls[0].vx, s.balls[0].vy)).toBeCloseTo(DIFFICULTY.normal.slow);
    expect(s.slowT).toBeGreaterThan(EFFECT_TIME - 0.2);
    catchIt(s, "multi");
    expect(s.balls.length).toBe(3);
    for (let i = 0; i < 4; i++) catchIt(s, "multi");
    expect(s.balls.length).toBe(MAX_BALLS);
  });
  test("tech debt shrinks the paddle, scores nothing and cancels autoscale", () => {
    const s = createState("normal", seeded(11));
    catchIt(s, "wide");
    const score = s.score;
    catchIt(s, "debt");
    expect(s.score).toBe(score);
    expect(s.wideT).toBe(0);
    expect(paddleHalf(s)).toBeCloseTo(DIFFICULTY.normal.half * DEBT_K);
  });
  test("strangler fig pierces for 2 s, damaging a legacy block once per pass", () => {
    const s = createState("normal", seeded(12));
    catchIt(s, "pierce");
    expect(s.pierceT).toBeGreaterThan(PIERCE_TIME - 0.1);
    const br = { ...s.bricks[0], id: 999, hp: 3, maxHp: 3, alive: true, y: 9, x: 0 };
    s.bricks = [br, { ...s.bricks[1], y: 17.5 }];
    s.balls = [{ x: 0, y: 7.5, vx: 0, vy: 10, stuck: false }];
    run(s, 0.3);
    expect(br.hp).toBe(2);
    expect(s.balls[0].vy).toBeGreaterThan(0); // passed through, no bounce
    s.pierceT = 0;
    s.balls = [{ x: 0, y: 7.5, vx: 0, vy: 10, stuck: false }];
    run(s, 0.3);
    expect(br.hp).toBe(1);
    expect(s.balls[0].vy).toBeLessThan(0);
  });
});
