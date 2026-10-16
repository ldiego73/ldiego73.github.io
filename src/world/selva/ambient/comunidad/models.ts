/**
 * Procedural models for the people of the Antisuyu road: an Amazonian riverside community inspired by
 * Shipibo-Konibo and Asháninka everyday dress, drawn plainly and without caricature.
 *  - men: the cushma, a long tunic down to the calves with thin vertical stripes, dyed in bark browns,
 *    achiote red-brown or left natural cotton; bare feet;
 *  - women: a short blouse with satin ribbon bands at the hem and collar, and a straight wrap skirt painted
 *    with kené (the maze of fine geometric lines Shipibo-Konibo women paint and embroider), long straight
 *    hair with a fringe, bead and huayruro-seed necklaces;
 *  - children: shorts and a tee (boys) or a small painted skirt (girls);
 *  - a few wear a feather crown (a band with macaw feathers).
 * Built on the mountain people's rendering core (../../../ambient/people/rig.ts): every part is one merged
 * geometry whose vertices carry a fixed color or a palette slot (1 skin, 2 main garment, 3 accent: stripes,
 * kené lines, ribbons, beads, 4 top: blouse, tee, sleeves). The mountain's own parts and palettes
 * (people/models.ts) are untouched: these are separate part names with their own builders.
 *
 * Also here: the static props (backstrap loom, painted pottery, palm mats, the elder's stool, the jumping
 * log) and the moving boats (a fisherman's dugout, the peque-peque motor canoe) and the cast net.
 */
import * as THREE from "three";
import {
  type Paint,
  Part,
  type PartSpec,
  type Protos,
  protos,
  S_ACC,
  S_ALT,
  S_MAIN,
  S_SKIN,
} from "../../../ambient/people/rig";
import { hullGeometries } from "../embarcadero/amazon";

const INK = "#1f1a17";
const HAIR = "#15100d";
const SOLE = "#5a4030";
const WOOD = "#7a4a2b";
const WOOD_D = "#4f2f1c";
const PALM = "#b48a4c";
const PALM_D = "#8a6633";
const CREAM = "#efe3c8";
const HUAYRURO = "#b8261f";
const SEED_W = "#efe6d6";
const BANANA = "#7ea33a";
const BANANA_Y = "#d9c04a";

// ---------------------------------------------------------------- shared bits

function face(p: Part, P: Protos, y = 0.2) {
  p.add(P.sph, S_SKIN, 0, y, 0, 0, 0, 0, 0.2, 0.21, 0.195);
  for (const s of [-1, 1]) {
    p.add(P.sph, INK, 0.072 * s, y - 0.02, 0.185, 0, 0, 0, 0.022, 0.03, 0.012);
    p.add(P.box, HAIR, 0.075 * s, y + 0.035, 0.183, 0, 0, 0.12 * s, 0.07, 0.014, 0.012);
    p.add(P.sph, S_SKIN, 0.198 * s, y - 0.01, 0, 0, 0, 0, 0.035, 0.05, 0.03);
  }
  p.add(P.sph, S_SKIN, 0, y - 0.065, 0.2, 0, 0, 0, 0.034, 0.04, 0.03);
  p.add(P.box, "#7a3e2a", 0, y - 0.125, 0.183, 0, 0, 0, 0.06, 0.012, 0.01);
}

/** Bare leg (everyone): thigh, knee, calf and a bare foot on a thin dark sole line (reads at a distance). */
function leg(P: Protos) {
  const p = new Part();
  p.add(P.cap, S_SKIN, 0, -0.17, 0, 0, 0, 0, 0.08, 0.2, 0.08);
  p.add(P.cap, S_SKIN, 0, -0.38, 0, 0, 0, 0, 0.06, 0.14, 0.06);
  p.add(P.box, S_SKIN, 0, -0.52, 0.04, 0, 0, 0, 0.11, 0.06, 0.21);
  p.add(P.box, SOLE, 0, -0.553, 0.04, 0, 0, 0, 0.112, 0.012, 0.212);
  return p.build();
}

/** Short-sleeved arm with a seed bracelet at the wrist. Sleeve = slot 4 (cushma, blouse or tee). */
function arm(P: Protos) {
  const p = new Part();
  p.add(P.cap, S_ALT, 0, -0.07, 0, 0, 0, 0, 0.078, 0.08, 0.078);
  p.add(P.cap, S_SKIN, 0, -0.2, 0, 0, 0, 0, 0.055, 0.16, 0.055);
  p.add(P.cyl, S_ACC, 0, -0.3, 0, 0, 0, 0, 0.058, 0.03, 0.058);
  p.add(P.sph, S_SKIN, 0, -0.37, 0.01, 0, 0, 0, 0.058, 0.064, 0.058);
  return p.build();
}

// ---------------------------------------------------------------- men: the cushma

/** Upper cushma (torso bone): a wide tunic with a vertical neck slit and thin warp stripes. */
function cushmaTop(P: Protos) {
  const p = new Part();
  p.add(P.cyl, S_MAIN, 0, 0.25, 0, 0, 0, 0, 0.215, 0.56, 0.165);
  p.add(P.sph, S_MAIN, 0, 0.47, 0, 0, 0, 0, 0.27, 0.1, 0.18);
  // Neck and the open slit down the chest.
  p.add(P.cyl, S_SKIN, 0, 0.56, 0, 0, 0, 0, 0.068, 0.1, 0.068);
  p.add(P.box, S_SKIN, 0, 0.45, 0.165, 0, 0, 0, 0.05, 0.14, 0.01);
  // Thin vertical stripes, front and back (Asháninka cushmas carry them from collar to hem).
  for (const z of [1, -1])
    for (const x of [-0.13, -0.07, 0.07, 0.13]) p.add(P.box, S_ACC, x, 0.24, z * 0.163, 0, 0, 0, 0.014, 0.5, 0.008);
  return p.build();
}

/** Lower cushma (hips bone): the tunic falls straight to mid-calf; stripes continue; a dark hem. */
const TUNIC = new THREE.CylinderGeometry(0.88, 1, 1, 14, 1);
function cushmaLow(P: Protos) {
  const p = new Part();
  const yT = 0.62;
  const yB = 0.16;
  p.add(TUNIC, S_MAIN, 0, (yT + yB) / 2, 0, 0, 0, 0, 0.27, yT - yB, 0.22);
  p.add(TUNIC, INK, 0, yB + 0.015, 0, 0, 0, 0, 0.275, 0.03, 0.225);
  for (const z of [1, -1])
    for (const x of [-0.13, -0.07, 0.07, 0.13])
      p.add(
        P.box,
        S_ACC,
        x,
        (yT + yB) / 2,
        z * (0.205 + (0.02 * Math.abs(x)) / 0.13),
        z * 0.04,
        0,
        0,
        0.014,
        yT - yB,
        0.008,
      );
  return p.build();
}

function headMan(P: Protos) {
  const p = new Part();
  face(p, P);
  p.add(P.halfSph, HAIR, 0, 0.215, -0.02, -0.3, 0, 0, 0.214, 0.21, 0.212);
  // Straight fringe across the forehead.
  p.add(P.box, HAIR, 0, 0.33, 0.14, -0.35, 0, 0, 0.3, 0.07, 0.08);
  return p.build();
}

// ---------------------------------------------------------------- women

/** Blouse / tee (torso bone): slot 4 body, a ribbon band at the hem and the collar (slot 3). */
function top(P: Protos) {
  const p = new Part();
  p.add(P.cyl, S_ALT, 0, 0.29, 0, 0, 0, 0, 0.19, 0.44, 0.15);
  p.add(P.sph, S_ALT, 0, 0.45, 0, 0, 0, 0, 0.245, 0.1, 0.165);
  p.add(P.cyl, S_SKIN, 0, 0.56, 0, 0, 0, 0, 0.065, 0.1, 0.065);
  p.add(P.cyl, S_ACC, 0, 0.09, 0, 0, 0, 0, 0.195, 0.045, 0.155);
  p.add(P.cyl, S_ACC, 0, 0.13, 0, 0, 0, 0, 0.193, 0.015, 0.153);
  p.add(P.cyl, S_ACC, 0, 0.5, 0, 0, 0, 0, 0.2, 0.03, 0.16);
  // Waist under the blouse (the skirt's waist sits on the hips bone).
  p.add(P.cyl, S_ALT, 0, 0.03, 0, 0, 0, 0, 0.18, 0.1, 0.145);
  beads(p, P);
  return p.build();
}

/**
 * Painted wrap skirt (hips bone): straight to mid-calf, base color slot 2, kené in slot 3: two framing
 * bands and, between them, a stepped maze of short horizontal and vertical strokes around the whole skirt.
 */
function skirt(P: Protos) {
  const p = new Part();
  const yT = 0.66;
  const yB = 0.17;
  const rT = 0.23;
  const rB = 0.28;
  p.add(TUNIC, S_MAIN, 0, (yT + yB) / 2, 0, 0, 0, 0, rB, yT - yB, rB * 0.88);
  const rAt = (y: number) => rT + ((rB - rT) * (yT - y)) / (yT - yB);
  // Framing bands near the hem and the waist.
  for (const y of [yB + 0.05, yB + 0.085, yT - 0.06])
    p.add(TUNIC, S_ACC, 0, y, 0, 0, 0, 0, rAt(y) + 0.004, 0.014, (rAt(y) + 0.004) * 0.88);
  // Kené: 16 panels round the skirt, each a step motif (a horizontal stroke, a riser, a second stroke),
  // alternating up/down so neighbouring panels join into a continuous maze line.
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const up = i % 2 === 0;
    const yA = up ? 0.3 : 0.44;
    const yC = up ? 0.44 : 0.3;
    const stroke = (a: number, y: number, len: number, vertical: boolean) => {
      const r = rAt(y) + 0.003;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r * 0.88;
      const tilt = Math.atan2(rB - rT, yT - yB);
      if (vertical) p.add(P.box, S_ACC, x, y, z, tilt * Math.cos(a), a, 0, 0.014, len, 0.006);
      else p.add(P.box, S_ACC, x, y, z, 0, a, 0, len, 0.014, 0.006);
    };
    const da = (Math.PI * 2) / n;
    stroke(a0 + da * 0.25, yA, rAt(yA) * da * 0.55, false);
    stroke(a0 + da * 0.5, (yA + yC) / 2, Math.abs(yC - yA), true);
    stroke(a0 + da * 0.75, yC, rAt(yC) * da * 0.55, false);
    // Small inner hooks (the fine filling lines of the kené).
    stroke(a0 + da * 0.5, up ? 0.24 : 0.5, rAt(0.37) * da * 0.3, false);
  }
  // Waist band.
  p.add(P.cyl, S_ACC, 0, yT - 0.015, 0, 0, 0, 0, 0.2, 0.04, 0.17);
  return p.build();
}

function headWoman(P: Protos) {
  const p = new Part();
  face(p, P);
  p.add(P.halfSph, HAIR, 0, 0.215, -0.015, -0.22, 0, 0, 0.216, 0.218, 0.214);
  // Fringe, and long straight hair down the back to the shoulder blades.
  p.add(P.box, HAIR, 0, 0.33, 0.14, -0.35, 0, 0, 0.32, 0.08, 0.08);
  p.add(P.box, HAIR, 0, 0.0, -0.15, 0.12, 0, 0, 0.36, 0.5, 0.09);
  for (const s of [-1, 1]) p.add(P.box, HAIR, 0.17 * s, 0.07, -0.05, 0, 0, 0, 0.07, 0.36, 0.2);
  return p.build();
}

// ---------------------------------------------------------------- children

/** Shorts (hips bone, boys): a short wide band over the thighs. */
function shorts(P: Protos) {
  const p = new Part();
  p.add(TUNIC, S_MAIN, 0, 0.53, 0, 0, 0, 0, 0.235, 0.2, 0.2);
  p.add(P.cyl, S_MAIN, 0, 0.62, 0, 0, 0, 0, 0.2, 0.05, 0.16);
  return p.build();
}

// ---------------------------------------------------------------- adornments and carried things

/**
 * Necklaces worn with the blouse (part of the top, so they cost no draw call of their own): a strand in slot 3,
 * white seeds, red huayruro seeds; they drape lower in front.
 */
function beads(p: Part, P: Protos) {
  const strands: Array<[number, Paint]> = [
    [0.15, S_ACC],
    [0.175, SEED_W],
    [0.2, HUAYRURO],
  ];
  strands.forEach(([r, c], i) => {
    p.add(P.torus, c, 0, 0.5 - i * 0.025, 0.02, Math.PI / 2 + 0.38, 0, 0, r, r * 0.85, 0.35);
  });
}

/** Feather crown (head bone): a woven band and a fan of macaw feathers (fixed colors). */
function crown(P: Protos) {
  const p = new Part();
  p.add(P.cyl, S_ACC, 0, 0.3, 0, 0, 0, 0, 0.222, 0.07, 0.22);
  p.add(P.cyl, SEED_W, 0, 0.3, 0, 0, 0, 0, 0.224, 0.015, 0.222);
  const cols = ["#c8312b", "#e8b631", "#c8312b", "#2f6fb5", "#c8312b", "#e8b631", "#c8312b"];
  cols.forEach((c, i) => {
    const a = (i - 3) * 0.32;
    const long = i === 3 ? 0.42 : 0.3 - Math.abs(i - 3) * 0.02;
    p.add(P.box, c, Math.sin(a) * 0.2, 0.32 + long / 2, Math.cos(a) * 0.2 - 0.04, -0.18, a, 0, 0.05, long, 0.012);
  });
  return p.build();
}

/** A green banana bunch carried on the right shoulder (torso bone). */
function bananas(P: Protos) {
  const p = new Part();
  p.add(P.cyl6, "#6e5a2e", -0.24, 0.66, 0, 0, 0, Math.PI / 2 - 0.25, 0.03, 0.75, 0.03);
  for (let i = 0; i < 5; i++)
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const x = -0.24 + (i - 2) * 0.11;
      const yy = 0.66 + (i - 2) * 0.027;
      p.add(
        P.cap,
        i === 0 && k % 3 === 0 ? BANANA_Y : BANANA,
        x,
        yy + Math.sin(a) * 0.08,
        Math.cos(a) * 0.08,
        Math.cos(a) * 0.5,
        0,
        Math.sin(a) * 0.4,
        0.022,
        0.07,
        0.022,
      );
    }
  return p.build();
}

/** Woven palm back-basket (torso bone) with yuca and fruit, two shoulder straps. */
function basket(P: Protos) {
  const p = new Part();
  const z = -0.3;
  p.add(P.flare, PALM, 0, 0.2, z, 0, 0, 0, 0.22, 0.42, 0.18);
  for (const y of [0.06, 0.18, 0.3]) p.add(P.flare, PALM_D, 0, y, z, 0, 0, 0, 0.215 - (y - 0.2) * 0.07, 0.02, 0.18);
  for (let i = 0; i < 5; i++)
    p.add(
      P.lowSph,
      i % 2 ? "#e0a03a" : "#c98a4e",
      -0.1 + i * 0.05,
      0.43,
      z + (i % 2) * 0.05 - 0.02,
      0,
      0,
      0,
      0.06,
      0.05,
      0.05,
    );
  p.add(P.cap, "#d9c4a0", 0.05, 0.47, z, 0, 0, 1.2, 0.035, 0.18, 0.035);
  for (const s of [-1, 1]) p.add(P.box, PALM_D, 0.12 * s, 0.38, -0.04, 0.5, 0, 0, 0.035, 0.03, 0.44);
  return p.build();
}

/** Canoe paddle (tool bone; origin at the grip): a long shaft and a leaf-shaped blade. */
function paddle(P: Protos) {
  const p = new Part();
  p.add(P.cyl6, WOOD, 0, -0.55, 0, 0, 0, 0, 0.025, 1.1, 0.025);
  p.add(P.box, WOOD, 0, 0, 0, 0, 0, 0, 0.12, 0.04, 0.04);
  p.add(P.sph, WOOD, 0, -1.25, 0, 0, 0, 0, 0.11, 0.3, 0.025);
  return p.build();
}

// ---------------------------------------------------------------- catalogue

export type AmazonPart =
  | "a:leg"
  | "a:arm"
  | "a:cushma"
  | "a:cushma-low"
  | "a:head-m"
  | "a:top"
  | "a:skirt"
  | "a:head-w"
  | "a:shorts"
  | "a:crown"
  | "a:bananas"
  | "a:basket"
  | "a:paddle";

const BUILDERS: Record<AmazonPart, { bone: PartSpec["bone"]; make: (P: Protos) => THREE.BufferGeometry }> = {
  "a:leg": { bone: "leg", make: leg },
  "a:arm": { bone: "arm", make: arm },
  "a:cushma": { bone: "torso", make: cushmaTop },
  "a:cushma-low": { bone: "hips", make: cushmaLow },
  "a:head-m": { bone: "head", make: headMan },
  "a:top": { bone: "torso", make: top },
  "a:skirt": { bone: "hips", make: skirt },
  "a:head-w": { bone: "head", make: headWoman },
  "a:shorts": { bone: "hips", make: shorts },
  "a:crown": { bone: "head", make: crown },
  "a:bananas": { bone: "torso", make: bananas },
  "a:basket": { bone: "torso", make: basket },
  "a:paddle": { bone: "tool", make: paddle },
};

export const MAN: readonly AmazonPart[] = ["a:leg", "a:arm", "a:cushma", "a:cushma-low", "a:head-m"];
export const WOMAN: readonly AmazonPart[] = ["a:leg", "a:arm", "a:top", "a:skirt", "a:head-w"];
export const BOY: readonly AmazonPart[] = ["a:leg", "a:arm", "a:top", "a:shorts", "a:head-m"];
export const GIRL: readonly AmazonPart[] = ["a:leg", "a:arm", "a:top", "a:skirt", "a:head-w"];
export const ALL_PARTS = Object.keys(BUILDERS) as AmazonPart[];
/** Parts that cast shadows (the big shapes). */
export const SHADOW_PARTS: ReadonlySet<string> = new Set([
  "a:leg",
  "a:cushma",
  "a:cushma-low",
  "a:top",
  "a:skirt",
  "a:head-m",
  "a:head-w",
]);

/** Fresh geometries for the named parts (each crowd owns its own: instance attributes live on them). */
export function amazonSpecs(names: Iterable<AmazonPart>): PartSpec[] {
  const P = protos();
  const out: PartSpec[] = [];
  for (const name of new Set(names)) {
    const b = BUILDERS[name];
    out.push({ name, bone: b.bone, geo: b.make(P) });
  }
  for (const g of Object.values(P)) g.dispose();
  return out;
}

// ---------------------------------------------------------------- outfits (palettes)

export const SKINS = ["#8a5634", "#9c6339", "#7d4b2d", "#a8703f", "#93603a", "#b27a4a", "#865231"];
/** Cushmas: bark browns, achiote red-brown, natural cotton, a faded indigo. */
export const CUSHMAS = ["#7b4a2c", "#9a5a35", "#8a3f2a", "#d8cbb0", "#5d4636", "#4a5370", "#a8724a"];
/** Cushma stripes (dark on light cushmas, light on dark ones are picked by the outfit). */
export const STRIPES = ["#2a1d17", "#3b2a20", "#efe3c8", "#c8b48a"];
/** Kené skirts: cream with dark lines, or huito indigo-black with cream lines, or achiote red. */
export const SKIRTS: ReadonlyArray<[base: string, line: string]> = [
  [CREAM, "#2b2320"],
  ["#2b3550", CREAM],
  [CREAM, "#8a2f25"],
  ["#1f2230", "#e8d9b8"],
  ["#a8432f", "#2b2320"],
];
/** Blouses: bright satin colors common at markets and feasts, and plainer everyday ones. */
export const BLOUSES = ["#c2456b", "#2a9d8f", "#e07a3a", "#3446a6", "#7a3d8f", "#d6303a", "#3f7f4a", "#e8b631"];
/** Ribbons (blouse bands, bracelets, crown bands). */
export const RIBBONS = ["#e8b631", "#efe6d6", "#2a9d8f", "#d6303a", "#3446a6", "#ff8a3d"];
/** Kids' tees and shorts. */
export const TEES = ["#e8e2d4", "#d6303a", "#2f6fb5", "#e8b631", "#3f7f4a", "#ff8a3d", "#7a3d8f"];
export const SHORTS = ["#2a3f6b", "#3b3330", "#4a6a3a", "#22262f", "#6b4a2e"];

// ---------------------------------------------------------------- static props (merged per site)

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();

/** Local placement matrix (yaw about Y at a world point). */
export function frameMatrix(x: number, y: number, z: number, yaw: number, out = new THREE.Matrix4()) {
  return out.compose(tmpP.set(x, y, z), tmpQ.setFromEuler(tmpE.set(0, yaw, 0)), tmpS.set(1, 1, 1));
}

/**
 * Backstrap loom, local frame (origin on the ground at the weaver's hips, +Z toward the far post): a stake,
 * the far bar, the warp running down to the breast bar at the weaver's waist, the finished cloth near her
 * with a kené band, and the strap round her back.
 */
export function loom(p: Part, P: Protos, cloth: string, line: string) {
  const far = 1.55;
  p.add(P.cyl6, WOOD_D, 0, 0.55, far + 0.12, 0, 0, 0, 0.05, 1.1, 0.05);
  p.add(P.cyl6, WOOD, 0, 0.78, far, 0, 0, Math.PI / 2, 0.025, 0.62, 0.025);
  p.add(P.cyl6, WOOD, 0, 0.5, 0.42, 0, 0, Math.PI / 2, 0.025, 0.6, 0.025);
  // Warp (thin, light) from the far bar down to the woven part.
  const y0 = 0.5;
  const y1 = 0.78;
  const len = Math.hypot(far - 0.42, y1 - y0);
  const slope = -Math.atan2(y1 - y0, far - 0.42);
  p.add(P.box, "#e9dfc6", 0, (y0 + y1) / 2, (far + 0.42) / 2, slope, 0, 0, 0.48, 0.006, len);
  // Finished cloth near the weaver, with its kené band.
  const wl = 0.55;
  const wz = 0.42 + (wl / 2) * Math.cos(slope);
  const wy = y0 + (wl / 2) * Math.sin(-slope);
  p.add(P.box, cloth, 0, wy + 0.004, wz, slope, 0, 0, 0.47, 0.01, wl);
  for (let k = 0; k < 4; k++)
    p.add(P.box, line, -0.15 + k * 0.1, wy + 0.012, wz + (k % 2) * 0.06 - 0.03, slope, 0, 0, 0.012, 0.01, wl * 0.6);
  p.add(P.box, line, 0, wy + 0.012, wz, slope, 0, 0, 0.42, 0.01, 0.014);
  // Heddle rod and the wooden sword across the warp.
  p.add(P.cyl6, WOOD_D, 0, 0.66, 1.05, 0, 0, Math.PI / 2, 0.015, 0.56, 0.015);
  p.add(P.box, WOOD, 0, 0.6, 0.8, slope, 0, 0, 0.56, 0.02, 0.06);
  // Back strap round the weaver's hips (she leans back to tension the warp).
  p.add(P.torus, PALM_D, 0, 0.42, 0.15, Math.PI / 2, 0, 0, 0.27, 0.3, 0.5);
}

/** Shipibo-style pottery: cream pots with red slip and black kené bands (local frame, on the ground). */
export function pots(p: Part, P: Protos, R: () => number) {
  const spots: Array<[number, number, number]> = [
    [0.55, 0.25, 0.22],
    [0.75, -0.25, 0.16],
    [-0.6, 0.35, 0.13],
    [0.3, 0.7, 0.12],
  ];
  for (const [x, z, r] of spots) {
    const h = r * (1 + R() * 0.25);
    p.add(P.sph, CREAM, x, h, z, 0, 0, 0, r, h, r);
    p.add(P.cyl, CREAM, x, h * 1.85, z, 0, 0, 0, r * 0.45, r * 0.6, r * 0.45);
    p.add(P.cyl, "#a8432f", x, h * 2.15, z, 0, 0, 0, r * 0.5, r * 0.08, r * 0.5);
    p.add(P.cyl, "#a8432f", x, h * 0.45, z, 0, 0, 0, r * 0.88, r * 0.3, r * 0.88);
    for (const k of [0.95, 1.25]) p.add(P.cyl, "#231a16", x, h * k, z, 0, 0, 0, r * 1.008, r * 0.05, r * 1.008);
    // Fine vertical strokes between the bands (the kené filling).
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.add(
        P.box,
        "#231a16",
        x + Math.sin(a) * r * 0.99,
        h * 1.1,
        z + Math.cos(a) * r * 0.99,
        0,
        a,
        0,
        0.012,
        r * 0.25,
        0.004,
      );
    }
  }
  // Paint bowls (red slip, black) and a clay lump.
  p.add(P.cyl, "#8f3f2b", -0.35, 0.03, -0.35, 0, 0, 0, 0.08, 0.06, 0.08);
  p.add(P.cyl, "#a8432f", -0.35, 0.065, -0.35, 0, 0, 0, 0.065, 0.01, 0.065);
  p.add(P.cyl, "#8f3f2b", -0.15, 0.03, -0.48, 0, 0, 0, 0.07, 0.06, 0.07);
  p.add(P.cyl, "#231a16", -0.15, 0.065, -0.48, 0, 0, 0, 0.055, 0.01, 0.055);
  p.add(P.lowSph, "#b4553a", 0.1, 0.06, -0.55, 0, 0, 0, 0.12, 0.07, 0.1);
}

/** Woven palm mat (local, on the ground). */
export function mat(p: Part, P: Protos, w: number, d: number) {
  p.add(P.box, PALM, 0, 0.012, 0, 0, 0, 0, w, 0.02, d);
  for (let i = 0; i < Math.floor(d / 0.16); i++)
    p.add(P.box, PALM_D, 0, 0.024, -d / 2 + 0.08 + i * 0.16, 0, 0, 0, w * 0.98, 0.006, 0.03);
}

/** Low carved stool (local, origin on the ground). */
export function stool(p: Part, P: Protos) {
  p.add(P.box, WOOD, 0, 0.28, 0, 0, 0, 0, 0.46, 0.06, 0.3);
  for (const s of [-1, 1]) p.add(P.box, WOOD_D, 0.17 * s, 0.13, 0, 0, 0, 0, 0.06, 0.26, 0.26);
}

/**
 * A fallen trunk leaning out over the river (kids jump off its tip). Built between world points `a` (base on
 * the bank) and `b` (tip over the water), with broken branch stubs and the root plate at the base.
 */
export function jumpLog(p: Part, P: Protos, a: THREE.Vector3, b: THREE.Vector3) {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const yaw = Math.atan2(d.x, d.z);
  const pitch = Math.asin(d.y / len);
  // The log as a cylinder lying along its own +Z (rotate a Y cylinder by π/2 about X, then pitch and yaw).
  const m = new THREE.Matrix4().compose(
    mid,
    new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - pitch, yaw, 0, "YXZ")),
    new THREE.Vector3(1, 1, 1),
  );
  p.post = m;
  p.add(P.cyl, "#8d7a62", 0, 0, 0, 0, 0, 0, 0.34, len, 0.34);
  p.add(P.cyl, "#6b5a46", 0, len / 2 + 0.02, 0, 0, 0, 0, 0.3, 0.05, 0.3);
  // Root plate at the base, a few stubs.
  p.add(P.ico, "#5a4636", 0, -len / 2 - 0.1, 0, 0, 0, 0, 0.75, 0.25, 0.75);
  for (const [y, a2, l] of [
    [-0.6, 0.6, 0.7],
    [0.4, -2.2, 0.5],
    [1.3, 2.4, 0.45],
  ] as const)
    p.add(P.cyl6, "#7a6853", Math.cos(a2) * 0.3, y, Math.sin(a2) * 0.3, 0, -a2, Math.PI / 2 - 0.5, 0.07, l, 0.07);
  p.post = null;
}

// ---------------------------------------------------------------- boats

/** A merged vertex-colored geometry for one boat (local frame: bow toward +Z, waterline at y = 0). */
function boatGeometry(build: (p: Part, P: Protos) => void): THREE.BufferGeometry {
  const P = protos();
  const p = new Part();
  build(p, P);
  const g = p.build();
  g.deleteAttribute("aSlot");
  for (const k of Object.values(P)) k.dispose();
  return g;
}

function hull(p: Part, len: number, w: number, h: number, color: string) {
  const { outer, inner } = hullGeometries(len, w, h);
  const top = h * 0.75;
  p.add(outer, color, 0, top, 0);
  p.add(inner, WOOD_D, 0, top, 0);
  outer.dispose();
  inner.dispose();
  return top;
}

/** The fisherman's dugout (≈ 4.4 u): two thwarts and a palm basket for the catch. */
export function fishingCanoe(): THREE.BufferGeometry {
  return boatGeometry((p, P) => {
    const top = hull(p, 4.4, 0.9, 0.42, "#6e4429");
    for (const z of [-1.2, 1.1]) p.add(P.box, "#a06a3e", 0, top - 0.14, z, 0, 0, 0, 0.7, 0.05, 0.18);
    p.add(P.flare, PALM, 0, top - 0.2, -0.3, Math.PI, 0, 0, 0.18, 0.22, 0.18);
    p.add(P.cyl, PALM_D, 0, top - 0.1, -0.3, 0, 0, 0, 0.18, 0.02, 0.18);
  });
}

/**
 * The peque-peque (≈ 7.6 u): a long plank-sided motor canoe with a palm shade over the middle, banana bunches
 * and sacks of cargo, and its long-tail motor at the stern (−Z): engine block, the long shaft and the prop.
 */
export function pequePeque(): THREE.BufferGeometry {
  return boatGeometry((p, P) => {
    const top = hull(p, 7.6, 1.35, 0.55, "#3d6a8a");
    // Painted gunwale stripe.
    for (const s of [-1, 1]) p.add(P.box, "#e8b631", s * 0.6, top - 0.02, 0, 0, 0, 0, 0.03, 0.05, 5.4);
    for (const z of [-2.6, -0.8, 1.0, 2.4]) p.add(P.box, "#a06a3e", 0, top - 0.16, z, 0, 0, 0, 1.15, 0.05, 0.2);
    // Shade roof on four poles over the middle.
    for (const x of [-0.5, 0.5])
      for (const z of [-1.2, 1.0]) p.add(P.cyl6, WOOD, x, top + 0.55, z, 0, 0, 0, 0.03, 1.2, 0.03);
    p.add(P.box, PALM, 0, top + 1.18, -0.1, 0, 0, 0, 1.3, 0.08, 2.6);
    p.add(P.box, PALM_D, 0, top + 1.13, -0.1, 0, 0, 0, 1.34, 0.05, 2.64);
    // Cargo: banana bunches and sacks.
    for (const [x, z] of [
      [-0.25, 1.7],
      [0.25, 1.95],
      [0, 2.3],
    ] as const) {
      p.add(P.cap, BANANA, x, top + 0.02, z, 0.3, 0, 0, 0.17, 0.2, 0.17);
      p.add(P.cyl6, "#6e5a2e", x, top + 0.28, z, 0, 0, 0, 0.025, 0.2, 0.025);
    }
    p.add(P.ico, "#d8cbb4", 0.25, top - 0.02, 0.4, 0, 0, 0, 0.3, 0.24, 0.3);
    p.add(P.ico, "#c9b48e", -0.25, top - 0.02, 0.1, 0, 0, 0, 0.28, 0.22, 0.3);
    // Long-tail motor: engine on the stern thwart, the shaft trailing into the water, the prop.
    p.add(P.box, "#5a5f63", 0, top + 0.12, -3.3, 0, 0, 0, 0.36, 0.3, 0.42);
    p.add(P.box, "#c4383f", 0, top + 0.3, -3.3, 0, 0, 0, 0.3, 0.08, 0.36);
    p.add(P.cyl6, "#3b3f42", 0, top - 0.25, -4.4, Math.PI / 2 + 0.28, 0, 0, 0.03, 2.2, 0.03);
    p.add(P.box, "#3b3f42", 0, -0.32, -5.45, 0, 0, 0, 0.22, 0.05, 0.05);
    // Tiller handle forward of the engine.
    p.add(P.cyl6, "#3b3f42", 0, top + 0.25, -2.85, Math.PI / 2 - 0.3, 0, 0, 0.02, 0.6, 0.02);
  });
}

/**
 * The cast net (tarrafa): an open cone of mesh with a weighted rim, drawn from a procedural canvas with
 * alpha (a faint veil, a coarse grid of twine and the dark lead line at the rim; transparent, no ink outline). Unit size: radius 1 at the rim, apex at y = 1.
 * The owner scales it (closed bundle → open disc) while it flies.
 */
export function netMesh(): THREE.Mesh {
  const geo = new THREE.ConeGeometry(1, 1, 24, 4, true);
  geo.translate(0, 0.5, 0);
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext("2d");
  if (ctx) {
    // A faint veil (the mesh reads as a translucent disc at a distance) under a coarse grid of knotted twine.
    ctx.fillStyle = "rgba(236,228,206,0.32)";
    ctx.fillRect(0, 0, 128, 128);
    ctx.strokeStyle = "rgba(244,238,220,0.95)";
    ctx.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(128, i);
      ctx.stroke();
    }
    // Lead line at the rim (bottom of the cone's UV).
    ctx.fillStyle = "rgba(50,44,40,1)";
    ctx.fillRect(0, 118, 128, 10);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(5, 1);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, m);
  mesh.name = "comunidad:net";
  return mesh;
}
