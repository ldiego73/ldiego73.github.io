/**
 * The horizon round the lake: one ring of mountains, never walked on, one vertex-coloured mesh.
 *  - North, across the water: the Cordillera Real, a wall of jagged snowy peaks rising from the far shore
 *    (the real range stands some 100 km off; here it is pulled in so it fills the skyline, as from Taquile).
 *  - South, behind the altiplano: lower ochre and brown hills with a little snow on the tallest tops.
 * The ring's inner radius changes with the bearing: on the land side it starts on the heightfield's rim (so
 * the two meet without a seam), on the lake side it starts far out in the water.
 *
 * Thin air: the ring draws without the scene fog (it would wash the range into a grey band at this distance);
 * a fixed blue haze is baked into its colours instead, a little more across the lake than on the land side, so
 * the peaks stay crisp but read as far away. Painted like an anime backdrop (the "cel pintado andino" style):
 * saturated blue-violet rock across the lake, warm ochre hills behind the altiplano, pure white snow with a hard
 * edge, the haze a clear sky blue rather than grey; the cel light and the indigo shade tint do the rest.
 */
import * as THREE from "three";
import { noOutline, type ToonCache } from "../../toon";
import type { TiticacaLayout } from "../layout";
import { HALF } from "../plan";

const SEGS = 360;
/** Radial profile: [fraction of the ring's depth, height factor] from the inner lip to the far fall-off. */
const PROFILE: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.08, 0.12],
  [0.2, 0.5],
  [0.29, 0.8],
  [0.36, 1],
  [0.44, 0.82],
  [0.6, 0.6],
  [1, 0.25],
];

function hash(i: number) {
  let h = Math.imul(i, 2654435761) ^ 0x7e1c0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}
/** Smooth periodic noise round the ring (k = segment index, any real). */
function ringNoise(k: number, period: number) {
  const n = Math.round(SEGS / period);
  const i = Math.floor(k / period);
  const f = k / period - i;
  const a = hash(((i % n) + n) % n);
  const b = hash((((i + 1) % n) + n) % n);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function buildBackdrop(L: TiticacaLayout, toon: ToonCache) {
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const rock = new THREE.Color("#8e7f86");
  const rockBlue = new THREE.Color("#5560a6");
  const ochre = new THREE.Color("#c39a5a");
  const snow = new THREE.Color("#ffffff");
  const haze = new THREE.Color("#9fbdf0");
  const shore = new THREE.Color("#8f9c66");
  const c = new THREE.Color();
  const R = PROFILE.length;
  for (let i = 0; i <= SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // north: 1 across the lake (−z), 0 on the land side.
    const north = THREE.MathUtils.smoothstep(-sa, 0.05, 0.55);
    const inner = THREE.MathUtils.lerp(HALF * 0.97, 860, north);
    const depth = THREE.MathUtils.lerp(420, 560, north);
    const big = ringNoise(i, 17);
    const small = ringNoise(i + 3.5, 5);
    const jag = ringNoise(i + 1.7, 2);
    // The Cordillera: tall, jagged, two massifs; the south: rounded hills.
    const massif = Math.exp(-(((a - 4.25) / 0.22) ** 2)) + 0.8 * Math.exp(-(((a - 5.05) / 0.18) ** 2));
    // Heights are kept modest for their distance (a few degrees over the water, like a real far range).
    const peak = THREE.MathUtils.lerp(
      40 + big * 34 + small * 10,
      30 + big * 24 + small * 24 + jag * 22 + massif * 46,
      north,
    );
    const snowLine = THREE.MathUtils.lerp(86, 60 + (1 - small) * 16, north);
    PROFILE.forEach(([f, k], j) => {
      const r = inner + depth * f;
      const x = ca * r;
      const z = sa * r;
      let y: number;
      if (j === 0) {
        // The lip: on the heightfield's rim on land, just under the water out on the lake.
        const hx = Math.max(-HALF, Math.min(HALF, x));
        const hz = Math.max(-HALF, Math.min(HALF, z));
        y = north > 0.5 ? L.level - 0.4 : Math.max(L.level - 0.4, L.heightAt(hx, hz) - 2);
      } else y = peak * k + (j === 1 ? THREE.MathUtils.lerp(16, 1, north) : 0);
      pos.push(x, y, z);
      // Snow caps the upper fifth of every tall peak across the lake; on the land side only the tallest tops.
      const capped = north > 0.5 ? k >= 0.8 && peak > 62 : y > snowLine + (1 - k) * 16;
      if (capped) c.copy(snow);
      else if (j === 0 && north > 0.5) c.copy(shore);
      else if (north > 0.5) c.copy(rockBlue).lerp(rock, 0.4 * (1 - k));
      else c.copy(ochre).lerp(rock, 0.3 + 0.4 * k);
      // Snow takes half the haze: the caps stay the brightest, crispest thing on the skyline.
      c.lerp(haze, THREE.MathUtils.lerp(0.16, 0.28, north) * (capped ? 0.5 : 1));
      col.push(c.r, c.g, c.b);
    });
  }
  for (let i = 0; i < SEGS; i++)
    for (let j = 0; j < R - 1; j++) {
      const a = i * R + j;
      const b = a + 1;
      const d = a + R;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  let geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  // Faceted peaks read better in the toon ramp.
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const mat = toon.vertexToon({ fog: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = "titicaca-cordillera";
  // Past the ink fade: off the ink pass, so its foot in the water draws no line along the horizon.
  noOutline(mesh);
  return {
    mesh,
    dispose() {
      geo.dispose();
    },
  };
}
