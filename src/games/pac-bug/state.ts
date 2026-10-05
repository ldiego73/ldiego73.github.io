/**
 * Pac-Bug rules: pure grid logic, no DOM, no three.
 * Actors live on tile (x, y) and move toward the next tile with progress t in [0, 1).
 * Bugs: 0 Null Pointer, 1 Memory Leak, 2 Race Condition, 3 Deadlock.
 */

export type Dir = "up" | "down" | "left" | "right";
export type Rng = () => number;
export type Difficulty = "easy" | "normal" | "hard";

// # wall, X void (wall, not drawn), . packet, o HOTFIX, space open, = gate, H house, P player start
export const MAZE = [
  "###################",
  "#o.......#.......o#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "XXX#.#... ...#.#XXX",
  "####.#.##=##.#.####",
  ".......#HHH#.......",
  "####.#.#####.#.####",
  "XXX#.#.......#.#XXX",
  "####.#.#####.#.####",
  "#........#........#",
  "#.##.###.#.###.##.#",
  "#o.#.....P.....#.o#",
  "##.#.#.#####.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "###################",
];
export const W = MAZE[0].length;
export const H = MAZE.length;
export const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const ORDER: Dir[] = ["up", "left", "down", "right"];
export const OPP: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

export const BUG = { NULL: 0, LEAK: 1, RACE: 2, LOCK: 3 } as const;
export const BUG_NAMES = ["Null Pointer", "Memory Leak", "Race Condition", "Deadlock"] as const;

/**
 * Everything the player feels per difficulty. Speeds are multipliers on the base bug speed (6.4 tiles/s;
 * the player runs 7 tiles/s); `hotfix` scales the patched time; `release` scales the house timers.
 */
export const DIFFICULTY = {
  easy: {
    lives: 4,
    bugSpeed: 0.82,
    hotfix: 1.4,
    release: 1.5,
    cycle: [9, 16, 9, 16, 7, 18, 7],
    lookahead: 2,
    raceRandom: 0.5,
    guardRadius: 4,
    freeze: 0.3,
  },
  normal: {
    lives: 3,
    bugSpeed: 1,
    hotfix: 1,
    release: 1,
    cycle: [7, 20, 7, 20, 5, 20, 5],
    lookahead: 4,
    raceRandom: 0.3,
    guardRadius: 6,
    freeze: 0.45,
  },
  hard: {
    lives: 2,
    bugSpeed: 1.06,
    hotfix: 0.65,
    release: 0.6,
    cycle: [4, 24, 3, 30],
    lookahead: 5,
    raceRandom: 0.12,
    guardRadius: 8,
    freeze: 0.6,
  },
} as const satisfies Record<Difficulty, unknown>;

export const PLAYER_SPEED = 7;
export const BUG_SPEED = 6.4;
/** Per-bug speed trait: Race Condition is fast, Deadlock is slow. */
export const TRAIT_SPEED = [1, 1, 1.15, 0.82];
const SPEED = [1, 1.1, 1.2]; // per level
const FRIGHT = [6, 5, 4]; // per level, seconds (x difficulty.hotfix)
const RELEASE = [0, 1.5, 4, 7];
export const LEVELS = 3;
export const READY = { start: 2.6, respawn: 1.6, level: 2 };
export const HIT = 0.6;
export const LEAK_GROW_SECS = 45;
export const LOCK_RADIUS = 1.8;
export const LOCK_COOLDOWN = 6;
export const WARP_COOLDOWN = 6;
export const WARP_SAFE = 4;
export const BONUS = {
  tile: { x: 9, y: 11 },
  at: [60, 130],
  life: 9,
  points: { coffee: 200, lgtm: 500 },
} as const;
export type BonusKind = keyof typeof BONUS.points;

const PLAYER_START = { x: 9, y: 15 };
export const EXIT = { x: 9, y: 7 };
export const HOUSE = { x: 9, y: 9 };
const ENEMY_STARTS = [EXIT, { x: 9, y: 9 }, { x: 8, y: 9 }, { x: 10, y: 9 }];
const TUNNEL_Y = 9;
/** Scatter targets: Null Pointer top-right, Memory Leak top-left, Race Condition the tunnel. */
const SCATTER = [
  { x: 17, y: -2 },
  { x: 1, y: -2 },
  { x: -3, y: 9 },
];
export const GUARD = [
  { x: 1, y: 1 },
  { x: 17, y: 1 },
  { x: 17, y: 19 },
  { x: 1, y: 19 },
];

export const wrapX = (x: number) => ((x % W) + W) % W;
export const cell = (x: number, y: number) => (y < 0 || y >= H ? "#" : MAZE[y][wrapX(x)]);
const solid = (c: string) => c === "#" || c === "X";
/** Player-walkable. */
export const open = (x: number, y: number) => {
  const c = cell(x, y);
  return !solid(c) && c !== "=" && c !== "H";
};
const inTunnel = (x: number, y: number) => y === TUNNEL_Y && (x <= 3 || x >= W - 4);

export interface Actor {
  x: number;
  y: number;
  dir: Dir | null;
  t: number;
}
export type EnemyMode = "house" | "leaving" | "active" | "eaten";
export interface Enemy extends Actor {
  id: number;
  mode: EnemyMode;
  scared: boolean;
  release: number;
  reverse: boolean;
  /** Memory Leak growth 0..1 (resets when eaten or on respawn). */
  grow: number;
}
export interface Bonus {
  kind: BonusKind;
  life: number;
}
export type Phase = "ready" | "play" | "dying" | "clear" | "over" | "won";
export type ReadyKind = "start" | "respawn" | "level";
export type GameEv =
  | { type: "score"; value: number }
  | { type: "packet"; x: number; y: number }
  | { type: "hotfix"; x: number; y: number }
  | { type: "eat"; id: number; points: number; x: number; y: number }
  | { type: "die" }
  | { type: "clear" }
  | { type: "level"; level: number }
  | { type: "lives"; lives: number }
  | { type: "bonus"; kind: BonusKind }
  | { type: "bonusEat"; kind: BonusKind; points: number }
  | { type: "warp"; y: number; from: number; to: number }
  | { type: "lock" }
  | { type: "gameover"; score: number }
  | { type: "win"; score: number };

export interface Game {
  difficulty: Difficulty;
  phase: Phase;
  ready: ReadyKind;
  timer: number;
  level: number;
  lives: number;
  score: number;
  /** Packets/HOTFIXes left: key y*W+x -> "." or "o". */
  food: Map<number, string>;
  eatenInLevel: number;
  player: Actor;
  want: Dir | null;
  enemies: Enemy[];
  fright: number;
  frightMax: number;
  chain: number;
  modeTime: number;
  modeIdx: number;
  clock: number;
  /** Deadlock freeze left (player and Deadlock both stop) and its cooldown. */
  freeze: number;
  lockCd: number;
  warpCd: number;
  bonus: Bonus | null;
  bonusIdx: number;
  rng: Rng;
  events: GameEv[];
  withEnemies: boolean;
}

export function newGame(rng: Rng = Math.random, opts: { enemies?: boolean; difficulty?: Difficulty } = {}): Game {
  const difficulty = opts.difficulty ?? "normal";
  const g: Game = {
    difficulty,
    phase: "ready",
    ready: "start",
    timer: READY.start,
    level: 1,
    lives: DIFFICULTY[difficulty].lives,
    score: 0,
    food: new Map(),
    eatenInLevel: 0,
    player: { ...PLAYER_START, dir: null, t: 0 },
    want: null,
    enemies: [],
    fright: 0,
    frightMax: 1,
    chain: 0,
    modeTime: 0,
    modeIdx: 0,
    clock: 0,
    freeze: 0,
    lockCd: 0,
    warpCd: 0,
    bonus: null,
    bonusIdx: 0,
    rng,
    events: [],
    withEnemies: opts.enemies ?? true,
  };
  fillFood(g);
  resetActors(g);
  return g;
}

const cfg = (g: Game) => DIFFICULTY[g.difficulty];

function fillFood(g: Game) {
  g.food.clear();
  g.eatenInLevel = 0;
  g.bonusIdx = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = MAZE[y][x];
      if (c === "." || c === "o") g.food.set(y * W + x, c);
    }
}

function resetActors(g: Game) {
  g.player = { ...PLAYER_START, dir: null, t: 0 };
  g.want = null;
  g.fright = 0;
  g.chain = 0;
  g.modeTime = 0;
  g.modeIdx = 0;
  g.clock = 0;
  g.freeze = 0;
  g.lockCd = 0;
  g.warpCd = 0;
  g.bonus = null;
  g.enemies = g.withEnemies
    ? ENEMY_STARTS.map((s, id) => ({
        id,
        x: s.x,
        y: s.y,
        dir: id === 0 ? "left" : null,
        t: 0,
        mode: id === 0 ? "active" : "house",
        scared: false,
        release: (RELEASE[id] * cfg(g).release) / SPEED[g.level - 1],
        reverse: false,
        grow: 0,
      }))
    : [];
}

export function setWant(g: Game, d: Dir) {
  g.want = d;
  const p = g.player;
  if (g.freeze > 0) return;
  // Instant reversal mid-segment.
  if (p.dir && d === OPP[p.dir] && p.t > 0) {
    const [dx, dy] = DIRS[p.dir];
    p.x = wrapX(p.x + dx);
    p.y += dy;
    p.t = 1 - p.t;
    p.dir = d;
  }
}

export const posOf = (a: Actor) => {
  if (!a.dir) return { x: a.x, y: a.y };
  const [dx, dy] = DIRS[a.dir];
  return { x: a.x + dx * a.t, y: a.y + dy * a.t };
};

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  let dx = Math.abs(a.x - b.x);
  dx = Math.min(dx, W - dx);
  return Math.hypot(dx, a.y - b.y);
};

export const scattering = (g: Game) => {
  const c = cfg(g).cycle;
  return g.modeIdx < c.length && g.modeIdx % 2 === 0;
};

export const playerSpeed = (g: Game) => (g.fright > 0 ? 7.6 : PLAYER_SPEED) * SPEED[g.level - 1];

/** Corridor speed of an active, unscared bug (tiles/s). */
export const bugSpeed = (d: Difficulty, level: number, id: number) =>
  BUG_SPEED * DIFFICULTY[d].bugSpeed * SPEED[level - 1] * TRAIT_SPEED[id];

export const hotfixSecs = (d: Difficulty, level: number) => FRIGHT[level - 1] * DIFFICULTY[d].hotfix;

function enemySpeed(g: Game, e: Enemy) {
  if (e.mode === "eaten") return 12;
  if (e.mode === "leaving") return 4;
  if (e.id === BUG.LOCK && g.freeze > 0) return 0;
  if (e.id !== BUG.RACE && inTunnel(e.x, e.y)) return 3.5;
  if (e.scared) return 4;
  return bugSpeed(g.difficulty, g.level, e.id);
}

/** Collision radius; Memory Leak gets slightly bigger as it grows (capped). */
export const hitRadius = (e: Enemy) => HIT + (e.id === BUG.LEAK ? 0.15 * e.grow : 0);

function eatAt(g: Game, x: number, y: number) {
  const b = g.bonus;
  if (b && x === BONUS.tile.x && y === BONUS.tile.y) {
    const points = BONUS.points[b.kind] * g.level;
    g.bonus = null;
    addScore(g, points);
    g.events.push({ type: "bonusEat", kind: b.kind, points });
  }
  const k = y * W + x;
  const f = g.food.get(k);
  if (!f) return;
  g.food.delete(k);
  g.eatenInLevel++;
  if (f === ".") {
    addScore(g, 10);
    g.events.push({ type: "packet", x, y });
  } else {
    addScore(g, 50);
    g.events.push({ type: "hotfix", x, y });
    g.fright = g.frightMax = hotfixSecs(g.difficulty, g.level);
    g.chain = 0;
    for (const e of g.enemies)
      if (e.mode !== "eaten") {
        e.scared = true;
        if (e.mode === "active") e.reverse = true;
      }
  }
  if (g.bonusIdx < BONUS.at.length && g.eatenInLevel >= BONUS.at[g.bonusIdx]) {
    const kind: BonusKind = g.bonusIdx === 0 ? "coffee" : "lgtm";
    g.bonusIdx++;
    g.bonus = { kind, life: BONUS.life };
    g.events.push({ type: "bonus", kind });
  }
  if (g.food.size === 0) {
    g.phase = "clear";
    g.timer = 1.8;
    g.bonus = null;
    g.events.push({ type: "clear" });
  }
}

function addScore(g: Game, n: number) {
  g.score += n;
  g.events.push({ type: "score", value: g.score });
}

function movePlayer(g: Game, dt: number) {
  if (g.freeze > 0) return;
  const p = g.player;
  let move = playerSpeed(g) * dt;
  for (let guard = 0; guard < 4 && move > 0; guard++) {
    if (p.t === 0) {
      if (g.want && open(p.x + DIRS[g.want][0], p.y + DIRS[g.want][1])) p.dir = g.want;
      else if (p.dir && !open(p.x + DIRS[p.dir][0], p.y + DIRS[p.dir][1])) p.dir = null;
      if (!p.dir) return;
    }
    const step = Math.min(move, 1 - p.t);
    p.t += step;
    move -= step;
    if (p.t >= 1 - 1e-9) {
      const [dx, dy] = DIRS[p.dir!];
      p.x = wrapX(p.x + dx);
      p.y += dy;
      p.t = 0;
      eatAt(g, p.x, p.y);
      if (g.phase !== "play") return;
    }
  }
}

function passable(e: Enemy, x: number, y: number) {
  const c = cell(x, y);
  if (solid(c)) return false;
  if (c === "=" || c === "H") return e.mode === "leaving" || e.mode === "eaten";
  return true;
}

/** Where a bug is heading right now (its personality). */
export function targetFor(g: Game, e: Enemy): { x: number; y: number } {
  if (e.mode === "eaten") return HOUSE;
  if (e.mode === "leaving") return EXIT;
  const p = g.player;
  const c = cfg(g);
  if (e.id === BUG.LOCK) {
    // Guards the corner nearest the player; closes in when the player comes near.
    if (dist(e, p) <= c.guardRadius) return p;
    let best = GUARD[0];
    for (const k of GUARD) if (dist(k, p) < dist(best, p)) best = k;
    return best;
  }
  if (scattering(g)) return SCATTER[e.id];
  if (e.id === BUG.LEAK && p.dir) {
    const [dx, dy] = DIRS[p.dir];
    return { x: p.x + dx * c.lookahead, y: p.y + dy * c.lookahead };
  }
  return p;
}

function chooseDir(g: Game, e: Enemy): Dir | null {
  const opts = ORDER.filter((d) => (!e.dir || d !== OPP[e.dir]) && passable(e, e.x + DIRS[d][0], e.y + DIRS[d][1]));
  if (!opts.length) return e.dir ? OPP[e.dir] : null;
  const flee = e.scared && e.mode === "active";
  if (!flee && e.id === BUG.RACE && e.mode === "active" && opts.length > 1 && g.rng() < cfg(g).raceRandom)
    return opts[Math.floor(g.rng() * opts.length) % opts.length];
  const tg = flee ? g.player : targetFor(g, e);
  let best = opts[0];
  let bd = Infinity;
  for (const d of opts) {
    const nx = e.x + DIRS[d][0] - tg.x;
    const ny = e.y + DIRS[d][1] - tg.y;
    const dd = (nx * nx + ny * ny) * (flee ? -1 : 1);
    if (dd < bd) {
      bd = dd;
      best = d;
    }
  }
  return best;
}

/** Race Condition sometimes jumps across the tunnel, never landing near the player. */
function tryWarp(g: Game, e: Enemy) {
  if (e.id !== BUG.RACE || e.mode !== "active" || e.scared || g.warpCd > 0) return;
  if (e.y !== TUNNEL_Y || !inTunnel(e.x, e.y)) return;
  const to = W - 1 - e.x;
  if (to === e.x || dist({ x: to, y: e.y }, g.player) < WARP_SAFE) return;
  if (g.rng() > 0.5) return;
  g.events.push({ type: "warp", y: e.y, from: e.x, to });
  e.x = to;
  g.warpCd = WARP_COOLDOWN;
}

function moveEnemy(g: Game, e: Enemy, dt: number) {
  if (e.mode === "house") {
    if (g.clock >= e.release) {
      e.mode = "leaving";
      e.dir = null;
    } else return;
  }
  if (e.id === BUG.LEAK && e.mode === "active") e.grow = Math.min(1, e.grow + dt / LEAK_GROW_SECS);
  let move = enemySpeed(g, e) * dt;
  for (let guard = 0; guard < 4 && move > 0; guard++) {
    if (e.t === 0) {
      if (e.mode === "eaten" && e.x === HOUSE.x && e.y === HOUSE.y) {
        e.mode = "leaving";
        e.dir = null;
      }
      if (e.mode === "leaving" && e.x === EXIT.x && e.y === EXIT.y) e.mode = "active";
      tryWarp(g, e);
      if (e.reverse && e.dir) e.dir = OPP[e.dir];
      else e.dir = chooseDir(g, e);
      e.reverse = false;
      if (!e.dir) return;
    } else if (e.reverse && e.dir) {
      const [dx, dy] = DIRS[e.dir];
      e.x = wrapX(e.x + dx);
      e.y += dy;
      e.t = 1 - e.t;
      e.dir = OPP[e.dir];
      e.reverse = false;
    }
    const step = Math.min(move, 1 - e.t);
    e.t += step;
    move -= step;
    if (e.t >= 1 - 1e-9) {
      const [dx, dy] = DIRS[e.dir!];
      e.x = wrapX(e.x + dx);
      e.y += dy;
      e.t = 0;
    }
  }
}

function collide(g: Game) {
  const p = posOf(g.player);
  for (const e of g.enemies) {
    if (e.mode === "eaten" || e.mode === "house") continue;
    const q = posOf(e);
    const d = dist(p, q);
    if (d > hitRadius(e)) {
      // Deadlock: coming close locks both of you for a moment (it freezes too, so it can't cash in).
      if (e.id === BUG.LOCK && !e.scared && e.mode === "active" && d <= LOCK_RADIUS && g.lockCd <= 0) {
        g.freeze = cfg(g).freeze;
        g.lockCd = LOCK_COOLDOWN;
        g.events.push({ type: "lock" });
      }
      continue;
    }
    if (e.scared) {
      const points = 200 * 2 ** Math.min(g.chain, 3);
      g.chain++;
      e.scared = false;
      e.mode = "eaten";
      e.grow = 0;
      addScore(g, points);
      g.events.push({ type: "eat", id: e.id, points, x: q.x, y: q.y });
    } else {
      g.phase = "dying";
      g.timer = 1.4;
      g.events.push({ type: "die" });
      return;
    }
  }
}

function tickPlay(g: Game, dt: number) {
  g.clock += dt;
  if (g.freeze > 0) g.freeze = Math.max(0, g.freeze - dt);
  if (g.lockCd > 0) g.lockCd -= dt;
  if (g.warpCd > 0) g.warpCd -= dt;
  if (g.bonus) {
    g.bonus.life -= dt;
    if (g.bonus.life <= 0) g.bonus = null;
  }
  if (g.fright > 0) {
    g.fright -= dt;
    if (g.fright <= 0) {
      g.fright = 0;
      for (const e of g.enemies) e.scared = false;
    }
  } else if (g.modeIdx < cfg(g).cycle.length) {
    g.modeTime += dt;
    if (g.modeTime >= cfg(g).cycle[g.modeIdx]) {
      g.modeTime = 0;
      g.modeIdx++;
      for (const e of g.enemies) if (e.mode === "active") e.reverse = true;
    }
  }
  movePlayer(g, dt);
  if (g.phase !== "play") return;
  collide(g);
  if (g.phase !== "play") return;
  for (const e of g.enemies) moveEnemy(g, e, dt);
  collide(g);
}

/** Advance the game by dt seconds (internally sub-stepped). */
export function step(g: Game, dt: number) {
  let left = dt;
  while (left > 1e-9) {
    const h = Math.min(left, 1 / 120);
    left -= h;
    switch (g.phase) {
      case "play":
        tickPlay(g, h);
        break;
      case "ready":
        g.timer -= h;
        if (g.timer <= 0) g.phase = "play";
        break;
      case "dying":
        g.timer -= h;
        if (g.timer <= 0) {
          g.lives--;
          g.events.push({ type: "lives", lives: g.lives });
          if (g.lives <= 0) {
            g.phase = "over";
            g.events.push({ type: "gameover", score: g.score });
            return;
          }
          resetActors(g);
          g.phase = "ready";
          g.ready = "respawn";
          g.timer = READY.respawn;
        }
        break;
      case "clear":
        g.timer -= h;
        if (g.timer <= 0) {
          if (g.level >= LEVELS) {
            g.phase = "won";
            g.events.push({ type: "win", score: g.score });
            return;
          }
          g.level++;
          fillFood(g);
          resetActors(g);
          g.phase = "ready";
          g.ready = "level";
          g.timer = READY.level;
          g.events.push({ type: "level", level: g.level });
        }
        break;
      default:
        return;
    }
  }
}
