/**
 * The ukuku's costume as data (../ukuku.ts dresses a person in it): the bear-dancer of the Qoyllur Rit'i is a
 * person of the shared characters (../../../characters) whose spec carries the costume in the generic hook,
 * `HumanSpec.extra` (signed-distance primitives on named bones, built with the body off the main thread, one
 * rigid field piece per bone in the body's draw) and `hideFace` (the knitted mask covers the face):
 *  - a dark shaggy fleece suit over the body, arms and legs (`wool` gives the lumpy fleece), with a fringe of
 *    tufts at the hem, the wrists and the ankles, and fleece tufts on the shoulders and round the neck;
 *  - a woven belt (chumpi) with a little brass bell at the right of the waist;
 *  - a little doll ukuku on the chest;
 *  - the knitted woollen mask over the whole head: knitted bands round the crown and the chin, a zigzag of
 *    coloured stitches on the brow, eye and mouth holes ringed in red, a knitted nose, two woollen tassels.
 * The whip is the core's held prop ("whip"). Colours are palette slots of the dancer's dress (DANCER_DRESS):
 * the fleece in `top`, `hair` (darker) and `trim` (lighter), the mask's wool in `white`, the stitches in
 * `accent` (red), `accent2` (yellow), `tie` (green) and `bead1` (blue), the holes in `dark`, the bell in `metal`.
 *
 * Coordinates: the body's model space at the bind pose in traveler units (feet at the origin, facing +Z,
 * left = +X; ../../../characters/human.ts: hips 0.8, chest 1.04, head centre 1.43 with radii ≈ 0.22); the core
 * scales them with the body. Limb segments follow the skeleton's own bind positions (rigOf). Pure: no DOM, no
 * three.js (tested in costume.test.ts).
 */
import { type ExtraPrim, type HumanSpec, rigOf } from "../../../characters/archetype";
import { dress, HS } from "../../../characters/slots";

type V3 = [number, number, number];

/** Dark brown fleece, lifted a little so the costume still reads in the moonlit plaza (it only comes out at night). */
const FLEECE = ["#4a3424", "#5b4029", "#3b2a1e", "#674a31"] as const;

/** The person inside the suit (the costume is added by ukukuSpec). */
const BASE: HumanSpec = { sex: "m", build: "sturdy", hair: "none", top: "sweater", bottom: "trousers", feet: "boots" };

/** The dancer's colours: the fleece, the gloves (skin), the mask's wool and its stitches. */
export const DANCER_DRESS = dress({
  skin: "#d7ccb6",
  hair: FLEECE[2],
  top: FLEECE[0],
  trim: FLEECE[3],
  legs: FLEECE[0],
  shoe: "#241b16",
  sole: "#241b16",
  sock: FLEECE[2],
  white: "#f1ece0",
  accent: "#c4383f",
  accent2: "#e8b631",
  tie: "#2a9d8f",
  bead1: "#3446a6",
  dark: "#15100d",
  metal: "#d6a43a",
});

/** Fleece: a lumpy wool displacement (amplitude, frequency per unit). */
const SHAG = { wool: 0.028, woolFreq: 11 } as const;

const ell = (bone: string, c: V3, r: V3, slot: number, o: Partial<ExtraPrim> = {}): ExtraPrim => ({
  bone,
  shape: { kind: "ellipsoid", c, r },
  slot,
  ...o,
});
const cone = (
  bone: string,
  a: V3,
  b: V3,
  ra: number,
  rb: number,
  slot: number,
  o: Partial<ExtraPrim> = {},
): ExtraPrim => ({
  bone,
  shape: { kind: "cone", a, b, ra, rb },
  slot,
  ...o,
});

/** A ring of n downward tufts round (x, y, z) with radii (rx, rz), each `len` long: the shaggy fringe. */
function fringe(bone: string, n: number, x: number, y: number, z: number, rx: number, rz: number, len: number) {
  const out: ExtraPrim[] = [];
  for (let i = 0; i < n; i++) {
    const th = ((i + 0.5 * (i % 2)) / n) * Math.PI * 2;
    const l = len * (0.8 + 0.4 * ((i * 7) % 5) * 0.25);
    const cx = x + Math.cos(th) * rx;
    const cz = z + Math.sin(th) * rz;
    out.push(
      cone(
        bone,
        [cx, y, cz],
        [x + Math.cos(th) * rx * 1.12, y - l, z + Math.sin(th) * rz * 1.12],
        0.03,
        0.008,
        i % 3 ? HS.hair : HS.top,
        {
          blend: 0.01,
        },
      ),
    );
  }
  return out;
}

/** The ukuku: the base dancer with the costume in `extra` and no painted face. */
export function ukukuSpec(): HumanSpec {
  const rig = rigOf(BASE);
  const k = rig.opts.scale;
  const at = (name: string): V3 => {
    const b = rig.bones.find((d) => d.name === name);
    if (!b) throw new Error(`ukuku: no bone ${name}`);
    return [b.at[0] / k, b.at[1] / k, b.at[2] / k];
  };
  const x: ExtraPrim[] = [];

  // ---------------------------------------------------------------- body: a broad, bear-like fleece tunic
  x.push(
    ell("hips", [0, 0.81, 0], [0.205, 0.12, 0.165], HS.top, SHAG),
    ell("spine", [0, 0.95, 0.005], [0.205, 0.1, 0.16], HS.top, SHAG),
    ell("chest", [0, 1.07, 0.005], [0.225, 0.13, 0.165], HS.top, SHAG),
    // Fleece collar where the mask meets the costume, and tufts on the shoulders.
    ell("chest", [0, 1.2, -0.01], [0.14, 0.05, 0.12], HS.trim, SHAG),
    ell("chest", [0.18, 1.13, -0.01], [0.085, 0.07, 0.09], HS.trim, SHAG),
    ell("chest", [-0.18, 1.13, -0.01], [0.085, 0.07, 0.09], HS.trim, SHAG),
    ...fringe("hips", 16, 0, 0.72, 0, 0.19, 0.155, 0.15),
  );
  // A woven belt (chumpi) proud of the fleece, red with a yellow line; the bell at the right of the waist.
  x.push(
    ell("hips", [0, 0.875, 0], [0.232, 0.032, 0.188], HS.accent, { blend: 0 }),
    ell("hips", [0, 0.875, 0], [0.236, 0.01, 0.192], HS.accent2, { blend: 0 }),
    cone("hips", [-0.17, 0.83, 0.14], [-0.175, 0.76, 0.15], 0.012, 0.036, HS.metal, { blend: 0 }),
  );
  // The little doll ukuku on the chest: a fleece blob with a white mask and two black eyes.
  x.push(
    ell("chest", [0, 1.0, 0.19], [0.045, 0.06, 0.035], HS.hair, { blend: 0, wool: 0.008, woolFreq: 40 }),
    ell("chest", [0, 1.07, 0.2], [0.034, 0.036, 0.026], HS.white, { blend: 0 }),
    ell("chest", [0.012, 1.074, 0.224], [0.008, 0.008, 0.006], HS.dark, { blend: 0 }),
    ell("chest", [-0.012, 1.074, 0.224], [0.008, 0.008, 0.006], HS.dark, { blend: 0 }),
  );

  // ---------------------------------------------------------------- limbs
  for (const s of ["L", "R"] as const) {
    const sg = s === "L" ? 1 : -1;
    const arm = at(`arm${s}`);
    const fore = at(`fore${s}`);
    const hand = at(`hand${s}`);
    x.push(
      cone(`arm${s}`, arm, fore, 0.085, 0.078, HS.top, SHAG),
      cone(`fore${s}`, fore, [hand[0], hand[1] + 0.03, hand[2]], 0.078, 0.07, HS.top, SHAG),
      ...fringe(`fore${s}`, 8, hand[0], hand[1] + 0.04, hand[2], 0.06, 0.06, 0.07),
    );
    const thigh = at(`thigh${s}`);
    const shin = at(`shin${s}`);
    const foot = at(`foot${s}`);
    x.push(
      cone(`thigh${s}`, [thigh[0] + 0.01 * sg, thigh[1] - 0.03, thigh[2]], shin, 0.11, 0.098, HS.top, SHAG),
      cone(`shin${s}`, shin, [foot[0], foot[1] + 0.09, foot[2]], 0.098, 0.09, HS.top, SHAG),
      ...fringe(`shin${s}`, 9, foot[0], foot[1] + 0.12, foot[2], 0.085, 0.085, 0.08),
    );
  }

  // ---------------------------------------------------------------- head: the knitted mask
  const h = at("head");
  const hc: V3 = [0, h[1] + 0.15, 0.012]; // the head's centre (human.ts: 0.15 above the head bone)
  const mr: V3 = [0.245, 0.235, 0.228];
  /** Half widths of the mask's section at height y (for bands and stitches round it). */
  const f = (y: number) => Math.sqrt(Math.max(0, 1 - ((y - hc[1]) / mr[1]) ** 2));
  /** The mask's front surface at (x, y), pushed out by `out`. */
  const front = (px: number, py: number, out: number) =>
    hc[2] + mr[2] * Math.sqrt(Math.max(0, 1 - (px / mr[0]) ** 2 - ((py - hc[1]) / mr[1]) ** 2)) + out;
  x.push(ell("head", hc, mr, HS.white, { wool: 0.004, woolFreq: 60 }));
  // Knitted bands: red round the crown, green round the chin (slightly proud of the mask).
  for (const [dy, slot] of [
    [0.14, HS.accent],
    [-0.17, HS.tie],
  ] as const) {
    const y = hc[1] + dy;
    x.push(ell("head", [0, y, hc[2]], [mr[0] * f(y) * 1.05, 0.022, mr[2] * f(y) * 1.05], slot, { blend: 0 }));
  }
  // A zigzag of coloured stitches across the brow.
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i / 6) * 1.8;
    const y = hc[1] + 0.09 + (i % 2 ? 0.02 : -0.01);
    const r = f(y);
    x.push(
      ell(
        "head",
        [Math.sin(a) * mr[0] * r * 1.01, y, hc[2] + Math.cos(a) * mr[2] * r * 1.01],
        [0.022, 0.018, 0.018],
        [HS.accent2, HS.bead1, HS.accent][i % 3] as number,
        { blend: 0 },
      ),
    );
  }
  // Eye holes and the mouth hole, each ringed in red stitches; a little knitted nose.
  for (const s of [-1, 1]) {
    const ex = s * 0.088;
    const ey = hc[1] + 0.01;
    x.push(
      ell("head", [ex, ey, front(ex, ey, -0.012)], [0.054, 0.046, 0.024], HS.accent, { blend: 0 }),
      ell("head", [ex, ey, front(ex, ey, -0.004)], [0.034, 0.028, 0.016], HS.dark, { blend: 0 }),
    );
  }
  const my = hc[1] - 0.105;
  x.push(
    ell("head", [0, my, front(0, my, -0.012)], [0.054, 0.03, 0.022], HS.accent, { blend: 0 }),
    ell("head", [0, my, front(0, my, -0.004)], [0.036, 0.016, 0.014], HS.dark, { blend: 0 }),
    ell("head", [0, hc[1] - 0.04, front(0, hc[1] - 0.04, 0)], [0.028, 0.034, 0.026], HS.white, { blend: 0.01 }),
  );
  // Two woollen tassels on top, the ukuku's tufts.
  for (const s of [-1, 1]) {
    const top = hc[1] + mr[1] * 0.9;
    x.push(
      cone("head", [s * 0.08, top, 0], [s * 0.15, top + 0.11, -0.02], 0.016, 0.014, s < 0 ? HS.accent : HS.accent2, {
        blend: 0,
      }),
      ell("head", [s * 0.155, top + 0.125, -0.02], [0.046, 0.046, 0.046], s < 0 ? HS.accent : HS.tie, {
        blend: 0.01,
        wool: 0.006,
        woolFreq: 50,
      }),
    );
  }

  return { ...BASE, hideFace: true, extra: x };
}
