/**
 * Who calls, when, from where: positional animal voices and people ambience read from the shared `creatures`
 * registry (src/world/creatures.ts). Pure decision logic (no Web Audio), unit tested; the soundscape turns each
 * `CallRequest` into sound with ./calls.ts.
 *
 *   - Each kind has a rule: hearing range, distance falloff, a randomized cooldown and a condition (night, dusk,
 *     over water, fleeing...). Only the nearest body of a kind is considered (herd alarms: the nearest one that
 *     just bolted); no body -> no sound.
 *   - At most one animal call per probe and a global minimum gap between animal calls, so a field full of
 *     animals never turns into a zoo. People chatter has its own (also sparse) clock.
 *   - Bodies are looked up fresh at every probe (core clears the registry on mount/dispose).
 */
import type { Body, CreatureRegistry } from "../../creatures";
import type { CallName } from "./calls";
import { falloff, panFor } from "./mix";

export interface Situation {
  night: boolean;
  /** Sky time 0..1 (0 midnight, 0.25 sunrise, 0.5 noon, 0.75 sunset). */
  time: number;
  raining: boolean;
  /** Indoors: the outdoors is muffled and mostly quiet. */
  inside: boolean;
}

export interface CallContext extends Situation {
  /** The body is moving fast (fleeing) right now, and was not at the previous probe. */
  startedFleeing: boolean;
  /** The body stands on water. */
  overWater: boolean;
}

export interface CallRule {
  kind: string;
  call: CallName;
  /** Silent beyond this distance (world units). */
  range: number;
  /** Distance at which the level halves. */
  half: number;
  /** Seconds between two calls of this kind: [min, max]. */
  gap: readonly [number, number];
  /** Peak level at the source. */
  level: number;
  /** Pitch variant passed to the synth. */
  variant?: number;
  when?: (c: CallContext) => boolean;
  /** Ignores the global gap (urgent: an alarm). */
  urgent?: boolean;
}

const dusky = (c: Situation) => c.time > 0.7 || c.time < 0.24;
const daylight = (c: Situation) => c.time > 0.22 && c.time < 0.8;

export const CALL_RULES: readonly CallRule[] = [
  { kind: "puma", call: "growl", range: 75, half: 24, gap: [28, 55], level: 0.45, when: (c) => c.night },
  { kind: "fox", call: "yip", range: 60, half: 16, gap: [16, 34], level: 0.4, when: dusky },
  { kind: "condor", call: "condor", range: 60, half: 16, gap: [35, 70], level: 0.55, when: daylight },
  {
    kind: "vicuna",
    call: "trill",
    range: 55,
    half: 14,
    gap: [5, 8],
    level: 0.4,
    urgent: true,
    when: (c) => c.startedFleeing,
  },
  { kind: "alpaca", call: "hum", range: 18, half: 5, gap: [12, 26], level: 0.35, variant: 1 },
  { kind: "llama", call: "hum", range: 18, half: 5, gap: [14, 28], level: 0.35, variant: -1 },
  { kind: "pack-llama", call: "hum", range: 16, half: 5, gap: [16, 32], level: 0.3, variant: -1 },
  { kind: "vizcacha", call: "whistle", range: 32, half: 9, gap: [12, 26], level: 0.3, when: daylight },
  {
    kind: "duck",
    call: "duck",
    range: 40,
    half: 11,
    gap: [9, 20],
    level: 0.32,
    when: (c) => c.overWater && daylight(c),
  },
  { kind: "tinamou", call: "tinamou", range: 48, half: 14, gap: [18, 36], level: 0.3, when: daylight },
  { kind: "colibri", call: "buzz", range: 12, half: 4, gap: [6, 14], level: 0.45, when: daylight },
  { kind: "bear", call: "huff", range: 32, half: 8, gap: [40, 80], level: 0.45 },
];

/** Bird kinds whose position steers the soundscape's existing birdsong (no second chirp stream; gallito = gallito de las rocas). */
export const SONGBIRDS: readonly string[] = ["tangara", "sparrow", "gallito"];
/** People kinds that murmur and laugh. */
export const PEOPLE: readonly string[] = ["vendor", "shopper", "child"];

/** Speed (units/s) above which a body counts as fleeing. */
export const FLEE_SPEED = 3.2;
/** Global minimum seconds between two animal calls. */
export const GLOBAL_GAP = 1.6;
export const PEOPLE_RANGE = 28;
export const PEOPLE_HALF = 8;
export const PEOPLE_LEVEL = 0.42;

export interface CallRequest {
  call: CallName;
  level: number;
  pan: number;
  dist: number;
  variant: number;
  kind: string;
}

/** Level of a call at distance `d` for a rule (0 beyond range). */
export function callLevel(rule: Pick<CallRule, "level" | "half" | "range">, d: number): number {
  return rule.level * falloff(d, rule.half, rule.range);
}

/** Seconds until the next murmur for `n` people nearby (busier crowds murmur more often). */
export function chatterGap(n: number, r: number): number {
  if (n <= 0) return 3;
  return Math.max(0.9, 3.2 / Math.sqrt(n)) * (0.7 + r * 0.9);
}

interface Track {
  x: number;
  z: number;
  fleeing: boolean;
  /** Probe counter when last seen (stale tracks are pruned). */
  seen: number;
}

export interface Listener {
  x: number;
  z: number;
  /** Camera right vector (x, z) for panning. */
  rx: number;
  rz: number;
}

/**
 * Stateful scheduler. Call `probe()` a few times per second with the audio clock; it returns at most one
 * animal call and at most one people call (written into `out`, which is cleared first).
 */
export class Critters {
  private next = new Map<string, number>();
  private lastAny = Number.NEGATIVE_INFINITY;
  private nextPeople = 0;
  /** Per-body motion of herd animals in earshot (urgent rules), by body id. */
  private tracks = new Map<number, Track>();
  private probes = 0;
  private herdBuf: Body[] = [];
  private nearBuf: Body[] = [];
  private peopleBuf: Body[] = [];
  private cc: CallContext = {
    night: false,
    time: 0.5,
    raining: false,
    inside: false,
    startedFleeing: false,
    overWater: false,
  };

  constructor(
    private reg: CreatureRegistry,
    private rand: () => number,
    private o: { low?: boolean; isWater?: (x: number, z: number) => boolean; rules?: readonly CallRule[] } = {},
  ) {}

  private rules() {
    return this.o.rules ?? CALL_RULES;
  }

  /**
   * Herd alarm: follows every body of `kind` within `range` (the nearest one changes while a herd runs) and returns
   * the nearest one that just started fleeing (speed measured between probes), or null.
   */
  private herdAlarm(kind: string, me: Listener, range: number, dt: number): Body | null {
    let best: Body | null = null;
    let bd = Number.POSITIVE_INFINITY;
    for (const b of this.reg.near(me.x, me.z, range, this.herdBuf)) {
      if (b.kind !== kind || (b.x === 0 && b.z === 0)) continue;
      const tr = this.tracks.get(b.id);
      if (!tr) {
        this.tracks.set(b.id, { x: b.x, z: b.z, fleeing: false, seen: this.probes });
        continue;
      }
      const spd = dt > 0 ? Math.hypot(b.x - tr.x, b.z - tr.z) / dt : 0;
      const was = tr.fleeing;
      tr.x = b.x;
      tr.z = b.z;
      tr.seen = this.probes;
      tr.fleeing = spd > FLEE_SPEED && spd < 40; // > 40 u/s is a teleport/respawn, not a run
      if (tr.fleeing && !was) {
        const d = (b.x - me.x) ** 2 + (b.z - me.z) ** 2;
        if (d < bd) {
          bd = d;
          best = b;
        }
      }
    }
    return best;
  }

  probe(now: number, dt: number, me: Listener, sit: Situation, out: CallRequest[]): CallRequest[] {
    out.length = 0;
    const gapScale = this.o.low ? 1.8 : 1;
    const globalGap = GLOBAL_GAP * gapScale;
    let picked = false;
    this.probes++;
    for (const rule of this.rules()) {
      const alarm = rule.urgent ? this.herdAlarm(rule.kind, me, rule.range, dt) : null;
      const b = alarm ?? this.reg.nearestOf(rule.kind, me.x, me.z);
      // a body still at the exact origin has not been placed yet (or is parked while hidden)
      if (!b || (b.x === 0 && b.z === 0)) continue;
      const startedFleeing = alarm !== null;
      const dx = b.x - me.x;
      const dz = b.z - me.z;
      const d = Math.hypot(dx, dz);
      if (picked || d > rule.range || sit.inside) continue;
      const due = this.next.get(rule.kind);
      if (due === undefined) {
        // first time in earshot: wait a little so arriving somewhere is not greeted by a chorus
        this.next.set(rule.kind, now + rule.gap[0] * 0.3 * (0.5 + this.rand()));
        if (!startedFleeing) continue;
      } else if (now < due) continue;
      if (!rule.urgent && now - this.lastAny < globalGap) continue;
      const cc = this.cc;
      cc.night = sit.night;
      cc.time = sit.time;
      cc.raining = sit.raining;
      cc.inside = sit.inside;
      cc.startedFleeing = startedFleeing;
      cc.overWater = !!this.o.isWater?.(b.x, b.z);
      if (rule.when && !rule.when(cc)) continue;
      const level = callLevel(rule, d);
      if (level < 0.01) continue;
      out.push({
        call: rule.call,
        level,
        pan: panFor(dx, dz, me.rx, me.rz),
        dist: d,
        variant: rule.variant ?? 0,
        kind: rule.kind,
      });
      picked = true;
      this.lastAny = now;
      this.next.set(rule.kind, now + (rule.gap[0] + this.rand() * (rule.gap[1] - rule.gap[0])) * gapScale);
    }

    for (const [id, tr] of this.tracks) if (tr.seen < this.probes - 1) this.tracks.delete(id);

    // people: murmur from a random nearby person, the odd laugh (children laugh more)
    if (!sit.inside && now >= this.nextPeople) {
      const near = this.reg.near(me.x, me.z, PEOPLE_RANGE, this.nearBuf);
      const people = this.peopleBuf;
      people.length = 0;
      for (const b of near) if (PEOPLE.includes(b.kind)) people.push(b);
      if (people.length) {
        const b = people[Math.floor(this.rand() * people.length)] as Body;
        const dx = b.x - me.x;
        const dz = b.z - me.z;
        const d = Math.hypot(dx, dz);
        const child = b.kind === "child";
        const laugh = this.rand() < (child ? 0.3 : 0.12);
        const level = PEOPLE_LEVEL * falloff(d, PEOPLE_HALF, PEOPLE_RANGE);
        if (this.nextPeople > 0 && level >= 0.01)
          out.push({
            call: laugh ? "laugh" : "chatter",
            level,
            pan: panFor(dx, dz, me.rx, me.rz),
            dist: d,
            variant: child ? 1 : 0,
            kind: b.kind,
          });
        this.nextPeople = now + chatterGap(people.length, this.rand()) * gapScale;
      } else this.nextPeople = now + 1;
    }
    return out;
  }

  /** Nearest songbird (tangara / sparrow / gallito) within `range`, or null. */
  nearestSongbird(x: number, z: number, range: number): Body | null {
    let best: Body | null = null;
    let bd = range;
    for (const k of SONGBIRDS) {
      const b = this.reg.nearestOf(k, x, z);
      if (!b) continue;
      const d = Math.hypot(b.x - x, b.z - z);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }
}
