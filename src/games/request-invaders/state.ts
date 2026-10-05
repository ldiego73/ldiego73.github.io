/**
 * Request Invaders: pure rules. No DOM, no three. World units: x in [-20, 20], y in [-15, 15].
 * Kinds: 0 = GET /wp-admin bot (red), 1 = POST SQLi (magenta), 2 = XSS drone (amber), 3 = botnet (violet).
 * Every 3rd wave is a boss wave (DDoS Mothership).
 */
import type { Difficulty } from "../core/types";

export type Kind = 0 | 1 | 2 | 3;
export type FormationName = "grid" | "v" | "ring";
export type PowerKind = "spread" | "cache" | "slow";

export interface Enemy {
  kind: Kind;
  /** Slot offset from the formation origin. */
  sx: number;
  sy: number;
  /** Current world position (derived every step). */
  x: number;
  y: number;
  alive: boolean;
  /** Entry clock: < 0 waiting, 0..ENTER_T flying in, >= ENTER_T in formation. */
  t: number;
  entry: 0 | 1 | 2;
  /** Free-flying swarm diver spawned by the boss. */
  dive: boolean;
  phase: number;
}
export interface Shot {
  x: number;
  y: number;
  vx: number;
}
export interface Packet {
  x: number;
  y: number;
  vx: number;
}
export interface Cell {
  x: number;
  y: number;
  hp: number;
}
export interface Saucer {
  x: number;
  dir: 1 | -1;
}
export interface Power {
  x: number;
  y: number;
  kind: PowerKind;
}
export interface Boss {
  x: number;
  y: number;
  hp: number;
  max: number;
  phase: 1 | 2 | 3;
  dir: 1 | -1;
  fireT: number;
  spawnT: number;
  index: number;
}
export type Evt =
  | { t: "kill"; x: number; y: number; kind: Kind; points: number }
  | { t: "saucer"; x: number; y: number; bonus: number }
  | { t: "shot" }
  | { t: "shield"; x: number; y: number; dead: boolean }
  | { t: "playerHit" }
  | { t: "cacheBlock" }
  | { t: "leak"; x: number }
  | { t: "power"; kind: PowerKind; x: number; y: number }
  | { t: "bossHit"; x: number; y: number }
  | { t: "bossPhase"; phase: 2 | 3 }
  | { t: "bossDown"; x: number; y: number; points: number }
  | { t: "waveStart"; wave: number; boss: boolean; formation: FormationName | null }
  | { t: "waveClear"; wave: number }
  | { t: "gameover" };

export interface Input {
  left: boolean;
  right: boolean;
  fire: boolean;
}

export interface Tuning {
  lives: number;
  /** Formation / boss / diver speed multiplier. */
  speed: number;
  /** Multiplier on seconds between enemy shots (higher = fewer shots). */
  fire: number;
  maxPackets: number;
  packetSpeed: number;
  /** Hard: packets lead toward the player. */
  aimed: boolean;
  /** Chance a shooter is the one closest to the player. */
  aimBias: number;
  bossHp: number;
  drop: number;
}

export const DIFFICULTY: Record<Difficulty, Tuning> = {
  easy: {
    lives: 5,
    speed: 0.7,
    fire: 1.7,
    maxPackets: 2,
    packetSpeed: 7,
    aimed: false,
    aimBias: 0.15,
    bossHp: 26,
    drop: 0.16,
  },
  normal: {
    lives: 3,
    speed: 1,
    fire: 1,
    maxPackets: 4,
    packetSpeed: 9,
    aimed: false,
    aimBias: 0.4,
    bossHp: 40,
    drop: 0.11,
  },
  hard: {
    lives: 2,
    speed: 1.3,
    fire: 0.7,
    maxPackets: 6,
    packetSpeed: 11,
    aimed: true,
    aimBias: 0.7,
    bossHp: 60,
    drop: 0.08,
  },
};

export interface State {
  rng: () => number;
  diff: Tuning;
  wave: number;
  lives: number;
  score: number;
  over: boolean;
  px: number;
  cooldown: number;
  invuln: number;
  hold: number;
  enemies: Enemy[];
  total: number;
  formation: FormationName | null;
  ox: number;
  oy: number;
  dir: 1 | -1;
  drop: number;
  shots: Shot[];
  packets: Packet[];
  fireTimer: number;
  shields: Cell[];
  saucer: Saucer | null;
  saucerTimer: number;
  powers: Power[];
  spread: number;
  slow: number;
  cache: boolean;
  boss: Boss | null;
  time: number;
  events: Evt[];
}

export const HALF_W = 20;
export const HALF_H = 15;
export const DX = 3.2;
export const DY = 2.4;
export const LIMIT = HALF_W - 1.5;
export const STEP_Y = 1.2;
export const DROP_SPEED = 6;
export const BASE_SPEED = 1.8;
export const ENTER_T = 1.25;
export const PLAYER_Y = -12.4;
export const PLAYER_HW = 1.4;
export const PLAYER_SPEED = 17;
export const FIRE_CD = 0.3;
export const SHOT_SPEED = 32;
export const INVULN = 1.6;
export const SAUCER_Y = 13.4;
export const SAUCER_SPEED = 7;
export const SHIELD_XS = [-12, 0, 12];
export const SHIELD_Y = -8.6;
export const CELL = 0.6;
export const SHIELD_COLS = 8;
export const SHIELD_ROWS = 4;
export const EHW = 1.1;
export const EHH = 0.8;
export const BOSS_Y = 9.6;
export const BOSS_HW = 4.6;
export const BOSS_HH = 1.7;
export const POWER_SPEED = 5;
export const SPREAD_T = 8;
export const SLOW_T = 6;
export const START_HOLD = 2.4;
export const WAVE_HOLD = 1.8;
/** GET, SQLi, XSS, botnet. */
export const POINTS = [20, 40, 30, 10] as const;
const BONUS = [50, 100, 150, 300];
const POWERS: PowerKind[] = ["spread", "cache", "slow"];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function overlap(
  ax: number,
  ay: number,
  ahw: number,
  ahh: number,
  bx: number,
  by: number,
  bhw: number,
  bhh: number,
) {
  return Math.abs(ax - bx) < ahw + bhw && Math.abs(ay - by) < ahh + bhh;
}

export const isBossWave = (wave: number) => wave % 3 === 0;

/** Formation for a regular wave: grid, V, ring, repeating. */
export function formationFor(wave: number): FormationName {
  const n = wave - Math.floor(wave / 3);
  return (["grid", "v", "ring"] as const)[(n - 1) % 3];
}

const ROW_KIND: Kind[] = [1, 2, 0, 0, 3];

/** Slot list for a formation: offsets from the origin (top row at sy = 0). */
export function slots(name: FormationName): Array<{ sx: number; sy: number; kind: Kind }> {
  const out: Array<{ sx: number; sy: number; kind: Kind }> = [];
  if (name === "grid") {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 9; c++) out.push({ sx: (c - 4) * DX, sy: -r * DY, kind: ROW_KIND[r] });
  } else if (name === "v") {
    for (let r = 0; r < 5; r++)
      for (let c = 0; c < 9; c++)
        if (Math.abs(Math.abs(c - 4) - (4 - r)) <= 1) out.push({ sx: (c - 4) * DX, sy: -r * DY, kind: ROW_KIND[r] });
  } else {
    const cy = -2 * DY;
    out.push({ sx: 0, sy: cy, kind: 1 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      out.push({ sx: Math.cos(a) * 3.4, sy: cy + Math.sin(a) * 2.6, kind: 2 });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + Math.PI / 12;
      out.push({ sx: Math.cos(a) * 7, sy: cy + Math.sin(a) * 4.6, kind: i % 2 ? 0 : 3 });
    }
    for (const side of [-1, 1])
      for (let r = 0; r < 3; r++) out.push({ sx: side * 12.4, sy: cy + (1 - r) * DY, kind: r === 1 ? 1 : 0 });
  }
  return out;
}

export function makeShields(): Cell[] {
  const cells: Cell[] = [];
  for (const cx of SHIELD_XS) {
    for (let r = 0; r < SHIELD_ROWS; r++) {
      for (let c = 0; c < SHIELD_COLS; c++) {
        if (r < 2 && (c === 3 || c === 4)) continue;
        if (r === SHIELD_ROWS - 1 && (c === 0 || c === SHIELD_COLS - 1)) continue;
        cells.push({ x: cx + (c - (SHIELD_COLS - 1) / 2) * CELL, y: SHIELD_Y + r * CELL, hp: 2 });
      }
    }
  }
  return cells;
}

/** World position of an entering enemy along its path (drop, side sweep, spiral). */
function entryPos(s: State, e: Enemy, out: { x: number; y: number }) {
  const hx = s.ox + e.sx;
  const hy = s.oy + e.sy;
  const u = Math.min(1, Math.max(0, e.t / ENTER_T));
  const k = 1 - u;
  const ease = 1 - k * k * k;
  if (e.entry === 0) {
    out.x = hx;
    out.y = hy + 20 * (1 - ease);
  } else if (e.entry === 1) {
    const side = e.sx < 0 || (e.sx === 0 && e.sy % 2) ? -1 : 1;
    out.x = hx + side * 30 * (1 - ease);
    out.y = hy + 8 * Math.sin(Math.PI * (1 - ease));
  } else {
    const r = 22 * (1 - ease);
    const a = Math.PI / 2 + (1 - ease) * 6 + e.phase;
    out.x = hx + r * Math.cos(a);
    out.y = hy + r * Math.sin(a);
  }
}

function setupWave(s: State) {
  s.enemies = [];
  s.boss = null;
  s.formation = null;
  s.shots = [];
  s.packets = [];
  s.powers = [];
  s.saucer = null;
  s.drop = 0;
  s.dir = 1;
  s.shields = makeShields();
  const boss = isBossWave(s.wave);
  if (boss) {
    const index = s.wave / 3;
    const hp = Math.round(s.diff.bossHp * (1 + 0.5 * (index - 1)));
    s.boss = { x: 0, y: BOSS_Y + 12, hp, max: hp, phase: 1, dir: 1, fireT: 1.5, spawnT: 3, index };
  } else {
    const name = formationFor(s.wave);
    const n = s.wave - Math.floor(s.wave / 3);
    s.formation = name;
    const entry = name === "grid" ? 0 : name === "v" ? 1 : 2;
    s.ox = 0;
    s.oy = 11 - Math.min(n - 1, 5) * 0.45;
    slots(name).forEach((sl, i) => {
      const delay = entry === 0 ? -(-sl.sy / DY) * 0.08 : -i * (entry === 1 ? 0.05 : 0.045);
      const e: Enemy = { ...sl, x: 0, y: 0, alive: true, t: delay, entry, dive: false, phase: (i % 4) * 0.3 };
      entryPos(s, e, e);
      s.enemies.push(e);
    });
  }
  s.total = s.enemies.length;
  s.fireTimer = fireInterval(s) * 1.5;
  s.events.push({ t: "waveStart", wave: s.wave, boss, formation: s.formation });
}

export function createState(difficulty: Difficulty = "normal", rng: () => number = mulberry32(Date.now())): State {
  const diff = DIFFICULTY[difficulty];
  const s: State = {
    rng,
    diff,
    wave: 1,
    lives: diff.lives,
    score: 0,
    over: false,
    px: 0,
    cooldown: 0,
    invuln: 0,
    hold: START_HOLD,
    enemies: [],
    total: 0,
    formation: null,
    ox: 0,
    oy: 0,
    dir: 1,
    drop: 0,
    shots: [],
    packets: [],
    fireTimer: 0,
    shields: [],
    saucer: null,
    saucerTimer: 14 + rng() * 10,
    powers: [],
    spread: 0,
    slow: 0,
    cache: false,
    boss: null,
    time: 0,
    events: [],
  };
  setupWave(s);
  return s;
}

export const slowFactor = (s: Pick<State, "slow">) => (s.slow > 0 ? 0.5 : 1);

const formationAlive = (s: State) => s.enemies.reduce((n, e) => n + (e.alive && !e.dive ? 1 : 0), 0);

/** Sideways speed of the formation (units/s): faster with fewer enemies, later waves and difficulty. */
export function formationSpeed(s: State): number {
  const left = s.total ? formationAlive(s) / s.total : 1;
  return BASE_SPEED * s.diff.speed * (1 + 0.08 * Math.min(s.wave - 1, 10)) * (1 + 2.6 * (1 - left)) * slowFactor(s);
}

/** Seconds between enemy shots. */
export function fireInterval(s: Pick<State, "wave" | "diff">): number {
  return Math.max(0.4, 1.4 - 0.1 * (s.wave - 1)) * s.diff.fire;
}

function hitShield(s: State, x: number, y: number, hw: number, hh: number, kill = false): boolean {
  for (const c of s.shields) {
    if (c.hp > 0 && overlap(x, y, hw, hh, c.x, c.y, CELL / 2, CELL / 2)) {
      c.hp = kill ? 0 : c.hp - 1;
      s.events.push({ t: "shield", x: c.x, y: c.y, dead: c.hp === 0 });
      return true;
    }
  }
  return false;
}

function firePacket(s: State, x: number, y: number, vx = 0) {
  if (s.diff.aimed && vx === 0) {
    const dy = Math.max(4, y - PLAYER_Y);
    const sp = s.diff.packetSpeed;
    vx = Math.max(-0.45 * sp, Math.min(0.45 * sp, ((s.px - x) / dy) * sp));
  }
  s.packets.push({ x, y, vx });
}

function enemyFire(s: State) {
  if (s.packets.length >= s.diff.maxPackets) return;
  const ready = s.enemies.filter((e) => e.alive && !e.dive && e.t >= ENTER_T);
  const shooters = ready.filter((e) => !ready.some((o) => o !== e && Math.abs(o.x - e.x) < 1.2 && o.y < e.y));
  if (!shooters.length) return;
  let pick = shooters[Math.floor(s.rng() * shooters.length)];
  if (s.rng() < s.diff.aimBias) pick = shooters.reduce((a, b) => (Math.abs(a.x - s.px) < Math.abs(b.x - s.px) ? a : b));
  firePacket(s, pick.x, pick.y - EHH);
}

function loseLife(s: State) {
  s.lives--;
  s.packets = [];
  s.invuln = INVULN;
  s.events.push({ t: "playerHit" });
  if (s.lives <= 0) endGame(s);
}

/** Something reached the player or the API: the CDN cache absorbs it, otherwise a life is lost. */
function damage(s: State) {
  if (s.invuln > 0) return;
  if (s.cache) {
    s.cache = false;
    s.invuln = 0.6;
    s.events.push({ t: "cacheBlock" });
    return;
  }
  loseLife(s);
}

function endGame(s: State) {
  if (s.over) return;
  s.over = true;
  s.lives = Math.max(0, s.lives);
  s.events.push({ t: "gameover" });
}

function maybeDrop(s: State, x: number, y: number, chance: number) {
  if (s.powers.length >= 2 || s.rng() >= chance) return;
  s.powers.push({ x, y, kind: POWERS[Math.floor(s.rng() * POWERS.length)] });
}

function killEnemy(s: State, e: Enemy, scored = true) {
  e.alive = false;
  const points = scored ? POINTS[e.kind] : 0;
  s.score += points;
  s.events.push({ t: "kill", x: e.x, y: e.y, kind: e.kind, points });
  if (scored) maybeDrop(s, e.x, e.y, s.diff.drop);
}

function spawnDivers(s: State, b: Boss, n: number) {
  for (let i = 0; i < n; i++) {
    const x = b.x + (i - (n - 1) / 2) * 2.4;
    s.enemies.push({
      kind: 3,
      sx: 0,
      sy: 0,
      x,
      y: b.y - 1.5,
      alive: true,
      t: ENTER_T,
      entry: 0,
      dive: true,
      phase: i * 1.7,
    });
  }
}

function stepBoss(s: State, b: Boss, dt: number) {
  const sf = slowFactor(s);
  if (b.y > BOSS_Y) {
    b.y = Math.max(BOSS_Y, b.y - 9 * dt);
    return;
  }
  if (s.hold > 0) return;
  const lim = HALF_W - BOSS_HW - 0.5;
  b.x += b.dir * (2.5 + 2 * (b.phase - 1)) * s.diff.speed * sf * dt;
  if (Math.abs(b.x) > lim) {
    b.x = Math.sign(b.x) * lim;
    b.dir = b.dir === 1 ? -1 : 1;
  }
  b.fireT -= dt * sf;
  if (b.fireT <= 0) {
    const sp = s.diff.packetSpeed;
    if (b.phase === 1) for (const vx of [-0.3, 0, 0.3]) firePacket(s, b.x + vx * 6, b.y - BOSS_HH, vx * sp);
    else if (b.phase === 2) firePacket(s, b.x, b.y - BOSS_HH);
    else for (const vx of [-0.45, -0.2, 0, 0.2, 0.45]) firePacket(s, b.x, b.y - BOSS_HH, vx * sp);
    b.fireT = [1.6, 1.1, 1.3][b.phase - 1] * s.diff.fire;
  }
  if (b.phase >= 2) {
    b.spawnT -= dt * sf;
    if (b.spawnT <= 0) {
      spawnDivers(s, b, b.phase === 2 ? 4 : 3);
      b.spawnT = (b.phase === 2 ? 4.5 : 6) * s.diff.fire;
    }
  }
}

function hitBoss(s: State, b: Boss) {
  b.hp--;
  s.events.push({ t: "bossHit", x: b.x, y: b.y });
  if (b.hp <= 0) {
    const points = 500 * b.index;
    s.score += points;
    s.events.push({ t: "bossDown", x: b.x, y: b.y, points });
    for (const e of s.enemies) if (e.alive) killEnemy(s, e, false);
    s.boss = null;
    return;
  }
  const phase = b.hp <= b.max / 3 ? 3 : b.hp <= (2 * b.max) / 3 ? 2 : 1;
  if (phase > b.phase) {
    b.phase = phase;
    b.spawnT = 0.8;
    s.events.push({ t: "bossPhase", phase: phase as 2 | 3 });
    maybeDrop(s, b.x, b.y - 2, 1);
  }
}

function moveFormation(s: State, dt: number) {
  let entering = false;
  for (const e of s.enemies) if (e.alive && !e.dive && e.t < ENTER_T) entering = true;
  if (entering || s.hold > 0) return;
  if (s.drop > 0) {
    const d = Math.min(s.drop, DROP_SPEED * slowFactor(s) * dt);
    s.oy -= d;
    s.drop -= d;
    return;
  }
  let min = Infinity;
  let max = -Infinity;
  for (const e of s.enemies) {
    if (!e.alive || e.dive) continue;
    min = Math.min(min, s.ox + e.sx);
    max = Math.max(max, s.ox + e.sx);
  }
  if (min === Infinity) return;
  const dx = s.dir * formationSpeed(s) * dt;
  if (min + dx < -LIMIT || max + dx > LIMIT) {
    s.ox = s.dir === 1 ? LIMIT - (max - s.ox) : -LIMIT - (min - s.ox);
    s.drop = STEP_Y;
    s.dir = s.dir === 1 ? -1 : 1;
  } else s.ox += dx;
}

function updateEnemies(s: State, dt: number) {
  const sf = slowFactor(s);
  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (e.dive) {
      e.phase += dt * 3;
      e.y -= 4.2 * s.diff.speed * sf * dt;
      e.x += (Math.sin(e.phase) * 5 + (s.px - e.x) * 0.5) * sf * dt;
      if (hitShield(s, e.x, e.y, 0.7, 0.6, true)) {
        killEnemy(s, e, false);
      } else if (overlap(e.x, e.y, 0.7, 0.6, s.px, PLAYER_Y, PLAYER_HW, 0.7)) {
        killEnemy(s, e, false);
        damage(s);
      } else if (e.y < -HALF_H) {
        e.alive = false;
        s.events.push({ t: "leak", x: e.x });
        damage(s);
      }
      if (s.over) return;
    } else {
      if (e.t < ENTER_T) e.t += dt;
      entryPos(s, e, e);
    }
  }
}

export function step(s: State, dt: number, input: Input) {
  if (s.over) return;
  s.time += dt;
  // Player
  const mv = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  s.px = Math.max(-HALF_W + PLAYER_HW, Math.min(HALF_W - PLAYER_HW, s.px + mv * PLAYER_SPEED * dt));
  s.cooldown -= dt;
  s.invuln -= dt;
  s.spread = Math.max(0, s.spread - dt);
  s.slow = Math.max(0, s.slow - dt);
  if (input.fire && s.hold <= 0 && s.cooldown <= 0) {
    if (s.spread > 0 && s.shots.length <= 3) {
      for (const vx of [-7, 0, 7]) s.shots.push({ x: s.px, y: PLAYER_Y + 1, vx });
      s.cooldown = FIRE_CD;
      s.events.push({ t: "shot" });
    } else if (s.spread <= 0 && s.shots.length === 0) {
      s.shots.push({ x: s.px, y: PLAYER_Y + 1, vx: 0 });
      s.cooldown = FIRE_CD;
      s.events.push({ t: "shot" });
    }
  }

  moveFormation(s, dt);
  updateEnemies(s, dt);
  if (s.over) return;
  if (s.boss) stepBoss(s, s.boss, dt);

  // Player shots
  for (let i = s.shots.length - 1; i >= 0; i--) {
    const b = s.shots[i];
    b.y += SHOT_SPEED * dt;
    b.x += b.vx * dt;
    let done = b.y > HALF_H || Math.abs(b.x) > HALF_W;
    if (!done) {
      for (const e of s.enemies) {
        if (!e.alive || (!e.dive && e.t < ENTER_T * 0.7)) continue;
        if (overlap(b.x, b.y, 0.2, 0.5, e.x, e.y, EHW, EHH)) {
          killEnemy(s, e);
          done = true;
          break;
        }
      }
    }
    const boss = s.boss;
    if (!done && boss && boss.y <= BOSS_Y + 1 && overlap(b.x, b.y, 0.2, 0.5, boss.x, boss.y, BOSS_HW, BOSS_HH)) {
      hitBoss(s, boss);
      done = true;
    }
    if (!done && s.saucer && overlap(b.x, b.y, 0.2, 0.5, s.saucer.x, SAUCER_Y, 1.6, 0.7)) {
      const bonus = BONUS[Math.floor(s.rng() * BONUS.length)];
      s.score += bonus;
      s.events.push({ t: "saucer", x: s.saucer.x, y: SAUCER_Y, bonus });
      maybeDrop(s, s.saucer.x, SAUCER_Y, 1);
      s.saucer = null;
      done = true;
    }
    if (!done) {
      const j = s.packets.findIndex((p) => overlap(b.x, b.y, 0.2, 0.5, p.x, p.y, 0.3, 0.4));
      if (j >= 0) {
        s.packets.splice(j, 1);
        done = true;
      }
    }
    if (!done) done = hitShield(s, b.x, b.y, 0.2, 0.5);
    if (done) s.shots.splice(i, 1);
  }

  if (s.hold > 0) s.hold -= dt;
  else if (s.formation) {
    s.fireTimer -= dt * slowFactor(s);
    if (s.fireTimer <= 0) {
      enemyFire(s);
      s.fireTimer = fireInterval(s) * (0.6 + 0.8 * s.rng());
    }
    // Zero-day saucer (regular waves only).
    if (s.saucer) {
      s.saucer.x += s.saucer.dir * SAUCER_SPEED * dt;
      if (Math.abs(s.saucer.x) > HALF_W + 3) s.saucer = null;
    } else {
      s.saucerTimer -= dt;
      if (s.saucerTimer <= 0) {
        const dir = s.rng() < 0.5 ? 1 : -1;
        s.saucer = { x: -dir * (HALF_W + 2), dir };
        s.saucerTimer = 16 + s.rng() * 12;
      }
    }
  }

  // Enemy packets
  const psp = s.diff.packetSpeed * slowFactor(s);
  for (let i = s.packets.length - 1; i >= 0; i--) {
    const p = s.packets[i];
    p.y -= psp * dt;
    p.x += p.vx * slowFactor(s) * dt;
    if (p.y < -HALF_H - 1 || hitShield(s, p.x, p.y, 0.3, 0.4)) {
      s.packets.splice(i, 1);
      continue;
    }
    if (s.invuln <= 0 && overlap(p.x, p.y, 0.3, 0.4, s.px, PLAYER_Y, PLAYER_HW, 0.7)) {
      s.packets.splice(i, 1);
      damage(s);
      if (s.over) return;
      break;
    }
  }

  // Power-ups
  for (let i = s.powers.length - 1; i >= 0; i--) {
    const p = s.powers[i];
    p.y -= POWER_SPEED * dt;
    if (overlap(p.x, p.y, 0.8, 0.6, s.px, PLAYER_Y, PLAYER_HW, 0.8)) {
      if (p.kind === "spread") s.spread = SPREAD_T;
      else if (p.kind === "slow") s.slow = SLOW_T;
      else s.cache = true;
      s.events.push({ t: "power", kind: p.kind, x: p.x, y: p.y });
      s.powers.splice(i, 1);
    } else if (p.y < -HALF_H - 1) s.powers.splice(i, 1);
  }

  // Formation vs shields and the API floor
  for (const e of s.enemies) {
    if (!e.alive || e.dive || e.t < ENTER_T) continue;
    if (e.y - EHH <= SHIELD_Y + SHIELD_ROWS * CELL) {
      for (const c of s.shields) if (c.hp > 0 && overlap(e.x, e.y, EHW, EHH, c.x, c.y, CELL / 2, CELL / 2)) c.hp = 0;
    }
    if (e.y - EHH <= PLAYER_Y + 0.7) {
      endGame(s);
      return;
    }
  }

  const cleared = s.boss === null && (s.formation === null || formationAlive(s) === 0);
  if (cleared && s.enemies.every((e) => !e.alive || !e.dive)) {
    s.events.push({ t: "waveClear", wave: s.wave });
    s.wave++;
    s.hold = WAVE_HOLD;
    setupWave(s);
  }
}
