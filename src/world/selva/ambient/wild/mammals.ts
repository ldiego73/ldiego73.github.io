/**
 * Procedural low-poly jungle animals for the joint rig in rig.ts (one merged vertex-colored geometry each,
 * joints: 0 body, 1–4 legs FL FR HL HR, 5 head, 6 tail). Models face +Z; the origin sits on the ground
 * under the body (the dolphin's at its body center). Sizes are real, in meters ≈ world units:
 *   ronsoco (capybara) 1.2 long · otorongo (jaguar) 1.6 + tail · mono fraile 0.3 + tail (scaled up by the
 *   ambient so it reads) · coto (red howler) 0.6 · perezoso (three-toed sloth) 0.6 · caimán negro ≈ 3
 *   · bufeo colorado ≈ 2.2.
 * Colors are chunky regions (saturated, so the 1 px ink and the 3-step toon keep them readable).
 */
import * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";
import { col, cone, egg, limb, planform, tube, V3 } from "./kit";
import { buildRigGeometry, GAIT_BOUND, GAIT_WALK, J, type RigSpec } from "./rig";

export interface RigModel {
  geo: THREE.BufferGeometry;
  spec: RigSpec;
  /** Eye centers in model space (left, right) and their radius, for eyeshine dots. */
  eyes: [THREE.Vector3, THREE.Vector3];
  eyeR: number;
}

type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;
const _c = new THREE.Color();
const _d = new THREE.Color();
/** Back color on top, belly color underneath (by normal and height). */
const backBelly =
  (back: string, belly: string, yBelly: number, soft = 0.25): ColorFn =>
  (p, n) =>
    _c.set(back).lerp(_d.set(belly), Math.max(0, Math.min(1, (yBelly - p.y) / soft + (n.y < -0.3 ? 0.6 : 0))));

/** Deterministic 3D hash (0..1). */
const hash3 = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

function legSet(
  b: GeoBuilder,
  piv: THREE.Vector3[],
  r: number,
  foot: number,
  color: string | ColorFn,
  footColor: string,
) {
  piv.forEach((p, k) => {
    const joint = J.fl + k;
    b.add(limb(r, p.x, p.y, p.z, p.x * 1.02, foot + r * 0.6, p.z + 0.01, 6), { color, flex: joint });
    b.add(egg(r * 1.15, 1, 0.6, 1.35, p.x * 1.02, foot + r * 0.45, p.z + r * 0.4, 0, 6), {
      color: footColor,
      flex: joint,
    });
  });
}

// ---------------------------------------------------------------- ronsoco (capybara)

export function capybaraModel(): RigModel {
  const b = new GeoBuilder();
  const coat = backBelly("#8b5a35", "#b58456", 0.3);
  b.add(egg(0.3, 0.85, 0.85, 1.75, 0, 0.47, -0.04, 0, 12), { color: coat });
  b.add(egg(0.27, 0.95, 0.95, 1, 0, 0.5, -0.32, 0, 10), { color: coat });
  const legs = [V3(0.14, 0.36, 0.3), V3(-0.14, 0.36, 0.3), V3(0.15, 0.38, -0.34), V3(-0.15, 0.38, -0.34)];
  legSet(b, legs, 0.065, 0, coat, "#3d2a1d");
  // Head: blunt, deep, almost square muzzle; small round ears high and far back; eyes high on the head.
  const head = V3(0, 0.6, 0.4);
  b.add(egg(0.15, 0.8, 1, 1.55, 0, 0.6, 0.62, 0.25, 10), { color: coat, flex: J.head });
  b.add(egg(0.105, 0.95, 1, 1, 0, 0.53, 0.8, 0, 8), { color: "#7a4e2e", flex: J.head });
  b.add(egg(0.035, 1.6, 0.7, 0.6, 0, 0.56, 0.885, 0, 6), { color: "#2b1d16", flex: J.head });
  for (const s of [-1, 1]) {
    b.add(egg(0.04, 0.6, 1, 0.8, s * 0.075, 0.72, 0.52, 0, 6), { color: "#5a3a24", flex: J.head });
    b.add(egg(0.022, 1, 1, 1, s * 0.085, 0.66, 0.66, 0, 6), { color: "#151010", flex: J.head });
  }
  const spec: RigSpec = {
    legs: legs as RigSpec["legs"],
    head,
    tail: V3(0, 0.5, -0.6),
    tailLen: 0.1,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.085, 0.66, 0.68), V3(-0.085, 0.66, 0.68)], eyeR: 0.022 };
}

// ---------------------------------------------------------------- otorongo (jaguar)

export function jaguarModel(): RigModel {
  const b = new GeoBuilder();
  const gold = "#d39a3c";
  const pale = "#efe2c4";
  // Rosettes: dark rings with a slightly darker gold center, from a jittered cell grid (vertex-painted).
  const coat: ColorFn = (p, n) => {
    if (p.y < 0.38 && n.y < -0.2) return _c.set(pale);
    const s = 0.13;
    const cx = Math.floor(p.x / s);
    const cy = Math.floor(p.y / s);
    const cz = Math.floor(p.z / s);
    let best = 9;
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++)
        for (let k = -1; k <= 1; k++) {
          const ox = (cx + i + 0.2 + hash3(cx + i, cy + j, cz + k) * 0.6) * s;
          const oy = (cy + j + 0.2 + hash3(cy + j, cz + k, cx + i) * 0.6) * s;
          const oz = (cz + k + 0.2 + hash3(cz + k, cx + i, cy + j) * 0.6) * s;
          best = Math.min(best, Math.hypot(p.x - ox, p.y - oy, p.z - oz));
        }
    if (best < 0.028) return _c.set("#b07a2c");
    if (best < 0.05) return _c.set("#1d1712");
    return _c.set(gold).lerp(_d.set(pale), p.y < 0.4 ? 0.35 : 0);
  };
  // Stocky and low: a deep chest, short thick legs with big paws (a jaguar is heavier than a puma).
  b.add(egg(0.27, 0.9, 0.86, 2.45, 0, 0.53, -0.02, 0, 16), { color: coat });
  b.add(egg(0.26, 0.95, 1.0, 1.1, 0, 0.53, 0.42, 0, 10), { color: coat });
  b.add(egg(0.24, 0.95, 0.95, 1.05, 0, 0.55, -0.45, 0, 10), { color: coat });
  const legs = [V3(0.16, 0.44, 0.5), V3(-0.16, 0.44, 0.5), V3(0.17, 0.47, -0.48), V3(-0.17, 0.47, -0.48)];
  legSet(b, legs, 0.095, 0, coat, "#d9b67a");
  // Big broad head, short muzzle, small round ears, pale chin.
  const head = V3(0, 0.64, 0.68);
  b.add(egg(0.19, 1.05, 0.9, 1.0, 0, 0.68, 0.86, 0, 12), { color: coat, flex: J.head });
  b.add(egg(0.1, 1.15, 0.8, 1, 0, 0.61, 1.01, 0, 8), { color: pale, flex: J.head });
  b.add(egg(0.033, 1.3, 0.8, 0.8, 0, 0.66, 1.1, 0, 6), { color: "#6b3d33", flex: J.head });
  for (const s of [-1, 1]) {
    const ear = egg(0.065, 1, 1, 0.45, s * 0.12, 0.84, 0.79, 0, 6);
    b.add(ear, { color: (_p, n) => (n.z < -0.2 ? _c.set("#1d1712") : _c.set(gold)), flex: J.head });
  }
  // Tail: thick, drooping, curling up at the tip; dark rings toward the end.
  b.add(tube(0.065, 0.05, 0, 0.58, -0.66, 0, 0.36, -1.02, 7), { color: coat, flex: J.tail });
  b.add(tube(0.05, 0.045, 0, 0.36, -1.02, 0, 0.34, -1.32, 7), {
    color: (p) => (Math.sin(p.z * 40) > 0.3 ? _c.set("#1d1712") : _c.set(gold)),
    flex: J.tail,
  });
  const spec: RigSpec = {
    legs: legs as RigSpec["legs"],
    head,
    tail: V3(0, 0.58, -0.66),
    tailLen: 0.7,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.07, 0.72, 1.0), V3(-0.07, 0.72, 1.0)], eyeR: 0.024 };
}

// ---------------------------------------------------------------- mono fraile (squirrel monkey)

export function squirrelMonkeyModel(): RigModel {
  const b = new GeoBuilder();
  const back = backBelly("#8a8762", "#efe1b8", 0.13, 0.05);
  b.add(egg(0.07, 0.85, 0.9, 1.6, 0, 0.16, -0.01, 0, 10), { color: back });
  const legs = [V3(0.04, 0.15, 0.07), V3(-0.04, 0.15, 0.07), V3(0.045, 0.15, -0.08), V3(-0.045, 0.15, -0.08)];
  legSet(b, legs, 0.018, 0, "#e3a63c", "#7d5a2a");
  // Head: dark cap, white mask around the eyes, black muzzle, white ears.
  const head = V3(0, 0.2, 0.09);
  b.add(egg(0.055, 1, 1, 1.05, 0, 0.245, 0.13, 0, 10), {
    color: (p) => {
      if (p.z > 0.155 && p.y < 0.235) return _c.set("#1b1714");
      if (p.z > 0.14 && p.y < 0.27) return _c.set("#f3efe6");
      return _c.set(p.y > 0.27 ? "#4b4a3e" : "#bdb79a");
    },
    flex: J.head,
  });
  for (const s of [-1, 1]) {
    b.add(egg(0.018, 0.5, 1, 1, s * 0.05, 0.26, 0.11, 0, 6), { color: "#f3efe6", flex: J.head });
    b.add(egg(0.011, 1, 1, 1, s * 0.02, 0.255, 0.18, 0, 5), { color: "#141414", flex: J.head });
  }
  // Long thin tail, black tip.
  b.add(tube(0.016, 0.012, 0, 0.17, -0.1, 0, 0.15, -0.52, 5), {
    color: (p) => (p.z < -0.42 ? _c.set("#1b1714") : _c.set("#8a8762")),
    flex: J.tail,
  });
  const spec: RigSpec = {
    legs: legs as RigSpec["legs"],
    head,
    tail: V3(0, 0.17, -0.1),
    tailLen: 0.42,
    gait: GAIT_BOUND,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.02, 0.255, 0.18), V3(-0.02, 0.255, 0.18)], eyeR: 0.011 };
}

// ---------------------------------------------------------------- coto (red howler monkey)

export function howlerModel(): RigModel {
  const b = new GeoBuilder();
  const fur = backBelly("#a7421c", "#7a2c12", 0.22, 0.1);
  b.add(egg(0.14, 0.9, 0.95, 1.5, 0, 0.3, -0.02, 0, 10), { color: fur });
  const legs = [V3(0.08, 0.28, 0.13), V3(-0.08, 0.28, 0.13), V3(0.09, 0.28, -0.15), V3(-0.09, 0.28, -0.15)];
  legSet(b, legs, 0.035, 0, "#8e3416", "#2a1610");
  const head = V3(0, 0.38, 0.17);
  // Dark bare face, bearded throat (the hyoid that makes the roar).
  b.add(egg(0.09, 1, 1, 1, 0, 0.43, 0.25, 0, 10), {
    color: (p) => (p.z > 0.29 ? _c.set("#2a1a14") : _c.set("#b3491e")),
    flex: J.head,
  });
  b.add(egg(0.08, 0.9, 1.1, 0.8, 0, 0.35, 0.27, 0, 8), { color: "#8a3214", flex: J.head });
  const spec: RigSpec = {
    legs: legs as RigSpec["legs"],
    head,
    tail: V3(0, 0.32, -0.2),
    tailLen: 0.65,
    gait: GAIT_WALK,
  };
  b.add(tube(0.03, 0.022, 0, 0.32, -0.2, 0, 0.28, -0.85, 6), { color: "#9a3b18", flex: J.tail });
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.03, 0.45, 0.33), V3(-0.03, 0.45, 0.33)], eyeR: 0.012 };
}

// ---------------------------------------------------------------- perezoso (brown-throated three-toed sloth)

/**
 * Built standing on its hooks (legs down to y = 0); the ambient flips it under a branch (roll π), so the
 * legs reach up to the limb and the shaggy back hangs below.
 */
export function slothModel(): RigModel {
  const b = new GeoBuilder();
  const shag: ColorFn = (p) => {
    const k = hash3(Math.round(p.x * 30), Math.round(p.y * 30), Math.round(p.z * 30));
    return _c.set("#8a7c62").lerp(_d.set("#5d5141"), k * 0.6);
  };
  b.add(egg(0.17, 0.95, 0.85, 1.45, 0, 0.47, -0.02, 0, 10), { color: shag });
  // Long arms (front) and shorter legs, ending in pale hooked claws.
  const legs = [V3(0.13, 0.46, 0.17), V3(-0.13, 0.46, 0.17), V3(0.13, 0.46, -0.18), V3(-0.13, 0.46, -0.18)];
  legs.forEach((p, k) => {
    const joint = J.fl + k;
    b.add(limb(0.045, p.x, p.y, p.z, p.x * 1.1, 0.06, p.z + (k < 2 ? 0.06 : -0.03), 6), { color: shag, flex: joint });
    b.add(cone(0.02, 0.09, 4, V3(p.x * 1.1, 0.07, p.z + (k < 2 ? 0.06 : -0.03)), V3(0, -0.4, 1)), {
      color: "#e8dcc0",
      flex: joint,
    });
  });
  // Round head, pale face with dark eye stripes, small dark nose.
  const head = V3(0, 0.52, 0.22);
  b.add(egg(0.1, 1, 0.95, 1, 0, 0.55, 0.3, 0, 10), {
    color: (p) => {
      const fx = Math.abs(p.x);
      if (p.z > 0.355 && fx > 0.025 && fx < 0.07 && p.y > 0.54 && p.y < 0.575) return _c.set("#2a221c");
      if (p.z > 0.33) return _c.set("#e5dcc4");
      return _c.set("#8a7c62");
    },
    flex: J.head,
  });
  b.add(egg(0.022, 1.2, 0.9, 0.8, 0, 0.535, 0.4, 0, 6), { color: "#2a221c", flex: J.head });
  const spec: RigSpec = {
    legs: legs as RigSpec["legs"],
    head,
    tail: V3(0, 0.45, -0.24),
    tailLen: 0.05,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.045, 0.56, 0.38), V3(-0.045, 0.56, 0.38)], eyeR: 0.012 };
}

// ---------------------------------------------------------------- caimán negro (black caiman)

export function caimanModel(): RigModel {
  const b = new GeoBuilder();
  const skin: ColorFn = (p, n) => {
    if (n.y < -0.35 || p.y < 0.07) return _c.set("#b8ad7c");
    // Faint pale crossbands along the flanks of the dark hide.
    const band = Math.sin(p.z * 9) > 0.75 && Math.abs(p.x) > 0.18 ? 0.25 : 0;
    return _c.set("#262c22").lerp(_d.set("#6c6a48"), band);
  };
  b.add(egg(0.3, 1.0, 0.48, 2.3, 0, 0.16, -0.05, 0, 12), { color: skin });
  // Back scutes: two rows of low cones.
  for (let i = 0; i < 7; i++)
    for (const s of [-1, 1]) {
      const z = 0.4 - i * 0.16;
      b.add(cone(0.035, 0.05, 4, V3(s * 0.08, 0.28 - Math.abs(z) * 0.06, z), V3(0, 1, 0)), { color: "#1d221a" });
    }
  const legs = [V3(0.24, 0.13, 0.42), V3(-0.24, 0.13, 0.42), V3(0.26, 0.13, -0.45), V3(-0.26, 0.13, -0.45)];
  legs.forEach((p, k) => {
    const joint = J.fl + k;
    const sx = Math.sign(p.x);
    b.add(limb(0.055, p.x, p.y, p.z, p.x + sx * 0.14, 0.03, p.z + 0.05, 5), { color: skin, flex: joint });
    b.add(egg(0.06, 1.3, 0.4, 1.2, p.x + sx * 0.16, 0.02, p.z + 0.1, 0, 6), { color: "#2a3026", flex: joint });
  });
  // Head: broad flat skull, long snout; raised eye bumps and nostril so a floating caiman shows just those.
  const head = V3(0, 0.18, 0.62);
  b.add(egg(0.2, 1, 0.5, 1.3, 0, 0.18, 0.82, 0, 10), { color: skin, flex: J.head });
  b.add(egg(0.14, 0.9, 0.42, 2.1, 0, 0.14, 1.18, 0, 10), { color: skin, flex: J.head });
  b.add(egg(0.13, 0.95, 0.25, 2.0, 0, 0.07, 1.12, 0, 8), { color: "#a99d70", flex: J.head });
  for (const s of [-1, 1])
    b.add(egg(0.05, 1, 0.9, 1.1, s * 0.085, 0.27, 0.8, 0, 6), { color: "#1d221a", flex: J.head });
  b.add(egg(0.035, 1.4, 0.7, 1, 0, 0.21, 1.46, 0, 6), { color: "#1d221a", flex: J.head });
  // Tail: tapering, with a double crest.
  b.add(tube(0.2, 0.05, 0, 0.17, -0.55, 0, 0.13, -2.05, 8), { color: skin, flex: J.tail });
  for (let i = 0; i < 9; i++) {
    const z = -0.7 - i * 0.15;
    b.add(cone(0.03, 0.06 - i * 0.004, 4, V3(0, 0.28 - i * 0.012, z), V3(0, 1, -0.2)), {
      color: "#1d221a",
      flex: J.tail,
    });
  }
  const spec: RigSpec = {
    legs: legs as RigSpec["legs"],
    head,
    tail: V3(0, 0.17, -0.55),
    tailLen: 1.5,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.085, 0.3, 0.83), V3(-0.085, 0.3, 0.83)], eyeR: 0.03 };
}

// ---------------------------------------------------------------- bufeo colorado (Amazon river dolphin)

/** Origin at the body center. Joint 6 bends the rear third and the flukes (the swimming beat). */
export function dolphinModel(): RigModel {
  const b = new GeoBuilder();
  const pink: ColorFn = (p, n) => {
    // Pinker below and on the flanks, greyer pink along the back.
    const k = Math.max(0, Math.min(1, 0.5 - n.y * 0.6 - p.y * 1.5));
    return _c.set("#b9939a").lerp(_d.set("#f39aa8"), k);
  };
  const rear = (p: THREE.Vector3) => (p.z < -0.35 ? J.tail : J.body);
  b.add(egg(0.27, 0.95, 0.88, 3.4, 0, 0, -0.05, 0, 14), { color: pink, flex: rear });
  // Bulging melon, long slender beak.
  b.add(egg(0.18, 1, 0.95, 1.1, 0, 0.06, 0.82, 0, 10), { color: pink, flex: J.head });
  b.add(tube(0.06, 0.035, 0, 0.0, 0.95, 0, -0.06, 1.45, 6), { color: "#f4a9b5", flex: J.head });
  // The low dorsal hump (bufeos have a ridge, not a fin).
  b.add(egg(0.1, 0.35, 0.55, 1.6, 0, 0.24, -0.2, 0, 8), { color: "#b48e96" });
  for (const s of [-1, 1]) {
    const f = planform(
      [
        [0, 0],
        [0.18, 0.02],
        [0.3, 0.12],
        [0.25, 0.22],
        [0.05, 0.18],
      ],
      s as 1 | -1,
      0.03,
    );
    f.rotateZ(s * -0.5);
    f.translate(s * 0.2, -0.12, 0.5);
    b.add(f, { color: "#ef9aa8" });
  }
  // Flukes at the tail end.
  b.add(
    planform(
      [
        [0, 0],
        [0.18, 0.08],
        [0.32, 0.2],
        [0.12, 0.18],
        [0, 0.12],
        [-0.12, 0.18],
        [-0.32, 0.2],
        [-0.18, 0.08],
      ],
      1,
      0.03,
    ).translate(0, 0, -0.88),
    { color: "#d88f9c", flex: J.tail },
  );
  const spec: RigSpec = {
    legs: [V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0), V3(0, 0, 0)],
    head: V3(0, 0, 0.6),
    tail: V3(0, 0, -0.35),
    tailLen: 0.8,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.15, 0.02, 0.85), V3(-0.15, 0.02, 0.85)], eyeR: 0.015 };
}

export { col };
