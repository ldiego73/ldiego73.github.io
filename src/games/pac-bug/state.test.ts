import { describe, expect, test } from "bun:test";
import {
  BONUS,
  BUG,
  bugSpeed,
  DIFFICULTY,
  DIRS,
  type Difficulty,
  type Dir,
  EXIT,
  type Game,
  type GameEv,
  GUARD,
  H,
  HIT,
  hitRadius,
  hotfixSecs,
  LEVELS,
  LOCK_RADIUS,
  MAZE,
  newGame,
  open,
  PLAYER_SPEED,
  READY,
  setWant,
  step,
  targetFor,
  W,
  wrapX,
} from "./state";

const seeded =
  (s = 1) =>
  () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
const drain = (g: Game) => g.events.splice(0);
const run = (g: Game, secs: number, ev: GameEv[] = []) => {
  for (let i = 0; i < secs * 60; i++) {
    step(g, 1 / 60);
    ev.push(...drain(g));
  }
  return ev;
};
const playing = (opts?: { enemies?: boolean; difficulty?: Difficulty }) => {
  const g = newGame(seeded(), opts);
  step(g, READY.start + 0.05);
  expect(g.phase).toBe("play");
  drain(g);
  return g;
};

/** BFS (with tunnel wrap) from (x,y) to the nearest remaining food; returns the first move. */
function nextMove(g: Game): Dir | null {
  const a = g.player;
  const p = a.dir && a.t > 0 ? { x: wrapX(a.x + DIRS[a.dir][0]), y: a.y + DIRS[a.dir][1] } : a;
  const seen = new Map<number, Dir | null>([[p.y * W + p.x, null]]);
  const q: Array<[number, number]> = [[p.x, p.y]];
  while (q.length) {
    const [x, y] = q.shift()!;
    const first = seen.get(y * W + x)!;
    if (g.food.has(y * W + x) && first) return first;
    for (const d of Object.keys(DIRS) as Dir[]) {
      const nx = wrapX(x + DIRS[d][0]);
      const ny = y + DIRS[d][1];
      if (!open(nx, ny) || seen.has(ny * W + nx)) continue;
      seen.set(ny * W + nx, first ?? d);
      q.push([nx, ny]);
    }
  }
  return null;
}

describe("maze", () => {
  test("rows are 19 wide, 21 tall and mirror-symmetric", () => {
    expect(H).toBe(21);
    for (const r of MAZE) {
      expect(r.length).toBe(19);
      expect([...r].reverse().join("").replace("P", ".")).toBe(r.replace("P", "."));
    }
  });
  test("exactly 4 HOTFIX patches and every packet reachable from the start", () => {
    expect(MAZE.join("").split("o").length - 1).toBe(4);
    const g = newGame(seeded());
    const seen = new Set([15 * W + 9]);
    const q = [[9, 15]];
    while (q.length) {
      const [x, y] = q.shift()!;
      for (const [dx, dy] of Object.values(DIRS)) {
        const nx = wrapX(x + dx);
        const ny = y + dy;
        if (open(nx, ny) && !seen.has(ny * W + nx)) {
          seen.add(ny * W + nx);
          q.push([nx, ny]);
        }
      }
    }
    for (const k of g.food.keys()) expect(seen.has(k)).toBe(true);
  });
  test("no dead ends outside the house", () => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!open(x, y)) continue;
        const n = Object.values(DIRS).filter(([dx, dy]) => open(x + dx, y + dy)).length;
        expect(n + (x === EXIT.x && y === EXIT.y ? 1 : 0)).toBeGreaterThanOrEqual(2);
      }
  });
});

describe("movement", () => {
  test("player is blocked by walls and stops", () => {
    const g = playing({ enemies: false });
    setWant(g, "down"); // (9,16) is a wall
    run(g, 0.5);
    expect(g.player).toMatchObject({ x: 9, y: 15, dir: null });
  });
  test("buffered turn is applied at the next intersection", () => {
    const g = playing({ enemies: false });
    setWant(g, "left");
    step(g, 0.05);
    setWant(g, "up"); // buffered until the player reaches (8,15), where up is open
    run(g, 1);
    expect(g.player.x).toBe(8);
    expect(g.player.y).toBeLessThan(15);
  });
  test("reversal mid-segment is instant", () => {
    const g = playing({ enemies: false });
    setWant(g, "right");
    step(g, 0.05);
    const before = g.player.t;
    expect(before).toBeGreaterThan(0);
    setWant(g, "left");
    expect(g.player.dir).toBe("left");
    expect(g.player.x).toBe(10);
    expect(g.player.t).toBeCloseTo(1 - before);
  });
  test("tunnel wraps", () => {
    const g = playing({ enemies: false });
    g.player = { x: 1, y: 9, dir: "left", t: 0 };
    g.want = "left";
    run(g, 0.4);
    expect(g.player.x).toBeGreaterThan(15);
  });
  test("gate blocks the player", () => {
    const g = playing({ enemies: false });
    g.player = { ...EXIT, dir: null, t: 0 };
    setWant(g, "down");
    run(g, 0.5);
    expect(g.player.y).toBe(7);
  });
});

describe("enemies and power mode", () => {
  test("eating a packet scores 10", () => {
    const g = playing({ enemies: false });
    setWant(g, "left");
    const ev = run(g, 0.2);
    expect(ev.some((e) => e.type === "packet")).toBe(true);
    expect(g.score).toBe(10);
  });
  test("all enemies leave the house", () => {
    const g = playing();
    g.lives = 99;
    const out = new Set<number>();
    for (let i = 0; i < 60 * 9; i++) {
      step(g, 1 / 60);
      if (g.phase === "play") for (const e of g.enemies) if (e.mode !== "house") out.add(e.id);
    }
    expect(out.size).toBe(4);
  });
  test("an eaten enemy gets home from every cell and heading", () => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (!open(x, y)) continue;
        for (const d of Object.keys(DIRS) as Dir[]) {
          if (!open(x - DIRS[d][0], y - DIRS[d][1])) continue;
          const g = playing();
          g.player = { x: 1, y: 19, dir: null, t: 0 };
          g.enemies = [{ ...g.enemies[0], x, y, dir: d, t: 0, mode: "eaten" }];
          let ok = false;
          for (let i = 0; i < 600 && !ok; i++) {
            step(g, 1 / 60);
            ok = g.enemies[0].mode === "active";
          }
          if (!ok) throw new Error(`stuck from ${x},${y} ${d}`);
        }
      }
  });
  test("patched bugs flee from the player", () => {
    const g = playing();
    const e = g.enemies[0];
    Object.assign(e, { x: 4, y: 3, dir: "right", t: 0, scared: true });
    g.fright = 5;
    g.player = { x: 9, y: 3, dir: null, t: 0 };
    run(g, 0.2);
    expect(e.x).toBeLessThanOrEqual(4);
  });
  test("HOTFIX patches every bug and the combo scores 200/400/800/1600", () => {
    const g = playing();
    g.lockCd = 99;
    for (const e of g.enemies) Object.assign(e, { mode: "active", x: 1, y: 3, dir: "down", t: 0 });
    g.player = { x: 1, y: 2, dir: "up", t: 0 };
    g.want = "up";
    const ev = run(g, 0.25);
    expect(ev.some((e) => e.type === "hotfix")).toBe(true);
    expect(g.fright).toBeGreaterThan(5);
    // enemies reversed toward the player and get eaten as they meet
    for (const e of g.enemies) Object.assign(e, { x: 1, y: 2, t: 0, dir: "up", reverse: false });
    g.player = { x: 1, y: 2, dir: null, t: 0 };
    g.want = null;
    const ev2 = run(g, 0.05);
    const pts = ev2.filter((e) => e.type === "eat").map((e) => (e as { points: number }).points);
    expect(pts).toEqual([200, 400, 800, 1600]);
    expect(g.enemies.every((e) => e.mode === "eaten")).toBe(true);
    run(g, 6);
    expect(g.enemies.every((e) => e.mode !== "eaten")).toBe(true);
  });
  test("mode change forces active enemies to reverse", () => {
    const g = playing();
    const e = g.enemies[0];
    g.modeTime = 6.99;
    g.player = { x: 1, y: 19, dir: null, t: 0 };
    const d = e.dir;
    run(g, 0.05);
    expect(g.modeIdx).toBe(1);
    expect(e.dir).not.toBe(d);
  });
  test("touching an enemy costs a life and resets", () => {
    const g = playing();
    const e = g.enemies[0];
    Object.assign(e, { x: 9, y: 15, t: 0, dir: "left" });
    const ev = run(g, 2);
    expect(ev.some((x) => x.type === "die")).toBe(true);
    expect(g.lives).toBe(2);
    expect(g.player).toMatchObject({ x: 9, y: 15 });
  });
});

describe("full runs", () => {
  test("idle player loses all lives and the run ends once", () => {
    const g = newGame(seeded(7));
    const ev = run(g, 240);
    expect(g.lives).toBe(0);
    expect(g.phase).toBe("over");
    expect(ev.filter((e) => e.type === "gameover").length).toBe(1);
    expect(ev.filter((e) => e.type === "die").length).toBe(3);
  });
  test("autopilot clears 3 levels and wins", () => {
    const g = newGame(seeded(3), { enemies: false });
    const ev: GameEv[] = [];
    for (let i = 0; i < 60 * 600 && g.phase !== "won"; i++) {
      if (g.phase === "play") g.want = nextMove(g) ?? g.want;
      step(g, 1 / 60);
      ev.push(...drain(g));
    }
    expect(g.phase).toBe("won");
    expect(ev.filter((e) => e.type === "level").map((e) => (e as { level: number }).level)).toEqual([2, 3]);
    expect(ev.filter((e) => e.type === "win").length).toBe(1);
    const packets = MAZE.join("").split(".").length - 1;
    expect(ev.filter((e) => e.type === "packet").length).toBe(packets * 3);
  });
});

const DIFFS: Difficulty[] = ["easy", "normal", "hard"];
const bug = (g: Game, id: number) => g.enemies[id];

describe("difficulty table", () => {
  test("lives 4 / 3 / 2", () => {
    expect(DIFFS.map((d) => DIFFICULTY[d].lives)).toEqual([4, 3, 2]);
    for (const d of DIFFS) expect(newGame(seeded(), { difficulty: d }).lives).toBe(DIFFICULTY[d].lives);
  });
  test("bugs get faster and HOTFIX shorter with difficulty and level", () => {
    for (let lv = 1; lv <= LEVELS; lv++) {
      for (let id = 0; id < 4; id++) {
        expect(bugSpeed("easy", lv, id)).toBeLessThan(bugSpeed("normal", lv, id));
        expect(bugSpeed("normal", lv, id)).toBeLessThan(bugSpeed("hard", lv, id));
      }
      expect(hotfixSecs("easy", lv)).toBeGreaterThan(hotfixSecs("normal", lv));
      expect(hotfixSecs("normal", lv)).toBeGreaterThan(hotfixSecs("hard", lv));
      if (lv > 1) expect(bugSpeed("normal", lv, 0)).toBeGreaterThan(bugSpeed("normal", lv - 1, 0));
    }
    expect(hotfixSecs("hard", 3)).toBeGreaterThan(2);
  });
  test("only Race Condition can outrun the player (every difficulty and level)", () => {
    for (const d of DIFFS)
      for (let lv = 1; lv <= LEVELS; lv++) {
        const ps = PLAYER_SPEED * [1, 1.1, 1.2][lv - 1];
        for (const id of [BUG.NULL, BUG.LEAK, BUG.LOCK]) expect(bugSpeed(d, lv, id)).toBeLessThan(ps);
      }
  });
  test("hard is smarter: less random Race, longer Leak lookahead, wider Deadlock guard", () => {
    expect(DIFFICULTY.hard.raceRandom).toBeLessThan(DIFFICULTY.normal.raceRandom);
    expect(DIFFICULTY.normal.raceRandom).toBeLessThan(DIFFICULTY.easy.raceRandom);
    expect(DIFFICULTY.hard.lookahead).toBeGreaterThan(DIFFICULTY.easy.lookahead);
    expect(DIFFICULTY.hard.guardRadius).toBeGreaterThan(DIFFICULTY.easy.guardRadius);
  });
  test("start shows a READY countdown before play", () => {
    const g = newGame(seeded());
    step(g, READY.start - 0.1);
    expect(g.phase).toBe("ready");
    step(g, 0.2);
    expect(g.phase).toBe("play");
  });
});

describe("bug AI", () => {
  const chase = (difficulty: Difficulty = "normal") => {
    const g = playing({ difficulty });
    g.modeIdx = 1; // chase phase
    for (const e of g.enemies) e.mode = "active";
    return g;
  };
  test("Null Pointer chases the player directly", () => {
    const g = chase();
    g.player = { x: 4, y: 13, dir: "left", t: 0 };
    expect(targetFor(g, bug(g, BUG.NULL))).toMatchObject({ x: 4, y: 13 });
  });
  test("Memory Leak ambushes ahead of the player (further on hard)", () => {
    for (const d of DIFFS) {
      const g = chase(d);
      g.player = { x: 9, y: 13, dir: "right", t: 0 };
      expect(targetFor(g, bug(g, BUG.LEAK))).toEqual({ x: 9 + DIFFICULTY[d].lookahead, y: 13 });
    }
  });
  test("Memory Leak grows over time, capped, and shrinks when eaten", () => {
    const g = chase();
    g.lives = 99;
    g.player = { x: 1, y: 19, dir: null, t: 0 };
    g.lockCd = 999;
    const e = bug(g, BUG.LEAK);
    g.enemies = [e];
    for (let i = 0; i < 60 * 60; i++) {
      step(g, 1 / 60);
      g.phase = "play"; // ignore catches: only growth matters here
    }
    expect(e.grow).toBeGreaterThan(0.5);
    expect(hitRadius(e)).toBeLessThanOrEqual(HIT + 0.15);
    Object.assign(e, { scared: true, x: 1, y: 19, t: 0, dir: null, mode: "active" });
    g.phase = "play";
    g.fright = 3;
    step(g, 1 / 60);
    expect(e.mode).toBe("eaten");
    expect(e.grow).toBe(0);
  });
  test("Race Condition is erratic: random turns depend on the rng", () => {
    const g = chase();
    const e = bug(g, BUG.RACE);
    Object.assign(e, { x: 9, y: 13, dir: "down", t: 0 }); // (9,14) is a wall: left/right only
    g.player = { x: 17, y: 13, dir: null, t: 0 };
    g.rng = () => 0; // always random, picks the first option ("left")
    step(g, 1 / 120);
    expect(e.dir).toBe("left");
    Object.assign(e, { x: 9, y: 13, dir: "down", t: 0 });
    g.rng = () => 0.99; // never random: heads to the player
    step(g, 1 / 120);
    expect(e.dir).toBe("right");
  });
  test("Race Condition warps across the tunnel, never next to the player", () => {
    const g = chase();
    const e = bug(g, BUG.RACE);
    g.rng = () => 0;
    Object.assign(e, { x: 2, y: 9, dir: "left", t: 0 });
    g.player = { x: 9, y: 19, dir: null, t: 0 };
    g.events.length = 0;
    step(g, 1 / 120);
    expect(g.events.some((v) => v.type === "warp")).toBe(true);
    expect(e.x).toBeGreaterThanOrEqual(15);
    const g2 = chase();
    const e2 = bug(g2, BUG.RACE);
    g2.rng = () => 0;
    Object.assign(e2, { x: 2, y: 9, dir: "left", t: 0 });
    g2.player = { x: 15, y: 9, dir: null, t: 0 };
    step(g2, 1 / 120);
    expect(e2.x).toBeLessThan(9);
  });
  test("Deadlock guards the corner nearest the player and closes in when near", () => {
    const g = chase();
    const e = bug(g, BUG.LOCK);
    Object.assign(e, { x: 9, y: 7 });
    g.player = { x: 16, y: 19, dir: null, t: 0 };
    expect(targetFor(g, e)).toEqual(GUARD[2]);
    g.player = { x: 2, y: 1, dir: null, t: 0 };
    expect(targetFor(g, e)).toEqual(GUARD[0]);
    g.player = { x: 12, y: 7, dir: null, t: 0 };
    expect(targetFor(g, e)).toMatchObject({ x: 12, y: 7 });
  });
  test("Deadlock lock freezes the player AND itself (it can never cash the freeze in)", () => {
    for (const d of DIFFS) {
      const g = chase(d);
      g.enemies = [bug(g, BUG.LOCK)];
      const e = g.enemies[0];
      Object.assign(e, { x: 4, y: 13, dir: "right", t: 0 });
      g.player = { x: 5, y: 13, dir: null, t: 0 };
      g.events.length = 0;
      step(g, 1 / 120);
      expect(g.events.some((v) => v.type === "lock")).toBe(true);
      expect(g.freeze).toBeGreaterThan(0);
      expect(LOCK_RADIUS).toBeGreaterThan(HIT);
      const before = { ...e };
      setWant(g, "left");
      step(g, DIFFICULTY[d].freeze - 0.05);
      expect(g.phase).toBe("play");
      expect(e.x).toBe(before.x);
      expect(e.t).toBeCloseTo(before.t);
      expect(g.player.x).toBe(5);
      // Cooldown: no immediate re-lock.
      step(g, 0.1);
      expect(g.lockCd).toBeGreaterThan(0);
    }
  });
});

describe("bonus items", () => {
  test("coffee then LGTM spawn on packet thresholds, score x level and expire", () => {
    const g = playing({ enemies: false });
    let k = 0;
    for (const [key, v] of [...g.food]) {
      if (k >= BONUS.at[0] - 1) break;
      if (v === ".") {
        g.food.delete(key);
        g.eatenInLevel++;
        k++;
      }
    }
    setWant(g, "left");
    const ev = run(g, 0.3);
    expect(ev.some((e) => e.type === "bonus" && e.kind === "coffee")).toBe(true);
    expect(g.bonus?.kind).toBe("coffee");
    // Walk the player onto the bonus tile.
    g.player = { x: BONUS.tile.x - 1, y: BONUS.tile.y, dir: null, t: 0 };
    const before = g.score;
    setWant(g, "right");
    const ev2 = run(g, 0.2);
    expect(ev2.some((e) => e.type === "bonusEat" && e.points === BONUS.points.coffee)).toBe(true);
    expect(g.score).toBeGreaterThanOrEqual(before + BONUS.points.coffee);
    g.eatenInLevel = BONUS.at[1] - 1;
    g.player = { x: 1, y: 19, dir: null, t: 0 };
    setWant(g, "right");
    run(g, 0.3);
    expect(g.bonus?.kind).toBe("lgtm");
    setWant(g, "left");
    run(g, BONUS.life + 0.5);
    expect(g.bonus).toBeNull();
  });
});

describe("scripted runs per difficulty", () => {
  for (const d of DIFFS)
    test(`${d}: idle player loses ${DIFFICULTY[d].lives} lives, one gameover`, () => {
      const g = newGame(seeded(5), { difficulty: d });
      const ev = run(g, 300);
      expect(g.phase).toBe("over");
      expect(ev.filter((e) => e.type === "die").length).toBe(DIFFICULTY[d].lives);
      expect(ev.filter((e) => e.type === "gameover").length).toBe(1);
      expect(ev.some((e) => e.type === "win")).toBe(false);
    });
});
