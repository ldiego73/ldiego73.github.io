/**
 * What a bird is doing, read from how the world moves it: the world's own sim owns the bird's position (a
 * condor circling a thermal, parrots crossing a river, a dove pecking on a plaza); this state machine looks at
 * the motion (on the ground or not, on water, horizontal speed, climb rate, height above ground) and decides
 * the state the animator (./anim-bird.ts) poses, with a little hysteresis so a bird does not flicker between
 * flapping and gliding on every bump.
 *
 *   perch    standing or sitting still            walk / hop   on the ground, moving (waddle for penguins)
 *   takeoff  the first strong downstrokes        flap         powered flight
 *   glide    wings fixed, descending              soar         wings fixed and spread wide, level or climbing
 *   hover    hummingbirds at a flower             land         wings braced, tail fanned, legs reaching
 *   swim     on the water surface (paddling)      dive         under water (penguins, cormorants, grebes)
 *
 * Styles: "soarer" (condor, pelican, gull: soar and glide, flap mostly to take off), "flapper" (parrots, doves,
 * sparrows, toucans: flap, with short glides on the way down), "hoverer" (hummingbirds), "runner" (tinamous:
 * ground first, a short burst of flight), "swimmer" (penguins: no flight).
 *
 * `wingPose` turns the state and its time into the few numbers the animator needs (flap angle, fold, tip
 * curl, legs down, tail fan, body pitch).
 *
 * Pure (no DOM, no Three).
 */

export type FlightState =
  | "perch"
  | "walk"
  | "hop"
  | "takeoff"
  | "flap"
  | "glide"
  | "soar"
  | "hover"
  | "land"
  | "swim"
  | "dive";

export type FlightStyle = "soarer" | "flapper" | "hoverer" | "runner" | "swimmer";

export interface FlightProfile {
  style: FlightStyle;
  /** Wing beats per second in powered flight. */
  flapHz: number;
  /** How the bird moves on the ground. */
  ground: "hop" | "walk" | "waddle";
  /** Above this height (units) while descending, the bird is still flying, not landing. */
  landHeight: number;
}

export interface FlightInput {
  grounded: boolean;
  /** On the water surface (ducks, grebes, pelicans, penguins). */
  water?: boolean;
  /** Under water. */
  under?: boolean;
  /** Horizontal speed and climb rate (units/s). */
  speed: number;
  vy: number;
  /** Height above ground or water (units). */
  height: number;
}

export interface FlightFSM {
  state: FlightState;
  /** Seconds in the current state. */
  time: number;
}

export const flightFSM = (state: FlightState = "perch"): FlightFSM => ({ state, time: 0 });

const AIR = new Set<FlightState>(["takeoff", "flap", "glide", "soar", "hover", "land"]);
export const isAirborne = (s: FlightState) => AIR.has(s);

/** Least time in a state before an ordinary change (seconds). Takeoff and landing are their own timers. */
const HOLD = 0.3;
const TAKEOFF = 0.55;

/** Advance the state machine one frame. Returns the (mutated) fsm. */
export function flightStep(f: FlightFSM, p: FlightProfile, i: FlightInput, dt: number): FlightFSM {
  f.time += dt;
  const want = desired(f, p, i);
  if (want !== f.state) {
    const locked = (f.state === "takeoff" && f.time < TAKEOFF && !i.grounded) || f.time < HOLD;
    // Touching ground or water always wins (a landing must never hang in the air pose).
    const forced = i.grounded || !!i.water || !!i.under;
    if (!locked || (forced && !isAirborne(want))) {
      f.state = want;
      f.time = 0;
    }
  }
  return f;
}

function desired(f: FlightFSM, p: FlightProfile, i: FlightInput): FlightState {
  if (i.under) return "dive";
  if (i.water) return "swim";
  if (i.grounded) {
    if (i.speed > 0.08) return p.ground === "hop" ? "hop" : "walk";
    return "perch";
  }
  if (p.style === "swimmer") return "swim";
  const wasDown = !isAirborne(f.state);
  if (wasDown) return "takeoff";
  if (f.state === "takeoff" && f.time < TAKEOFF) return "takeoff";
  if (i.vy < -0.15 && i.height < p.landHeight) return "land";
  switch (p.style) {
    case "hoverer":
      return i.speed < 1.2 ? "hover" : "flap";
    case "soarer":
      if (i.vy > 0.6 && i.speed < 3) return "flap";
      if (i.vy < -0.35) return "glide";
      return "soar";
    case "runner":
      return i.vy < -0.3 ? "glide" : "flap";
    default:
      return i.vy < -0.5 ? "glide" : "flap";
  }
}

export interface WingPose {
  /** Wing elevation (radians, + up) at the shoulder. */
  flap: number;
  /** 0 open … 1 folded against the body. */
  fold: number;
  /** Primaries curled up at the tip (soaring), radians. */
  curl: number;
  /** 0 legs tucked … 1 legs down and reaching. */
  legs: number;
  /** Tail fan 0 closed … 1 spread. */
  fan: number;
  /** Body pitch (radians, + nose up). */
  pitch: number;
  /** Paddling phase drive for the feet (0 = still). */
  paddle: number;
}

/**
 * Pose of the wings and body in a state, `time` seconds into it (`clock` is the free-running time that keeps
 * flapping continuous across states). Reduced motion halves the flap amplitude.
 */
export function wingPose(state: FlightState, time: number, clock: number, p: FlightProfile, rm = false): WingPose {
  const amp = rm ? 0.5 : 1;
  const beat = Math.sin(clock * p.flapHz * Math.PI * 2);
  const base: WingPose = { flap: 0, fold: 1, curl: 0, legs: 1, fan: 0, pitch: 0, paddle: 0 };
  switch (state) {
    case "perch":
    case "walk":
    case "hop":
      return base;
    case "swim":
      return { ...base, legs: 0, paddle: 1 };
    case "dive":
      // Penguins fly under water: flippers beat slowly; others fold the wings.
      return p.style === "swimmer"
        ? { ...base, fold: 0, flap: beat * 0.6 * amp, legs: 0, pitch: -0.1 }
        : { ...base, fold: 0.9, legs: 0, paddle: 1.6, pitch: -0.2 };
    case "takeoff": {
      const k = Math.min(1, time / 0.15);
      // Deep, fast downstrokes; the body pitches up, the legs push then tuck.
      const deep = Math.sin(clock * p.flapHz * 1.3 * Math.PI * 2);
      return {
        flap: deep * 0.95 * amp * k + 0.15,
        fold: 1 - k,
        curl: 0,
        legs: Math.max(0, 1 - time / 0.45),
        fan: 0.8,
        pitch: 0.35 * (1 - time / 0.6),
        paddle: 0,
      };
    }
    case "flap": {
      if (p.style === "flapper" && p.flapHz > 6) {
        // Small birds bound: a burst of beats, then a short folded pause.
        const cyc = (clock * 1.6) % 1;
        if (cyc > 0.72) return { flap: 0, fold: 0.75, curl: 0, legs: 0, fan: 0, pitch: 0.05, paddle: 0 };
      }
      return { flap: beat * 0.75 * amp + 0.1, fold: 0, curl: 0, legs: 0, fan: 0.2, pitch: 0.04, paddle: 0 };
    }
    case "glide":
      return { flap: -0.05 + beat * 0.02 * amp, fold: 0.12, curl: 0.05, legs: 0, fan: 0.15, pitch: -0.08, paddle: 0 };
    case "soar":
      // Wide and still, a slight dihedral, primaries spread and curled up; a slow rock in the air.
      return {
        flap: 0.12 + Math.sin(clock * 0.7) * 0.03 * amp,
        fold: 0,
        curl: 0.28,
        legs: 0,
        fan: 0.55,
        pitch: 0.02,
        paddle: 0,
      };
    case "hover":
      return { flap: beat * 0.9 * amp, fold: 0, curl: 0, legs: 0.3, fan: 0.6, pitch: 0.75, paddle: 0 };
    case "land": {
      const k = Math.min(1, time / 0.3);
      return {
        flap: 0.35 * k + beat * 0.3 * amp * k,
        fold: 0,
        curl: 0.1,
        legs: k,
        fan: 1,
        pitch: 0.4 * k,
        paddle: 0,
      };
    }
  }
}
