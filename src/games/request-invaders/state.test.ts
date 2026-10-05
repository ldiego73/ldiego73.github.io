import { describe, expect, test } from "bun:test";
import type { Difficulty } from "../core/types";
import {
  createState,
  DIFFICULTY,
  ENTER_T,
  formationFor,
  formationSpeed,
  isBossWave,
  LIMIT,
  mulberry32,
  PLAYER_Y,
  POINTS,
  SLOW_T,
  SPREAD_T,
  type State,
  slots,
  step,
} from "./state";

const idle = { left: false, right: false, fire: false };
const fire = { left: false, right: false, fire: true };

/** A state whose formation is already in place and playing. */
const ready = (d: Difficulty = "normal", seed = 7) => {
  const s = createState(d, mulberry32(seed));
  s.hold = 0;
  s.saucerTimer = 1e9;
  for (const e of s.enemies) e.t = ENTER_T;
  step(s, 0, idle);
  s.events.length = 0;
  return s;
};

const toWave = (s: State, wave: number) => {
  while (s.wave < wave) {
    for (const e of s.enemies) e.alive = false;
    s.boss = null;
    step(s, 0.01, idle);
  }
  s.hold = 0;
  s.events.length = 0;
};

describe("difficulty table", () => {
  test("lives per level", () => {
    expect(createState("easy").lives).toBe(5);
    expect(createState("normal").lives).toBe(3);
    expect(createState("hard").lives).toBe(2);
  });

  test("easy is slower and shoots less, hard faster and aimed", () => {
    const { easy, normal, hard } = DIFFICULTY;
    expect(easy.speed).toBeLessThan(normal.speed);
    expect(hard.speed).toBeGreaterThan(normal.speed);
    expect(easy.fire).toBeGreaterThan(normal.fire);
    expect(hard.fire).toBeLessThan(normal.fire);
    expect(easy.maxPackets).toBeLessThan(hard.maxPackets);
    expect(hard.aimed).toBe(true);
    expect(normal.aimed).toBe(false);
    expect(hard.bossHp).toBeGreaterThan(normal.bossHp);
    expect(formationSpeed(ready("easy"))).toBeLessThan(formationSpeed(ready("hard")));
  });

  test("hard packets lead toward the player", () => {
    const s = ready("hard");
    s.px = 15;
    s.fireTimer = 0;
    step(s, 0.001, idle);
    expect(s.packets.length).toBe(1);
    expect(s.packets[0].vx).toBeGreaterThan(0);
    const n = ready("normal");
    n.px = 15;
    n.fireTimer = 0;
    step(n, 0.001, idle);
    expect(n.packets[0].vx).toBe(0);
  });

  test("boss HP scales with difficulty", () => {
    const hp = (d: Difficulty) => {
      const s = ready(d);
      toWave(s, 3);
      return s.boss?.max ?? 0;
    };
    expect(hp("easy")).toBeLessThan(hp("normal"));
    expect(hp("normal")).toBeLessThan(hp("hard"));
  });
});

describe("formations", () => {
  test("waves cycle grid, V, boss, ring", () => {
    expect(formationFor(1)).toBe("grid");
    expect(formationFor(2)).toBe("v");
    expect(isBossWave(3)).toBe(true);
    expect(formationFor(4)).toBe("ring");
    expect(formationFor(5)).toBe("grid");
    expect(isBossWave(6)).toBe(true);
  });

  test("slot counts and every slot fits inside the field", () => {
    expect(slots("grid").length).toBe(45);
    expect(slots("v").length).toBe(24);
    expect(slots("ring").length).toBe(25);
    for (const name of ["grid", "v", "ring"] as const)
      for (const sl of slots(name)) expect(Math.abs(sl.sx)).toBeLessThan(LIMIT);
  });

  test("grid drops in and lands in place within the countdown", () => {
    const s = createState("normal", mulberry32(1));
    const top = Math.max(...s.enemies.map((e) => e.y));
    expect(top).toBeGreaterThan(20);
    for (let i = 0; i < 100; i++) step(s, 1 / 60, idle);
    expect(s.enemies.every((e) => e.t >= ENTER_T)).toBe(true);
    for (const e of s.enemies) expect(e.y).toBeCloseTo(s.oy + e.sy);
  });

  test("ring wave enters on a spiral", () => {
    const s = ready();
    toWave(s, 4);
    expect(s.formation).toBe("ring");
    const e = s.enemies[5];
    const path: number[] = [];
    while (e.t < ENTER_T) {
      step(s, 1 / 30, idle);
      path.push(Math.atan2(e.y - (s.oy + e.sy), e.x - (s.ox + e.sx)));
    }
    const turns = path.filter((a, i) => i > 0 && Math.abs(a - path[i - 1]) > Math.PI).length;
    expect(turns).toBeGreaterThan(0);
  });

  test("moves sideways, then drops and reverses at the edge", () => {
    const s = ready();
    const oy = s.oy;
    step(s, 0.1, idle);
    expect(s.ox).toBeGreaterThan(0);
    let guard = 0;
    while (s.dir === 1 && guard++ < 2000) step(s, 1 / 60, idle);
    expect(s.dir).toBe(-1);
    for (let i = 0; i < 60; i++) step(s, 1 / 60, idle);
    expect(s.oy).toBeCloseTo(oy - 1.2);
    expect(Math.max(...s.enemies.map((e) => e.x))).toBeLessThanOrEqual(LIMIT + 1e-6);
  });

  test("shooting an enemy scores by kind", () => {
    const s = ready();
    s.packets = [];
    s.shields = [];
    s.fireTimer = 1e9;
    const target = s.enemies.filter((e) => Math.abs(e.x - s.px) < 0.5).sort((a, b) => a.y - b.y)[0];
    for (let i = 0; i < 60 && target.alive; i++) step(s, 1 / 60, i === 0 ? fire : idle);
    expect(target.alive).toBe(false);
    expect(s.score).toBe(POINTS[target.kind]);
  });

  test("clearing a wave emits waveClear and starts the next one", () => {
    const s = ready();
    for (const e of s.enemies) e.alive = false;
    step(s, 0.01, idle);
    expect(s.events.some((e) => e.t === "waveClear" && e.wave === 1)).toBe(true);
    expect(s.wave).toBe(2);
    expect(s.formation).toBe("v");
  });
});

describe("boss", () => {
  test("every third wave is the DDoS Mothership, with phases and swarms", () => {
    const s = ready();
    toWave(s, 3);
    const b = s.boss;
    if (!b) throw new Error("no boss");
    expect(s.enemies.length).toBe(0);
    for (let i = 0; i < 120; i++) step(s, 1 / 60, idle);
    expect(b.y).toBeCloseTo(9.6);
    s.packets = [];
    s.shields = [];
    b.hp = Math.floor((b.max * 2) / 3) + 1;
    s.invuln = 1e9;
    s.px = b.x;
    b.dir = 1;
    let phased = false;
    for (let i = 0; i < 200 && b.phase === 1; i++) {
      s.px = b.x;
      step(s, 1 / 60, fire);
      phased ||= s.events.some((e) => e.t === "bossPhase");
    }
    expect(b.phase).toBe(2);
    expect(phased).toBe(true);
    for (let i = 0; i < 120; i++) step(s, 1 / 60, idle);
    expect(s.enemies.some((e) => e.dive && e.kind === 3)).toBe(true);
  });

  test("defeating the boss clears the wave and kills its swarm", () => {
    const s = ready();
    toWave(s, 3);
    const b = s.boss;
    if (!b) throw new Error("no boss");
    b.y = 9.6;
    s.shields = [];
    b.hp = 1;
    b.phase = 3;
    b.dir = 1;
    s.enemies.push({ kind: 3, sx: 0, sy: 0, x: 15, y: 5, alive: true, t: ENTER_T, entry: 0, dive: true, phase: 0 });
    s.px = b.x;
    s.invuln = 1e9;
    let down = false;
    for (let i = 0; i < 60 && s.wave === 3; i++) {
      s.px = s.boss?.x ?? s.px;
      step(s, 1 / 60, fire);
      down ||= s.events.some((e) => e.t === "bossDown");
    }
    expect(down).toBe(true);
    expect(s.wave).toBe(4);
    expect(s.score).toBeGreaterThanOrEqual(500);
  });
});

describe("power-ups", () => {
  const grab = (s: State, kind: "spread" | "cache" | "slow") => {
    s.powers = [{ x: s.px, y: PLAYER_Y + 0.5, kind }];
    step(s, 0.01, idle);
  };

  test("rule upgrade fires a 3-way spread for 8s", () => {
    const s = ready();
    s.fireTimer = 1e9;
    grab(s, "spread");
    expect(s.spread).toBeCloseTo(SPREAD_T, 1);
    step(s, 0.01, fire);
    expect(s.shots.length).toBe(3);
    for (let i = 0; i < 9 * 60; i++) step(s, 1 / 60, idle);
    expect(s.spread).toBe(0);
  });

  test("CDN cache absorbs exactly one hit", () => {
    const s = ready();
    s.fireTimer = 1e9;
    grab(s, "cache");
    expect(s.cache).toBe(true);
    const lives = s.lives;
    s.packets = [{ x: s.px, y: PLAYER_Y + 0.3, vx: 0 }];
    step(s, 0.01, idle);
    expect(s.cache).toBe(false);
    expect(s.lives).toBe(lives);
    s.invuln = 0;
    s.packets = [{ x: s.px, y: PLAYER_Y + 0.3, vx: 0 }];
    step(s, 0.01, idle);
    expect(s.lives).toBe(lives - 1);
  });

  test("rate limit halves enemy speed for 6s", () => {
    const s = ready();
    const v = formationSpeed(s);
    grab(s, "slow");
    expect(s.slow).toBeCloseTo(SLOW_T, 1);
    expect(formationSpeed(s)).toBeCloseTo(v / 2, 5);
    for (let i = 0; i < 7 * 60; i++) step(s, 1 / 60, idle);
    expect(s.slow).toBe(0);
  });

  test("the zero-day saucer pays a bonus and drops a power-up", () => {
    const s = ready();
    s.fireTimer = 1e9;
    s.saucer = { x: 0, dir: 1 };
    s.px = 0;
    for (const e of s.enemies) if (Math.abs(e.x) < 2) e.alive = false;
    s.shields = [];
    let bonus = 0;
    for (let i = 0; i < 60 && !bonus; i++) {
      if (s.saucer) s.saucer.x = 0;
      step(s, 1 / 60, i === 0 ? fire : idle);
      for (const e of s.events) if (e.t === "saucer") bonus = e.bonus;
    }
    expect(bonus).toBeGreaterThan(0);
    expect(s.powers.length).toBe(1);
  });
});

describe("game over", () => {
  test("an idle run is overrun on every difficulty", () => {
    for (const d of ["easy", "normal", "hard"] as const) {
      const s = createState(d, mulberry32(3));
      let t = 0;
      while (!s.over && t < 600) {
        step(s, 1 / 30, idle);
        t += 1 / 30;
      }
      expect(s.over).toBe(true);
      expect(s.events.filter((e) => e.t === "gameover").length).toBe(1);
    }
  });

  test("a scripted shooter scores and clears at least one wave before falling", () => {
    const s = createState("easy", mulberry32(11));
    let cleared = 0;
    let t = 0;
    while (!s.over && t < 900) {
      const alive = s.enemies.filter((e) => e.alive);
      const tx = s.boss ? s.boss.x : (alive.sort((a, b) => a.y - b.y)[0]?.x ?? 0);
      step(s, 1 / 30, { left: tx < s.px - 0.4, right: tx > s.px + 0.4, fire: true });
      cleared += s.events.filter((e) => e.t === "waveClear").length;
      s.events.length = 0;
      t += 1 / 30;
    }
    expect(s.score).toBeGreaterThan(0);
    expect(cleared).toBeGreaterThan(0);
  });
});
