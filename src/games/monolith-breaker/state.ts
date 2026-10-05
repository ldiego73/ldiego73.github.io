/** Monolith Breaker rules: pure, deterministic, no DOM or three. World units, y grows toward the monolith. */

import type { Difficulty } from "../core/types";

export const W = 16; // x in [-W/2, W/2]
export const H = 18; // y in [0, H]
export const COLS = 10;
export const BRICK_W = 1.5;
export const BRICK_H = 0.6;
export const BRICK_TOP = H - 1.6; // y of the first row's center
export const PADDLE_Y = 1;
export const PADDLE_H = 0.44;
export const PADDLE_SPEED = 17;
export const BALL_R = 0.25;
export const POWER_FALL = 4.5;
export const POWER_CHANCE = 0.16;
export const MAX_BALLS = 6;
export const MAX_ALIVE = 44;
export const EFFECT_TIME = 12;
export const PIERCE_TIME = 2;
export const WIDE_K = 1.55;
export const DEBT_K = 0.6;
export const BOSS_R = 0.9;
export const BOSS_Y = 15.7;
export const BOSS_CD = 0.3;
export const STEP = 1 / 120;
const MAX_ANGLE = (60 * Math.PI) / 180;

/** Everything difficulty changes, in one place. */
export const DIFFICULTY = {
  easy: {
    lives: 5,
    speed0: 8.2,
    speedMax: 11.5,
    slow: 5.5,
    half: 1.85,
    promote: 0, // every Nth plain brick becomes legacy (0 = never)
    hpCap: 2,
    bossHp: 6,
    bossSpeed: 2.2,
    shedEvery: 9,
    debt: 0.14,
  },
  normal: {
    lives: 3,
    speed0: 10,
    speedMax: 14,
    slow: 6.5,
    half: 1.4,
    promote: 0,
    hpCap: 3,
    bossHp: 8,
    bossSpeed: 3,
    shedEvery: 7,
    debt: 0.22,
  },
  hard: {
    lives: 2,
    speed0: 11.5,
    speedMax: 16,
    slow: 7.5,
    half: 1.2,
    promote: 3,
    hpCap: 3,
    bossHp: 10,
    bossSpeed: 3.8,
    shedEvery: 5,
    debt: 0.3,
  },
} as const satisfies Record<Difficulty, unknown>;
export type Cfg = (typeof DIFFICULTY)[Difficulty];

export const LABELS = ["auth", "billing", "orders", "search", "users", "cart", "email", "pay", "catalog", "ledger"];

/** '.' empty, '1' plain, 'm' labeled module, '2'/'3' legacy core (hits). The last stage is the boss. */
export const LEVELS: string[][] = [
  // Layered monolith
  ["1111111111", "1m111111m1", "1111221111", "11m1111m11", "1111111111"],
  // Pyramid of doom
  ["....11....", "...1m11...", "..112211..", ".1m1331m1.", "1111111111", "11m1221m11"],
  // Legacy fortress
  ["1111111111", "1m133331m1", "1123mm3211", "1123333211", "1m122221m1", "11......11", "11......11"],
  // Sharded towers
  ["1m1....1m1", "1221..1221", "1m11..11m1", "1221..1221", "1111mm1111", "11......11"],
  // Spaghetti core
  ["....mm....", "...1331...", "..1m33m1..", ".12333321.", "..1m33m1..", "...1331...", "....11...."],
  // Big Ball of Mud (boss): shields below the moving core
  ["..........", "..........", "..........", "1.2.mm.2.1", ".1.1221.1.", "2.1....1.2"],
];
export const BOSS_LEVEL = LEVELS.length - 1;

export type PowerKind = "wide" | "multi" | "slow" | "pierce" | "debt";
export const BUFFS: PowerKind[] = ["wide", "multi", "slow", "pierce"];
export interface Brick {
  id: number;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  label: string | null;
  alive: boolean;
}
export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  stuck: boolean;
  /** Brick ids the ball is passing through while piercing (damage on entry only). */
  inside?: number[];
}
export interface Power {
  kind: PowerKind;
  x: number;
  y: number;
}
export interface Boss {
  x: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  cd: number;
  shedT: number;
}
export type Ev =
  | { t: "break"; brick: Brick }
  | { t: "hit"; brick: Brick }
  | { t: "shed"; brick: Brick }
  | { t: "boss"; hp: number }
  | { t: "paddle" }
  | { t: "wall" }
  | { t: "power"; kind: PowerKind }
  | { t: "life" }
  | { t: "level"; level: number }
  | { t: "over" }
  | { t: "win" };

export interface Input {
  /** -1..1 from held keys. */
  move: number;
  /** Absolute paddle target x from pointer, or null. */
  target: number | null;
  launch: boolean;
}

export interface State {
  diff: Difficulty;
  cfg: Cfg;
  level: number; // 0-based
  lives: number;
  score: number;
  bricks: Brick[];
  boss: Boss | null;
  balls: Ball[];
  powers: Power[];
  paddleX: number;
  wideT: number;
  slowT: number;
  pierceT: number;
  debtT: number;
  speed: number;
  nextId: number;
  phase: "play" | "over" | "win";
  rng: () => number;
  events: Ev[];
}

const slotX = (c: number) => (c - (COLS - 1) / 2) * (BRICK_W + 0.08);
const slotY = (r: number) => BRICK_TOP - r * (BRICK_H + 0.1);

/** Builds a stage's bricks. Hard promotes every Nth plain brick to legacy; easy caps legacy at 2 hits. */
export function buildLevel(i: number, diff: Difficulty = "normal", id0 = 0): Brick[] {
  const cfg = DIFFICULTY[diff];
  const out: Brick[] = [];
  let li = i * 3;
  let plain = 0;
  LEVELS[i].forEach((row, r) => {
    for (let c = 0; c < COLS; c++) {
      const ch = row[c];
      if (!ch || ch === ".") continue;
      let hp = ch === "2" ? 2 : ch === "3" ? 3 : 1;
      if (ch === "1" && cfg.promote && ++plain % cfg.promote === 0) hp = 2;
      hp = Math.min(hp, cfg.hpCap);
      out.push({
        id: id0 + out.length,
        x: slotX(c),
        y: slotY(r),
        hp,
        maxHp: hp,
        label: ch === "m" ? LABELS[li++ % LABELS.length] : null,
        alive: true,
      });
    }
  });
  return out;
}

export function paddleHalf(s: State): number {
  const b = s.cfg.half;
  return s.debtT > 0 ? b * DEBT_K : s.wideT > 0 ? b * WIDE_K : b;
}

function stuckBall(x: number): Ball {
  return { x, y: PADDLE_Y + PADDLE_H / 2 + BALL_R + 0.02, vx: 0, vy: 0, stuck: true };
}

function loadLevel(s: State, i: number) {
  s.level = i;
  s.bricks = buildLevel(i, s.diff, s.nextId);
  s.nextId += s.bricks.length;
  s.boss =
    i === BOSS_LEVEL
      ? {
          x: 0,
          y: BOSS_Y,
          vx: s.cfg.bossSpeed,
          hp: s.cfg.bossHp,
          maxHp: s.cfg.bossHp,
          cd: 0,
          shedT: s.cfg.shedEvery,
        }
      : null;
  s.speed = s.cfg.speed0;
}

export function createState(diff: Difficulty = "normal", rng: () => number = Math.random, level = 0): State {
  const cfg = DIFFICULTY[diff];
  const s: State = {
    diff,
    cfg,
    level: 0,
    lives: cfg.lives,
    score: 0,
    bricks: [],
    boss: null,
    balls: [stuckBall(0)],
    powers: [],
    paddleX: 0,
    wideT: 0,
    slowT: 0,
    pierceT: 0,
    debtT: 0,
    speed: cfg.speed0,
    nextId: 0,
    phase: "play",
    rng,
    events: [],
  };
  loadLevel(s, level);
  return s;
}

const curSpeed = (s: State) => (s.slowT > 0 ? s.cfg.slow : s.speed);

/** Sets velocity from paddle hit offset in [-1, 1]: center goes straight up, edges up to 60 degrees. */
export function paddleBounce(b: Ball, offset: number, speed: number) {
  const a = Math.max(-1, Math.min(1, offset)) * MAX_ANGLE;
  b.vx = Math.sin(a) * speed;
  b.vy = Math.abs(Math.cos(a) * speed);
}

const overlaps = (b: Ball, br: Brick) =>
  Math.abs(b.x - br.x) <= BRICK_W / 2 + BALL_R && Math.abs(b.y - br.y) <= BRICK_H / 2 + BALL_R;

/** Circle vs AABB. Reflects b if overlapping and moving into the box. Returns true on contact. */
export function collideBox(b: Ball, cx: number, cy: number, hw: number, hh: number): boolean {
  const px = Math.max(cx - hw, Math.min(cx + hw, b.x));
  const py = Math.max(cy - hh, Math.min(cy + hh, b.y));
  let dx = b.x - px;
  let dy = b.y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > BALL_R * BALL_R) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Center inside the box: push out along the axis of least penetration.
    const ox = hw - Math.abs(b.x - cx);
    const oy = hh - Math.abs(b.y - cy);
    if (ox < oy) [dx, dy] = [Math.sign(b.x - cx) || 1, 0];
    else [dx, dy] = [0, Math.sign(b.y - cy) || 1];
    d = 0;
  } else {
    dx /= d;
    dy /= d;
  }
  reflect(b, dx, dy);
  const push = BALL_R - d + 1e-3;
  b.x += dx * push;
  b.y += dy * push;
  return true;
}

function reflect(b: Ball, nx: number, ny: number) {
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= 2 * vn * nx;
    b.vy -= 2 * vn * ny;
  }
}

/** Circle vs the boss core: always pushes the ball out and sends it away from the core. */
export function collideCore(b: Ball, boss: Boss): boolean {
  let dx = b.x - boss.x;
  let dy = b.y - boss.y;
  const rr = BOSS_R + BALL_R;
  const d = Math.hypot(dx, dy);
  if (d > rr) return false;
  if (d < 1e-6) [dx, dy] = [0, -1];
  else [dx, dy] = [dx / d, dy / d];
  reflect(b, dx, dy);
  b.x = boss.x + dx * (rr + 1e-3);
  b.y = boss.y + dy * (rr + 1e-3);
  return true;
}

function normalize(b: Ball, speed: number) {
  const l = Math.hypot(b.vx, b.vy) || 1;
  b.vx = (b.vx / l) * speed;
  b.vy = (b.vy / l) * speed;
  // Never let the ball go nearly horizontal.
  const minVy = speed * 0.28;
  if (Math.abs(b.vy) < minVy) {
    b.vy = (b.vy < 0 ? -1 : 1) * minVy;
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(speed * speed - minVy * minVy);
  }
}

function dropPower(s: State, x: number, y: number) {
  const kind = s.rng() < s.cfg.debt ? "debt" : BUFFS[Math.floor(s.rng() * BUFFS.length) % BUFFS.length];
  s.powers.push({ kind, x, y });
}

function hitBrick(s: State, br: Brick) {
  br.hp--;
  if (br.hp > 0) {
    s.score += 5;
    s.events.push({ t: "hit", brick: br });
    return;
  }
  br.alive = false;
  s.score += 10 * br.maxHp + (br.label ? 15 : 0);
  s.events.push({ t: "break", brick: br });
  if (s.rng() < POWER_CHANCE + (br.label ? 0.25 : 0)) dropPower(s, br.x, br.y);
}

/** The boss sheds a block into a free shield slot below it (rows 3-6). */
function shed(s: State) {
  const boss = s.boss;
  if (!boss || s.bricks.filter((b) => b.alive).length >= MAX_ALIVE) return;
  // Recycling dead shields keeps long boss fights within the renderer's instance budget.
  if (s.bricks.length >= MAX_ALIVE) s.bricks = s.bricks.filter((b) => b.alive);
  for (let tries = 0; tries < 12; tries++) {
    const c = Math.floor(s.rng() * COLS) % COLS;
    const r = 3 + (Math.floor(s.rng() * 4) % 4);
    const x = slotX(c);
    const y = slotY(r);
    if (s.bricks.some((b) => b.alive && b.x === x && b.y === y)) continue;
    if (s.balls.some((b) => Math.abs(b.x - x) < BRICK_W && Math.abs(b.y - y) < BRICK_H + BALL_R * 2)) continue;
    const label = s.rng() < 0.3 ? LABELS[Math.floor(s.rng() * LABELS.length) % LABELS.length] : null;
    const brick: Brick = { id: s.nextId++, x, y, hp: 1, maxHp: 1, label, alive: true };
    s.bricks.push(brick);
    s.events.push({ t: "shed", brick });
    return;
  }
}

function hitBoss(s: State) {
  const boss = s.boss!;
  if (boss.cd > 0) return;
  boss.cd = BOSS_CD;
  boss.hp--;
  s.score += 50;
  s.events.push({ t: "boss", hp: boss.hp });
  if (boss.hp <= 0) return;
  shed(s);
  shed(s);
  if (s.rng() < 0.35) dropPower(s, boss.x, boss.y - BOSS_R);
}

function applyPower(s: State, kind: PowerKind) {
  s.events.push({ t: "power", kind });
  if (kind === "debt") {
    s.debtT = EFFECT_TIME;
    s.wideT = 0;
    return;
  }
  s.score += 25;
  if (kind === "wide") {
    s.wideT = EFFECT_TIME;
    s.debtT = 0;
  } else if (kind === "slow") s.slowT = EFFECT_TIME;
  else if (kind === "pierce") s.pierceT = PIERCE_TIME;
  else {
    const src = s.balls.find((b) => !b.stuck) ?? s.balls[0];
    if (!src) return;
    for (const sign of [-1, 1]) {
      if (s.balls.length >= MAX_BALLS) break;
      const nb: Ball = { x: src.x, y: src.y, vx: 0, vy: 0, stuck: false };
      paddleBounce(nb, sign * 0.5, curSpeed(s));
      s.balls.push(nb);
    }
  }
}

function launch(s: State) {
  for (const b of s.balls) {
    if (!b.stuck) continue;
    b.stuck = false;
    paddleBounce(b, (b.x - s.paddleX) / paddleHalf(s) || 0.18, curSpeed(s));
  }
}

function resetServe(s: State) {
  s.balls = [stuckBall(s.paddleX)];
  s.powers = [];
  s.wideT = s.slowT = s.pierceT = s.debtT = 0;
}

function moveBoss(s: State, dt: number) {
  const boss = s.boss;
  if (!boss || boss.hp <= 0) return;
  const lim = W / 2 - BOSS_R - 0.6;
  boss.x += boss.vx * dt;
  if (Math.abs(boss.x) > lim) {
    boss.x = Math.sign(boss.x) * lim;
    boss.vx = -boss.vx;
  }
  boss.cd = Math.max(0, boss.cd - dt);
  boss.shedT -= dt;
  if (boss.shedT <= 0) {
    boss.shedT = s.cfg.shedEvery;
    shed(s);
  }
}

/** Advances one fixed step (STEP seconds). Ball motion is sub-stepped so it never tunnels through a brick. */
export function step(s: State, input: Input, dt = STEP) {
  if (s.phase !== "play") return;
  const half = paddleHalf(s);
  const lim = W / 2 - half;
  if (input.target !== null) {
    const d = input.target - s.paddleX;
    s.paddleX += Math.sign(d) * Math.min(Math.abs(d), PADDLE_SPEED * 1.6 * dt);
  } else s.paddleX += input.move * PADDLE_SPEED * dt;
  s.paddleX = Math.max(-lim, Math.min(lim, s.paddleX));
  s.wideT = Math.max(0, s.wideT - dt);
  s.slowT = Math.max(0, s.slowT - dt);
  s.pierceT = Math.max(0, s.pierceT - dt);
  s.debtT = Math.max(0, s.debtT - dt);
  if (input.launch) launch(s);
  moveBoss(s, dt);

  const speed = curSpeed(s);
  const piercing = s.pierceT > 0;
  for (const b of s.balls) {
    if (b.stuck) {
      b.x = s.paddleX;
      continue;
    }
    normalize(b, speed);
    const n = Math.max(1, Math.ceil((speed * dt) / (BALL_R * 0.4)));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      b.x += b.vx * h;
      b.y += b.vy * h;
      // Walls
      if (b.x < -W / 2 + BALL_R) {
        b.x = -W / 2 + BALL_R;
        b.vx = Math.abs(b.vx);
        s.events.push({ t: "wall" });
      } else if (b.x > W / 2 - BALL_R) {
        b.x = W / 2 - BALL_R;
        b.vx = -Math.abs(b.vx);
        s.events.push({ t: "wall" });
      }
      if (b.y > H - BALL_R) {
        b.y = H - BALL_R;
        b.vy = -Math.abs(b.vy);
        s.events.push({ t: "wall" });
      }
      // Paddle (only when falling and above the paddle's midline)
      if (
        b.vy < 0 &&
        b.y > PADDLE_Y - 0.05 &&
        b.y - BALL_R <= PADDLE_Y + PADDLE_H / 2 &&
        Math.abs(b.x - s.paddleX) <= half + BALL_R
      ) {
        s.speed = Math.min(s.cfg.speedMax, s.speed + 0.12);
        paddleBounce(b, (b.x - s.paddleX) / half, curSpeed(s));
        b.y = PADDLE_Y + PADDLE_H / 2 + BALL_R;
        s.events.push({ t: "paddle" });
      }
      // Boss core always reflects, even while piercing.
      if (s.boss && s.boss.hp > 0 && collideCore(b, s.boss)) {
        hitBoss(s);
        normalize(b, speed);
      }
      if (piercing) {
        // Strangler Fig: pass through, damaging each brick once on entry.
        const now: number[] = [];
        for (const br of s.bricks) {
          if (!br.alive || !overlaps(b, br)) continue;
          now.push(br.id);
          if (!b.inside?.includes(br.id)) hitBrick(s, br);
        }
        b.inside = now;
        continue;
      }
      b.inside = undefined;
      // Bricks: resolve the closest overlapping brick only.
      let best: Brick | null = null;
      let bd = Infinity;
      for (const br of s.bricks) {
        if (!br.alive || !overlaps(b, br)) continue;
        const d = Math.hypot(b.x - br.x, b.y - br.y);
        if (d < bd) {
          bd = d;
          best = br;
        }
      }
      if (best && collideBox(b, best.x, best.y, BRICK_W / 2, BRICK_H / 2)) {
        hitBrick(s, best);
        normalize(b, speed);
      }
    }
  }
  const before = s.balls.length;
  s.balls = s.balls.filter((b) => b.y > -BALL_R * 2);

  // Power-ups and hazards
  for (const p of s.powers) {
    p.y -= POWER_FALL * dt;
    if (Math.abs(p.y - PADDLE_Y) < 0.45 && Math.abs(p.x - s.paddleX) < half + 0.4) {
      p.y = -10;
      applyPower(s, p.kind);
    }
  }
  s.powers = s.powers.filter((p) => p.y > -1);

  if (before > 0 && s.balls.length === 0) {
    s.lives--;
    s.events.push({ t: "life" });
    if (s.lives <= 0) {
      s.phase = "over";
      s.events.push({ t: "over" });
      return;
    }
    resetServe(s);
  }

  if (s.boss ? s.boss.hp <= 0 : s.bricks.every((b) => !b.alive)) {
    s.score += 100 * (s.level + 1) + (s.boss ? 500 : 0);
    s.events.push({ t: "level", level: s.level + 1 });
    if (s.level >= BOSS_LEVEL) {
      s.phase = "win";
      s.events.push({ t: "win" });
      return;
    }
    loadLevel(s, s.level + 1);
    resetServe(s);
  }
}

/** Seeded RNG (mulberry32) for tests and replays. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
