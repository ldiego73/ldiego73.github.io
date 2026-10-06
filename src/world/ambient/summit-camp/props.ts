/**
 * Static dressing of the summit camp, merged into one vertex-colored geometry in the summit-local frame
 * (people/models.ts `Static`): the travellers' hearth with seat stones, a striped manta and their q'ipi
 * bundles; the apacheta (a cairn of stones that travellers raise, one stone each, at high passes); and the
 * api stall — a small table with a woven cloth under a cotton shade, cups set out, and a big clay pot on a
 * three-stone q'uncha (stove). Flames, glow and steam are separate (animated) objects.
 */
import * as THREE from "three";
import { DYE } from "../../palette";
import { hearth, rng, Static } from "../people/models";
import { APACHETA, FIRE, SEATS, STALL, STOVE } from "./plan";

const WOOD = "#7a5233";
const WOOD_D = "#5e3b22";
const STONES = ["#9a9184", "#b9b1a3", "#8f877b", "#a59a88", "#7f776c"];
const CLAY = ["#b5653b", "#c4774a", "#9c5434"];

export interface CampProps {
  geo: THREE.BufferGeometry;
  /** Spots on the apacheta where added stones go (local, y relative to the summit center). */
  cairnSlots: THREE.Vector3[];
  /** Height of the pot's mouth over the stove (local y). */
  potTop: number;
  /** Ground under the fire and the stove (local y). */
  fireY: number;
  stoveY: number;
  /** Seat top heights (local y, per seat). */
  seatY: number[];
}

/** `gy(lx, lz)`: ground height in the summit-local frame (relative to the summit center). */
export function buildCampProps(gy: (x: number, z: number) => number, travellers: number): CampProps {
  const s = new Static();
  const P = s.P;
  const p = s.p;
  const R = rng(4242);
  const m = new THREE.Matrix4();

  // ------------------------------------------------ hearth and seats
  const fireY = gy(FIRE.x, FIRE.z);
  hearth(s, m.makeTranslation(FIRE.x, fireY, FIRE.z));
  // A few spare sticks by the fire.
  for (let i = 0; i < 3; i++)
    p.add(
      P.cyl6,
      WOOD_D,
      FIRE.x + 0.85,
      fireY + 0.04 + i * 0.05,
      FIRE.z - 0.65 + i * 0.05,
      Math.PI / 2,
      0.6 + i * 0.3,
      0,
      0.035,
      0.7,
      0.035,
    );
  const seatY: number[] = [];
  SEATS.slice(0, travellers).forEach((seat, i) => {
    const x = FIRE.x + Math.cos(seat.a) * seat.r;
    const z = FIRE.z + Math.sin(seat.a) * seat.r;
    const g = gy(x, z);
    const face = Math.atan2(FIRE.x - x, FIRE.z - z);
    if (seat.seat === "stone") {
      p.add(P.lowSph, STONES[i % STONES.length] as string, x, g + 0.1, z, 0, face, 0, 0.34, 0.2, 0.28);
      p.add(P.box, DYE.red, x, g + 0.235, z, 0, face, 0, 0.36, 0.025, 0.3); // a folded lliclla to sit on
      p.add(P.box, DYE.ochre, x, g + 0.25, z, 0, face, 0, 0.36, 0.008, 0.06);
      seatY.push(g + 0.25);
    } else {
      // Manta (woven blanket) on the grass, stripes across.
      p.add(P.box, DYE.indigo, x, g + 0.015, z, 0, face, 0, 1.0, 0.03, 0.78);
      for (const [j, k] of [-0.36, -0.12, 0.12, 0.36].entries())
        p.add(
          P.box,
          j % 3 ? DYE.cotton : DYE.ochre,
          x + Math.cos(face) * k,
          g + 0.032,
          z - Math.sin(face) * k,
          0,
          face,
          0,
          0.06,
          0.008,
          0.79,
        );
      seatY.push(g + 0.03);
    }
    // Their q'ipi (load wrapped in a lliclla) set down behind them, and one walking staff.
    const bx = x - Math.sin(face) * 0.75 + Math.cos(face) * 0.35;
    const bz = z - Math.cos(face) * 0.75 - Math.sin(face) * 0.35;
    const bg = gy(bx, bz);
    const cloth = [DYE.red, DYE.turq, "#c2456b"][i % 3] as string;
    p.add(P.box, cloth, bx, bg + 0.17, bz, 0, face + 0.4, 0, 0.46, 0.32, 0.3);
    const f = face + 0.4;
    for (const sd of [-1, 1])
      p.add(
        P.cap,
        cloth,
        bx + Math.cos(f) * 0.23 * sd,
        bg + 0.17,
        bz - Math.sin(f) * 0.23 * sd,
        0,
        f,
        Math.PI / 2,
        0.15,
        0.06,
        0.15,
      );
    p.add(P.box, DYE.cotton, bx, bg + 0.17, bz, 0, face + 0.4, 0, 0.47, 0.03, 0.31);
    p.add(P.box, DYE.ochre, bx, bg + 0.25, bz, 0, face + 0.4, 0, 0.47, 0.03, 0.31);
    if (i === 0) p.add(P.cyl6, WOOD, bx + 0.3, bg + 0.03, bz + 0.2, Math.PI / 2, face, 0, 0.022, 1.5, 0.022);
  });

  // ------------------------------------------------ apacheta
  const ay = gy(APACHETA.x, APACHETA.z);
  const layers = [
    { r: 0.62, y: 0.1, s: 0.16 },
    { r: 0.48, y: 0.27, s: 0.15 },
    { r: 0.35, y: 0.43, s: 0.14 },
    { r: 0.22, y: 0.58, s: 0.12 },
    { r: 0.1, y: 0.72, s: 0.11 },
  ];
  for (const [li, L] of layers.entries()) {
    const n = Math.max(3, Math.round((Math.PI * 2 * L.r) / (L.s * 1.6)));
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + li * 0.5;
      const sc = L.s * (0.85 + R() * 0.35);
      p.add(
        P.lowSph,
        STONES[(k + li) % STONES.length] as string,
        APACHETA.x + Math.cos(a) * L.r,
        ay + L.y,
        APACHETA.z + Math.sin(a) * L.r,
        R() * 3,
        R() * 3,
        R() * 3,
        sc * 1.15,
        sc * 0.85,
        sc,
      );
    }
    // Core so the cairn reads solid between stones.
    p.add(P.ico, "#8f877b", APACHETA.x, ay + L.y, APACHETA.z, 0, li, 0, L.r * 0.9, 0.12, L.r * 0.9);
  }
  p.add(P.lowSph, "#b9b1a3", APACHETA.x, ay + 0.86, APACHETA.z, 0.3, 0.2, 0, 0.1, 0.12, 0.09);
  // Loose stones at the foot.
  for (let k = 0; k < 7; k++) {
    const a = R() * Math.PI * 2;
    const r = 0.8 + R() * 0.4;
    const x = APACHETA.x + Math.cos(a) * r;
    const z = APACHETA.z + Math.sin(a) * r;
    p.add(P.lowSph, STONES[k % STONES.length] as string, x, gy(x, z) + 0.03, z, R(), R(), 0, 0.09, 0.06, 0.08);
  }
  const cairnSlots: THREE.Vector3[] = [];
  for (let k = 0; k < 8; k++) {
    const L = layers[2 + (k % 3)] as (typeof layers)[number];
    const a = k * 2.4;
    cairnSlots.push(
      new THREE.Vector3(
        APACHETA.x + Math.cos(a) * L.r * 0.9,
        ay + L.y + L.s * 0.75,
        APACHETA.z + Math.sin(a) * L.r * 0.9,
      ),
    );
  }

  // ------------------------------------------------ api stall (faces +x, the plaza)
  const sy = gy(STALL.x, STALL.z);
  const leg = (x: number, z: number, top: number) => {
    const g = gy(x, z);
    p.add(P.box, WOOD, x, (g + top) / 2 - 0.05, z, 0, 0, 0, 0.05, top - g + 0.1, 0.05);
  };
  const th = sy + 0.66;
  for (const dx of [-0.24, 0.24]) for (const dz of [-0.5, 0.5]) leg(STALL.x + dx, STALL.z + dz, th);
  p.add(P.box, WOOD, STALL.x, th, STALL.z, 0, 0, 0, 0.58, 0.04, 1.14);
  // Woven cloth over the table, hanging down the front.
  p.add(P.box, DYE.red, STALL.x, th + 0.025, STALL.z, 0, 0, 0, 0.6, 0.012, 1.16);
  p.add(P.box, DYE.red, STALL.x + 0.3, th - 0.12, STALL.z, 0, 0, 0, 0.012, 0.26, 1.16);
  for (const [dy, c] of [
    [-0.03, DYE.ochre],
    [-0.1, DYE.cotton],
    [-0.17, DYE.turq],
  ] as const)
    p.add(P.box, c, STALL.x + 0.307, th + dy, STALL.z, 0, 0, 0, 0.006, 0.025, 1.16);
  // Cups set out in two rows, a clay jug and a basket of bread (t'anta wawa season or not, there is bread).
  for (let i = 0; i < 6; i++) {
    const x = STALL.x + (i % 2 ? 0.12 : -0.02);
    const z = STALL.z - 0.42 + Math.floor(i / 2) * 0.17 + (i % 2) * 0.08;
    p.add(P.cyl, CLAY[i % 3] as string, x, th + 0.085, z, 0, 0, 0, 0.05, 0.1, 0.045);
    p.add(P.cyl, DYE.cotton, x, th + 0.115, z, 0, 0, 0, 0.052, 0.015, 0.047);
  }
  p.add(P.sph, "#a85e38", STALL.x - 0.08, th + 0.17, STALL.z + 0.18, 0, 0, 0, 0.12, 0.14, 0.12);
  p.add(P.cyl, "#a85e38", STALL.x - 0.08, th + 0.31, STALL.z + 0.18, 0, 0, 0, 0.05, 0.08, 0.05);
  p.add(P.cyl, DYE.cotton, STALL.x - 0.08, th + 0.18, STALL.z + 0.18, 0, 0, 0, 0.122, 0.03, 0.122);
  p.add(P.flare, "#c99a55", STALL.x + 0.05, th + 0.08, STALL.z + 0.42, Math.PI, 0, 0, 0.15, 0.1, 0.13);
  for (let i = 0; i < 4; i++)
    p.add(
      P.cap,
      "#d9a35b",
      STALL.x + 0.02 + (i % 2) * 0.07,
      th + 0.15,
      STALL.z + 0.38 + (i >> 1) * 0.08,
      Math.PI / 2,
      0.3,
      0,
      0.035,
      0.07,
      0.035,
    );
  // Cotton shade on four thin poles, sloping toward the front.
  const shadeH = 1.75;
  const pole = (x: number, z: number, h: number) => {
    const g = gy(x, z);
    p.add(P.cyl6, WOOD_D, x, (g + sy + h) / 2, z, 0, 0, 0, 0.025, sy + h - g, 0.025);
  };
  for (const dz of [-0.75, 0.75]) {
    pole(STALL.x - 0.95, STALL.z + dz, shadeH + 0.15);
    pole(STALL.x + 0.45, STALL.z + dz, shadeH - 0.1);
  }
  const slope = Math.atan2(0.25, 1.4);
  const sx = STALL.x - 0.25;
  p.add(P.box, DYE.cotton, sx, sy + shadeH + 0.03, STALL.z, 0, 0, -slope, 1.6, 0.03, 1.7);
  for (const dz of [-0.6, -0.2, 0.2, 0.6])
    p.add(P.box, DYE.ochre, sx, sy + shadeH + 0.05, STALL.z + dz, 0, 0, -slope, 1.61, 0.01, 0.1);
  for (let k = -3; k <= 3; k++)
    p.add(
      P.box,
      k % 2 ? DYE.cotton : DYE.red,
      STALL.x + 0.56,
      sy + shadeH - 0.2,
      STALL.z + k * 0.24,
      0,
      0,
      0,
      0.02,
      0.12,
      0.22,
    );

  // Q'uncha: three stones under the big pot, ash, a woodpile; a sack of purple maize by the vendor.
  const ky = gy(STOVE.x, STOVE.z);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    p.add(
      P.lowSph,
      STONES[k] as string,
      STOVE.x + Math.cos(a) * 0.26,
      ky + 0.1,
      STOVE.z + Math.sin(a) * 0.26,
      a,
      a,
      0,
      0.13,
      0.15,
      0.12,
    );
  }
  p.add(P.sph, "#3b2c25", STOVE.x, ky + 0.01, STOVE.z, 0, 0, 0, 0.3, 0.02, 0.3);
  const potC = ky + 0.42;
  p.add(P.sph, "#8e4a2c", STOVE.x, potC, STOVE.z, 0, 0, 0, 0.27, 0.24, 0.27);
  p.add(P.cyl, "#9c5434", STOVE.x, potC + 0.22, STOVE.z, 0, 0, 0, 0.19, 0.08, 0.19);
  p.add(P.torus, "#9c5434", STOVE.x, potC + 0.26, STOVE.z, Math.PI / 2, 0, 0, 0.19, 0.19, 0.19);
  p.add(P.cyl, "#5b2a4e", STOVE.x, potC + 0.255, STOVE.z, 0, 0, 0, 0.175, 0.01, 0.175);
  p.add(P.cyl, "#2a1d17", STOVE.x, potC - 0.04, STOVE.z, 0, 0, 0, 0.272, 0.05, 0.272); // soot band
  for (const sd of [-1, 1])
    p.add(P.torus, "#8e4a2c", STOVE.x + sd * 0.26, potC + 0.1, STOVE.z, 0, 0, Math.PI / 2, 0.06, 0.06, 0.06);
  for (let i = 0; i < 4; i++)
    p.add(
      P.cyl6,
      WOOD_D,
      STOVE.x - 0.55 + (i % 2) * 0.06,
      ky + 0.04 + (i >> 1) * 0.07,
      STOVE.z - 0.25,
      Math.PI / 2,
      0.1,
      Math.PI / 2,
      0.035,
      0.6,
      0.035,
    );
  const sackX = STALL.x - 0.7;
  const sackZ = STALL.z + 0.8;
  const sg = gy(sackX, sackZ);
  p.add(P.ico, "#d8cbb4", sackX, sg + 0.24, sackZ, 0, 0, 0, 0.22, 0.26, 0.2);
  p.add(P.cyl, "#5b2a4e", sackX, sg + 0.47, sackZ, 0, 0, 0, 0.12, 0.05, 0.12);
  for (let i = 0; i < 4; i++)
    p.add(P.cap, "#4a2142", sackX + 0.3, sg + 0.05, sackZ - 0.1 + i * 0.07, Math.PI / 2, 0.2 * i, 0, 0.04, 0.11, 0.04);

  return { geo: s.build(), cairnSlots, potTop: potC + 0.27, fireY, stoveY: ky, seatY };
}
