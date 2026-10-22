import { describe, expect, test } from "bun:test";
import { type FlightProfile, flightFSM, flightStep, wingPose } from "./flight";

const soarer: FlightProfile = { style: "soarer", flapHz: 1.1, ground: "walk", landHeight: 2 };
const hummer: FlightProfile = { style: "hoverer", flapHz: 16, ground: "hop", landHeight: 0.3 };
const steps = (
  f: ReturnType<typeof flightFSM>,
  p: FlightProfile,
  i: Parameters<typeof flightStep>[2],
  secs: number,
) => {
  for (let t = 0; t < secs; t += 0.05) flightStep(f, p, i, 0.05);
  return f.state;
};

describe("flight state machine", () => {
  test("perch → takeoff → soar for a condor in the air; back to perch on the ground", () => {
    const f = flightFSM();
    expect(steps(f, soarer, { grounded: true, speed: 0, vy: 0, height: 0 }, 1)).toBe("perch");
    expect(steps(f, soarer, { grounded: false, speed: 10, vy: 0, height: 20 }, 0.2)).toBe("takeoff");
    expect(steps(f, soarer, { grounded: false, speed: 10, vy: 0, height: 20 }, 2)).toBe("soar");
    expect(steps(f, soarer, { grounded: false, speed: 10, vy: -1, height: 20 }, 1)).toBe("glide");
    expect(steps(f, soarer, { grounded: false, speed: 3, vy: -1, height: 1 }, 1)).toBe("land");
    expect(steps(f, soarer, { grounded: true, speed: 0, vy: 0, height: 0 }, 0.05)).toBe("perch");
  });

  test("ground gaits, water and hovering", () => {
    const f = flightFSM();
    expect(steps(f, hummer, { grounded: true, speed: 0.5, vy: 0, height: 0 }, 1)).toBe("hop");
    expect(steps(f, soarer, { grounded: false, water: true, speed: 0.5, vy: 0, height: 0 }, 1)).toBe("swim");
    const h = flightFSM();
    steps(h, hummer, { grounded: false, speed: 0.3, vy: 0, height: 1 }, 2);
    expect(h.state).toBe("hover");
  });

  test("wing poses: folded on the ground, open in the air, legs down to land", () => {
    expect(wingPose("perch", 1, 1, soarer).fold).toBe(1);
    expect(wingPose("soar", 1, 1, soarer).fold).toBe(0);
    expect(wingPose("land", 1, 1, soarer).legs).toBeCloseTo(1);
    expect(wingPose("flap", 1, 1, soarer).legs).toBe(0);
    // Reduced motion halves the beat.
    const a = Math.abs(wingPose("flap", 0, 0.2, soarer).flap - 0.1);
    const b = Math.abs(wingPose("flap", 0, 0.2, soarer, true).flap - 0.1);
    expect(b).toBeLessThan(a);
  });
});
