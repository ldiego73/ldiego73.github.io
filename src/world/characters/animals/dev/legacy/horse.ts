// Dev-only snapshot of the pre-characters model (the harness shows it next to the new one). Not shipped.
/**
 * Peruvian Paso horse (caballo de paso) for the coast ride: a bay horse (red-brown coat, black mane, tail and
 * lower legs, a white star on the forehead) with the breed's look: an arched neck carried high, a refined head
 * held near vertical, a long mane falling to one side and a long, full, low-set tail. Dressed in a chalán's
 * tack: a Peruvian saddle (high pommel and cantle, leather skirts) under a sheepskin pellón with woven, fringed
 * edges, carved wooden box stirrups (estribos de cajón) with brass trim, a studded breast collar and crupper,
 * and a bridle with a dyed browband and wool tassels (borlas). Faces +Z, origin at the feet.
 * Ridden on the Chinchaysuyu coast road (../../costa/ambient/caballo.ts via ./ride.ts); it moves in the paso
 * llano, the breed's lateral four-beat gait (./gait.ts "lateral", a very small bob: the rider's back stays still).
 *
 * Draw calls: each rigid node (body, every leg, neck, head, tail, both stirrups) is flattened into one
 * vertex-colored mesh on one shared vertex-toon material (../../merge-colors.ts); the eyes stay apart (no ink).
 */
import * as THREE from "three";
import type { MountModel } from "../../../../ambient/mount/ride";
import type { WorldEnv } from "../../../../contract";
import { flattenToonGroup, vertexToon } from "../../../../merge-colors";
import { DYE } from "../../../../props";
import { quadrupedGait } from "./gait";

const COAT = "#7b4224";
const COAT_LIGHT = "#8c5030";
const POINTS = "#231915";
const MUZZLE = "#3a2a24";
const HOOF = "#2a211b";
const STAR = "#efe6d6";
const EYE = "#1a1412";
const LEATHER = "#6a3b20";
const LEATHER_DARK = "#3f2414";
const WOOD = "#5b3a22";
const WOOD_LIGHT = "#7a5232";
const FLEECE = "#e9dfc9";
const SILVER = "#d8d4c8";
const BRASS = "#c9a24a";

/** Leg pivot height (hips / shoulders) and the barrel's centre and radius. */
const HIP = 0.92;
const BODY_Y = 1.12;
const BODY_R = 0.32;
/** Top of the barrel (the saddle sits on it) and of the pellón (the rider sits on it). */
const TOP = BODY_Y + BODY_R;
const PELLON_TOP = TOP + 0.13;
/**
 * The rider's feet sit this high: the avatar's hip pivot (0.56 above its feet) lands a hair above the pellón,
 * as the mule's does (./mule.ts).
 */
const SEAT_HEIGHT = PELLON_TOP + 0.05 - 0.56;
/** Resting neck lean and the head's own pitch on it (net ~1 rad: the Paso's near-vertical face). */
const NECK_LEAN = 0.42;
const HEAD_PITCH = 0.62;

export function buildPasoHorse(env: WorldEnv): MountModel {
  const geos: THREE.BufferGeometry[] = [];
  const g = <T extends THREE.BufferGeometry>(x: T) => {
    geos.push(x);
    return x;
  };
  const mat = vertexToon();
  const toon = (c: string) => env.toon(c);
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, toon(c));
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const sph = g(new THREE.SphereGeometry(1, 12, 9));
  const box = g(new THREE.BoxGeometry(1, 1, 1));
  const blob = (
    parent: THREE.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
  ) => part(parent, sph, c, x, y, z).scale.set(sx, sy, sz);
  const slab = (
    parent: THREE.Object3D,
    c: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => {
    const m = part(parent, box, c, x, y, z);
    m.scale.set(w, h, d);
    m.rotation.set(rx, ry, rz);
    return m;
  };

  const group = new THREE.Group();
  group.name = "ride-horse";
  const body = new THREE.Group();
  group.add(body);

  // ---- Barrel: a capsule along Z; a deep chest, a rounded, slightly sloping croup, the belly a shade lighter.
  const barrel = part(body, g(new THREE.CapsuleGeometry(BODY_R, 0.66, 5, 14)), COAT, 0, BODY_Y, -0.02);
  barrel.rotation.x = Math.PI / 2;
  blob(body, COAT, 0, BODY_Y + 0.02, 0.42, 0.31, 0.36, 0.3);
  blob(body, COAT, 0, BODY_Y + 0.03, -0.46, 0.33, 0.33, 0.34);
  blob(body, COAT_LIGHT, 0, BODY_Y - 0.12, 0.02, 0.27, 0.2, 0.55);
  // Withers rising into the neck.
  blob(body, COAT, 0, TOP - 0.02, 0.4, 0.16, 0.14, 0.22);

  // ---- Tack on the barrel: saddle cloth, leather skirts, saddle with a high pommel and cantle, the pellón.
  slab(body, "#2f3557", 0, TOP - 0.01, 0.02, 0.7, 0.03, 0.72);
  for (const s of [-1, 1]) {
    // Leather skirts (faldones) down the flanks, tooled edge in a darker brown.
    slab(body, LEATHER, s * 0.335, TOP - 0.14, 0.0, 0.03, 0.3, 0.58, 0, 0, s * 0.16);
    slab(body, LEATHER_DARK, s * 0.345, TOP - 0.28, 0.0, 0.032, 0.035, 0.6, 0, 0, s * 0.16);
  }
  slab(body, LEATHER, 0, TOP + 0.04, 0, 0.46, 0.07, 0.52);
  slab(body, LEATHER_DARK, 0, TOP + 0.12, 0.25, 0.26, 0.17, 0.07, -0.25);
  slab(body, LEATHER_DARK, 0, TOP + 0.13, -0.26, 0.38, 0.16, 0.07, 0.3);
  part(body, g(new THREE.CylinderGeometry(0.035, 0.045, 0.1, 8)), LEATHER_DARK, 0, TOP + 0.24, 0.27);
  // Pellón: a fleece pad over the seat (soft, rounded), its woven edges in dyed stripes with a short fringe.
  blob(body, FLEECE, 0, PELLON_TOP - 0.04, -0.01, 0.25, 0.05, 0.23);
  slab(body, FLEECE, 0, PELLON_TOP - 0.05, -0.01, 0.42, 0.06, 0.4);
  for (const s of [-1, 1]) {
    slab(body, DYE.red, s * 0.24, PELLON_TOP - 0.13, -0.01, 0.03, 0.15, 0.42, 0, 0, s * 0.35);
    slab(body, DYE.ochre, s * 0.265, PELLON_TOP - 0.18, -0.01, 0.032, 0.03, 0.43, 0, 0, s * 0.35);
    slab(body, DYE.indigo, s * 0.25, PELLON_TOP - 0.09, -0.01, 0.032, 0.025, 0.43, 0, 0, s * 0.35);
    for (let k = 0; k < 9; k++)
      slab(body, k % 2 ? DYE.ochre : DYE.red, s * 0.29, PELLON_TOP - 0.24, -0.19 + k * 0.045, 0.012, 0.07, 0.016);
  }
  // Girth and the studded breast collar (pechera) across the chest, a tassel on each side of it.
  const girth = part(
    body,
    g(new THREE.TorusGeometry(BODY_R * 1.04, 0.022, 4, 18, Math.PI)),
    LEATHER_DARK,
    0,
    BODY_Y,
    0.12,
  );
  girth.rotation.set(0, Math.PI / 2, Math.PI);
  const collar = part(body, g(new THREE.TorusGeometry(0.3, 0.026, 4, 14, Math.PI)), LEATHER, 0, BODY_Y + 0.04, 0.52);
  collar.rotation.z = Math.PI;
  collar.scale.set(1, 0.72, 1);
  for (let k = 0; k <= 6; k++) {
    const a = Math.PI + (k / 6) * Math.PI;
    blob(body, SILVER, Math.cos(a) * 0.3, BODY_Y + 0.04 + Math.sin(a) * 0.216, 0.55, 0.022, 0.022, 0.012);
  }
  const tasselGeo = g(new THREE.ConeGeometry(0.035, 0.12, 6));
  for (const s of [-1, 1]) part(body, tasselGeo, DYE.red, s * 0.2, BODY_Y - 0.21, 0.6).rotation.x = Math.PI;
  // Crupper (baticola) from the cantle along the croup, silver studs on it.
  slab(body, LEATHER, 0, TOP + 0.005, -0.62, 0.05, 0.025, 0.42, 0.18);
  for (let k = 0; k < 4; k++) blob(body, SILVER, 0, TOP + 0.02 - k * 0.022, -0.47 - k * 0.1, 0.018, 0.018, 0.018);

  // ---- Swinging bits: the carved box stirrups (estribos de cajón) on leather straps from the saddle.
  const danglers: THREE.Group[] = [];
  const strapGeo = g(new THREE.BoxGeometry(0.022, 0.26, 0.045));
  strapGeo.translate(0, -0.13, 0);
  for (const s of [-1, 1]) {
    const st = new THREE.Group();
    st.position.set(s * 0.34, TOP + 0.02, 0.06);
    part(st, strapGeo, LEATHER_DARK);
    // The box: a closed toe, two sides and the tread; a lighter carved front panel and a brass band.
    slab(st, WOOD, 0, -0.33, 0.02, 0.12, 0.13, 0.2);
    slab(st, WOOD_LIGHT, 0, -0.33, 0.125, 0.105, 0.1, 0.012);
    slab(st, BRASS, 0, -0.275, 0.02, 0.124, 0.018, 0.204);
    slab(st, WOOD_LIGHT, s * 0.0605, -0.35, 0.02, 0.006, 0.05, 0.12);
    body.add(st);
    danglers.push(st);
  }

  // ---- Legs: fine forearm / gaskin in the coat, black cannons (bay points), fetlock, hoof.
  const upperGeo = g(new THREE.CapsuleGeometry(0.078, 0.3, 3, 9));
  const cannonGeo = g(new THREE.CapsuleGeometry(0.043, 0.34, 3, 8));
  const hoofGeo = g(new THREE.CylinderGeometry(0.055, 0.068, 0.08, 9));
  const legs: THREE.Group[] = [];
  for (const [x, z, hind] of [
    [0.15, 0.42, false],
    [-0.15, 0.42, false],
    [0.15, -0.48, true],
    [-0.15, -0.48, true],
  ] as Array<[number, number, boolean]>) {
    const p = new THREE.Group();
    p.position.set(x, HIP, z);
    // Hind legs: a thicker thigh blending into the croup.
    if (hind) blob(p, COAT, 0, 0.02, 0, 0.11, 0.2, 0.15);
    part(p, upperGeo, COAT, 0, -0.2, hind ? -0.02 : 0);
    part(p, cannonGeo, POINTS, 0, -0.58, 0);
    blob(p, POINTS, 0, -HIP + 0.13, 0.008, 0.055, 0.05, 0.06);
    part(p, hoofGeo, HOOF, 0, -HIP + 0.04, 0.012);
    body.add(p);
    legs.push(p);
  }

  // ---- Neck (pivot at the withers): a deep base and an arched upper neck; the long mane falls to its right.
  const neck = new THREE.Group();
  neck.position.set(0, BODY_Y + 0.14, 0.5);
  neck.rotation.x = NECK_LEAN;
  part(neck, g(new THREE.CapsuleGeometry(0.16, 0.3, 4, 12)), COAT, 0, 0.2, 0);
  const upper = part(neck, g(new THREE.CapsuleGeometry(0.115, 0.3, 4, 12)), COAT, 0, 0.55, 0.02);
  upper.rotation.x = -0.22;
  // Crest (the arch) and the mane: overlapping locks hanging down the right side, longer at mid-neck.
  const crest = part(neck, g(new THREE.CapsuleGeometry(0.05, 0.6, 3, 8)), POINTS, 0, 0.42, -0.11);
  crest.rotation.x = -0.1;
  for (let k = 0; k < 8; k++) {
    const y = 0.12 + k * 0.088;
    const len = 0.22 + Math.sin((k / 7) * Math.PI) * 0.14;
    slab(neck, POINTS, -0.085, y, -0.1 + k * 0.004, 0.03, len, 0.1, 0.1, 0, -0.32 - (k % 2) * 0.06).position.y =
      y - len * 0.35;
  }
  // Reins from the bit back along the neck to the pommel.
  for (const s of [-1, 1]) slab(neck, LEATHER_DARK, s * 0.12, 0.42, 0.12, 0.012, 0.78, 0.018, 0.14);
  body.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.8, 0.05);
  head.rotation.x = HEAD_PITCH;
  // Skull and jowl, a tapered face, a dark soft muzzle with nostrils.
  const skull = part(head, g(new THREE.CapsuleGeometry(0.105, 0.16, 4, 12)), COAT, 0, 0, 0.08);
  skull.rotation.x = Math.PI / 2;
  blob(head, COAT, 0, -0.04, 0.04, 0.1, 0.11, 0.12);
  const face = part(head, g(new THREE.CylinderGeometry(0.07, 0.095, 0.26, 10)), COAT, 0, -0.005, 0.3);
  face.rotation.x = Math.PI / 2;
  blob(head, MUZZLE, 0, -0.015, 0.45, 0.078, 0.075, 0.08);
  for (const s of [-1, 1]) blob(head, "#120c0a", s * 0.04, 0.02, 0.51, 0.016, 0.02, 0.012);
  // White star on the forehead.
  blob(head, STAR, 0, 0.098, 0.12, 0.035, 0.012, 0.05);
  // Small, alert ears, tips curving in; a forelock between them.
  const earGeo = g(new THREE.ConeGeometry(0.035, 0.15, 6));
  earGeo.translate(0, 0.075, 0);
  for (const s of [-1, 1]) {
    const ear = part(head, earGeo, COAT, s * 0.06, 0.08, -0.03);
    ear.rotation.set(-0.5, 0, -s * 0.12);
    ear.scale.set(1, 1, 0.6);
  }
  slab(head, POINTS, 0, 0.1, 0.03, 0.06, 0.02, 0.12, 0.15);
  // Bridle: crown strap, a dyed browband with brass studs, cheek straps and the noseband; wool tassels (borlas).
  slab(head, LEATHER_DARK, 0, 0.065, -0.06, 0.23, 0.025, 0.03);
  slab(head, DYE.red, 0, 0.08, 0.02, 0.22, 0.03, 0.03, 0.2);
  for (const x of [-0.06, 0, 0.06]) blob(head, BRASS, x, 0.098, 0.026, 0.012, 0.012, 0.01);
  for (const s of [-1, 1]) slab(head, LEATHER_DARK, s * 0.105, 0.0, 0.15, 0.015, 0.025, 0.34, 0, s * 0.04);
  const nose = part(head, g(new THREE.TorusGeometry(0.093, 0.016, 4, 14)), LEATHER_DARK, 0, -0.005, 0.36);
  nose.scale.set(1, 0.95, 1);
  const borla = g(new THREE.ConeGeometry(0.03, 0.11, 6));
  for (const s of [-1, 1]) {
    part(head, borla, DYE.ochre, s * 0.125, 0.02, 0.02).rotation.set(Math.PI - 0.4, 0, 0);
    part(head, borla, DYE.red, s * 0.12, -0.05, 0.36).rotation.set(Math.PI - 0.6, 0, 0);
  }
  part(head, borla, DYE.indigo, 0, -0.13, 0.06).rotation.set(Math.PI - 0.6, 0, 0);
  neck.add(head);

  // ---- Tail: set low, a short dock and long full hair falling nearly to the ground.
  const tail = new THREE.Group();
  tail.position.set(0, BODY_Y + 0.12, -0.78);
  part(tail, g(new THREE.CylinderGeometry(0.05, 0.04, 0.22, 7)), POINTS, 0, -0.1, -0.02);
  const hair = part(tail, g(new THREE.CylinderGeometry(0.06, 0.12, 0.86, 10)), POINTS, 0, -0.6, -0.04);
  hair.scale.set(1, 1, 0.75);
  for (const s of [-1, 1]) slab(tail, POINTS, s * 0.05, -0.62, -0.06, 0.05, 0.78, 0.07, 0, 0, s * 0.05);
  // Crupper loop round the dock.
  const loop = part(tail, g(new THREE.TorusGeometry(0.06, 0.018, 4, 10)), LEATHER, 0, -0.03, -0.01);
  loop.rotation.x = Math.PI / 2;
  body.add(tail);

  // One vertex-colored mesh per rigid node (bob and swing pivots keep their own transforms).
  for (const node of [body, neck, head, tail, ...legs, ...danglers]) flattenToonGroup(node, mat);

  // Eyes last (unmerged, no ink outline).
  const eyeGeo = g(new THREE.SphereGeometry(0.024, 7, 5));
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(eyeGeo, toon(EYE));
    eye.position.set(s * 0.097, 0.035, 0.1);
    eye.scale.set(0.5, 1.1, 1.2);
    env.noOutline(eye);
    head.add(eye);
  }

  return {
    group,
    seatHeight: SEAT_HEIGHT,
    bodyR: 0.7,
    // The paso llano: lateral pairs, a long smooth stride and almost no bob; the high neck nods little.
    animate: quadrupedGait(
      { body, legs, neck, head, tail, danglers },
      { gait: "lateral", neckLean: NECK_LEAN, tailLean: 0.12, legMax: 0.42, bob: 0.018, flick: true },
    ),
    dispose() {
      group.removeFromParent();
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.name.endsWith(":vc")) m.geometry.dispose();
      });
      for (const x of geos) x.dispose();
      mat.dispose();
    },
  };
}
