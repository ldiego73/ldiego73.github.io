import * as THREE from "three";
import type { Avatar, CreateAvatar, WorldEnv } from "./contract";
import { on, type SitPose } from "./events";
import { C, canvasTex, DYE, toonMapped } from "./props";

/**
 * Generic traveler (not a real person), dressed per world (`outfit`):
 *  - "andean" (mountain, Qusqu; default): chullo with ear flaps and pompom, poncho with khipu dye stripes, long pants.
 *  - "explorer" (Antisuyu jungle): wide-brim explorer hat, short-sleeved polo, bandana, belted shorts, socks.
 *  - "beach" (Chinchaysuyu coast): woven straw hat, sunglasses, open flower-print shirt over a white tee, board
 *    shorts, sandals.
 *  - "altiplano" (Collasuyu lake): brown felt hat with a band, knitted alpaca chompa (sweater), chalina (scarf),
 *    long trousers.
 *  - "trek" (Kuntisuyu canyon): cap with a neck flap, two-tone zipped windbreaker, cargo trousers, hiking boots.
 * All carry the backpack with a laptop edge peeking out. Chunky, Messenger-like proportions.
 * Origin at the feet, facing +Z (core sets group.rotation.y = yaw). About 1.6 units tall.
 * All motion is procedural: idle breathing + look-around, walk/run cycles, jump, landing squash, dust.
 * Riding (`world:mount`): legs straddle the saddle, hands on the reins, no walk cycle, a light bob with speed.
 * Seated (`world:sit`, ./seat.ts): knees bent, hands on the knees ("bench") or typing on a keyboard ("desk").
 */

const SKIN = "#b9764a";
const PANTS = "#2f3557";
const BOOT = "#4a2e1c";
const SWEATER = "#7a2f35";
const PACK = "#6b4a2b";
// Explorer outfit (jungle): light cotton polo, khaki shorts, a tan felt hat with a leather band.
const POLO = "#e6dcc2";
const POLO_TRIM = "#4f7a62";
const SHORTS = "#a88d5c";
const BELT = "#5a3b24";
const HAT = "#c7a96f";
const HAT_BAND = "#5a3b24";
const HAIR = "#2b1d15";
// Beach outfit (coast): teal flower-print shirt open over a cotton tee, navy board shorts, leather sandals.
const SHIRT = "#2a8f86";
const BOARD = "#2c4a7a";
const SANDAL = "#6b4026";
const SHADES = "#1c1d24";
const STRAW_BAND = "#3446a6";
// Altiplano outfit (lake): natural brown alpaca knit, red chalina, dark felt hat, charcoal trousers.
const KNIT = "#8a6f58";
const FELT = "#3f2c21";
const TROUSERS = "#3a3a44";
// Trek outfit (canyon): rust windbreaker with a slate yoke, khaki cap, olive-grey cargo trousers.
const JACKET = "#c8572f";
const YOKE = "#2f4858";
const CAP = "#cbb88f";
const CARGO = "#6d6a52";
const SOLE = "#2a2420";

export type Outfit = "andean" | "explorer" | "beach" | "altiplano" | "trek";

/** Leg colour (thighs and shins): trousers, or bare skin under shorts. */
const LEGS: Record<Outfit, string> = {
  andean: PANTS,
  explorer: SKIN,
  beach: SKIN,
  altiplano: TROUSERS,
  trek: CARGO,
};

function ponchoTexture() {
  return canvasTex(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#e9dcc4";
    ctx.fillRect(0, 0, w, h);
    // Khipu dye bands, top (v=1) at the shoulders → bottom hem.
    const bands: Array<[number, string, number]> = [
      [0.12, DYE.red, 10],
      [0.24, DYE.ochre, 5],
      [0.55, DYE.indigo, 12],
      [0.7, DYE.turq, 5],
      [0.8, DYE.red, 7],
      [0.9, DYE.indigo, 12],
    ];
    for (const [y, c, th] of bands) {
      ctx.fillStyle = c;
      ctx.fillRect(0, y * h, w, th);
    }
    // Knot-like diamonds between the bands (pallay motif).
    ctx.fillStyle = "#2b2140";
    for (let x = 10; x < w; x += 21) {
      const y = 0.42 * h;
      ctx.beginPath();
      ctx.moveTo(x, y - 7);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 7);
      ctx.lineTo(x - 6, y);
      ctx.fill();
    }
    ctx.fillStyle = DYE.ochre;
    for (let x = 10; x < w; x += 21) ctx.fillRect(x - 2, 0.42 * h - 2, 4, 4);
  });
}

function chulloTexture() {
  return canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = DYE.red;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.cotton;
    ctx.fillRect(0, h * 0.62, w, 6);
    ctx.fillRect(0, h * 0.3, w, 3);
    ctx.fillStyle = DYE.ochre;
    for (let x = 0; x < w; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.62 + 12);
      ctx.lineTo(x + 6, h * 0.62 + 20);
      ctx.lineTo(x + 12, h * 0.62 + 12);
      ctx.fill();
    }
    ctx.fillStyle = DYE.indigo;
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = DYE.turq;
    for (let x = 4; x < w; x += 16) ctx.fillRect(x, h * 0.4, 6, 6);
  });
}

/** Teal shirt with a hibiscus-and-leaf print (the beach outfit's open shirt and short sleeves). */
function floralTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = SHIRT;
    ctx.fillRect(0, 0, w, h);
    // Fixed scatter (no Math.random: the print is the same on every visit). Leaves first, flowers on top.
    const spots: Array<[number, number, string]> = [
      [18, 20, DYE.cotton],
      [70, 14, DYE.ochre],
      [112, 40, DYE.cotton],
      [44, 56, "#e2675f"],
      [92, 78, DYE.cotton],
      [20, 92, DYE.ochre],
      [62, 108, "#e2675f"],
      [110, 112, DYE.ochre],
    ];
    ctx.fillStyle = "#1d6b5e";
    for (const [x, y] of spots) {
      ctx.beginPath();
      ctx.ellipse(x + 9, y + 6, 9, 4, 0.6, 0, Math.PI * 2);
      ctx.ellipse(x - 8, y + 7, 8, 3.5, -0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const [x, y, c] of spots) {
      ctx.fillStyle = c;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(x + Math.cos(a) * 5, y + Math.sin(a) * 5, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#7a2f35";
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Woven straw (beach hat): warm straw with a darker over-under weave grid. */
function strawTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = C.straw;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = C.strawDark;
    for (let y = 0; y < h; y += 8)
      for (let x = 0; x < w; x += 8) {
        // Alternate horizontal and vertical stitches like a basket weave.
        if (((x + y) / 8) % 2 === 0) ctx.fillRect(x + 1, y + 3, 6, 2);
        else ctx.fillRect(x + 3, y + 1, 2, 6);
      }
  });
}

/**
 * Alpaca chompa knit (altiplano sweater and sleeves). Top of the canvas (v=1) is the shoulders: a cream yoke with
 * red zigzags and indigo diamonds, plain brown knit with V-stitches in the middle, ribbing at the hem (and cuffs).
 */
function knitTexture() {
  return canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = KNIT;
    ctx.fillRect(0, 0, w, h);
    // V-stitch texture all over (subtle, a shade darker).
    ctx.strokeStyle = "#76604b";
    ctx.lineWidth = 1.2;
    for (let y = 2; y < h; y += 6)
      for (let x = 0; x < w; x += 6) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 3, y + 3);
        ctx.lineTo(x + 6, y);
        ctx.stroke();
      }
    // Yoke band.
    ctx.fillStyle = "#e9dcc4";
    ctx.fillRect(0, h * 0.1, w, h * 0.26);
    ctx.fillStyle = DYE.red;
    for (let x = 0; x < w; x += 16) {
      ctx.beginPath();
      ctx.moveTo(x, h * 0.16);
      ctx.lineTo(x + 8, h * 0.12);
      ctx.lineTo(x + 16, h * 0.16);
      ctx.lineTo(x + 16, h * 0.19);
      ctx.lineTo(x + 8, h * 0.15);
      ctx.lineTo(x, h * 0.19);
      ctx.fill();
    }
    ctx.fillStyle = DYE.indigo;
    for (let x = 8; x < w; x += 16) {
      const y = h * 0.28;
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 6, y);
      ctx.fill();
    }
    ctx.fillStyle = DYE.red;
    ctx.fillRect(0, h * 0.36, w, 3);
    ctx.fillRect(0, h * 0.1, w, 3);
    // Second thin band at mid-chest, then the ribbed hem.
    ctx.fillStyle = "#e9dcc4";
    ctx.fillRect(0, h * 0.6, w, 5);
    ctx.fillStyle = "#5c4636";
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = "#4a382b";
    for (let x = 0; x < w; x += 4) ctx.fillRect(x, h * 0.86, 2, h * 0.14);
  });
}

/** Tiny critically-damped spring for secondary motion (tassels, pompom, poncho). */
class Spring {
  x = 0;
  v = 0;
  constructor(
    private k = 90,
    private d = 9,
  ) {}
  step(target: number, dt: number) {
    const a = -this.k * (this.x - target) - this.d * this.v;
    this.v += a * dt;
    this.x += this.v * dt;
    return this.x;
  }
}

/**
 * `outfit` is an optional extra argument (still assignable to CreateAvatar): the mountain loader calls
 * `createAvatar(env)` and gets the Andean traveler; the jungle page passes "explorer".
 */
export function createAvatar(env: WorldEnv, outfit: Outfit = "andean"): Avatar {
  const andean = outfit === "andean";
  const explorer = outfit === "explorer";
  const beach = outfit === "beach";
  const altiplano = outfit === "altiplano";
  const trek = outfit === "trek";
  /** Shorts over bare legs (jungle, coast); everyone else wears long trousers. */
  const shorts = explorer || beach;
  const group = new THREE.Group();
  group.name = "traveler";
  const geos: THREE.BufferGeometry[] = [];
  const owned: THREE.Material[] = [];
  const texs: THREE.Texture[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => {
    geos.push(x);
    return x;
  };
  /** Owned toon material over a canvas texture repeated `rx` times around (disposed with the avatar). */
  const mapped = (tex: THREE.CanvasTexture, rx: number, ry = 1) => {
    tex.wrapS = THREE.RepeatWrapping;
    if (ry !== 1) tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    texs.push(tex);
    const m = toonMapped(env, tex);
    owned.push(m);
    return m;
  };
  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };
  const toon = (c: string) => env.toon(c);

  // Rig: rig (bob/squash) → hips → legs; torso → arms, poncho, pack, head.
  const rig = new THREE.Group();
  group.add(rig);

  // ---- Legs (pivot at hip)
  // Thigh + shin (knee pivot, straight unless seated): the two capsules overlap into one leg while walking.
  const thighGeo = g(new THREE.CapsuleGeometry(0.085, 0.12, 3, 8));
  const shinGeo = g(new THREE.CapsuleGeometry(0.085, 0.07, 3, 8));
  const bootGeo = g(new THREE.BoxGeometry(0.15, 0.11, 0.24));
  const cuffGeo = g(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 8));
  const shortsGeo = explorer ? g(new THREE.CapsuleGeometry(0.1, 0.07, 3, 8)) : null;
  const sockGeo = explorer ? g(new THREE.CylinderGeometry(0.09, 0.088, 0.11, 8)) : null;
  // Beach: longer board shorts (to the knee) with a white side stripe; sandals = sole + bare foot + straps.
  const boardGeo = beach ? g(new THREE.CapsuleGeometry(0.105, 0.1, 3, 8)) : null;
  const stripeGeo = beach ? g(new THREE.BoxGeometry(0.012, 0.2, 0.04)) : null;
  const soleGeo = beach || trek ? g(new THREE.BoxGeometry(0.155, 0.03, 0.25)) : null;
  const footGeo = beach ? g(new THREE.BoxGeometry(0.12, 0.07, 0.2)) : null;
  const strapGeo = beach ? g(new THREE.BoxGeometry(0.135, 0.025, 0.035)) : null;
  // Trek: cargo pocket on the outer thigh.
  const pocketGeo = trek ? g(new THREE.BoxGeometry(0.035, 0.1, 0.1)) : null;
  const KNEE = 0.25;
  const knees: THREE.Group[] = [];
  const makeLeg = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.105 * side, 0.56, 0);
    pivot.add(mesh(thighGeo, toon(LEGS[outfit]), 0, -0.145, 0));
    // Shorts leg: a wider khaki capsule over the top of the thigh, ending above the knee.
    if (explorer) pivot.add(mesh(shortsGeo!, toon(SHORTS), 0, -0.1, 0));
    if (beach) {
      pivot.add(mesh(boardGeo!, toon(BOARD), 0, -0.11, 0));
      const stripe = mesh(stripeGeo!, toon(C.cotton), 0.104 * side, -0.11, 0);
      env.noOutline(stripe);
      pivot.add(stripe);
    }
    if (trek) pivot.add(mesh(pocketGeo!, toon(CARGO), 0.09 * side, -0.19, 0.005));
    const knee = new THREE.Group();
    knee.position.y = -KNEE;
    knee.add(mesh(shinGeo, toon(LEGS[outfit]), 0, -0.12, 0));
    if (beach) {
      // Sandal: leather sole under a bare foot, a strap across the instep and one around the ankle.
      knee.add(mesh(soleGeo!, toon(SANDAL), 0, -0.545 + KNEE, 0.035));
      knee.add(mesh(footGeo!, toon(SKIN), 0, -0.495 + KNEE, 0.04));
      const strap = mesh(strapGeo!, toon(SANDAL), 0, -0.47 + KNEE, 0.085);
      strap.rotation.x = 0.35;
      knee.add(strap);
      knee.add(mesh(strapGeo!, toon(SANDAL), 0, -0.47 + KNEE, -0.04));
    } else {
      knee.add(mesh(bootGeo, toon(BOOT), 0, -0.5 + KNEE, 0.035));
      // Hiking boots: a dark lugged sole under the boot.
      if (trek) knee.add(mesh(soleGeo!, toon(SOLE), 0, -0.545 + KNEE, 0.035));
    }
    // Sandal strap/sock cuff in cotton (the explorer wears taller hiking socks). The trekker's cuff is a wool
    // sock in rust; the beach traveler has none.
    if (explorer) knee.add(mesh(sockGeo!, toon(C.cotton), 0, -0.39 + KNEE, 0));
    else if (trek) knee.add(mesh(cuffGeo, toon(JACKET), 0, -0.42 + KNEE, 0));
    else if (!beach) knee.add(mesh(cuffGeo, toon(C.cotton), 0, -0.42 + KNEE, 0));
    pivot.add(knee);
    knees.push(knee);
    rig.add(pivot);
    return pivot;
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  // ---- Torso
  const torso = new THREE.Group();
  torso.position.y = 0.56;
  rig.add(torso);
  // The altiplano chompa shares one knit material between the body and the sleeves.
  const knitMat = altiplano ? mapped(knitTexture(), 3) : null;
  const floralMat = beach ? mapped(floralTexture(), 2) : null;
  const top = { andean: SWEATER, explorer: POLO, beach: C.cotton, altiplano: SWEATER, trek: JACKET }[outfit];
  const chest = mesh(g(new THREE.CylinderGeometry(0.19, 0.17, 0.48, 10)), knitMat ?? toon(top), 0, 0.24, 0);
  torso.add(chest);

  // Andean: poncho (pivot at the shoulders, hangs over the chest; striped cloth) + neck opening collar.
  // Explorer: polo collar and placket, a knotted bandana, shorts waist and belt.
  let poncho: THREE.Mesh | null = null;
  if (andean) {
    const ponchoMat = mapped(ponchoTexture(), 2);
    const ponchoGeo = g(new THREE.CylinderGeometry(0.17, 0.4, 0.46, 12, 1));
    ponchoGeo.translate(0, -0.23, 0);
    // Slightly square the poncho (a cloth rectangle draped over the shoulders).
    {
      const p = ponchoGeo.getAttribute("position");
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i);
        const z = p.getZ(i);
        p.setXYZ(i, x * 1.08, p.getY(i), z * 0.86);
      }
      ponchoGeo.computeVertexNormals();
    }
    poncho = mesh(ponchoGeo, ponchoMat, 0, 0.5, 0);
    torso.add(poncho);
    torso.add(mesh(g(new THREE.TorusGeometry(0.11, 0.035, 5, 10)), toon(DYE.indigo), 0, 0.5, 0).rotateX(Math.PI / 2));
  } else if (explorer) {
    // Polo collar (thin trim ring) and a red bandana triangle hanging on the chest. No red ring at the chin:
    // from the follow camera's height it reads as lips.
    torso.add(mesh(g(new THREE.TorusGeometry(0.125, 0.02, 4, 12)), toon(POLO_TRIM), 0, 0.475, 0).rotateX(Math.PI / 2));
    // Three-sided cone, apex down, flattened front-to-back: a cloth triangle whose flat face is the front.
    const bibGeo = g(new THREE.ConeGeometry(0.11, 0.16, 3));
    bibGeo.rotateX(Math.PI);
    bibGeo.scale(1, 1, 0.25);
    const bib = mesh(bibGeo, toon(DYE.red), 0, 0.4, 0.2);
    bib.rotation.x = 0.05;
    torso.add(bib);
    // Polo placket (two buttons' worth of trim) below the bandana.
    const placket = mesh(g(new THREE.BoxGeometry(0.05, 0.1, 0.02)), toon(POLO_TRIM), 0, 0.31, 0.175);
    placket.rotation.x = -0.05;
    env.noOutline(placket);
    torso.add(placket);
    // Shorts waist (the polo tucked in) and a leather belt with a brass buckle.
    torso.add(mesh(g(new THREE.CylinderGeometry(0.176, 0.185, 0.12, 10)), toon(SHORTS), 0, 0.04, 0));
    torso.add(mesh(g(new THREE.CylinderGeometry(0.182, 0.182, 0.04, 10)), toon(BELT), 0, 0.1, 0));
    const buckle = mesh(g(new THREE.BoxGeometry(0.06, 0.045, 0.02)), toon(DYE.ochre), 0, 0.1, 0.18);
    env.noOutline(buckle);
    torso.add(buckle);
  } else if (beach) {
    // Shirt worn open over the tee: a cylinder a little wider than the chest with a gap down the front
    // (theta 0 is +Z). Child of the chest so it breathes with it; double-sided so the inner edges read as cloth.
    floralMat!.side = THREE.DoubleSide;
    const OPEN = 0.42;
    const shirt = mesh(
      g(new THREE.CylinderGeometry(0.2, 0.183, 0.44, 12, 1, true, OPEN, Math.PI * 2 - OPEN * 2)),
      floralMat!,
      0,
      -0.01,
      0,
    );
    chest.add(shirt);
    // Collar points folded out at the neck.
    const lapelGeo = g(new THREE.BoxGeometry(0.075, 0.1, 0.015));
    for (const s of [-1, 1]) {
      const lapel = mesh(lapelGeo, floralMat!, 0.075 * s, 0.43, 0.165);
      lapel.rotation.set(-0.25, 0.35 * s, -0.55 * s);
      torso.add(lapel);
    }
    // Board shorts waist under the tee hem.
    torso.add(mesh(g(new THREE.CylinderGeometry(0.176, 0.185, 0.12, 10)), toon(BOARD), 0, 0.04, 0));
  } else if (altiplano) {
    // Chalina: a red wool ring around the neck with both ends hanging down the front, ochre stripe, cream fringe.
    torso.add(mesh(g(new THREE.TorusGeometry(0.13, 0.05, 6, 12)), toon(DYE.red), 0, 0.48, 0).rotateX(Math.PI / 2));
    const tailGeo = g(new THREE.BoxGeometry(0.08, 0.26, 0.035));
    const bandGeo = g(new THREE.BoxGeometry(0.082, 0.025, 0.037));
    const fringeGeo = g(new THREE.BoxGeometry(0.07, 0.035, 0.02));
    for (const [x, len, z, rz] of [
      [0.08, 1, 0.19, 0.06],
      [0.0, 0.8, 0.185, -0.05],
    ] as const) {
      const tail = new THREE.Group();
      tail.position.set(x, 0.47, z);
      tail.rotation.set(0.1, 0, rz);
      tail.scale.y = len;
      tail.add(mesh(tailGeo, toon(DYE.red), 0, -0.13, 0));
      const band = mesh(bandGeo, toon(DYE.ochre), 0, -0.2, 0);
      env.noOutline(band);
      tail.add(band);
      const fringe = mesh(fringeGeo, toon(C.cotton), 0, -0.275, 0);
      env.noOutline(fringe);
      tail.add(fringe);
      torso.add(tail);
    }
  } else if (trek) {
    // Windbreaker: slate yoke across the shoulders, stand-up collar, elastic hem and a zip line down the front.
    chest.add(mesh(g(new THREE.CylinderGeometry(0.197, 0.192, 0.16, 10)), toon(YOKE), 0, 0.16, 0));
    torso.add(mesh(g(new THREE.CylinderGeometry(0.125, 0.135, 0.08, 12)), toon(YOKE), 0, 0.5, 0));
    torso.add(mesh(g(new THREE.CylinderGeometry(0.176, 0.178, 0.05, 10)), toon(YOKE), 0, 0.025, 0));
    // The chest tapers 0.19 → 0.17 over 0.48: tilt the zip by that slope so it lies on the cloth.
    const zip = mesh(g(new THREE.BoxGeometry(0.014, 0.46, 0.024)), toon(SOLE), 0, 0, 0.18);
    zip.rotation.x = Math.atan2(0.02, 0.48);
    env.noOutline(zip);
    chest.add(zip);
  }

  // Arms (pivot at shoulder), sleeves + hands.
  const armGeo = g(new THREE.CapsuleGeometry(0.065, 0.26, 3, 8));
  const handGeo = g(new THREE.SphereGeometry(0.07, 8, 6));
  const sleeveGeo = shorts ? g(new THREE.CapsuleGeometry(beach ? 0.084 : 0.078, 0.07, 3, 8)) : null;
  const forearmGeo = shorts ? g(new THREE.CapsuleGeometry(0.058, 0.17, 3, 8)) : null;
  const cuffArmGeo = trek ? g(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 8)) : null;
  const makeArm = (side: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0.25 * side, 0.43, 0);
    if (shorts) {
      // Short sleeve (polo, or the open print shirt) over a bare forearm.
      pivot.add(mesh(sleeveGeo!, floralMat ?? toon(POLO), 0, -0.07, 0));
      pivot.add(mesh(forearmGeo!, toon(SKIN), 0, -0.21, 0));
    } else pivot.add(mesh(armGeo, knitMat ?? toon(top), 0, -0.17, 0));
    if (trek) pivot.add(mesh(cuffArmGeo!, toon(YOKE), 0, -0.3, 0));
    pivot.add(mesh(handGeo, toon(SKIN), 0, -0.36, 0.01));
    torso.add(pivot);
    return pivot;
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // Backpack with a laptop edge peeking out the top.
  const pack = new THREE.Group();
  pack.position.set(0, 0.28, -0.25);
  pack.add(mesh(g(new THREE.BoxGeometry(0.36, 0.38, 0.18)), toon(PACK), 0, 0, 0));
  pack.add(mesh(g(new THREE.BoxGeometry(0.37, 0.12, 0.2)), toon(DYE.ochre), 0, 0.15, 0.005)); // flap
  pack.add(mesh(g(new THREE.BoxGeometry(0.22, 0.12, 0.05)), toon(PACK), 0, -0.07, -0.1)); // pocket
  const laptop = mesh(g(new THREE.BoxGeometry(0.3, 0.22, 0.025)), toon("#3d4046"), 0.01, 0.16, 0.05);
  laptop.rotation.z = -0.06;
  pack.add(laptop);
  const lid = mesh(g(new THREE.BoxGeometry(0.26, 0.015, 0.012)), toon("#9fd7d0"), 0.01, 0.27, 0.064);
  lid.rotation.z = -0.06;
  pack.add(lid);
  // Straps
  for (const s of [-1, 1]) pack.add(mesh(g(new THREE.BoxGeometry(0.045, 0.42, 0.03)), toon(PACK), 0.11 * s, 0.02, 0.1));
  // Bedroll in cotton.
  const roll = mesh(g(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8)), toon(DYE.turq), 0, -0.22, 0.02);
  roll.rotation.z = Math.PI / 2;
  pack.add(roll);
  torso.add(pack);

  // ---- Head
  const head = new THREE.Group();
  head.position.y = 0.6;
  torso.add(head);
  const skull = mesh(g(new THREE.SphereGeometry(0.235, 14, 10)), toon(SKIN), 0, 0.2, 0);
  skull.scale.set(1, 0.98, 0.94);
  head.add(skull);
  const eyeGeo = g(new THREE.SphereGeometry(0.028, 6, 5));
  const eyeL = mesh(eyeGeo, toon(C.ink), 0.085, 0.13, 0.215);
  const eyeR = mesh(eyeGeo, toon(C.ink), -0.085, 0.13, 0.215);
  env.noOutline(eyeL);
  env.noOutline(eyeR);
  eyeL.scale.set(1, 1.3, 0.5);
  eyeR.scale.set(1, 1.3, 0.5);
  head.add(eyeL, eyeR);
  const cheekGeo = g(new THREE.SphereGeometry(0.035, 6, 5));
  for (const s of [-1, 1]) {
    const ck = mesh(cheekGeo, toon("#c4565a"), 0.135 * s, 0.07, 0.19);
    ck.scale.set(1, 0.6, 0.4);
    env.noOutline(ck);
    head.add(ck);
  }
  const nose = mesh(g(new THREE.SphereGeometry(0.035, 6, 5)), toon("#a8653d"), 0, 0.08, 0.235);
  env.noOutline(nose);
  head.add(nose);

  // Headwear. Andean: chullo (knitted cap + cuff band + ear flaps with tassels + pompom). The others: hair, ears
  // and a hat (explorer felt, beach straw, altiplano felt) or the trekker's cap; the hat sits on a pivot that
  // wobbles a little with the gait (the pompom's spring).
  const tassels: THREE.Group[] = [];
  const bobPivot = new THREE.Group();
  /** How far the bob pivot follows its spring: the pompom swings freely, the hat brim only nods. */
  const bobAmp = andean ? 1 : 0.12;
  /** Resting tilt of the hat pivot (brims tipped back a touch; the cap and the chullo sit level). */
  const hatTilt = { andean: 0, explorer: -0.12, beach: -0.08, altiplano: -0.06, trek: 0 }[outfit];
  /** Trek cap's neck flap (cubrenuca): its own pivot at the cap rim, trailing behind with the tassel spring. */
  let neckFlap: THREE.Group | null = null;
  if (andean) {
    const chulloMat = mapped(chulloTexture(), 3);
    const capGeo = g(new THREE.SphereGeometry(0.255, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55));
    const cap = mesh(capGeo, chulloMat, 0, 0.25, -0.01);
    cap.scale.set(1.02, 1.12, 1.02);
    head.add(cap);
    // Pointed crown (chullos are a bit conical).
    head.add(mesh(g(new THREE.ConeGeometry(0.13, 0.16, 10)), chulloMat, 0, 0.5, -0.03));
    bobPivot.position.set(0, 0.56, -0.03);
    bobPivot.add(mesh(g(new THREE.IcosahedronGeometry(0.07, 0)), toon(DYE.ochre), 0, 0.06, 0));
    head.add(bobPivot);
    const flapGeo = g(new THREE.BoxGeometry(0.06, 0.18, 0.14));
    const tasselGeo = g(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 4));
    const tasselEndGeo = g(new THREE.IcosahedronGeometry(0.035, 0));
    for (const s of [-1, 1]) {
      const flap = mesh(flapGeo, chulloMat, 0.235 * s, 0.13, -0.01);
      flap.rotation.z = 0.12 * s;
      head.add(flap);
      const tp = new THREE.Group();
      tp.position.set(0.25 * s, 0.03, -0.01);
      tp.add(mesh(tasselGeo, toon(DYE.indigo), 0, -0.08, 0));
      tp.add(mesh(tasselEndGeo, toon(DYE.red), 0, -0.17, 0));
      head.add(tp);
      tassels.push(tp);
    }
  } else {
    // Hair: a cap of the skull sphere tilted back, so the hairline clears the eyes and covers the nape.
    const hair = mesh(
      g(new THREE.SphereGeometry(0.245, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.6)),
      toon(HAIR),
      0,
      0.2,
      -0.005,
    );
    hair.rotation.x = -0.45;
    hair.scale.set(1.01, 0.99, 0.96);
    head.add(hair);
    const earGeo = g(new THREE.SphereGeometry(0.045, 6, 5));
    for (const s of [-1, 1]) {
      const ear = mesh(earGeo, toon(SKIN), 0.232 * s, 0.13, 0);
      ear.scale.set(0.6, 1, 0.8);
      head.add(ear);
    }
    bobPivot.rotation.x = hatTilt;
    if (trek) {
      // Cap (pivot at the rim): a domed crown with a button, a visor dipping over the eyes, and the neck flap.
      bobPivot.position.set(0, 0.27, -0.005);
      const capCrown = mesh(
        g(new THREE.SphereGeometry(0.25, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        toon(CAP),
        0,
        0,
        0,
      );
      capCrown.scale.set(1, 0.85, 1);
      bobPivot.add(capCrown);
      bobPivot.add(mesh(g(new THREE.SphereGeometry(0.03, 6, 4)), toon(YOKE), 0, 0.21, 0));
      // Half disc (theta -π/2..π/2 is the +Z half) whose straight edge tucks under the crown's front.
      const visor = mesh(
        g(new THREE.CylinderGeometry(0.21, 0.21, 0.022, 12, 1, false, -Math.PI / 2, Math.PI)),
        toon(YOKE),
      );
      visor.position.set(0, 0.0, 0.15);
      visor.rotation.x = 0.24;
      bobPivot.add(visor);
      // Back arc of a flared open cylinder (theta around π is -Z), double-sided so its inside reads from the sides.
      const flapMat = env.toon(CAP).clone();
      flapMat.side = THREE.DoubleSide;
      owned.push(flapMat);
      neckFlap = new THREE.Group();
      neckFlap.position.set(0, 0.27, -0.005);
      neckFlap.add(
        mesh(
          g(new THREE.CylinderGeometry(0.252, 0.285, 0.18, 12, 1, true, Math.PI / 2 + 0.3, Math.PI - 0.6)),
          flapMat,
          0,
          -0.09,
          0,
        ),
      );
      head.add(neckFlap);
    } else {
      // Hat (pivot at the brim): flat brim, rounded crown with a pinch, a band. Explorer: wide tan felt with a
      // leather band. Beach: wider woven straw. Altiplano: narrower, taller dark felt with a red band.
      const hat = {
        explorer: { brim: 0.42, crownR: 0.2, crownH: 0.19, topY: 0.35 },
        beach: { brim: 0.47, crownR: 0.19, crownH: 0.16, topY: 0.3 },
        altiplano: { brim: 0.33, crownR: 0.19, crownH: 0.23, topY: 0.45 },
      }[outfit as "explorer" | "beach" | "altiplano"];
      const hatMat = beach ? mapped(strawTexture(), 6, 2) : toon(altiplano ? FELT : HAT);
      const bandColor = beach ? STRAW_BAND : altiplano ? DYE.red : HAT_BAND;
      bobPivot.position.set(0, 0.33, -0.01);
      bobPivot.add(mesh(g(new THREE.CylinderGeometry(hat.brim, hat.brim + 0.02, 0.03, 18)), hatMat, 0, 0, 0));
      const crown = mesh(
        g(new THREE.CylinderGeometry(hat.crownR, 0.245, hat.crownH, 14)),
        hatMat,
        0,
        hat.crownH / 2 + 0.005,
        0,
      );
      crown.scale.set(1, 1, 0.92);
      bobPivot.add(crown);
      const top = mesh(
        g(new THREE.SphereGeometry(hat.crownR, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5)),
        hatMat,
        0,
        hat.crownH,
        0,
      );
      top.scale.set(1, hat.topY, 0.92);
      bobPivot.add(top);
      const band = mesh(g(new THREE.CylinderGeometry(0.236, 0.246, 0.045, 14)), toon(bandColor), 0, 0.045, 0);
      band.scale.set(1, 1, 0.92);
      bobPivot.add(band);
    }
    head.add(bobPivot);
  }
  if (beach) {
    // Small dark sunglasses over the eyes: two lenses, a bridge and the temples back to the ears.
    const lensGeo = g(new THREE.BoxGeometry(0.085, 0.055, 0.02));
    for (const s of [-1, 1]) {
      const lens = mesh(lensGeo, toon(SHADES), 0.088 * s, 0.135, 0.226);
      lens.rotation.y = 0.18 * s;
      head.add(lens);
      const temple = mesh(g(new THREE.BoxGeometry(0.012, 0.014, 0.2)), toon(SHADES), 0.212 * s, 0.145, 0.11);
      temple.rotation.y = -0.18 * s;
      env.noOutline(temple);
      head.add(temple);
    }
    const bridge = mesh(g(new THREE.BoxGeometry(0.06, 0.014, 0.012)), toon(SHADES), 0, 0.138, 0.238);
    env.noOutline(bridge);
    head.add(bridge);
  }

  // ---- Dust puffs (world space, pooled)
  const dustGeo = g(new THREE.IcosahedronGeometry(0.12, 0));
  const dustMat = new THREE.MeshBasicMaterial({ color: "#e9dcc4", transparent: true, opacity: 0.8, depthWrite: false });
  owned.push(dustMat);
  const dust: Array<{ m: THREE.Mesh; life: number; v: THREE.Vector3 }> = [];
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(dustGeo, dustMat);
    m.visible = false;
    env.noOutline(m);
    env.scene.add(m);
    dust.push({ m, life: 0, v: new THREE.Vector3() });
  }
  let dustIdx = 0;
  const wp = new THREE.Vector3();
  const puff = (n: number, spread: number) => {
    if (env.reducedMotion) return;
    group.getWorldPosition(wp);
    for (let i = 0; i < n; i++) {
      const p = dust[dustIdx++ % dust.length]!;
      const a = Math.random() * Math.PI * 2;
      p.m.position.set(wp.x + Math.cos(a) * 0.15, wp.y + 0.05, wp.z + Math.sin(a) * 0.15);
      p.v.set(Math.cos(a) * spread, 0.5 + Math.random() * 0.4, Math.sin(a) * spread);
      p.life = 1;
      p.m.visible = true;
      p.m.scale.setScalar(0.5);
    }
  };

  // ---- Animation state
  let phase = 0;
  let walkW = 0;
  let runW = 0;
  let airW = 0;
  let squash = 0;
  let wasGrounded = true;
  let lastSin = 0;
  let headYaw = 0;
  let headTarget = 0;
  let lookTimer = 2;
  let prevSpeed = 0;
  const ponchoSpring = new Spring(60, 8);
  const tasselSpring = new Spring(50, 5);
  const pompomSpring = new Spring(80, 6);
  const rm = env.reducedMotion;
  const damp = (cur: number, target: number, rate: number, dt: number) =>
    cur + (target - cur) * (1 - Math.exp(-rate * dt));
  // Riding pose (llama mount): blended in with rideW so mounting never snaps.
  let riding = false;
  let rideW = 0;
  let ridePhase = 0;
  const offMount = on("world:mount", (d) => {
    riding = !!d?.riding;
  });
  // Seated (`world:sit`, ./seat.ts): knees bent over the seat edge; "bench" hands on the knees, "desk" hands
  // forward on the keyboard with a small typing motion. The runtime pins the feet at the seat (seat.ts SIT_HIP).
  let seated = false;
  let sitPose: SitPose = "bench";
  let sitW = 0;
  const offSit = on("world:sit", (d) => {
    seated = !!d?.seated;
    if (seated) sitPose = d.pose === "desk" ? "desk" : "bench";
  });

  const avatar: Avatar = {
    group,
    update(dt, s) {
      dt = Math.min(dt, 0.05);
      const sp = Math.max(0, s.speed);
      rideW = damp(rideW, riding ? 1 : 0, 9, dt);
      const onFoot = rideW < 0.5;
      walkW = damp(walkW, onFoot ? Math.min(1, sp / 2.2) : 0, 10, dt);
      runW = damp(runW, onFoot && s.running && sp > 1 ? Math.min(1, (sp - 2.5) / 2.5 + 0.4) : 0, 8, dt);
      airW = damp(airW, s.grounded ? 0 : 1, 14, dt);
      const accel = (sp - prevSpeed) / Math.max(dt, 1e-3);
      prevSpeed = sp;

      if (s.grounded && onFoot) phase += dt * (sp / (1.25 + runW * 0.55)) * Math.PI;
      const sw = Math.sin(phase);
      const legAmp = (0.6 * walkW + 0.35 * runW) * (1 - airW);
      const armAmp = (0.45 * walkW + 0.55 * runW) * (1 - airW);

      legL.rotation.x = sw * legAmp + airW * -0.65;
      legR.rotation.x = -sw * legAmp + airW * 0.35;
      armL.rotation.x = -sw * armAmp + airW * -0.3;
      armR.rotation.x = sw * armAmp + airW * -0.3;
      armL.rotation.z = 0.12 + runW * 0.25 + airW * 0.9;
      armR.rotation.z = -0.12 - runW * 0.25 - airW * 0.9;

      // Bob, lean, breathing, landing squash.
      const bob = Math.abs(Math.cos(phase)) * (0.045 * walkW + 0.05 * runW) * (1 - airW);
      const idle = 1 - walkW;
      const breathe = rm ? 0 : Math.sin(s.t * 2.1) * 0.018 * idle;
      squash = damp(squash, 0, 9, dt);
      rig.position.y = bob - squash * 0.08;
      rig.scale.set(1 + squash * 0.12, 1 - squash * 0.14 + breathe * 0.5, 1 + squash * 0.12);
      chest.scale.set(1 + breathe, 1 + breathe, 1 + breathe);
      torso.rotation.x = 0.07 * walkW + 0.16 * runW - airW * 0.08;
      torso.rotation.y = sw * 0.07 * walkW;
      torso.rotation.z = Math.cos(phase) * 0.025 * walkW;

      // Idle look-around: head glances to random targets.
      if (!rm) {
        lookTimer -= dt;
        if (lookTimer <= 0) {
          headTarget = idle > 0.7 ? (Math.random() - 0.5) * 1.1 : 0;
          lookTimer = 1.8 + Math.random() * 3;
        }
      }
      headYaw = damp(headYaw, walkW > 0.4 ? 0 : headTarget, 4, dt);
      head.rotation.y = headYaw;
      head.rotation.x = -torso.rotation.x * 0.6 + Math.sin(s.t * 2.1) * 0.02 * idle;

      // Secondary motion: poncho trails behind, tassels swing, pompom wobbles.
      const amp = rm ? 0.4 : 1;
      const pTarget = -(0.12 * walkW + 0.22 * runW) - THREE.MathUtils.clamp(accel * 0.02, -0.15, 0.15) + airW * 0.25;
      const pX = ponchoSpring.step(pTarget * amp, dt);
      if (poncho) {
        poncho.rotation.x = pX;
        poncho.rotation.z = Math.cos(phase) * 0.05 * walkW * amp;
      }
      const tTarget = -(0.3 * walkW + 0.5 * runW) + airW * 0.6 + Math.sin(phase * 2) * 0.12 * walkW;
      const tx = tasselSpring.step(tTarget * amp, dt);
      for (const tp of tassels) {
        tp.rotation.x = tx;
        tp.rotation.z = Math.sin(phase + tp.position.x) * 0.15 * walkW * amp;
      }
      const bobX = pompomSpring.step((-0.3 * walkW - 0.5 * runW + airW * 0.5 - bob * 4) * amp, dt) * bobAmp;
      bobPivot.rotation.x = hatTilt + bobX;
      // The cap's neck flap trails back a little as the traveler walks (opposite sign to the side tassels).
      if (neckFlap) neckFlap.rotation.x = -tx * 0.3;

      // Seated on the llama: legs straddle the saddle, hands hold the reins, bob with the trot.
      if (rideW > 0.001) {
        const k = rideW;
        const mix = (a: number, b: number) => a + (b - a) * k;
        ridePhase += dt * (2.4 + sp * 1.1) * Math.PI;
        const rb = rm ? 0 : Math.abs(Math.sin(ridePhase)) * Math.min(1, sp / 4) * 0.045;
        legL.rotation.x = mix(legL.rotation.x, -0.55);
        legR.rotation.x = mix(legR.rotation.x, -0.55);
        legL.rotation.z = 0.62 * k;
        legR.rotation.z = -0.62 * k;
        armL.rotation.x = mix(armL.rotation.x, -0.75);
        armR.rotation.x = mix(armR.rotation.x, -0.75);
        armL.rotation.z = mix(armL.rotation.z, -0.18);
        armR.rotation.z = mix(armR.rotation.z, 0.18);
        rig.position.y = mix(rig.position.y, rb);
        torso.rotation.x = mix(torso.rotation.x, 0.06 + Math.min(1, sp / 6) * 0.1);
        torso.rotation.y *= 1 - k;
        torso.rotation.z = mix(torso.rotation.z, rm ? 0 : Math.sin(ridePhase * 0.5) * 0.03 * Math.min(1, sp / 4));
      } else {
        legL.rotation.z = 0;
        legR.rotation.z = 0;
      }

      sitW = damp(sitW, seated ? 1 : 0, 10, dt);
      if (sitW > 0.001) {
        const k = sitW;
        const mix = (a: number, b: number) => a + (b - a) * k;
        const desk = sitPose === "desk";
        // Thighs level over the seat, shins hanging (the chunky traveler's boots dangle a little: cute).
        legL.rotation.x = mix(legL.rotation.x, -1.5);
        legR.rotation.x = mix(legR.rotation.x, -1.5);
        legL.rotation.z = mix(legL.rotation.z, 0.06);
        legR.rotation.z = mix(legR.rotation.z, -0.06);
        const swing = rm || desk ? 0 : Math.sin(s.t * 1.7) * 0.12;
        knees[0]!.rotation.x = (1.45 + swing) * k;
        knees[1]!.rotation.x = (1.45 - swing) * k;
        rig.position.y = mix(rig.position.y, 0);
        rig.scale.set(mix(rig.scale.x, 1), mix(rig.scale.y, 1), mix(rig.scale.z, 1));
        torso.rotation.y *= 1 - k;
        torso.rotation.z *= 1 - k;
        if (desk) {
          // Hands on the keyboard; fingers tap in turn (no tapping with reduced motion).
          const tap = rm ? 0 : Math.max(0, Math.sin(s.t * 13)) * 0.07;
          const tap2 = rm ? 0 : Math.max(0, Math.sin(s.t * 13 + 2.2)) * 0.07;
          torso.rotation.x = mix(torso.rotation.x, 0.16);
          armL.rotation.x = mix(armL.rotation.x, -1.22 - tap);
          armR.rotation.x = mix(armR.rotation.x, -1.22 - tap2);
          armL.rotation.z = mix(armL.rotation.z, -0.3);
          armR.rotation.z = mix(armR.rotation.z, 0.3);
          head.rotation.x = mix(head.rotation.x, 0.2);
          head.rotation.y = mix(head.rotation.y, 0);
        } else {
          torso.rotation.x = mix(torso.rotation.x, 0.1);
          armL.rotation.x = mix(armL.rotation.x, -0.78);
          armR.rotation.x = mix(armR.rotation.x, -0.78);
          armL.rotation.z = mix(armL.rotation.z, -0.2);
          armR.rotation.z = mix(armR.rotation.z, 0.2);
        }
      } else {
        knees[0]!.rotation.x = 0;
        knees[1]!.rotation.x = 0;
      }
      // The pack comes off while seated (it would sink into a backrest).
      pack.visible = sitW < 0.5;

      // Dust: footfalls while running, and a puff on landing.
      if (s.grounded && onFoot && runW > 0.3 && Math.sign(sw) !== Math.sign(lastSin)) puff(2, 0.6);
      if (s.grounded && !wasGrounded && onFoot) {
        squash = rm ? 0 : 1;
        puff(6, 1.2);
      }
      if (!s.grounded && wasGrounded) squash = -0.4;
      lastSin = sw;
      wasGrounded = s.grounded;

      for (const p of dust) {
        if (p.life <= 0) continue;
        p.life -= dt * 1.6;
        p.m.position.addScaledVector(p.v, dt);
        p.v.multiplyScalar(1 - dt * 2.5);
        p.m.scale.setScalar(0.5 + (1 - p.life) * 1.1);
        dustMat.opacity = 0.75;
        if (p.life <= 0) p.m.visible = false;
      }
    },
    dispose() {
      offMount();
      offSit();
      for (const p of dust) p.m.removeFromParent();
      for (const x of geos) x.dispose();
      for (const t of texs) t.dispose();
      for (const m of owned) m.dispose();
      group.removeFromParent();
    },
  };
  return avatar;
}

// Still a CreateAvatar (the mountain loader calls it with env only).
createAvatar satisfies CreateAvatar;
