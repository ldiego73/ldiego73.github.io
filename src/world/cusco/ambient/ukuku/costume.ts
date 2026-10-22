/**
 * The ukuku's costume as data (../ukuku.ts dresses a person in it): the bear-dancer of the Qoyllur Rit'i is a
 * person of the shared characters (../../../characters) whose spec carries most of the costume in the core's
 * generic hook, `HumanSpec.extra` (signed-distance primitives on named bones, built with the body off the main
 * thread, one rigid field piece per bone in the body's draw) and `hideFace` (the knitted mask covers the face):
 *  - the knitted woollen mask over the whole head: knitted bands round the crown and the chin, a zigzag of
 *    coloured stitches on the brow, eye and mouth holes ringed in red, a knitted nose, two woollen tassels;
 *  - a woven belt (chumpi) with a little brass bell at the right of the waist;
 *  - a little doll ukuku on the chest.
 * The shaggy fleece suit is NOT here: the hook's `wool` is a smooth noise on a surface and read as a plain
 * tracksuit, so the fleece stays the world-local lumps of ./model.ts. The whip is the core's held prop. Under it
 * all the base top and trousers are the fleece's brown. Colours are palette slots of DANCER_DRESS: the mask's
 * wool in `white`, the stitches in `accent` (red), `accent2` (yellow), `tie` (green) and `bead1` (blue), the
 * holes in `dark`, the bell in `metal`, the doll in `hair`.
 *
 * Coordinates: the body's model space at the bind pose in traveler units (feet at the origin, facing +Z,
 * left = +X; ../../../characters/human.ts: hips 0.8, chest 1.04, head centre 1.43 with radii ≈ 0.22); the core
 * scales them with the body. Pure: no DOM, no three.js (tested in costume.test.ts).
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

  // A woven belt (chumpi) proud of the fleece (./model.ts lumps reach ≈ 0.26 out), red with a yellow line; the
  // bell hangs from it at the right of the waist.
  x.push(
    ell("hips", [0, 0.875, 0], [0.262, 0.034, 0.215], HS.accent, { blend: 0 }),
    ell("hips", [0, 0.875, 0], [0.266, 0.011, 0.219], HS.accent2, { blend: 0 }),
    cone("hips", [-0.2, 0.84, 0.17], [-0.21, 0.76, 0.19], 0.012, 0.038, HS.metal, { blend: 0 }),
  );
  // The little doll ukuku on the chest, outside the fleece: a dark blob with a white mask and two black eyes.
  x.push(
    ell("chest", [0, 1.0, 0.25], [0.05, 0.065, 0.035], HS.hair, { blend: 0, wool: 0.008, woolFreq: 40 }),
    ell("chest", [0, 1.075, 0.255], [0.036, 0.038, 0.026], HS.white, { blend: 0 }),
    ell("chest", [0.013, 1.08, 0.279], [0.009, 0.009, 0.006], HS.dark, { blend: 0 }),
    ell("chest", [-0.013, 1.08, 0.279], [0.009, 0.009, 0.006], HS.dark, { blend: 0 }),
  );

  // ---------------------------------------------------------------- head: the knitted mask
  const h = at("head");
  const hc: V3 = [0, h[1] + 0.15, 0.012]; // the head's centre (human.ts: 0.15 above the head bone)
  const mr: V3 = [0.245, 0.235, 0.228];
  /** Half widths of the mask's section at height y (for bands and stitches round it). */
  const f = (y: number) => Math.sqrt(Math.max(0, 1 - ((y - hc[1]) / mr[1]) ** 2));
  /** The mask's front surface at (x, y), pushed out by `out`. */
  const front = (px: number, py: number, out: number) =>
    hc[2] + mr[2] * Math.sqrt(Math.max(0, 1 - (px / mr[0]) ** 2 - ((py - hc[1]) / mr[1]) ** 2)) + out;
  x.push(ell("head", hc, mr, HS.white));
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
