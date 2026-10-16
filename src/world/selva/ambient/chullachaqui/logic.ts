/**
 * Pure rules of the Chullachaqui egg (no DOM, no Three; runs under bun test).
 *
 * The site: a short side path that leaves the jungle road on its forest side (side +1, away from the river)
 * between the palafitos (t 0.6) and the floating arcade (t 0.76), ending in a small clearing. The scenery's
 * forest is seeded per quality tier and grid size, so no fixed spot is free of trunks on every tier: the
 * runtime hands `pickSite` the trunk colliders the scenery registered (all trunks within 12 u of the road)
 * and it picks, among a grid of candidate road t's and path bends, the first one whose path and clearing
 * miss every trunk and stand on open ground, preferring the candidates closest to PREFERRED_T. Road t's
 * under the scenery's plank sections (muddy stretches) are skipped: the planks would hide the prints.
 *
 * The trail: mismatched prints (a bare human foot on the left, a round hoof/peg on the right) along a
 * quadratic curve from the middle of the road to the clearing, stopping short of the spirit.
 *
 * The encounter state machine (`Spirit`): lurk (back to the road) → watch (turned toward the traveler, one
 * mischievous quip per visit) → talk (E: the folk line, the stamp) → vanish (a puff of leaves, or a plain
 * fade under reduced motion) → gone (the prints fade). Walking far away and coming back brings him back.
 */

/** Road frame at a t: point on the centerline and the unit tangent (x, z). Side +1 is (-tz, tx). */
export interface RoadFrame {
  px: number;
  pz: number;
  tx: number;
  tz: number;
}

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Site {
  t: number;
  /** Path start (on the road), bend control and end (the clearing center), world x/z. */
  a: [number, number];
  c: [number, number];
  b: [number, number];
  /** Where the spirit stands (back edge of the clearing) and its yaw facing away from the road. */
  spirit: [number, number];
  yaw: number;
}

/** Road t range searched (palafitos at 0.6 and its plaza end ≈ 0.625; the arcade plaza starts ≈ 0.735). */
export const T_RANGE: readonly [number, number] = [0.64, 0.722];
export const T_STEP = 0.003;
/** Middle of the quiet stretch: candidates are tried in order of distance from it. */
export const PREFERRED_T = 0.685;
/** Path start: just past the road centerline on the river side, so the prints cross half the road. */
export const START_LAT = -0.6;
/** Clearing center: lateral distance from the centerline (u). Lateral offsets along the road tried for it. */
export const CLEAR_LATS = [8, 7, 9] as const;
export const CLEAR_LONS = [1.8, -1.8, 3.2, 0, -3.2] as const;
/** Clearing radius (walkable disc) and the margin kept from trunks around it and along the path. */
export const CLEAR_R = 2.6;
export const PATH_HALF = 0.9;
/** Spirit stands this far beyond the clearing center (away from the road), half hidden by the roots. */
export const SPIRIT_BACK = 1.2;

/** Point on the quadratic Bézier a → c → b at u. */
export function bez(s: Pick<Site, "a" | "b" | "c">, u: number): [number, number] {
  const k = 1 - u;
  return [k * k * s.a[0] + 2 * k * u * s.c[0] + u * u * s.b[0], k * k * s.a[1] + 2 * k * u * s.c[1] + u * u * s.b[1]];
}

/** The path as a polyline of n + 1 points (the walkable chain and the print placement both use it). */
export function pathPoints(s: Pick<Site, "a" | "b" | "c">, n = 24): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) out.push(bez(s, i / n));
  return out;
}

/** Builds a candidate site from a road frame: lateral `lat` and along-road `lon` of the clearing center. */
export function siteAt(t: number, f: RoadFrame, lat: number, lon: number): Site {
  const rx = -f.tz;
  const rz = f.tx;
  const at = (l: number, o: number): [number, number] => [f.px + rx * l + f.tx * o, f.pz + rz * l + f.tz * o];
  const a = at(START_LAT, 0);
  // The bend: leave the road square to it, then drift along to the clearing (reads as a wandering walk).
  const c = at(lat * 0.55, lon * 0.1);
  const b = at(lat, lon);
  const dx = b[0] - c[0];
  const dz = b[1] - c[1];
  const l = Math.hypot(dx, dz) || 1;
  const spirit: [number, number] = [b[0] + (dx / l) * SPIRIT_BACK, b[1] + (dz / l) * SPIRIT_BACK];
  return { t, a, c, b, spirit, yaw: Math.atan2(dx, dz) };
}

const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax;
  const dz = bz - az;
  const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(x - ax - dx * u, z - az - dz * u);
};

/** True when no trunk touches the path band or the clearing (both grown by the trunk's radius). */
export function siteClear(s: Site, trunks: readonly Circle[]): boolean {
  const pts = pathPoints(s, 16);
  for (const c of trunks) {
    if (Math.abs(c.x - s.b[0]) > 30 || Math.abs(c.z - s.b[1]) > 30) continue;
    if (Math.hypot(c.x - s.b[0], c.z - s.b[1]) < CLEAR_R + 0.4 + c.r) return false;
    if (Math.hypot(c.x - s.spirit[0], c.z - s.spirit[1]) < 1 + c.r) return false;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i] as [number, number];
      const q = pts[i + 1] as [number, number];
      if (segDist(c.x, c.z, p[0], p[1], q[0], q[1]) < PATH_HALF + c.r) return false;
    }
  }
  return true;
}

/**
 * The first clear site, trying road t's nearest PREFERRED_T first, then the clearing offsets. `open(x, z)`
 * is the ground rule for the off-road part (open forest floor: not water, plaza or a steep bank).
 * Falls back to the preferred spot (straight path) when nothing is clear, so the egg always exists.
 */
export function pickSite(
  frameAt: (t: number) => RoadFrame,
  trunks: readonly Circle[],
  open: (x: number, z: number) => boolean,
  /** Road t's to skip (e.g. the plank sections over the muddy stretches, which would cover the prints). */
  avoidT: (t: number) => boolean = () => false,
): Site {
  const ts: number[] = [];
  for (let t = T_RANGE[0]; t <= T_RANGE[1] + 1e-9; t += T_STEP) ts.push(Math.round(t * 1000) / 1000);
  ts.sort((a, b) => Math.abs(a - PREFERRED_T) - Math.abs(b - PREFERRED_T));
  for (const t of ts) {
    if (avoidT(t)) continue;
    const f = frameAt(t);
    for (const lat of CLEAR_LATS)
      for (const lon of CLEAR_LONS) {
        const s = siteAt(t, f, lat, lon);
        if (!siteClear(s, trunks)) continue;
        // Off-road half of the path, the clearing rim and the spirit's spot must be open floor.
        const pts = pathPoints(s, 12).slice(7);
        const rim = [0, 1, 2, 3, 4, 5].map((k): [number, number] => [
          s.b[0] + Math.cos(k * 1.047) * (CLEAR_R - 0.3),
          s.b[1] + Math.sin(k * 1.047) * (CLEAR_R - 0.3),
        ]);
        if ([...pts, ...rim, s.spirit].every(([x, z]) => open(x, z))) return s;
      }
  }
  return siteAt(PREFERRED_T, frameAt(PREFERRED_T), CLEAR_LATS[0], 0);
}

export interface Print {
  x: number;
  z: number;
  /** Heading of the walk (atan2(dx, dz), the toes point that way). */
  yaw: number;
  /** "foot": bare human left foot; "hoof": the round hoof/peg of the right leg. */
  kind: "foot" | "hoof";
}

/** Distance between consecutive prints (a short, shuffling stride) and their offset from the walk line. */
export const STRIDE = 0.62;
export const GAIT = 0.13;
/** The prints stop this far short of the path's end (the spirit stands beyond the clearing center). */
export const STOP_SHORT = 0.6;

/** Alternating prints along the path, evenly spaced by arc length. Left = foot, right = hoof. */
export function placePrints(s: Pick<Site, "a" | "b" | "c">): Print[] {
  const pts = pathPoints(s, 64);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i] as [number, number];
    const q = pts[i - 1] as [number, number];
    cum.push((cum[i - 1] as number) + Math.hypot(p[0] - q[0], p[1] - q[1]));
  }
  const total = cum[cum.length - 1] as number;
  const out: Print[] = [];
  let k = 0;
  for (let d = 0.3; d <= total - STOP_SHORT; d += STRIDE, k++) {
    let i = 1;
    while (i < cum.length - 1 && (cum[i] as number) < d) i++;
    const p0 = pts[i - 1] as [number, number];
    const p1 = pts[i] as [number, number];
    const seg = (cum[i] as number) - (cum[i - 1] as number) || 1;
    const u = (d - (cum[i - 1] as number)) / seg;
    const dx = (p1[0] - p0[0]) / seg;
    const dz = (p1[1] - p0[1]) / seg;
    const left = k % 2 === 0;
    // Left of the heading (dx, dz) is (dz, -dx) in this Y-up, x-east frame seen from above.
    const side = left ? 1 : -1;
    out.push({
      x: p0[0] + (p1[0] - p0[0]) * u + dz * GAIT * side,
      z: p0[1] + (p1[1] - p0[1]) * u - dx * GAIT * side,
      yaw: Math.atan2(dx, dz),
      kind: left ? "foot" : "hoof",
    });
  }
  return out;
}

// ------------------------------------------------------------------ encounter

export type Phase = "lurk" | "watch" | "talk" | "vanish" | "gone";

export interface Spirit {
  phase: Phase;
  /** Seconds in the current phase. */
  time: number;
  /** The quip was said this visit (reset when he comes back). */
  quipped: boolean;
  /** Prints opacity 0..1 (fade out while gone, back in on return). */
  prints: number;
  /** How many times the traveler talked to him (alternates the folk lines). */
  talks: number;
}

/** He turns when the traveler comes this close (u); "E · Hablar" within TALK_R. */
export const NOTICE_R = 7;
export const TALK_R = 2.6;
/** Seconds the folk line stays before he vanishes; the vanish itself; the prints' fade. */
export const TALK_TIME = 5.5;
export const VANISH_TIME = 1.2;
export const FADE_TIME = 2.5;
/** He comes back (and the prints with him) once the traveler has walked this far away. */
export const RESET_R = 45;

export const newSpirit = (): Spirit => ({ phase: "lurk", time: 0, quipped: false, prints: 1, talks: 0 });

export const canTalk = (s: Spirit, d: number) => (s.phase === "lurk" || s.phase === "watch") && d < TALK_R;

/** Starts the talk (E pressed). Returns the folk line index to show, or -1 when not in range. */
export function talk(s: Spirit, d: number): number {
  if (!canTalk(s, d)) return -1;
  const line = s.talks % 2;
  s.talks++;
  s.phase = "talk";
  s.time = 0;
  s.quipped = true;
  return line;
}

export interface TickOut {
  /** Say the mischievous quip now (he just turned). */
  quip: boolean;
  /** The vanish just started (puff / fade). */
  vanish: boolean;
  /** He is back at his spot. */
  back: boolean;
}

/** Advances the encounter by dt with the traveler at distance d from the spirit. */
export function tick(s: Spirit, dt: number, d: number): TickOut {
  const out: TickOut = { quip: false, vanish: false, back: false };
  s.time += dt;
  switch (s.phase) {
    case "lurk":
      if (d < NOTICE_R) {
        s.phase = "watch";
        s.time = 0;
        if (!s.quipped) {
          s.quipped = true;
          out.quip = true;
        }
      }
      break;
    case "watch":
      // Back to minding his roots if the traveler wanders off without talking (the quip is not repeated).
      if (d > NOTICE_R + 2) {
        s.phase = "lurk";
        s.time = 0;
      }
      break;
    case "talk":
      if (s.time >= TALK_TIME) {
        s.phase = "vanish";
        s.time = 0;
        out.vanish = true;
      }
      break;
    case "vanish":
      if (s.time >= VANISH_TIME) {
        s.phase = "gone";
        s.time = 0;
      }
      break;
    case "gone":
      s.prints = Math.max(0, s.prints - dt / FADE_TIME);
      if (d > RESET_R) {
        s.phase = "lurk";
        s.time = 0;
        s.quipped = false;
        out.back = true;
      }
      break;
  }
  if (s.phase !== "gone" && s.prints < 1) s.prints = Math.min(1, s.prints + dt / FADE_TIME);
  return out;
}

/** 0..1 visibility of the figure: 1 until the vanish, then down to 0 over VANISH_TIME. */
export const figureFade = (s: Spirit) =>
  s.phase === "vanish" ? Math.max(0, 1 - s.time / VANISH_TIME) : s.phase === "gone" ? 0 : 1;
