/**
 * More procedural low-poly animals of the Antisuyu for the joint rig in rig.ts (one merged vertex-colored
 * geometry each; joints 0 body, 1–4 legs FL FR HL HR, 5 head, 6 tail), in the same visual language as
 * mammals.ts: chunky color regions, saturated enough for the 3-step toon and the 1 px ink. Models face +Z.
 * Sizes are real, in meters ≈ world units:
 *   sajino (collared peccary) 0.95 long, 0.45 at the shoulder · añuje (agouti) 0.55 long · sachavaca
 *   (lowland tapir) 2.0 long, 1.0 at the shoulder · taricaya (yellow-spotted river turtle) 0.45 shell.
 * Origins sit on the ground under the body, except the agouti's, which sits under its hind feet so a pitch
 * of the root about it stands the animal up on its haunches (the alert, upright pose).
 * Also the turtles' basking log (a static prop, vertex-colored) and the agouti's nut.
 */
import * as THREE from "three";
import { GeoBuilder } from "../../../flora/geom";
import { cone, egg, limb, tube, V3 } from "./kit";
import type { RigModel } from "./mammals";
import { buildRigGeometry, GAIT_BOUND, GAIT_TROT, GAIT_WALK, J, type RigSpec } from "./rig";

type ColorFn = (p: THREE.Vector3, n: THREE.Vector3) => THREE.Color;
const _c = new THREE.Color();
const _d = new THREE.Color();

/** Deterministic 3D hash (0..1) for grizzled coats. */
const hash3 = (x: number, y: number, z: number) => {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Legs from the pivots down to `foot`, with a hoof / paw blob, one joint per leg. */
function legs(
  b: GeoBuilder,
  piv: THREE.Vector3[],
  r: number,
  foot: number,
  color: string | ColorFn,
  footColor: string,
) {
  piv.forEach((p, k) => {
    const joint = J.fl + k;
    b.add(limb(r, p.x, p.y, p.z, p.x * 1.02, foot + r * 0.7, p.z + 0.01, 5), { color, flex: joint });
    b.add(egg(r * 1.1, 1, 0.7, 1.2, p.x * 1.02, foot + r * 0.5, p.z + r * 0.3, 0, 6), {
      color: footColor,
      flex: joint,
    });
  });
}

// ---------------------------------------------------------------- sajino (collared peccary)

export function peccaryModel(): RigModel {
  const b = new GeoBuilder();
  // Grizzled grey-black coat; the pale collar runs from the shoulders down and around the neck.
  const coat: ColorFn = (p, n) => {
    const k = hash3(Math.round(p.x * 40), Math.round(p.y * 40), Math.round(p.z * 40));
    // The collar: a pale band slanting down and forward from the withers over the shoulder, sides only.
    const band = p.z - 0.16 + (p.y - 0.5) * 0.45;
    if (band > 0 && band < 0.065 && p.y > 0.26 && p.y < 0.56) return _c.set("#cbc3ad");
    const base = _c.set("#37322d").lerp(_d.set("#6e655b"), k * 0.55);
    return n.y < -0.4 ? base.lerp(_d.set("#2a2622"), 0.5) : base;
  };
  // Barrel body, high in front, a little narrower behind; a short mane of bristles along the spine.
  b.add(egg(0.21, 0.82, 0.95, 1.95, 0, 0.38, -0.02, 0.06, 12), { color: coat });
  b.add(egg(0.2, 0.9, 1.0, 1.0, 0, 0.42, 0.22, 0, 10), { color: coat });
  for (let i = 0; i < 6; i++) {
    const z = 0.28 - i * 0.11;
    b.add(cone(0.03, 0.05 - i * 0.004, 4, V3(0, 0.575 - i * 0.012, z), V3(0, 1, -0.6)), { color: "#24201c" });
  }
  const lp = [V3(0.09, 0.3, 0.24), V3(-0.09, 0.3, 0.24), V3(0.09, 0.3, -0.24), V3(-0.09, 0.3, -0.24)];
  legs(b, lp, 0.035, 0, "#2f2a26", "#1b1816");
  // Wedge head tapering to the flat snout disc; small upright ears.
  const head = V3(0, 0.44, 0.34);
  b.add(egg(0.13, 0.85, 0.9, 1.35, 0, 0.42, 0.47, 0.35, 10), { color: coat, flex: J.head });
  b.add(tube(0.08, 0.045, 0, 0.38, 0.54, 0, 0.32, 0.7, 8), { color: "#3a342f", flex: J.head });
  b.add(egg(0.05, 1.05, 0.85, 0.35, 0, 0.32, 0.71, 0, 8), { color: "#7a5f55", flex: J.head });
  for (const s of [-1, 1]) {
    b.add(cone(0.035, 0.07, 4, V3(s * 0.07, 0.52, 0.4), V3(s * 0.4, 1, -0.4)), { color: "#2a2622", flex: J.head });
    b.add(egg(0.014, 1, 1, 1, s * 0.07, 0.46, 0.52, 0, 5), { color: "#0f0d0c", flex: J.head });
  }
  b.add(egg(0.025, 1, 1, 1.2, 0, 0.4, -0.38, 0, 5), { color: "#2a2622", flex: J.tail });
  const spec: RigSpec = {
    legs: lp as RigSpec["legs"],
    head,
    tail: V3(0, 0.4, -0.36),
    tailLen: 0.05,
    gait: GAIT_TROT,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.07, 0.46, 0.52), V3(-0.07, 0.46, 0.52)], eyeR: 0.014 };
}

// ---------------------------------------------------------------- añuje (agouti)

/** Origin under the hind feet (z = 0): pitching the root about it sits the agouti up on its haunches. */
export function agoutiModel(): RigModel {
  const b = new GeoBuilder();
  // Grizzled brown fore-quarters, bright orange rump (the agouti's signal patch), paler belly.
  const coat: ColorFn = (p, n) => {
    const k = hash3(Math.round(p.x * 60), Math.round(p.y * 60), Math.round(p.z * 60));
    if (n.y < -0.45) return _c.set("#c99a62");
    const rump = Math.max(0, Math.min(1, (0.12 - p.z) / 0.12));
    return _c
      .set("#7d4f2a")
      .lerp(_d.set("#d9822a"), rump)
      .lerp(_d.set("#4a2f1a"), k * 0.3);
  };
  // Arched back: big rounded rump, slimmer chest.
  b.add(egg(0.13, 0.85, 0.9, 1.15, 0, 0.24, 0.08, 0, 10), { color: coat });
  b.add(egg(0.1, 0.85, 0.85, 1.15, 0, 0.23, 0.24, 0.25, 10), { color: coat });
  // Slender legs: long hind legs, thin front legs.
  const lp = [V3(0.05, 0.17, 0.3), V3(-0.05, 0.17, 0.3), V3(0.07, 0.19, 0.04), V3(-0.07, 0.19, 0.04)];
  legs(b, lp, 0.022, 0, "#5a3a22", "#2a1c12");
  // Rat-like head with a blunt pink-brown nose, round ears, big dark eyes.
  const head = V3(0, 0.27, 0.33);
  b.add(egg(0.075, 0.8, 0.85, 1.4, 0, 0.29, 0.4, 0.3, 10), { color: "#7d4f2a", flex: J.head });
  b.add(egg(0.03, 1, 0.9, 0.8, 0, 0.255, 0.49, 0, 6), { color: "#4a2f22", flex: J.head });
  for (const s of [-1, 1]) {
    b.add(egg(0.03, 0.4, 1, 0.9, s * 0.04, 0.35, 0.36, 0, 6), { color: "#6b4226", flex: J.head });
    b.add(egg(0.015, 1, 1, 1, s * 0.045, 0.31, 0.43, 0, 5), { color: "#0f0b08", flex: J.head });
  }
  b.add(egg(0.018, 1, 1, 1.4, 0, 0.27, -0.06, 0, 5), { color: "#3a2516", flex: J.tail });
  const spec: RigSpec = {
    legs: lp as RigSpec["legs"],
    head,
    tail: V3(0, 0.27, -0.04),
    tailLen: 0.04,
    gait: GAIT_BOUND,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.045, 0.31, 0.43), V3(-0.045, 0.31, 0.43)], eyeR: 0.015 };
}

/** Mouth of the agouti in model space (where a carried nut sits, moved with the head). */
export const AGOUTI_MOUTH = V3(0, 0.245, 0.52);

/** A Brazil-nut-like seed (brown, ribbed ovoid), ≈ 6 cm; scaled by the ambient so it reads. */
export function nutGeometry() {
  const b = new GeoBuilder();
  b.add(egg(0.03, 0.85, 0.85, 1.25, 0, 0, 0, 0, 7), {
    color: (p) => (Math.sin(Math.atan2(p.x, p.y) * 3) > 0.4 ? _c.set("#4a2c16") : _c.set("#8a5a2c")),
  });
  return b.build();
}

// ---------------------------------------------------------------- sachavaca (lowland tapir)

export function tapirModel(): RigModel {
  const b = new GeoBuilder();
  const hide: ColorFn = (p, n) => {
    const k = hash3(Math.round(p.x * 12), Math.round(p.y * 12), Math.round(p.z * 12));
    const base = _c.set("#3f3833").lerp(_d.set("#56493f"), k * 0.4);
    return n.y < -0.5 ? base.lerp(_d.set("#2b2622"), 0.4) : base;
  };
  // Heavy pear-shaped body: deep rounded rump higher than the shoulders.
  b.add(egg(0.45, 0.85, 0.95, 2.0, 0, 0.82, -0.05, 0.06, 14), { color: hide });
  b.add(egg(0.43, 0.95, 1.05, 1.0, 0, 0.86, -0.45, 0, 12), { color: hide });
  b.add(egg(0.36, 0.9, 0.95, 1.0, 0, 0.78, 0.45, 0, 10), { color: hide });
  // Short stiff mane along the nape.
  for (let i = 0; i < 5; i++)
    b.add(cone(0.05, 0.1, 4, V3(0, 1.1 - i * 0.03, 0.62 - i * 0.12), V3(0, 1, -0.5)), { color: "#221d1a" });
  const lp = [V3(0.22, 0.6, 0.55), V3(-0.22, 0.6, 0.55), V3(0.24, 0.62, -0.6), V3(-0.24, 0.62, -0.6)];
  legs(b, lp, 0.085, 0, hide, "#1c1816");
  // Head on a thick neck: long sloping face ending in the short mobile proboscis; white-rimmed ears.
  const head = V3(0, 0.92, 0.7);
  b.add(egg(0.2, 0.85, 1.0, 1.5, 0, 0.92, 0.92, 0.5, 10), { color: hide, flex: J.head });
  b.add(tube(0.12, 0.07, 0, 0.8, 1.1, 0, 0.62, 1.32, 8), { color: "#3a332e", flex: J.head });
  b.add(tube(0.07, 0.05, 0, 0.62, 1.32, 0, 0.5, 1.42, 7), { color: "#2a2420", flex: J.head });
  for (const s of [-1, 1]) {
    const ear = egg(0.075, 0.55, 1, 0.7, s * 0.12, 1.12, 0.78, 0, 6);
    b.add(ear, { color: (p) => (p.y > 1.17 ? _c.set("#e8e2d4") : _c.set("#2e2824")), flex: J.head });
    b.add(egg(0.022, 1, 1, 1, s * 0.12, 0.98, 1.0, 0, 5), { color: "#0d0b0a", flex: J.head });
  }
  b.add(egg(0.05, 1, 1, 1.4, 0, 0.92, -0.98, 0, 5), { color: "#2e2824", flex: J.tail });
  const spec: RigSpec = {
    legs: lp as RigSpec["legs"],
    head,
    tail: V3(0, 0.92, -0.94),
    tailLen: 0.1,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.12, 0.98, 1.0), V3(-0.12, 0.98, 1.0)], eyeR: 0.022 };
}

// ---------------------------------------------------------------- taricaya (yellow-spotted river turtle)

export function turtleModel(): RigModel {
  const b = new GeoBuilder();
  // Domed dark olive carapace with paler scute seams; a yellow-cream rim.
  const shell: ColorFn = (p, n) => {
    if (n.y < -0.3) return _c.set("#c9b874");
    if (p.y < 0.075) return _c.set("#8d8455");
    const seam = Math.abs(Math.sin(p.x * 26)) < 0.18 || Math.abs(Math.sin(p.z * 20)) < 0.15;
    return _c.set(seam ? "#56603e" : "#2f3826");
  };
  b.add(egg(0.22, 0.85, 0.42, 1.08, 0, 0.1, 0, 0, 14), { color: shell });
  b.add(egg(0.21, 0.88, 0.16, 1.05, 0, 0.07, 0, 0, 12), { color: "#8d8455" });
  // Flippers: grey, short, paddle-shaped.
  const lp = [V3(0.13, 0.07, 0.13), V3(-0.13, 0.07, 0.13), V3(0.12, 0.07, -0.15), V3(-0.12, 0.07, -0.15)];
  lp.forEach((p, k) => {
    const joint = J.fl + k;
    const sx = Math.sign(p.x);
    b.add(limb(0.03, p.x, p.y, p.z, p.x + sx * 0.09, 0.02, p.z + (k < 2 ? 0.05 : -0.03), 5), {
      color: "#4f5446",
      flex: joint,
    });
    b.add(egg(0.045, 1.2, 0.35, 1, p.x + sx * 0.1, 0.015, p.z + (k < 2 ? 0.07 : -0.04), 0, 6), {
      color: "#4f5446",
      flex: joint,
    });
  });
  // Neck and head: dark, with the bright yellow spots that name it (unifilis: "one thread" on the chin).
  const head = V3(0, 0.1, 0.2);
  b.add(tube(0.045, 0.04, 0, 0.1, 0.18, 0, 0.13, 0.3, 7), { color: "#2c2f28", flex: J.head });
  b.add(egg(0.05, 0.9, 0.8, 1.3, 0, 0.14, 0.34, 0, 8), {
    color: (p) => {
      const top = p.y > 0.15;
      const spot = (Math.abs(p.x) > 0.02 && top && p.z > 0.3 && p.z < 0.36) || (p.z > 0.38 && top);
      return _c.set(spot ? "#f2c21c" : "#262923");
    },
    flex: J.head,
  });
  b.add(cone(0.02, 0.05, 4, V3(0, 0.08, -0.2), V3(0, -0.3, -1)), { color: "#2c2f28", flex: J.tail });
  const spec: RigSpec = {
    legs: lp as RigSpec["legs"],
    head,
    tail: V3(0, 0.08, -0.2),
    tailLen: 0.06,
    gait: GAIT_WALK,
  };
  return { geo: buildRigGeometry(b), spec, eyes: [V3(0.035, 0.155, 0.35), V3(-0.035, 0.155, 0.35)], eyeR: 0.01 };
}

/**
 * A fallen trunk for the turtles to bask on: barkless grey-brown wood, a couple of broken branch stubs and
 * a tuft of roots at the base. Built along +Z from z = 0 (root end) to `len`, radius `r`, lying on y = r.
 */
export function logGeometry(len: number, r: number, seed: number) {
  const b = new GeoBuilder();
  const wood: ColorFn = (p) => {
    const k = hash3(Math.round(p.x * 8 + seed), Math.round(p.y * 8), Math.round(p.z * 3));
    return _c.set("#6f5a42").lerp(_d.set("#46382a"), k * 0.7);
  };
  b.add(tube(r, r * 0.72, 0, r, 0, 0, r * 0.9, len, 10), { color: wood });
  b.add(egg(r * 0.72, 1, 1, 0.25, 0, r * 0.9, len, 0, 8), { color: "#c2a77e" });
  // Root plate at the base.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + seed;
    b.add(tube(r * 0.32, r * 0.08, 0, r, 0.05, Math.cos(a) * r * 2.4, r + Math.sin(a) * r * 2.2, -0.35, 5), {
      color: "#4a3a2b",
    });
  }
  for (const [z, s] of [
    [len * 0.35, 1],
    [len * 0.62, -1],
  ] as const)
    b.add(tube(r * 0.28, r * 0.16, s * r * 0.6, r * 1.3, z, s * r * 2.3, r * 2.6, z + 0.3, 5), { color: wood });
  return b.build();
}

/**
 * Merges vertex-colored props that lie within `gap` of each other (bounding-sphere centers, XZ) into one
 * geometry per cluster: the logs or thickets strung along the canoe route then cost one draw (and one ink and
 * one shadow pass) together instead of one each, while a far-off site stays separate so SiteProps can hide it.
 */
export function mergeNear(geos: THREE.BufferGeometry[], gap: number): THREE.BufferGeometry[] {
  const centers = geos.map((g) => {
    g.computeBoundingSphere();
    return (g.boundingSphere as THREE.Sphere).center;
  });
  const cluster = geos.map((_, i) => i);
  const root = (i: number): number => {
    let r = i;
    while (cluster[r] !== r) r = cluster[r] as number;
    return r;
  };
  for (let i = 0; i < geos.length; i++)
    for (let j = i + 1; j < geos.length; j++) {
      const a = centers[i] as THREE.Vector3;
      const b = centers[j] as THREE.Vector3;
      if (Math.hypot(a.x - b.x, a.z - b.z) < gap) cluster[root(j)] = root(i);
    }
  const out = new Map<number, GeoBuilder>();
  geos.forEach((g, i) => {
    const r = root(i);
    if (!out.has(r)) out.set(r, new GeoBuilder());
    (out.get(r) as GeoBuilder).add(g);
  });
  return [...out.values()].map((b) => b.build());
}
