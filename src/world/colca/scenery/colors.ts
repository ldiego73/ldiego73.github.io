/**
 * Ground colours of the Kuntisuyu, shared by the walkable ground (./ground.ts) and the far skirt round it
 * (./backdrop.ts) so they meet without a seam: puna straw and dry grass on the rim plateau, reddish-ochre
 * gravel on the Nazca pampa with darker desert-varnish patches, bare rock on steep ground, and a greener band
 * round the village (irrigated fields). Colours by place, not texture.
 */
import * as THREE from "three";
import { noise, smooth } from "../layout";
import { CANYON, canyonS, PAMPA, RIM_ROAD, rimZ, VILLAGE } from "../plan";

const PUNA = new THREE.Color("#c4ad74");
const PUNA_2 = new THREE.Color("#a9a466");
const PUNA_DRY = new THREE.Color("#d2bb84");
const FIELD = new THREE.Color("#8fa356");
const PAMPA_C = new THREE.Color("#9a6c55");
const PAMPA_2 = new THREE.Color("#7e5a49");
const PAMPA_PALE = new THREE.Color("#ad8667");
const ROCK = new THREE.Color("#8d7462");
const SOUTH = new THREE.Color("#b49a68");
const tmp = new THREE.Color();
/** The village's irrigated fields spread north of its plaza. */
const FIELDS_Z = rimZ(VILLAGE.x) - RIM_ROAD - VILLAGE.off - 30;

/** Writes the ground colour at (x, z) (height y, slope as rise per unit) into `out`. */
export function groundColor(x: number, z: number, y: number, slope: number, out: THREE.Color): THREE.Color {
  const s = canyonS(x, z);
  const w = noise(x / 46, z / 46, 0x51);
  const w2 = noise(x / 13, z / 13, 0x52);
  if (s > CANYON.south) {
    out
      .copy(SOUTH)
      .lerp(PUNA_2, w * 0.6)
      .lerp(PUNA_DRY, w2 * 0.25);
  } else {
    out
      .copy(PUNA)
      .lerp(PUNA_2, w * 0.7)
      .lerp(PUNA_DRY, Math.max(0, w2 - 0.55) * 1.4);
    // Irrigated fields round the village (north of the road there).
    const dv = Math.hypot((x - VILLAGE.x) * 0.8, z - FIELDS_Z);
    out.lerp(FIELD, (1 - smooth(40, 110, dv)) * 0.55 * (0.6 + 0.4 * w));
    // The pampa: reddish gravel, pale where the wind swept it, darker varnished patches.
    const m = smooth(PAMPA.z0 + 10, PAMPA.z1 + 20, z);
    if (m > 0) {
      tmp
        .copy(PAMPA_C)
        .lerp(PAMPA_2, w * 0.8)
        .lerp(PAMPA_PALE, Math.max(0, w2 - 0.6) * 1.5);
      out.lerp(tmp, m);
    }
  }
  if (slope > 0.45) out.lerp(ROCK, Math.min(1, (slope - 0.45) * 2));
  // Low hollows a touch darker (reads the relief from the lookout).
  out.multiplyScalar(0.94 + 0.06 * smooth(-30, 10, y));
  return out;
}
